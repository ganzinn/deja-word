# ADR-0037: drill は元テスト単位で独立生成（ユーザー単位の単一プールを持たない）

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

drill（定着モード）の生成単位を、ユーザー全体で 1 つの復習プールにするか、テスト実施ごとに独立させるかの選択があった。

## 決定内容

**drill は元テスト（TEST の結果画面）から都度生成し、テスト単位で独立**させる。結果画面の導線から drill を作成し、複数の drill が並存できる。不要になった drill はユーザーが削除できる（削除導線も設計時に決定、quiz-06 決定 7）。

## 採らなかった代替案

`docs/design/word-quiz/06-drill-mode.md` 決定 2 の却下案:

- **ユーザー単位の単一プール** — 却下
- **掲載箇所単位のプール** — 却下
- **テスト完了時の自動生成** — 却下（ユーザーの明示操作で生成する）

## 影響

- Drill が元テストの範囲・形式などのスナップショット（`format` / `timeoutSeconds` / `rangeFrom/To` / `sourceRangeFrom/To`）を保持する設計になった
- 同じ単語が複数 drill に属し得るが、残数は drill ごとに独立している

## 根拠（コード・コミット・文書参照）

- `docs/design/word-quiz/06-drill-mode.md` 決定 2・決定 7（design/ 削除運用の対象になった場合は本 ADR が引き継ぎ先）
- `src/lib/drill-create.ts` / `src/lib/drill-list.ts` / `src/lib/drill-delete.ts`
- `prisma/schema.prisma` — Drill / DrillWord
