/**
 * デモ用シードスクリプト
 *
 * 実行方法:
 *   DATABASE_URL=<接続文字列> SEED_AGENT_PASSWORD=<パスワード> pnpm seed
 *   （ローカル開発DBに対しては pnpm seed:local で.envの接続先に投入）
 *
 * 注意:
 * - 全テーブルをTRUNCATEしてから投入する「作り直し」方式（デモ用DB専用。再実行すれば常に同じ状態に戻せる）
 * - デモ用エージェントのパスワードは環境変数で渡す（コミットしない）。
 *   同じ資格情報を⑥AIエージェント側のサーバー環境変数にも設定して使う
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { agents, customers, inquiries, properties, viewings } from "../src/db/schema.js";
import { hashPassword } from "../src/lib/password.js";

const SEED_AGENT_EMAIL = process.env.SEED_AGENT_EMAIL ?? "demo-agent@example.com";
const SEED_AGENT_NAME = process.env.SEED_AGENT_NAME ?? "デモ担当者";
const SEED_AGENT_PASSWORD = process.env.SEED_AGENT_PASSWORD;

if (!SEED_AGENT_PASSWORD) {
  console.error("SEED_AGENT_PASSWORD を環境変数で指定してください（デモ用エージェントのログインパスワードになります）");
  process.exit(1);
}

// 内見予約の日時は実行時点からの相対で組み立てる（いつ再シードしてもデモが近日の日付で成立するように）
// now+9hのUTC表記 = JSTの壁時計から日付部分を取り出す
function jstDateString(daysFromNow: number): string {
  return new Date(Date.now() + 9 * 3600000 + daysFromNow * 86400000).toISOString().slice(0, 10);
}

function jstDateTime(daysFromNow: number, hour: number): Date {
  return new Date(`${jstDateString(daysFromNow)}T${String(hour).padStart(2, "0")}:00:00+09:00`);
}

type PropertySeed = {
  type: "rent" | "sale";
  title: string;
  description?: string;
  price: number;
  layout?: string;
  area?: string;
  address: string;
  status: "draft" | "published" | "contracted" | "closed";
};

// ⑥のデモシナリオ「予算8万円以内・2LDK・ペット可」に確実にヒットする物件（先頭4件）を含む55件
const PROPERTY_SEEDS: PropertySeed[] = [
  // ── デモの主役: 賃貸・2LDK・8万円以下・ペット可（published） ──
  {
    type: "rent",
    title: "阿佐ヶ谷駅徒歩6分 ペット可2LDK メゾンすずかけ201",
    description:
      "小型犬・猫2匹まで飼育可（敷金+1ヶ月）。駅徒歩6分の閑静な住宅街で、南向きバルコニーと独立洗面台つき。近隣に動物病院とドッグラン併設の公園があります。",
    price: 78000,
    layout: "2LDK",
    area: "52.30",
    address: "東京都杉並区阿佐谷南3-12-8",
    status: "published",
  },
  {
    type: "rent",
    title: "練馬駅徒歩8分 ペット相談可2LDK グリーンハイツ石神井102",
    description:
      "ペット相談可（小型犬・猫）。1階専用庭つきでペットの足洗い場あり。都営大江戸線・西武池袋線の2路線利用可、スーパー徒歩2分の買い物便利な立地です。",
    price: 75000,
    layout: "2LDK",
    area: "50.10",
    address: "東京都練馬区豊玉北5-18-2",
    status: "published",
  },
  {
    type: "rent",
    title: "葛飾・金町駅徒歩10分 ペット可2LDK リバーサイド金町305",
    description:
      "ペット可（小型犬1匹または猫2匹まで）。江戸川の河川敷が徒歩3分で散歩コースに最適。追い焚き機能・宅配ボックスつき、2口ガスコンロ設置済みです。",
    price: 72000,
    layout: "2LDK",
    area: "54.00",
    address: "東京都葛飾区金町4-7-15",
    status: "published",
  },
  {
    type: "rent",
    title: "八王子駅バス5分 ペット可2LDK コーポやまぼうし B棟",
    description:
      "犬猫合わせて2匹まで飼育可。バス停まで徒歩1分、八王子駅までバス5分。60㎡超のゆとりある間取りで、ペット用クロス・傷に強い床材を採用したリノベーション済み物件です。",
    price: 69500,
    layout: "2LDK",
    area: "60.80",
    address: "東京都八王子市子安町2-9-4",
    status: "published",
  },
  // ── 2LDKだがペット不可 or 予算オーバー（絞り込み・条件緩和の判断材料） ──
  {
    type: "rent",
    title: "中野駅徒歩5分 2LDK ライオンズプラザ中野702",
    description:
      "駅徒歩5分・築浅のオートロックマンション。浴室乾燥機・食洗機つき。ペットの飼育は不可です。",
    price: 145000,
    layout: "2LDK",
    area: "55.60",
    address: "東京都中野区中野5-3-11",
    status: "published",
  },
  {
    type: "rent",
    title: "三軒茶屋駅徒歩7分 ペット可2LDK パークサイド世田谷401",
    description:
      "小型犬・猫可（敷金+1ヶ月）。世田谷公園まで徒歩5分でペットとの暮らしに人気のエリア。カウンターキッチン・ウォークインクローゼットつき。",
    price: 128000,
    layout: "2LDK",
    area: "58.20",
    address: "東京都世田谷区太子堂4-22-6",
    status: "published",
  },
  {
    type: "rent",
    title: "赤羽駅徒歩9分 2LDK シティハイム赤羽203",
    description: "商店街至近で買い物便利。二人暮らし・新婚さんに人気の間取りです。ペット不可。",
    price: 79000,
    layout: "2LDK",
    area: "48.90",
    address: "東京都北区赤羽南1-14-3",
    status: "published",
  },
  {
    type: "rent",
    title: "亀有駅徒歩12分 ペット可2LDK メゾンドソレイユ101",
    description:
      "小型犬・猫相談可。駅徒歩12分ですが、その分ゆとりの広さと家賃設定。追い焚き・TVモニタホンつきです。",
    price: 83000,
    layout: "2LDK",
    area: "56.40",
    address: "東京都葛飾区亀有3-26-9",
    status: "published",
  },
  // ── 1LDK・1K・1DK帯（published） ──
  {
    type: "rent",
    title: "高円寺駅徒歩4分 1LDK カーサ高円寺301",
    description: "駅近1LDK。独立洗面台・浴室乾燥機・オートロックつき。単身・二人入居可。",
    price: 98000,
    layout: "1LDK",
    area: "38.50",
    address: "東京都杉並区高円寺北2-5-17",
    status: "published",
  },
  {
    type: "rent",
    title: "池袋駅徒歩10分 1K プレール池袋West 604",
    description: "都心アクセス抜群の1K。宅配ボックス・防犯カメラ・オートロック完備。",
    price: 85000,
    layout: "1K",
    area: "25.10",
    address: "東京都豊島区池袋3-41-2",
    status: "published",
  },
  {
    type: "rent",
    title: "北千住駅徒歩8分 ペット可1LDK アニマート千住102",
    description:
      "猫2匹まで飼育可（小型犬は相談）。キャットウォーク造作つきの珍しいペット共生型賃貸です。",
    price: 89000,
    layout: "1LDK",
    area: "40.20",
    address: "東京都足立区千住旭町4-12",
    status: "published",
  },
  {
    type: "rent",
    title: "荻窪駅徒歩11分 1DK 荻窪コーポラス202",
    description: "昔ながらの落ち着いた住宅街。リフォーム済みで室内は清潔です。ペット不可。",
    price: 68000,
    layout: "1DK",
    area: "30.00",
    address: "東京都杉並区荻窪2-8-21",
    status: "published",
  },
  {
    type: "rent",
    title: "西日暮里駅徒歩6分 1K ステージア日暮里305",
    description: "山手線徒歩6分の好立地1K。バス・トイレ別、2階以上・南向き。",
    price: 78000,
    layout: "1K",
    area: "22.80",
    address: "東京都荒川区西日暮里5-19-7",
    status: "published",
  },
  {
    type: "rent",
    title: "調布駅徒歩5分 1LDK ガーデン調布ステーションフロント503",
    description: "再開発で便利になった調布駅前エリア。京王線特急停車駅で新宿まで15分です。",
    price: 92000,
    layout: "1LDK",
    area: "36.90",
    address: "東京都調布市布田1-36-4",
    status: "published",
  },
  // ── 3LDK・ファミリー帯（published） ──
  {
    type: "rent",
    title: "光が丘駅徒歩9分 3LDK ファミール光が丘605",
    description:
      "光が丘公園至近のファミリー向け3LDK。学区・買い物環境良好で、和室1部屋つきの使いやすい間取りです。ペット不可。",
    price: 135000,
    layout: "3LDK",
    area: "68.50",
    address: "東京都練馬区光が丘3-9-1",
    status: "published",
  },
  {
    type: "rent",
    title: "西葛西駅徒歩10分 ペット可3LDK リバージュ葛西202",
    description:
      "小型犬・猫可。荒川河川敷まで徒歩5分。ファミリーとペットでゆったり暮らせる70㎡超です。",
    price: 148000,
    layout: "3LDK",
    area: "71.20",
    address: "東京都江戸川区西葛西6-13-8",
    status: "published",
  },
  {
    type: "rent",
    title: "町田駅バス7分 3LDK グランドメゾン町田A-301",
    description: "緑豊かな環境のファミリー向け3LDK。駐車場1台無料、追い焚き・床暖房つき。",
    price: 105000,
    layout: "3LDK",
    area: "72.00",
    address: "東京都町田市原町田6-28-3",
    status: "published",
  },
  // ── 2DK・低価格帯（published） ──
  {
    type: "rent",
    title: "竹ノ塚駅徒歩13分 2DK 第2さつきハイツ201",
    description: "リフォーム済み2DK。家賃を抑えたい二人暮らしにおすすめです。ペット不可。",
    price: 62000,
    layout: "2DK",
    area: "40.00",
    address: "東京都足立区西竹の塚1-10-6",
    status: "published",
  },
  {
    type: "rent",
    title: "小岩駅徒歩9分 2DK メゾン小岩104",
    description: "商店街近くの2DK。日当たり良好・室内洗濯機置場あり。楽器不可・ペット不可。",
    price: 65000,
    layout: "2DK",
    area: "38.70",
    address: "東京都江戸川区南小岩7-24-11",
    status: "published",
  },
  {
    type: "rent",
    title: "府中駅徒歩14分 ペット相談可2DK コーポ武蔵野102",
    description: "小型犬・猫相談可。府中の森公園まで自転車5分、静かな環境で家賃控えめです。",
    price: 63000,
    layout: "2DK",
    area: "41.30",
    address: "東京都府中市緑町2-14-9",
    status: "published",
  },
  // ── その他published賃貸（バリエーション） ──
  {
    type: "rent",
    title: "吉祥寺駅徒歩12分 1LDK メゾネットいのかしら B",
    description:
      "井の頭公園まで徒歩8分のメゾネットタイプ1LDK。天井が高く開放感があります。ペット不可・楽器相談可。",
    price: 112000,
    layout: "1LDK",
    area: "42.60",
    address: "東京都武蔵野市御殿山1-6-3",
    status: "published",
  },
  {
    type: "rent",
    title: "大森駅徒歩7分 2LDK サンヴェール大森902",
    description: "高層階からの眺望が魅力の2LDK。京浜東北線で品川・東京へ直通です。ペット不可。",
    price: 138000,
    layout: "2LDK",
    area: "57.30",
    address: "東京都大田区大森北1-8-12",
    status: "published",
  },
  {
    type: "rent",
    title: "板橋区役所前駅徒歩5分 1LDK クレスト板橋204",
    description: "都営三田線徒歩5分。コンビニ1分・スーパー3分で生活利便性の高い1LDKです。",
    price: 88000,
    layout: "1LDK",
    area: "35.40",
    address: "東京都板橋区板橋2-60-7",
    status: "published",
  },
  {
    type: "rent",
    title: "門前仲町駅徒歩6分 1DK リバーゲート深川503",
    description: "運河沿いの落ち着いた環境。東西線・大江戸線の2路線利用可です。ペット不可。",
    price: 95000,
    layout: "1DK",
    area: "29.80",
    address: "東京都江東区門前仲町2-4-8",
    status: "published",
  },
  {
    type: "rent",
    title: "成増駅徒歩10分 ペット可1DK ハイム成増201",
    description: "猫1匹まで飼育可。光が丘公園まで自転車圏内、家賃を抑えてペットと暮らせます。",
    price: 66000,
    layout: "1DK",
    area: "28.50",
    address: "東京都板橋区成増3-17-4",
    status: "published",
  },
  {
    type: "rent",
    title: "国分寺駅徒歩8分 2LDK セントラルハイツ国分寺302",
    description: "中央線特快停車駅の2LDK。カウンターキッチン・追い焚きつき。ペット不可。",
    price: 108000,
    layout: "2LDK",
    area: "53.70",
    address: "東京都国分寺市南町3-11-5",
    status: "published",
  },
  {
    type: "rent",
    title: "綾瀬駅徒歩7分 1K アムールあやせ103",
    description: "千代田線始発駅で座って通勤可能。単身者向けのコンパクトな1Kです。",
    price: 58000,
    layout: "1K",
    area: "20.40",
    address: "東京都足立区綾瀬2-30-8",
    status: "published",
  },
  {
    type: "rent",
    title: "下北沢駅徒歩9分 1LDK ヴィラモデルナ代田102",
    description:
      "小田急線・井の頭線の2路線利用可。カフェや古着屋が並ぶ人気エリアの1LDKです。ペット不可。",
    price: 118000,
    layout: "1LDK",
    area: "37.20",
    address: "東京都世田谷区代田5-8-16",
    status: "published",
  },
  {
    type: "rent",
    title: "王子駅徒歩6分 2DK パレ・ドール王子305",
    description: "飛鳥山公園まで徒歩5分。桜の季節が楽しみな立地の2DKです。ペット不可。",
    price: 82000,
    layout: "2DK",
    area: "42.10",
    address: "東京都北区王子1-21-9",
    status: "published",
  },
  {
    type: "rent",
    title: "立川駅徒歩11分 ペット可3LDK ガーデンコート立川E-102",
    description:
      "犬猫2匹まで可・1階専用庭つき。昭和記念公園まで自転車5分でペットとの週末が充実します。",
    price: 121000,
    layout: "3LDK",
    area: "69.80",
    address: "東京都立川市錦町4-6-22",
    status: "published",
  },
  {
    type: "rent",
    title: "錦糸町駅徒歩8分 1LDK ブライトタワー錦糸町1204",
    description: "総武線快速で東京駅まで8分。タワーマンションの高層階1LDKです。ペット不可。",
    price: 132000,
    layout: "1LDK",
    area: "40.80",
    address: "東京都墨田区江東橋2-15-3",
    status: "published",
  },
  {
    type: "rent",
    title: "田無駅徒歩9分 2LDK ソレイユ西東京201",
    description: "西武新宿線で高田馬場まで直通。買い物施設が徒歩圏に揃う2LDKです。ペット不可。",
    price: 86000,
    layout: "2LDK",
    area: "51.90",
    address: "東京都西東京市田無町4-9-12",
    status: "published",
  },
  {
    type: "rent",
    title: "浅草駅徒歩10分 1DK 蔵前リバーサイドレジデンス403",
    description: "隅田川テラス沿いの散歩が楽しい立地。バルコニーからスカイツリーが見えます。ペット不可。",
    price: 90000,
    layout: "1DK",
    area: "31.20",
    address: "東京都台東区駒形2-3-14",
    status: "published",
  },
  {
    type: "rent",
    title: "自由が丘駅徒歩8分 1LDK コートダジュール自由が丘202",
    description: "人気の自由が丘エリア。落ち着いた低層レジデンスの1LDKです。ペット不可。",
    price: 125000,
    layout: "1LDK",
    area: "39.60",
    address: "東京都目黒区自由が丘2-11-7",
    status: "published",
  },
  {
    type: "rent",
    title: "多摩センター駅徒歩12分 3LDK エステート多摩丘陵C-505",
    description: "緑豊かなニュータウンエリアのファミリー向け3LDK。駐車場空きあり。ペット不可。",
    price: 89000,
    layout: "3LDK",
    area: "70.50",
    address: "東京都多摩市落合3-2-1",
    status: "published",
  },
  // ── 賃貸draft（未公開: 可視性ルールのデモ用） ──
  {
    type: "rent",
    title: "【準備中】品川シーサイド駅徒歩5分 2LDK ベイクレスト品川805",
    description: "写真撮影後に公開予定。りんかい線徒歩5分・運河ビューの2LDKです。",
    price: 158000,
    layout: "2LDK",
    area: "56.80",
    address: "東京都品川区東品川4-10-6",
    status: "draft",
  },
  {
    type: "rent",
    title: "【準備中】笹塚駅徒歩7分 ペット可1LDK メゾンベル笹塚302",
    description: "退去後の原状回復工事中。完了次第公開します。小型犬・猫可の予定です。",
    price: 102000,
    layout: "1LDK",
    area: "38.10",
    address: "東京都渋谷区笹塚2-18-4",
    status: "draft",
  },
  {
    type: "rent",
    title: "【準備中】拝島駅徒歩15分 2DK コーポあきしま102",
    description: "オーナー承諾待ち。条件確定後に公開予定です。",
    price: 55000,
    layout: "2DK",
    area: "39.40",
    address: "東京都昭島市美堀町3-7-2",
    status: "draft",
  },
  // ── 賃貸contracted / closed（状態遷移済みデータ） ──
  {
    type: "rent",
    title: "【成約済】恵比寿駅徒歩6分 1LDK エスペランサ恵比寿503",
    description: "申込が入り契約手続き中です。",
    price: 142000,
    layout: "1LDK",
    area: "41.50",
    address: "東京都渋谷区恵比寿1-22-9",
    status: "contracted",
  },
  {
    type: "rent",
    title: "【成約済】武蔵小山駅徒歩4分 ペット可2LDK パルム武蔵小山201",
    description: "ペット可2LDKは人気が高く、公開から1週間で申込が入りました。",
    price: 79800,
    layout: "2LDK",
    area: "49.70",
    address: "東京都品川区小山3-14-8",
    status: "contracted",
  },
  {
    type: "rent",
    title: "【成約済】三鷹駅徒歩10分 1K ヴェルデ三鷹204",
    description: "契約手続き中です。",
    price: 71000,
    layout: "1K",
    area: "23.60",
    address: "東京都三鷹市下連雀3-28-5",
    status: "contracted",
  },
  {
    type: "rent",
    title: "【掲載終了】新小岩駅徒歩8分 2DK サンハイム新小岩103",
    description: "契約完了につき掲載を終了しました。",
    price: 67000,
    layout: "2DK",
    area: "37.90",
    address: "東京都葛飾区新小岩1-45-12",
    status: "closed",
  },
  {
    type: "rent",
    title: "【掲載終了】高幡不動駅徒歩9分 1LDK モナークヒルズ日野302",
    description: "オーナー都合により募集を取り下げました。",
    price: 74000,
    layout: "1LDK",
    area: "36.30",
    address: "東京都日野市高幡1005-3",
    status: "closed",
  },
  // ── 売買published ──
  {
    type: "sale",
    title: "世田谷区桜上水 中古戸建 4LDK 駐車場つき",
    description:
      "京王線桜上水駅徒歩11分。2015年築・南道路の整形地で日当たり良好。ペット飼育はもちろん自由です。",
    price: 78000000,
    layout: "4LDK",
    area: "98.50",
    address: "東京都世田谷区桜上水3-18-6",
    status: "published",
  },
  {
    type: "sale",
    title: "江東区東雲 中古マンション 3LDK タワー20階",
    description: "りんかい線東雲駅徒歩7分。20階南向き・眺望良好。管理体制良好の大規模タワーです。",
    price: 65000000,
    layout: "3LDK",
    area: "72.40",
    address: "東京都江東区東雲1-9-22",
    status: "published",
  },
  {
    type: "sale",
    title: "練馬区大泉学園町 新築建売 3LDK 全2棟の1号棟",
    description: "大泉学園駅バス8分。長期優良住宅認定・耐震等級3。小中学校まで徒歩10分圏内です。",
    price: 52800000,
    layout: "3LDK",
    area: "89.20",
    address: "東京都練馬区大泉学園町5-21-3",
    status: "published",
  },
  {
    type: "sale",
    title: "八王子市めじろ台 中古戸建 5DK 庭・菜園スペースつき",
    description: "めじろ台駅徒歩13分。広い庭で家庭菜園やドッグランも作れます。リフォーム歴あり。",
    price: 32800000,
    layout: "5DK",
    area: "112.60",
    address: "東京都八王子市めじろ台2-31-8",
    status: "published",
  },
  {
    type: "sale",
    title: "文京区本駒込 中古マンション 2LDK 低層レジデンス",
    description: "六義園至近の落ち着いた住環境。山手線駒込駅徒歩9分・管理良好の低層マンションです。",
    price: 71500000,
    layout: "2LDK",
    area: "60.10",
    address: "東京都文京区本駒込6-8-14",
    status: "published",
  },
  {
    type: "sale",
    title: "町田市玉川学園 中古戸建 4LDK 眺望良好の高台",
    description: "玉川学園前駅徒歩14分。高台からの眺望と通風が魅力。2階建て+ロフトつきです。",
    price: 41900000,
    layout: "4LDK",
    area: "104.30",
    address: "東京都町田市玉川学園7-4-19",
    status: "published",
  },
  {
    type: "sale",
    title: "足立区北綾瀬 新築建売 3LDK 駅徒歩8分",
    description: "千代田線北綾瀬駅徒歩8分。始発駅で通勤ラクラク、食洗機・床暖房標準装備です。",
    price: 45800000,
    layout: "3LDK",
    area: "85.70",
    address: "東京都足立区谷中2-14-6",
    status: "published",
  },
  {
    type: "sale",
    title: "調布市仙川 中古マンション 1LDK リノベーション済み",
    description: "仙川駅徒歩6分。2024年フルリノベーション済み・即入居可。単身・DINKS向けです。",
    price: 38500000,
    layout: "1LDK",
    area: "44.90",
    address: "東京都調布市仙川町1-25-4",
    status: "published",
  },
  // ── 売買draft / contracted / closed ──
  {
    type: "sale",
    title: "【準備中】杉並区西荻北 中古戸建 3LDK",
    description: "査定・写真撮影の準備中です。",
    price: 59800000,
    layout: "3LDK",
    area: "92.80",
    address: "東京都杉並区西荻北4-9-7",
    status: "draft",
  },
  {
    type: "sale",
    title: "【準備中】江戸川区葛西 中古マンション 2LDK",
    description: "売主と媒介契約締結済み。価格調整中です。",
    price: 43000000,
    layout: "2LDK",
    area: "58.30",
    address: "東京都江戸川区中葛西5-33-10",
    status: "draft",
  },
  {
    type: "sale",
    title: "【成約済】武蔵野市吉祥寺本町 中古マンション 2LDK",
    description: "契約手続き中です。",
    price: 82000000,
    layout: "2LDK",
    area: "61.70",
    address: "東京都武蔵野市吉祥寺本町2-16-8",
    status: "contracted",
  },
  {
    type: "sale",
    title: "【掲載終了】日野市多摩平 中古戸建 4LDK",
    description: "引き渡し完了につき掲載を終了しました。",
    price: 36500000,
    layout: "4LDK",
    area: "99.10",
    address: "東京都日野市多摩平3-8-15",
    status: "closed",
  },
];

const CUSTOMER_SEEDS = [
  { name: "佐藤 花子", email: "hanako.sato@example.com", phone: "090-1111-2222" },
  { name: "鈴木 一郎", email: "ichiro.suzuki@example.com", phone: "080-3333-4444" },
  { name: "田中 美咲", email: "misaki.tanaka@example.com", phone: "070-5555-6666" },
  { name: "高橋 健太", email: "kenta.takahashi@example.com", phone: "090-7777-8888" },
  { name: "伊藤 さくら", email: "sakura.ito@example.com", phone: null },
];

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  console.log(`シード投入先: ${url.host}${url.pathname}`);

  console.log("既存データを全削除します（TRUNCATE ... RESTART IDENTITY CASCADE）");
  await db.execute(sql`
    TRUNCATE TABLE viewings, inquiries, customers, properties, refresh_tokens, agents
    RESTART IDENTITY CASCADE
  `);

  // デモ用エージェント（シード物件すべてのオーナー。⑥のcreateViewingがこのアカウントでログインする）
  const passwordHash = await hashPassword(SEED_AGENT_PASSWORD!);
  const [demoAgent] = await db
    .insert(agents)
    .values({ name: SEED_AGENT_NAME, email: SEED_AGENT_EMAIL, passwordHash, role: "agent" })
    .returning();

  const insertedProperties = await db
    .insert(properties)
    .values(PROPERTY_SEEDS.map((seed) => ({ ...seed, agentId: demoAgent.id })))
    .returning({ id: properties.id, title: properties.title });

  const insertedCustomers = await db.insert(customers).values(CUSTOMER_SEEDS).returning();

  // 問い合わせ: 人気のペット可2LDK（先頭3件）に集中させ、内見予約と整合するstatusにする
  const [petOk1, petOk2, petOk3] = insertedProperties;
  const familyRent = insertedProperties[15]; // 西葛西 ペット可3LDK
  const insertedInquiries = await db
    .insert(inquiries)
    .values([
      {
        propertyId: petOk1.id,
        customerId: insertedCustomers[0].id,
        message: "トイプードルを飼っています。内見を希望します。土日だと助かります。",
        status: "in_progress" as const, // 下で内見予約を作成する
      },
      {
        propertyId: petOk1.id,
        customerId: insertedCustomers[1].id,
        message: "猫2匹と入居できますか？初期費用の見積もりもお願いしたいです。",
        status: "in_progress" as const, // 下で内見予約を作成する
      },
      {
        propertyId: petOk2.id,
        customerId: insertedCustomers[2].id,
        message: "専用庭つきに惹かれています。平日夕方に内見できますか？",
        status: "in_progress" as const, // 下で内見予約を作成する
      },
      {
        propertyId: petOk3.id,
        customerId: insertedCustomers[3].id,
        message: "先日内見した者です。申込書類について教えてください。",
        status: "in_progress" as const, // 下で完了済みの内見が紐づく
      },
      {
        propertyId: petOk2.id,
        customerId: insertedCustomers[4].id,
        message: "ペットは飼っていませんが、この物件は入居可能でしょうか。",
        status: "new" as const,
      },
      {
        propertyId: petOk3.id,
        customerId: insertedCustomers[0].id,
        message: "駐輪場と駐車場の空き状況を教えてください。",
        status: "new" as const,
      },
      {
        propertyId: familyRent.id,
        customerId: insertedCustomers[2].id,
        message: "子どもと犬がいます。学区と近隣の動物病院について知りたいです。",
        status: "new" as const,
      },
      {
        propertyId: insertedProperties[8].id, // 高円寺1LDK
        customerId: insertedCustomers[3].id,
        message: "来月から入居希望です。空き状況を教えてください。",
        status: "new" as const,
      },
    ])
    .returning();

  // 内見予約: 直近数日の枠を部分的に埋める（空き枠エンドポイントのデモがリアルになるように）
  await db.insert(viewings).values([
    // 阿佐ヶ谷2LDK: 明日14時に予定 + 明後日10時に別の顧客（人気物件の演出）
    {
      inquiryId: insertedInquiries[0].id,
      propertyId: petOk1.id,
      scheduledAt: jstDateTime(1, 14),
      status: "scheduled" as const,
    },
    {
      inquiryId: insertedInquiries[1].id,
      propertyId: petOk1.id,
      scheduledAt: jstDateTime(2, 10),
      status: "scheduled" as const,
    },
    // 練馬2LDK: 明日16時に予定。同じ問い合わせで一度日程変更（キャンセル→取り直し）した履歴つき
    {
      inquiryId: insertedInquiries[2].id,
      propertyId: petOk2.id,
      scheduledAt: jstDateTime(1, 11),
      status: "cancelled" as const,
    },
    {
      inquiryId: insertedInquiries[2].id,
      propertyId: petOk2.id,
      scheduledAt: jstDateTime(1, 16),
      status: "scheduled" as const,
    },
    // 金町2LDK: 3日前に内見済み
    {
      inquiryId: insertedInquiries[3].id,
      propertyId: petOk3.id,
      scheduledAt: jstDateTime(-3, 13),
      status: "completed" as const,
    },
  ]);

  console.log("シード投入が完了しました");
  console.log(`- agents: 1件（${SEED_AGENT_EMAIL} / パスワードはSEED_AGENT_PASSWORDで指定した値）`);
  console.log(`- properties: ${insertedProperties.length}件`);
  console.log(`- customers: ${insertedCustomers.length}件`);
  console.log(`- inquiries: ${insertedInquiries.length}件`);
  console.log("- viewings: 5件（scheduled 3 / completed 1 / cancelled 1）");
  console.log(
    `空き枠デモ: GET /properties/${petOk1.id}/availability?from=${jstDateString(1)}&to=${jstDateString(2)}`,
  );
}

main()
  .then(async () => {
    await db.$client.end();
  })
  .catch(async (error) => {
    console.error(error);
    await db.$client.end();
    process.exit(1);
  });
