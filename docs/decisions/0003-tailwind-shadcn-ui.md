# UIライブラリに Tailwind CSS + shadcn/ui を採用する

## 状況

道の駅v2のフロントエンド（React + Vite on Cloudflare Pages）のUIライブラリを選定する。旧repoは Chakra UI v3 を採用しており、`docs/chakra-ui-rules.md` として運用知見も蓄積されていた。

継続（Chakra UI v3）と乗り換え（Tailwind等）の判断が必要。

## 決定

**Tailwind CSS + shadcn/ui を採用する。** 旧repoの Chakra UI v3 からは乗り換える。

## 理由

### 決定的な理由: AIによる実装効率

このプロジェクトはコード実装をすべてAI（Claude Code + Codex）に委譲する方針。AIが得意な記法・命名体系を優先することで生産性が最大化される。

- Tailwindはクラス名がドキュメント化されており、AIが正確に生成しやすい
- shadcn/uiはコピペ型（コンポーネントをリポジトリ内にコピーして所有）で、AIが直接編集しやすい
- Chakraのprops-basedスタイルもAIで扱えるが、Tailwindの方がLLMの学習データが多く、生成精度が高い

### 副次的な理由

1. **エコシステムのトレンド**
   - Tailwind CSS（v4）は新規React プロジェクトの事実上の標準
   - shadcn/uiの急伸によりコンポーネント配布モデルが定着
   - GitHub Stars: Tailwind約85k、shadcn/ui約75k（対 Chakra UI約38k）
2. **バンドルサイズ**
   - Tailwindは未使用クラスをpurgeするため最終バンドルが小さい
   - Chakraはコンポーネント単位で含まれ、相対的に大きい
3. **カスタマイズ性**
   - shadcn/uiはコード所有型で、実装を直接改変可能
   - Chakraはブラックボックス化されたコンポーネントの拡張が中心
4. **Cloudflare Pagesとの相性**
   - どちらも動作可能だが、Tailwindのビルド成果物はCDN配信に最適

### 却下した選択肢

- **Chakra UI v3 継続**
  - 旧repo資産流用の恩恵はあるが、AI適性とトレンドの点で劣後
  - v3で大幅リライトされたため「旧repoの知見がそのまま使える」わけでもない
- **Mantine**
  - Chakraライクだが、コミュニティ規模でTailwind陣営に及ばない
- **MUI (Material UI)**
  - 業務系に強いが、バンドルサイズが大きくCloudflareの配信サイズ最適化と噛み合わない
- **Radix UI + Tailwind（shadcnなし）**
  - shadcn/uiが実質Radix + Tailwindのラッパーであり、こちらを直接採用しない理由がない

### 移行の非対称性について

Chakra UIで開始 → 後日Tailwindに移行、というパスも検討したが、以下の理由で最初からTailwindを選ぶ:

- Chakra → Tailwindは実質「書き直し」であり、自動移行手段がない
- 併用は可能だがバンドル増と保守性低下を招く
- 移行コスト回避のためだけに初期選択で妥協するのは合理性が薄い

## 結果

（後から追記）
