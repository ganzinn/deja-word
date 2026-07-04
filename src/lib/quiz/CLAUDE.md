# src/lib/quiz

- server-only の線引き: `payload.ts` / `default-settings.ts` / `spelling.ts` / `generation/` はクライアントからも import されるため `server-only` を付けない。`handlers/` / `queries/` は付ける。
- handler のシグネチャは `(tx, userId, ...)`。words の EditorContext / row-policy は使わない。quiz は system 共有行に書き込まないための意図的な相違 (docs/design/word-quiz/05-architecture.md 決定 5)。
- 出題生成は RNG (`() => number`) を引数注入する純関数。unit テストは `tests/setup/seeded-rng.ts` を注入して決定化する。シードは永続化しない (中断 = 破棄)。
- 同名ファイルに注意: `quiz/default-settings.ts` (client-safe 定数) と `src/lib/quiz-default-settings.ts` (server-only UseCase)、`quiz/spelling.ts` (採点) と `quiz/generation/spelling.ts` (出題生成) は別物。

## 出題形式の追加チェックリスト

カラム追加・テーブル変更は不要 (enum 値追加のみ)。触る箇所:

1. `prisma/schema.prisma` の QuizFormat enum
2. `generation/<format>.ts` (出題生成)
3. `payload.ts` の union メンバ
4. `format-options.ts` の FORMAT_GROUPS / JA_TO_EN_FORMATS / TG_EXAMPLE_FORMATS (コンパイルエラーにならず最も漏れやすい)
5. `default-settings.ts` の timeoutByFormat (全形式キー必須、コンパイルが強制)
6. `src/app/quiz/_components/` の `question-<format>.tsx` と `quiz-flow.tsx` の分岐

`build-quiz.ts` と `quiz-flow.tsx` の exhaustive switch (never チェック) を通し、既存ユーザーへ推奨デフォルト制限時間を backfill する migration を書く (前例: `prisma/migrations/20260704025822_backfill_tg_format_default_timeouts`)。
