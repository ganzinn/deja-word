# ADR-0011: 掲載箇所（Occurrence）概念と WordOccurrence 多対多

- ステータス: 提案
- 確信度: 中
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

「単語をどこで出会ったか」を表す分類が当初は「タグ」として実装されており、Occurrence も当初は `word_id` を直接持つ（単語 1 件に従属する）構造だった。同じ単語が複数の教材に載る現実と合っていなかった。

## 決定内容

- 「タグ」を**掲載箇所（Occurrence）**の概念へ刷新する。掲載箇所は「単語と出会った場所」（教材名等）を表すマスタで、`@@unique([ownerId, location])`
- Word と Occurrence は join テーブル **WordOccurrence** の多対多で結び、掲載番号（`occurrenceNumber`、nullable、`@@unique([occurrenceId, occurrenceNumber])`）を持たせる
- system 所有のプリセット掲載箇所（ターゲット1900 / システム英単語）を seed で用意する

## 採らなかった代替案

- タグ（自由ラベル）のまま拡張 — commit `fb09554` で刷新されたが、比較検討の記録は残っていない
- Occurrence が `word_id` を直接持つ従属構造 — migration `20260514005225_restructure_occurrence_with_word_link` で多対多へ再構築された（同じ単語を複数教材に載せられないため、と推定）

## 影響

- quiz の出題範囲指定（掲載箇所 + 番号範囲、[ADR-0022](0022-quiz-source-occurrence-range.md)）はこの構造の上に成立している
- `Occurrence.location` という命名は「出会った場所」の広い意図で付けられたが、実態は「テストを切る単位」であり、改名の要否が issue #97 として保留されている

## 根拠（コード・コミット・文書参照）

- commit `fb09554` "タグを「掲載箇所」に刷新しカスタム追加と複数掲載詳細に対応"
- commit `bbdaa51` "Word 関連スキーマを再構築し例文セクションを追加"
- `prisma/migrations/20260514005225_restructure_occurrence_with_word_link/`
- `docs/reference/naming-book.md` — 掲載箇所の定義、issue #97 への言及

## 人間への確認質問

- （補足）タグ → 掲載箇所への刷新時、他に検討した概念モデルがあれば記録に残したい
