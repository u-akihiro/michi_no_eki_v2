# @michi-no-eki/shared

道の駅v2 の共有パッケージ。型定義・zodスキーマ・定数を配置する。

## 現状: ビルド未整備

`package.json` の `exports` が `./src/index.ts` を直接指している。

- Vite / Wrangler / tsc 経由での参照は動作する
- Node 直接実行（例: 将来の scraper CLI、vitest の一部モード）では解決に失敗する可能性がある

## TODO

将来 apps から本パッケージを参照する段階で、以下のいずれかで対応する:

- `tsup` などのビルダーで `dist/index.js` + `dist/index.d.ts` を生成し、`exports` を `import` / `types` に分けて指定
- または `"composite": true` + project reference で TypeScript レベルで解決

現状は空 export のみのためビルド不要。実装追加時に別issueで対応する。
