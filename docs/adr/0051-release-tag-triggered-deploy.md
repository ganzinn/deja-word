# ADR-0051: 本番デプロイは GitHub Release タグトリガー（main 自動デプロイと Preview を抑止）

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

Vercel の Git Integration は main へのマージで自動デプロイする。リリースのタイミングを人間が制御したいが、Vercel の Git Integration は**ブランチベース**であり、git タグや GitHub Release を直接トリガにできない。

## 決定内容

- **main マージの自動デプロイを止め、GitHub Release の発行（タグ `rel-YYYYMMDDHHmm`）を本番デプロイのトリガー**にする。Release publish → GitHub Actions → Vercel CLI（remote build）→ 本番デプロイ
- Preview Deployments は `vercel.ts` の `git.deploymentEnabled` を全ブランチ false にして抑止する（Dashboard に Preview 全体を OFF にする単一トグルが無いため、この方法を選んだと理由明記）
- 入口は手動の「Create Release」ワークフロー 1 本に集約し、デプロイ側は `workflow_call` で再利用する。GITHUB_TOKEN が作成した Release は `release:published` を再発火しないため、dispatch ワークフローからデプロイを直接チェーンする（回避理由が明記）
- ビルドは `--prebuilt` ではなく **remote build**（機密 env が Vercel 側に揃っているため）。Release ノートは `--generate-notes` で自動生成

## 採らなかった代替案

- **main マージ自動デプロイ（Vercel 既定）** — リリース制御のため停止（commit `c8466f1` で移行）
- **`--prebuilt`（CI でビルドして成果物を上げる）** — 機密 env を CI に置く必要が生じるため remote build を選択（ops 文書に記載）

## 影響

- main へのマージはデプロイを意味しない。本番反映は必ず Release 作成の明示操作を伴う
- ロールバックは過去 Release の再デプロイ手順として `docs/ops/release-deploy.md` に文書化されている

## 根拠（コード・コミット・文書参照）

- commit `c8466f1` "ci: production デプロイを main merge から GitHub Release トリガへ移行"（PR #17）
- commit `f83420b` "ci: Create Release ワークフロー追加とデプロイの再利用化" — GITHUB_TOKEN 再発火制約の明記
- commit `87bb43f` "vercel.ts で Preview Deployments を抑止" — 単一トグル不在の理由明記
- `docs/ops/release-deploy.md` / `.github/workflows/`
