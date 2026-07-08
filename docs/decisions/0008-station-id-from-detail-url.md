# 道の駅IDを詳細ページの数値IDから UUID v5 で生成する

## 状況

`stations.id` は安定した主キーである必要がある。同一の道の駅は、再スクレイプしても常に同じ ID になる（冪等）ことが求められる。そうでないと、再取得のたびに重複行が生まれたり、将来この ID を参照する箇所（チェックイン、ブックマーク、外部連携等）が壊れる。

旧repo（u-akihiro/michi_no_eki, ADR-0008）は `uuid.NewSHA1(NameSpaceDNS, name + "/" + prefecture)` として **道の駅名＋都道府県** から UUID v5 を生成していた。しかしこの方式は **名称変更に追従できない** — 駅名が変わると別 ID になり、同一施設が別レコード化してしまう。

michi-no-eki.jp の詳細ページ URL は `https://www.michi-no-eki.jp/stations/views/{数値ID}`（例 `/stations/views/18786`）の形式で、この `{数値ID}` は同サイトが各駅に振る**永続的な固有ID**である。これを ID の一次キーに使う。

## 決定

`stations.id` は、詳細ページ URL から抽出した数値IDをもとに、**論理キー `station:{数値ID}` を固定アプリ namespace で UUID v5 生成**する。

```
NAMESPACE = 615c3168-7878-4e61-b458-a225b3261663   // 本プロジェクト固定
id = uuidv5(`station:${sourceStationId}`, NAMESPACE)
```

あわせて、抽出した数値IDを **`source_station_id`（INTEGER, UNIQUE）列**として保持する（provenance・upsert キー・ID体系変更の検知に用いる）。

ハッシュ入力は `scheme / host / www / 末尾スラッシュ / クエリ / パス（stations/views）` を**意図的に除外**し、リソース種別 discriminator `station:` と数値IDのみで構成する。

## 理由

- **名称変更に強い**: identity を担うのはサイトの数値IDであり、駅名や住所の変更で ID が変わらない。
- **URL 装飾・パス再編に強い**: `views`→`view`、`/spot/{id}` へのパス変更、`www` の有無、ドメイン移転などが起きても、数値IDが同じなら ID は不変。生 URL や domain+path をハッシュすると、これら「identity に本質的でない可変部分」の変更で全駅の ID が飛ぶ。
- **名前空間衝突の回避**: 裸の整数ではなく `station:` を前置することで、サイトが別セクションで同じ整数を使っても衝突しない。
- **UUID を主キーにする意義**: 公開 API の主キーをソース由来の連番に直結させず、非連番・安定・非推測な ID を提供できる（旧repo が SERIAL→UUID へ移行した理由と同じ）。

### 却下した選択肢

- **name + prefecture（旧方式）**: 名称変更に追従できない。
- **生 URL をハッシュ**: `https`/`www`/末尾スラッシュ/クエリの揺れで別 ID 化する。
- **domain + path をハッシュ**: パス構造・ホスト変更で全 ID が再生成される。可変部分を巻き込みすぎる。
- **裸の数値ID をハッシュ**: サイト内の名前空間衝突リスクが残る（discriminator 付与で解消）。
- **数値IDをそのまま主キー**: ソースの連番に公開キーを直結させたくない。ただし `source_station_id` 列としては保持する。

## 結果

（後から追記）
