# ADR-0019: words 書き込みは EditorContext + row-policy の二層認可、quiz は意図的に不適用

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

単語編集画面では、一般ユーザーが system 共有行を「そのまま維持」しつつ自分の行を追加・編集できる。行単位で「誰の行に何をしてよいか」の判定が必要で、当初は `SYSTEM_USER_ID` の条件分岐が handler 内に散在していた。

## 決定内容

words の書き込み認可を 2 層の純関数に分離し、`src/lib/words/policy/` に集約する:

1. **EditorContext**（`policy/editor-context.ts`）: 「誰として書くか」（一般ユーザー / system）
2. **row-policy**（`policy/row-policy.ts`）: 行単位の許可判定。一般ユーザーは system 行の pass-through（無変更維持）は可、変更・削除は不可

認可変更は row-policy に集中させ、handler 内に条件分岐を置かない。DB 読み取りは UseCase が行い、policy へは `loadedRows` として渡す（policy は純関数でテスト可能）。

一方 **quiz はこの二層を意図的に使わない**。quiz は system 共有行に書き込まないため、`ownerId: userId` の単純所有で足りる（words との意図的な相違として設計に明記）。

## 採らなかった代替案

- handler 内の `SYSTEM_USER_ID` 条件分岐（旧実装）— リファクタ Phase 2–4 で解消。Phase 4（commit `2b71e8b`）には `SYSTEM_USER_ID` が残ってよい場所の grep 不変条件が DoD として記録されている
- quiz にも同じ policy を適用 — 「quiz は共有行に書かないため不適用」として却下（`docs/design/word-quiz/05-architecture.md` 決定 5）

## 影響

- 認可の変更・レビューは `policy/` の 2 ファイルを見ればよい
- 単語の書き込みは正規経路（`createWordForUser` → `writeWordChildren`）を通す契約があり、`tx.word.create` での迂回は row-policy と書き込み順序の契約を壊す（`src/lib/CLAUDE.md`）

## 根拠（コード・コミット・文書参照）

- `src/lib/words/CLAUDE.md` — 二層認可の規約（EditorContext = 誰として書くか / row-policy = 行単位許可）
- `src/lib/words/policy/row-policy.ts` / `policy/editor-context.ts`
- commit `2b71e8b` "認可ロジックを policy/ に切り出し SYSTEM_USER_ID を局所化"（Phase 4）
- `docs/design/word-quiz/05-architecture.md` 決定 5 — quiz 側の意図的不適用
