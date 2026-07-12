# ADR-0033: drill ラウンドの冪等性は roundCount の compare-and-swap

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

drill のラウンド結果送信が二重実行されると残数（[ADR-0036](0036-drill-remaining-count-model.md)）が二重に減り、学習状態が壊れる。TEST と違い drill は重複を許容できない。

## 決定内容

`Drill.roundCount` を用いた **compare-and-swap（CAS）**で冪等化する。ラウンド送信は「期待する roundCount を where に含めた `updateMany`」で行い、更新件数 0 なら既に処理済みとして残数更新をスキップする。

**楽観ロックや素の update に書き換えないこと**が規約として明記されている。

## 採らなかった代替案

- **updatedAt ベースの楽観ロック** — 却下（quiz-05 決定 4 の却下案）
- **idempotency key テーブルの追加** — 却下（同上。テーブル追加のコストに見合わない）

## 影響

- `roundCount` は「表示用の連番」ではなく整合性機構の一部。意味を知らずに削除・変更すると冪等性が壊れる
- DRILL_RETRY は roundCount を進めない設計（[ADR-0041](0041-drill-retry.md)）と組み合わさっている

## 根拠（コード・コミット・文書参照）

- 決定 4（元 design ドキュメントは実装完了に伴い削除。本 ADR が一次情報）
- `src/lib/CLAUDE.md` — 「楽観ロックや素の update に書き換えない」（決定 4 への参照付き）
- `src/lib/quiz/handlers/drill-round-handler.ts` / `src/lib/drill-round-submit.ts`
- `prisma/schema.prisma` — `Drill.roundCount`
