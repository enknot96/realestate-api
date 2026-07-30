# 不動産業務管理API

不動産会社の物件管理・問い合わせ対応・内見予約を扱うバックエンドAPI（Hono + Drizzle ORM + Neon on Vercel）。前職の不動産営業6年の実務経験をもとに、状態遷移とトランザクション設計に重点を置いて実装した。単体で完結するAPIであると同時に、別作品のAIエージェントから外部サービスとして呼び出される想定でも設計している。

- **本番環境**: https://realestate-api-phi.vercel.app
- **API仕様書 / 動作確認**: [`/docs`](https://realestate-api-phi.vercel.app/docs)（Swagger UI。ブラウザから全エンドポイントを試せます）

## 目次

- [なぜこの題材にしたか](#なぜこの題材にしたか)
- [技術スタック](#技術スタック)
- [アーキテクチャ](#アーキテクチャ)
- [APIドキュメント（Swagger UI）](#apiドキュメントswagger-ui)
- [主な設計判断・意図的な簡略化（既知の制約）](#主な設計判断意図的な簡略化既知の制約)
- [AIエージェント（別作品）からの利用](#aiエージェント別作品からの利用)
- [テスト](#テスト)
- [セットアップ](#セットアップ)
- [デプロイ](#デプロイ)

## なぜこの題材にしたか

前職のハウスメーカー営業6年で経験した「物件公開→問い合わせ→内見調整→成約」という業務フローと、そこで起こりがちな状態管理の問題（二重内見予約、成約済み物件への問い合わせ対応など）を、`properties`→`inquiries`→`viewings`の状態遷移や一括キャンセルといった業務ルールの設計に反映している。

## 技術スタック

| 分類              | 採用技術                                                                                                                                                                        | 補足                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Webフレームワーク | [Hono](https://hono.dev/)                                                                                                                                                       | `hono/vercel`で公式にVercelサーバーレス対応                                |
| ORM / DB          | [Drizzle ORM](https://orm.drizzle.team/) + [Neon](https://neon.tech/)（PostgreSQL）                                                                                             | 本番/開発ともにNeon一本化。interactive transaction対応のためPool（WebSocket）ドライバを使用 |
| バリデーション    | [zod](https://zod.dev/) v4 + `@hono/zod-validator`                                                                                                                              | 失敗時は422＋統一エラー形式                                                |
| 認証              | bcrypt（パスワードハッシュ）+ 自前JWT実装（HS256）                                                                                                                              | アクセストークン15分（レスポンスボディ）、リフレッシュトークン30日（httpOnly Cookie、ローテーション） |
| APIドキュメント   | [`@asteasolutions/zod-to-openapi`](https://github.com/asteasolutions/zod-to-openapi) + [`@hono/swagger-ui`](https://github.com/honojs/middleware/tree/main/packages/swagger-ui) | zodスキーマからOpenAPI仕様を自動生成、実装と乖離させない                   |
| テスト            | [Vitest](https://vitest.dev/)                                                                                                                                                   | Neonの`test`ブランチで本番/開発用DBと分離                                  |
| デプロイ          | Vercel（アプリ）+ Neon（DB）                                                                                                                                                    | Railway/Fly.ioは恒久無料枠が無いため見送り                                 |
| パッケージ管理    | pnpm、ESM (`"type": "module"`)                                                                                                                                                  |                                                                            |
| 開発体制          | [Claude Code](https://claude.com/claude-code)（Anthropic）とのペアプログラミング                                                                                                | 設計の壁打ち・コードレビューの相手として活用                               |

## アーキテクチャ

### レイヤー構成

```
src/
├── routes/         # ルーティング + リクエストハンドラー（1ファイルに統合）
├── services/        # ビジネスロジック・状態遷移・トランザクション制御
├── repositories/     # DBアクセス（Drizzleのクエリ）
├── schemas/         # zodによるリクエスト/レスポンスの型・バリデーション定義
├── middlewares/      # 認証・CSRF・レート制限・エラーハンドリング
├── lib/            # 横断的なユーティリティ（JWT、パスワードハッシュ、認可、エラークラス等）
├── db/            # Drizzleスキーマ定義・DB接続
├── app.ts          # Honoアプリの組み立て（テスト時はサーバー起動なしでこれをimportする）
└── index.ts         # `serve()`するだけの薄いエントリーポイント
```

`routes`と`handlers`をあえて1ファイルに統合しているのは、エンドポイント数が多くないこの規模で「どのURLに何が生えているか」を1箇所で見渡せるようにするため。一方で`services`/`repositories`は分離し、ビジネスロジックとDBアクセスの責務を分けている。

### DB設計

6テーブル（`agents`, `properties`, `customers`, `inquiries`, `viewings`, `refresh_tokens`）。主キーは`serial`、`status`や`role`などの区分値は`pgEnum`で表現し、アプリケーション側の型（TypeScriptのUnion型）と一致させている。

```
agents (担当者) ─┬─< properties (物件)
          │
          └─< refresh_tokens (リフレッシュトークン)

properties ─< inquiries (問い合わせ) >─ customers (顧客・emailでupsert)
      │            │
      └─< viewings (内見予約) >───┘
```

### 状態遷移とトランザクション

3つの状態機械（`ALLOWED_TRANSITIONS`テーブルで許可する遷移のみを表現し、それ以外は409エラー）を実装している。

- 物件: `draft → published → contracted/closed`
- 問い合わせ: `new → in_progress → done`
- 内見予約: `scheduled → completed/cancelled`

このうち以下3箇所は複数テーブルにまたがる更新のため`db.transaction()`で原子性を保証している（テストでロールバック確認済み、後述）。

1. 物件が`published`から`contracted`/`closed`に変わるとき、その物件の予約中の内見を一括キャンセル
2. 公開問い合わせフォームからの送信時、`customers`テーブルのemail基準upsert + `inquiries`の作成
3. 内見予約の作成 + 対応する問い合わせのstatusを`in_progress`に更新

### 可視性・認可ルール

- 物件一覧・詳細（`GET /properties`）は認証任意。未認証は`published`のみ、エージェントは自分の物件は全ステータス+他人の公開中物件、管理者は全件、という3段階の可視性ルール
- 物件・問い合わせ・内見予約への書き込み操作は、所有権チェック（`assertOwnership`、`src/lib/authorization.ts`）により他人の物件への操作を403で拒否

## APIドキュメント（Swagger UI）

サーバー起動後、`/docs`にアクセスすると全エンドポイントの仕様確認・実行（Try it out）ができる。`/openapi.json`はzodスキーマから実行時に生成しており、実装とドキュメントが乖離しない構成にしている。

ルート定義自体（`@hono/zod-openapi`のようなラッパー）を書き換える方式ではなく、既存の素のHono+zodのコードはそのままに、`src/openapi.ts`で別途OpenAPIレジストリにパス・スキーマを登録する方式を採用した。理由は、既存のルート実装への変更を最小限にしつつ、ドキュメント生成の関心事を分離するため。

社内向けAPIという位置づけを想定しており、主な利用者はフロントエンド担当者や他チームのエンジニア（お客さんに直接見せるものではない）という前提で設計している。実際の入出力例は[`/docs`](https://realestate-api-phi.vercel.app/docs)から「Try it out」でその場で確認できる。

## 主な設計判断・意図的な簡略化（既知の制約）

### 顧客識別の精度（メール認証は未実装）

`POST /properties/:id/inquiries`は匿名の公開エンドポイントで、`email`を一意な識別子として`customers`をupsertしている。**既知の制約**: 本人確認が無いため、メールアドレスを複数人が共有していると別人が同一顧客として扱われ`customers.name`が上書きされ得る（発生時はログに警告のみ出力）。**改修案**: メール認証（OTP等）で防げるが、「誰でも気軽に問い合わせできる」という趣旨とトレードオフになるため見送った。

### レート制限（インメモリ実装の制約）

`POST /properties/:id/inquiries`にIPごと1分5回までの制限をかけている（`src/middlewares/rateLimit.ts`）。**既知の制約**: プロセス内メモリの`Map`によるシンプルな実装のため、Vercelのようなマルチインスタンス環境ではインスタンス間でカウントが共有されず、実効的な制限が緩くなり得る。**改修案**: 本番運用ではRedis等の外部ストア（Upstash Redisなど）にカウントを持たせる。

### CSRF対策（Origin検証）の適用範囲

Origin検証は、httpOnly Cookieが自動送信される`POST /auth/refresh`・`POST /auth/logout`にのみ適用している。CSRFは「ブラウザがCookieを自動付与すること」を悪用する攻撃なので、Bearer認証必須のルートや公開POST（問い合わせ）はそもそも保護すべき資格情報が無く脅威モデル外、と整理した。これによりOriginヘッダーを送らないサーバー間通信（AIエージェント）やcurlからの書き込みも自然に通る。

### 空き枠確認はスロットテーブルを持たない計算方式

`GET /properties/:id/availability`は、スロット専用テーブルを持たず「営業時間内の1時間枠のうち予約中(scheduled)の内見と重複しない枠」を毎回計算して返す。テーブルで持つと生成バッチや二重管理が必要になるため、この規模では計算方式が最もシンプルと判断した。**既知の制約**: 営業時間（10:00〜18:00 JST）と枠の長さ（1時間）はアプリケーション定数で固定。

### デモ用途による簡略化（`/auth/register`の公開）

エージェント登録エンドポイントは誰でも叩ける状態で公開している（ポートフォリオとして動作をすぐ試せることを優先）。**既知の制約**: これと`GET /properties`の未認証閲覧を組み合わせると、誰でも登録→物件作成→`published`化という経路で公開一覧にスパム物件を混入させられる。承認フローが無く技術的に塞がれていない。**改修案**: 登録制限に加え、`published`遷移に管理者承認を挟むことで防げるが、「誰でもすぐ試せる」体験を優先し対応を見送っている。

## AIエージェント（別作品）からの利用

本APIは、別作品のAIエージェント（Next.js + Vercel AI SDK）が「ツール」として呼び出す外部サービスでもある。エージェントは物件検索→詳細確認→空き枠確認→（ユーザー承認を挟んで）内見予約、という多段フローで本APIを叩く。

この利用要件に応じて、検索パラメータの拡張（`layout`・`keyword`）、内見空き枠の公開エンドポイント（`GET /properties/:id/availability`）、CSRF適用範囲の整理（Originヘッダー無しのサーバー間通信を安全に通す、前述）を追加した。書き込み系の`POST /inquiries/:id/viewings`は要認証で、デモ用エージェントアカウントのJWTをエージェント側サーバー内でのみ保持する（クライアントには出さない）。

## テスト

Vitestを使用。Neonに専用の`test`ブランチを作成し、`.env.test`で開発用DBと分離している（`fileParallelism: false`でテストDBの競合を回避）。

- `tests/unit/`: property/inquiry/viewing各serviceの状態遷移・所有権チェック・可視性ルールを、repositoryをモックして検証
- `tests/integration/`: `app.request()`でサーバー起動なしに主要エンドポイントを検証。加えて、前述の3箇所のトランザクションについて、2番目の処理を`vi.spyOn`で強制失敗させ、DBの実値を見て1番目の処理が永続化されていない（ロールバックされている）ことを確認

## セットアップ

```bash
pnpm install

# .envを作成し、DATABASE_URL・JWT_SECRET・ALLOWED_ORIGINSなどを設定
cp .env.example .env

# Neon上にスキーマを反映
npx drizzle-kit push

# デモデータの投入（注意: 全テーブルをTRUNCATEしてから作り直す）
# デモ用エージェント（demo-agent@example.com）のパスワードは環境変数で渡す
SEED_AGENT_PASSWORD=<任意のパスワード> pnpm seed:local

pnpm run dev
# http://localhost:3000/docs でAPIドキュメントを確認
```

テストを実行する場合は、別途Neonの`test`ブランチを用意し`.env.test`を作成した上で

```bash
pnpm test
```

## デプロイ

Vercel（アプリ）+ Neon（DB）。`api/index.ts`で`hono/vercel`の`handle()`を使いVercel Functionsとして公開している。既存の（`/api`プレフィックスの無い）ルート構成をそのまま活かすため、`vercel.json`で全パスを`api/index.ts`にリライトしている。

- 本番URL: https://realestate-api-phi.vercel.app
