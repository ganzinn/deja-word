# ADR-0013: enum 値追加時は推奨デフォルトの backfill migration を伴う

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

quiz の形式別デフォルト設定（推奨制限時間）は形式ごとの行としてユーザーに保存される。新しい QuizFormat enum 値を追加すると、既存ユーザーにはその形式の行が存在せず、デフォルトが欠落する。

## 決定内容

QuizFormat に enum 値を追加する際は、**既存ユーザーへ推奨デフォルト制限時間を投入する backfill migration をセットで書く**。冪等性は `ON CONFLICT DO NOTHING` で担保する。先例は `20260704025822_backfill_tg_format_default_timeouts`。

## 採らなかった代替案

- アプリ側で行が無いときに実行時フォールバックする —（推定）2026-06-22 の設計改訂で「レコード全体が null のときのみ推奨デフォルト」とするフォールバック方式が定義されており、形式単位の欠落はフィールドレベルのマージを避ける方針（`docs/design/word-quiz/02-data-model.md`）と整合しないため、データ側で埋める方式になったと考えられる

## 影響

- 形式追加のチェックリスト（`src/lib/quiz/CLAUDE.md`）の最終項目として組み込まれており、TG 形式追加（formats 7–10）で実際に運用された（commit `8c6afda` の backfill）
- migration の書き忘れは「既存ユーザーだけ新形式の制限時間デフォルトが無い」という気づきにくい不整合になる

## 根拠（コード・コミット・文書参照）

- `prisma/CLAUDE.md` — enum 追加時の backfill 儀式の明文化
- `prisma/migrations/20260704025822_backfill_tg_format_default_timeouts/` — 先例
- `src/lib/quiz/CLAUDE.md` — 形式追加チェックリスト
- `docs/reference/naming-book.md` — 「形式追加時は backfill migration を伴う」旨の記載
