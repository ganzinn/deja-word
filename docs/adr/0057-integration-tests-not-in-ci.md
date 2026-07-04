# ADR-0057: integration テストは CI で走らせない（ローカルのみ）

- ステータス: 提案
- 確信度: 低
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

integration テスト（[ADR-0056](0056-test-split-unit-integration.md)）は Postgres と `.env.test` を必要とする。CI（GitHub Actions）は lint / typecheck / format:check / unit テストを対象にしており、導入時に「DB / 認証 env は不要」であることが言及されていた（M5 の CI 導入コミット）。

## 決定内容

**integration テストはローカルのみで実行し、CI では走らせない**（AGENTS.md に運用として明記）。CI は env 非依存の高速チェックに限定する。

## 採らなかった代替案

- CI に Postgres サービスコンテナを立てて integration も走らせる — 採られていないが、**却下の記録は無い**（検討されたかどうか自体が不明）

## 影響

- DB 層のリグレッション（クエリ・migration・truncate 順序など）は、ローカルで `pnpm test:integration` を回さない限り検出されない。マージ前のローカル実行が運用上の前提になる
- CI は DB・secrets を持たないため、fork PR やセキュリティ面の考慮が単純になっている

## 根拠（コード・コミット・文書参照）

- `AGENTS.md` Testing 節 — 「ローカルのみ、CI では走らせない」（事実の記載のみで理由は未記録）
- commit `50a0c11`（M5 Phase 5、CI 導入。「DB / 認証 env は不要」の言及）
- `.github/workflows/` — CI 対象の実態

## 人間への確認質問

- CI から integration を外したのは、DB サービス用意のコスト / 実行時間 / secrets 管理のどれが主因か？
- 将来 CI に integration を載せる意向はあるか？（あるなら「暫定」、ないなら「恒久」として本 ADR を確定したい）
