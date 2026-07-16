# 不動産業務管理API

不動産会社の業務（物件管理・問い合わせ対応・内見予約）を題材にした、Hono + Drizzle ORM + Neon (PostgreSQL) によるバックエンドAPI。

- **API仕様書 / 動作確認**: [`/docs`](https://YOUR-DEPLOYMENT-URL.vercel.app/docs)（Swagger UI。デプロイ後にURLを差し替えてください）

## 目次

- [レビューする際に見ていただきたいポイント](#レビューする際に見ていただきたいポイント)
- [なぜこの題材にしたか](#なぜこの題材にしたか)
- [技術スタック](#技術スタック)
- [アーキテクチャ](#アーキテクチャ)
- [APIドキュメント（Swagger UI）](#apiドキュメントswagger-ui)
- [動作イメージ（サンプルリクエスト）](#動作イメージサンプルリクエスト)
- [主な設計判断・意図的な簡略化（既知の制約）](#主な設計判断意図的な簡略化既知の制約)
- [AIエージェント（別作品）からの利用](#aiエージェント別作品からの利用)
- [テスト](#テスト)
- [セットアップ](#セットアップ)
- [デプロイ](#デプロイ)

## レビューする際に見ていただきたいポイント

お時間が限られている場合は、特に以下を見ていただけると実装の意図が伝わりやすいと思います。

| ポイント                           | ファイル                                                                                         | 内容                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| トランザクションのロールバック検証 | [`tests/integration/transactions.test.ts`](tests/integration/transactions.test.ts)               | 3箇所のトランザクションそれぞれについて、2番目の処理を`vi.spyOn`で強制失敗させ、DBの実値を見て1番目の処理がロールバックされていることを確認するテスト |
| 状態遷移テーブルによるガード       | [`src/services/propertyService.ts:16-22`](src/services/propertyService.ts#L16-L22)               | `ALLOWED_TRANSITIONS`で許可された遷移だけを表現し、それ以外は一律409を返す設計                                                                        |
| 所有権チェックの共通化             | [`src/lib/authorization.ts`](src/lib/authorization.ts)                                           | `assertOwnership`。property/inquiry/viewingの3serviceから共通利用し、他人のリソースへの操作を403で拒否                                                |
| 可視性ルールのSQL組み立て          | [`src/repositories/propertyRepository.ts:48-68`](src/repositories/propertyRepository.ts#L48-L68) | 未認証/エージェント/管理者で異なるWHERE句を動的に組み立てる`buildConditions`                                                                          |
| ドキュメントと実装の乖離防止       | [`src/openapi.ts`](src/openapi.ts)                                                               | 既存のzodスキーマからOpenAPI仕様を自動生成する設計（ルート定義自体は書き換えない）                                                                    |
| 空き枠をテーブルで持たない設計     | [`src/services/availabilityService.ts`](src/services/availabilityService.ts)                     | スロット専用テーブルを作らず、営業時間の枠と予約中(scheduled)の内見との重複計算で空き枠を導出                                                         |
| CSRF対策の適用範囲                 | [`src/app.ts`](src/app.ts) / [`src/middlewares/csrf.ts`](src/middlewares/csrf.ts)                | Origin検証をCookieが自動送信されるルートのみに限定し、Bearer認証・公開POSTはCSRFの脅威モデル外と整理した設計判断                                      |

## なぜこの題材にしたか

前職でハウスメーカーの営業を6年経験しており、「物件を公開する」「問い合わせが来る」「内見の日程調整をする」「契約が決まったら物件を非公開にする」という一連の業務フローと、そこで起こりがちな状態管理の問題（二重内見予約、成約済み物件への問い合わせ対応など）を実務として理解しています。この経験を、実際に手を動かして学んだTypeScript/Hono/Drizzleでバックエンドとして設計・実装し直したのが本プロジェクトです。

題材選びだけでなく、`properties`（物件）→`inquiries`（問い合わせ）→`viewings`（内見予約）の状態遷移や、物件が成約・取り下げになった際に予約中の内見を一括キャンセルする、といった業務ルールの設計にも実務経験を反映しています。

## 技術スタック

| 分類              | 採用技術                                                                                                                                                                        | 補足                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webフレームワーク | [Hono](https://hono.dev/)                                                                                                                                                       | `hono/vercel`で公式にVercelのサーバーレス環境に対応                                                                                                                                |
| ORM / DB          | [Drizzle ORM](https://orm.drizzle.team/) + [Neon](https://neon.tech/)（PostgreSQL）                                                                                             | ローカル・本番ともにNeon一本化（Docker不使用）。ドライバは`@neondatabase/serverless`のPool（WebSocket）を選択。interactive transactionが必要なため、httpドライバではなくPoolを使用 |
| バリデーション    | [zod](https://zod.dev/) v4 + `@hono/zod-validator`                                                                                                                              | 失敗時は422＋統一エラー形式で返す                                                                                                                                                  |
| 認証              | bcrypt（パスワードハッシュ）+ 自前JWT実装（HS256）                                                                                                                              | アクセストークン15分（レスポンスボディ）、リフレッシュトークン30日（httpOnly Cookie、ローテーション方式）                                                                          |
| APIドキュメント   | [`@asteasolutions/zod-to-openapi`](https://github.com/asteasolutions/zod-to-openapi) + [`@hono/swagger-ui`](https://github.com/honojs/middleware/tree/main/packages/swagger-ui) | 既存のzodスキーマからOpenAPI仕様を自動生成。ルート定義自体は書き換えない方式を採用                                                                                                 |
| テスト            | [Vitest](https://vitest.dev/)                                                                                                                                                   | Neonの`test`ブランチを使い、本番/開発用DBと分離                                                                                                                                    |
| デプロイ          | Vercel（アプリ）+ Neon（DB）                                                                                                                                                    | Railway/Fly.ioは執筆時点で恒久無料枠が無いため見送り                                                                                                                               |
| パッケージ管理    | pnpm、ESM (`"type": "module"`)                                                                                                                                                  |                                                                                                                                                                                    |
| 開発体制          | [Claude Code](https://claude.com/claude-code)（Anthropic）とのペアプログラミング                                                                                                | 設計方針の壁打ちやコードレビューの相手として活用しつつ、ビジネスロジック、OpenAPI定義やドキュメントなど、共に実装を進めた                                                          |

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

社内向けAPIという位置づけを想定しており、主な利用者はフロントエンド担当者や他チームのエンジニア（お客さんに直接見せるものではない）という前提で設計している。

## 動作イメージ（サンプルリクエスト）

`/docs`を開かなくても雰囲気が伝わるよう、実際に動かした際の入出力例を載せる。

**ログイン**

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "agent@example.com", "password": "password123"}'
```

```json
{ "accessToken": "eyJhbGciOiJIUzI1NiIs..." }
```

（`refresh_token`はhttpOnly Cookieで別途セットされ、レスポンスボディには含まれない）

**物件の新規登録（要認証）**

```bash
curl -X POST http://localhost:3000/properties \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"type": "rent", "title": "渋谷駅徒歩5分 1LDK", "price": 150000, "layout": "1LDK", "area": 40.5, "address": "東京都渋谷区..."}'
```

```json
{
  "id": 1,
  "agentId": 1,
  "type": "rent",
  "title": "渋谷駅徒歩5分 1LDK",
  "description": null,
  "price": 150000,
  "layout": "1LDK",
  "area": "40.50",
  "address": "東京都渋谷区...",
  "status": "draft",
  "createdAt": "2026-07-11T08:23:52.320Z",
  "updatedAt": "2026-07-11T08:23:52.320Z"
}
```

**物件検索（未認証・絞り込み）**

```bash
curl "http://localhost:3000/properties?layout=2LDK&maxPrice=80000&keyword=ペット可"
```

`type` / `minPrice` / `maxPrice` に加え、`layout`（完全一致）と `keyword`（タイトル・説明の部分一致。`%`等のLIKEメタ文字はエスケープして文字通り扱う）で絞り込める。

**内見空き枠の確認（未認証・公開エンドポイント）**

```bash
curl "http://localhost:3000/properties/1/availability?from=2026-07-20&to=2026-07-21"
```

```json
{
  "propertyId": 1,
  "days": [
    {
      "date": "2026-07-20",
      "slots": [
        { "startAt": "2026-07-20T10:00:00+09:00", "available": true },
        { "startAt": "2026-07-20T11:00:00+09:00", "available": false }
      ]
    }
  ]
}
```

（営業時間はJST固定の10:00〜18:00・1時間刻み。期間は最大7日。予約中の内見と重複する枠が`available: false`になる）

**問い合わせ（未認証・公開エンドポイント）**

```bash
curl -X POST http://localhost:3000/properties/1/inquiries \
  -H "Content-Type: application/json" \
  -d '{"name": "山田太郎", "email": "yamada@example.com", "message": "内見を希望します"}'
```

```json
{
  "id": 1,
  "propertyId": 1,
  "customerId": 1,
  "message": "内見を希望します",
  "status": "new",
  "createdAt": "2026-07-11T08:30:00.000Z",
  "updatedAt": "2026-07-11T08:30:00.000Z"
}
```

## 主な設計判断・意図的な簡略化（既知の制約）

### 顧客識別の精度（メール認証は未実装）

`POST /properties/:id/inquiries`は未認証・匿名で誰でも問い合わせできる公開エンドポイント。送られてきた`email`を顧客の一意な識別子として扱い、`customers`テーブルをemail基準でupsertしている（同じemailなら同一人物とみなす）。

**既知の制約**: このエンドポイントには本人確認手段が無いため、同じメールアドレスを複数人が共有している場合（家族共用アドレス、会社の代表アドレスなど）、別人からの問い合わせが誤って同一顧客として扱われ、`customers.name`が意図せず上書きされる可能性がある。上書き発生時はサーバーログに警告を出力する（`src/repositories/customerRepository.ts`の`upsertByEmail`）が、上書き自体は防げない。

**改修案**: メール認証（OTP・マジックリンク等）で本人確認ができた場合のみ同一人物として扱う。ただし顧客側にログイン・認証フローを追加することになり、「誰でも気軽に問い合わせできる」という公開エンドポイントの趣旨とはトレードオフになるため、今回のスコープでは見送った。

### レート制限（インメモリ実装の制約）

`POST /properties/:id/inquiries`には、IPごとに1分あたり5回までのレート制限をかけている（`src/middlewares/rateLimit.ts`）。

**既知の制約**: プロセス内メモリの`Map`でカウントする最もシンプルな実装。単一インスタンスでは機能するが、Vercelのようなサーバーレス環境ではリクエストごとに別インスタンスが起動し得るため、インスタンス間でカウントが共有されず実質的な制限が緩くなる（または効かなくなる）可能性がある。

**改修案**: 本番運用ではRedis等の外部ストア（Upstash Redisなど）にカウントを持たせ、インスタンスをまたいだ一貫したレート制限を行う。

### CSRF対策（Origin検証）の適用範囲

Origin検証は、リフレッシュトークン（httpOnly Cookie）が自動送信される`POST /auth/refresh`・`POST /auth/logout`にのみ適用している。

CSRFは「ブラウザがCookieを自動付与すること」を悪用する攻撃なので、守るべきはCookieに依存するルートだけ、と整理した。Bearerトークン必須のルートは攻撃者がクロスサイトから`Authorization`ヘッダーを付与できないため、公開POST（問い合わせ）はそもそも保護すべき資格情報がないため、いずれも脅威モデル外。この整理により、Originヘッダーを送らないサーバー間通信（後述のAIエージェント）やcurlからの書き込みも自然に通る。

### 空き枠確認はスロットテーブルを持たない計算方式

`GET /properties/:id/availability`は、スロット専用のテーブルを事前生成せず、「営業時間内の1時間枠のうち、予約中(scheduled)の内見と重複しない枠を空きとする」を毎回計算して返す。空き枠の実体をテーブルで持つと、生成バッチや内見予約との二重管理（整合性維持）が必要になるため、この規模では計算方式が最もシンプルと判断した。

**既知の制約**: 営業時間（10:00〜18:00 JST）と枠の長さ（1時間）はアプリケーション定数で固定。物件や担当者ごとに営業時間を変えるなら、設定テーブルの追加が必要になる。

### デモ用途による簡略化（`/auth/register`の公開）

エージェント登録エンドポイントは誰でも叩ける状態で公開している（ポートフォリオとして動作をすぐ試せることを優先）。実運用であれば、招待制・管理者による作成・メールドメイン制限などで登録を閉じるべき箇所。

## AIエージェント（別作品）からの利用

本APIは、別作品のAIエージェント（Next.js + Vercel AI SDK）が「ツール」として呼び出す外部サービスでもある。エージェントは物件検索→詳細確認→空き枠確認→（ユーザー承認を挟んで）内見予約、という多段フローで本APIを叩く。

エージェント側の要求に応えるかたちで、本APIには以下の進化を加えた:

- **検索パラメータの拡張**（`layout`・`keyword`）: 「予算8万円以内・2LDK・ペット可」のような自然文の希望条件を、APIの絞り込みに落とせるようにした
- **内見空き枠の公開エンドポイント**（`GET /properties/:id/availability`）: エージェントが内見予約の前に空き状況を確認できるようにした
- **CSRF適用範囲の整理**: エージェントのサーバー（Route Handler）からのOriginヘッダー無しのリクエストが、安全性を損なわずに通るようにした（前述）

エージェントが使う書き込み系のうち`POST /inquiries/:id/viewings`は要認証。デモ用エージェントアカウントのJWTを、エージェント側のサーバー内でのみ取得・保持して利用する（クライアントには一切出さない）。

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

- 本番URL: （デプロイ後に追記）
