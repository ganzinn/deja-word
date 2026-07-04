# ADR-0035: 自己判定に「うろ覚え」(VAGUE) を導入、GAVE_UP は回答前「わからない」に転用

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

自己判定形式（答えを見てから本人が正誤を申告する形式）で、当初の申告選択肢は「正解 /（思い浮かばなかった = GAVE_UP）」等の構成だった。「たまたま正解した（当てずっぽうで合っていた）」場合に正解として残数が進むのは定着の実態と合わない。

## 決定内容

- 自己判定の申告に**正解と不正解の中間である「うろ覚え」(QuizResult.VAGUE)** を追加する（commit `f2dd495`、PR #78）
- 旧「思い浮かばなかった」ラベルは廃止し、**GAVE_UP enum 値は削除せず「回答前のわからない」申告に転用**する（naming-book ブレ 3 に正規の用語対応が記録されている）
- drill の残数計算では VAGUE 用の初期残数（`vagueRemaining`）を持つ

## 採らなかった代替案

- 正解 / 不正解の 2 値のみ — 却下（quiz-03 の却下案「2択のみ」）。たまたま正解を正解扱いにすると定着判定が甘くなる
- 部分正解スコア — 却下（同却下案「部分正解あり」）

## 影響

- QuizResult は CORRECT / INCORRECT / VAGUE / GAVE_UP / TIMEOUT の 5 値になり、drill の残数遷移（[ADR-0036](0036-drill-remaining-count-model.md)）が結果値ごとに定義される
- enum 値 GAVE_UP とその UI 上の意味（わからない）がずれているため、naming-book の対応表が理解の前提になる

## 根拠（コード・コミット・文書参照）

- commit `f2dd495` "feat: 単語テストに「うろ覚え」（正解と不正解の中間）を追加"（PR #78）
- `docs/reference/naming-book.md` ブレ 3 — GAVE_UP / VAGUE のラベル変遷
- `prisma/schema.prisma` — QuizResult enum と drill 残数カラム
- `docs/design/word-quiz/03-algorithm.md` — 自己判定 3 値の決定と却下案
