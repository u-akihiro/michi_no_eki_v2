# 写真の二層構成（原本保存 + オンデマンド変換配信）と HEIC 受け入れ

## 状況

写真機能（#73 / ADR-0011）は、R2 に原本を無加工保存し、`GET /api/photos/:id` が原本をそのまま stream する構成。変換・最適化は「後付け」（#85）としていた。ここで以下の要求・課題が顕在化した。

1. **エクスポート向けの原本保全**: 将来のユーザーデータエクスポート実装に向け、アップロードされた画像の**原本**を確実に保つ方針を明確化したい（現状も原本は保存されているが、設計方針として固める）。
2. **HEIC の受け入れ**: iPhone 標準の **HEIC/HEIF** がアップロード検証（JPEG/PNG のマジックバイトのみ許可）で弾かれ、スマホの原本をそのまま保存できない。
3. **表示の重さ**: 大量サムネ（4a 写真タブ等）で原本をそのまま読み込むため配信が重い（#85）。

技術的制約として、**HEIC は主要ブラウザ（Chrome/Firefox）で表示できない**ため、原本 HEIC をそのまま `<img>` に出せない。事前調査で以下を確認済み。

- Cloudflare の画像変換は **HEIC を入力として全プランで decode 可**（web-safe な JPEG/WebP/PNG に変換）。Enterprise 限定なのは AVIF 入力の方。
- Workers の **Images binding**（`[images] binding = "IMAGES"`）で、**R2 等の任意ソースのバイト/ストリームを直接変換**できる（`.input()` → `.transform({width})` → `.output({format})`、入力上限 20MB）。課金は「ユニーク変換」（同一画像×パラメータは月内 1 回課金、繰り返し無料）。
- Images binding は **`wrangler dev` のローカル低精度オフライン版**で width/height/rotate/format をサポート（JPEG/PNG は変換可・課金なし）。HEIC decode まで対応するかは不明で、その確認は `--remote`（実サービス）か本番で行う。

## 決定

写真を **二層** で扱う。

1. **原本層（保全・エクスポート用）**: アップロードされたバイトを**無加工**で R2 に保存する。受け入れ形式に **HEIC/HEIF を追加**（JPEG / PNG / HEIC）。エクスポートはこの原本を返す。R2 キーは既存どおり `users/{userId}/checkins/{checkinId}/{photoId}`。
2. **表示層（アプリ内表示用）**: 配信時に **Cloudflare Image Transformations（Workers の `IMAGES` binding）** で原本を web-safe（JPEG/WebP）へ変換し、必要サイズにリサイズして stream する。これにより **HEIC も表示可能**になり、**#85 の最適化（サムネ・軽量化）も同時に達成**する。

補足の設計方針:

- **配信の堅牢化（環境非依存のフォールバック）**: `GET /api/photos/:id` は `IMAGES` binding での変換を試み、**binding 未設定 or 変換失敗（例: ローカル低精度版で HEIC decode 不可）時は R2 原本をそのまま stream にフォールバック**する。これにより、Image Transformations 未有効化のローカル開発でも写真機能が壊れない。
  - ローカル既定 `wrangler dev`: 低精度オフライン版で JPEG/PNG は変換可。HEIC の変換確認は `wrangler dev --remote` か本番で行う。
- **エクスポート経路**: 変換を通さず**原本をそのまま**返す別経路とする（表示用エンドポイントとは分離）。
- **サイズ上限**: 現行の 10MB を維持（Images binding の入力上限 20MB 内）。将来の引き上げは別途判断。
- **キャッシュ**: 変換結果は `Cache-Control`（private 写真も id 単位で不変のため immutable 可）＋エッジ/ブラウザキャッシュで再変換・再取得を抑える（ADR-0011 のキャッシュ方針を継続）。

## 理由

- **原本を R2 に保つ**ことで、エクスポート・将来の再変換・可逆性を確保できる（ADR-0011 の「R2 を保存の正とする」方針の延長）。
- Cloudflare が **HEIC を全プランで decode 可能**なため、「原本 HEIC 保存」と「表示可能性」を、Worker/クライアント側に重い HEIC デコーダを持ち込まずに両立できる。
- 変換は **オンデマンド＋ユニーク変換課金＋キャッシュ**で、個人利用のコストは小さい。表示層の最適化は #85 の目的（大量サムネの軽量化）も満たす。
- Images binding は `wrangler dev` の低精度版で width/height/format をサポートするため、**ローカルでも（JPEG/PNG は）現実的にテスト可能**。原本フォールバックにより Transformations 未有効化でも開発を止めない。

### 却下・保留した選択肢

- **アップロード時に HEIC→JPEG 変換して JPEG のみ保存**: 表示は楽だが**原本（HEIC）が失われ**、エクスポートの原本保全という目的に反する。却下。
- **Worker / クライアントでの HEIC デコード（libheif-wasm 等）**: Workers に HEIC codec が無く、WASM は重い。ブラウザも Chrome/Firefox は HEIC 非対応。Cloudflare の変換に委ねる方が確実・軽量。却下。
- **変換版もアップロード時に生成して R2 に二重保存**: ストレージ増＋生成パイプライン増。オンデマンド変換＋キャッシュで足りるため保留（大量アクセスで再検討）。

## 結果

（後から追記）

## 前提・段取り

- **事前準備（ユーザー作業）**: Cloudflare で Image Transformations を有効化し、`apps/api/wrangler.toml` に `[images] binding = "IMAGES"` を追加する（R2 有効化と同様の一度きりの準備）。
- **有効化後の確認**: `IMAGES` binding が HEIC を decode できるかを実データで 1 回検証する（Images 製品全体は HEIC 入力対応のため通る見込みだが、binding 経路として要確認）。
- **実装は別 issue**: アップロード検証への HEIC 追加、配信の変換化＋原本フォールバック、エクスポート用の原本経路、フロントの `accept` 追加、を段取りする。
