# 02. generation-prompt

状態: **完了**（2026-08-15）　PR: [#270](https://github.com/ganzinn/deja-word/pull/270)

## 目的

「先頭の訳語のみ表示」の表示文字列を作る共通ヘルパを 1 つに集約し、日本語→英語 3 形式（四択・自己判定・スペル確認）の**問題文**にも設定を効かせる。四択（英→日）の選択肢は既存挙動のままヘルパ経由に置き換える。

本チケットは適用先が広がることで虚偽になる既存コメントの修正も担当するため、`prisma/schema.prisma` と `src/lib/schema/quiz.ts` にも触れる（いずれもコメント本文だけ。スキーマ定義は変えないのでマイグレーションは不要）。

スコープ外:

- 四択（日→英）のダミー選択肢の除外・可用性判定（03）
- 四択（英→日）の重複排除キー `choiceCandidateTexts` の扱い（**変えない**）
- 赤字強調（04 / 05）、UI の表示条件・文言（06）
- TG 例文形式 4 種・多義語選択・自己判定（英→日）への適用（設計上の対象外）

## 依存チケット

- 01: `BuildQuizOptions.firstMeaningTextOnly` へ改名済みであること（本チケットはその受け渡し先を増やす）

## 前提（設計決定の再掲）

- 設定を適用する表示は 2 つだけ。(a) 四択（英語→日本語 `CHOICE`）の選択肢（既存の適用先。**挙動は変えない**）、(b) 日本語→英語 3 形式（`CHOICE_JA_EN` / `SELF_JUDGE_JA_EN` / `SPELLING`）の問題文（今回の追加分。現在は常に「; 」連結）（[01-requirements.md](../../design/quiz-first-meaning-only/01-requirements.md) 決定 1）
- 適用しない表示: 多義語選択の選択肢、自己判定（英→日 `SELF_JUDGE`）の解答表示と結果一覧のその正解列、TG 例文形式 4 種（`CHOICE_TG` / `CHOICE_TG_JA_EN` / `SELF_JUDGE_TG` / `SELF_JUDGE_TG_JA_EN`）、訳語が出る他の画面（[01-requirements.md](../../design/quiz-first-meaning-only/01-requirements.md) 決定 1）
- 結果一覧は生成済みデータの再表示なので、上記 2 つは結果一覧の該当列にも同じ内容で出る。**結果一覧のためだけの分岐は設けない**（[01-requirements.md](../../design/quiz-first-meaning-only/01-requirements.md) 決定 1）
- ON のとき表示するのは「最初の Meaning（sortOrder 先頭）の先頭 MeaningText 1 つ」（品詞は含めない。既存 `firstMeaningHeadText` と同じ）。OFF のときは最初の Meaning の MeaningText を「; 」で連結する（既存 `firstMeaningText`）。この定義は適用先すべてで共通（[01-requirements.md](../../design/quiz-first-meaning-only/01-requirements.md) 決定 2）
- ヘルパは `src/lib/quiz/generation/material.ts` に `firstMeaningDisplayText(word, firstMeaningTextOnly): string` として置く。実体は四択（英→日）の `choiceDisplayText` の**移設・改名**で、引数・戻り値は同じ（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 3）
- `buildQuestions` の `CHOICE` に加えて `CHOICE_JA_EN` / `SELF_JUDGE_JA_EN` / `SPELLING` の各 case からビルダーへ boolean で渡す。引数の形は既存 `buildChoiceQuestions(material, rng, firstMeaningTextOnly)` に揃える（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 3）
- 四択（英→日）の重複排除キー（`choiceCandidateTexts`）と成立判定での使われ方は変えない（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 3）
- 先頭の訳語だけでは答えが一意に定まらない問題文は**許容する**（同じ先頭訳語を持つ別単語が同じテストに入ると、スペル確認で別解を入力して不正解になりうる等）。避けたいユーザーは開始フォームで OFF にする（[01-requirements.md](../../design/quiz-first-meaning-only/01-requirements.md) 決定 5）

## 実装内容

### 変更: `src/lib/quiz/generation/material.ts`

既存の `firstMeaningText` / `firstMeaningHeadText` の隣に、設定で分岐するヘルパを新設する。`choice.ts` の `choiceDisplayText` をそのまま移設・改名したもの。

```ts
/**
 * 設定に従った最初の Meaning の表示文字列。
 * `firstMeaningTextOnly` が true なら先頭の訳語のみ、false なら MeaningText を「; 」で連結。
 * 四択（英→日）の選択肢表示と、日本語→英語 3 形式の問題文で共用する。
 */
export function firstMeaningDisplayText(word: QuizWord, firstMeaningTextOnly: boolean): string {
  return firstMeaningTextOnly ? firstMeaningHeadText(word) : firstMeaningText(word);
}
```

### 変更: `src/lib/quiz/generation/choice.ts`

`choiceDisplayText` を削除し、`buildChoiceQuestions` 内の 2 箇所の呼び出し（正解側・ダミー側）を `firstMeaningDisplayText` に置き換える。`choiceCandidateTexts` と `toWordCandidate` は**触らない**。

`choiceDisplayText` の残存参照（import・テストの直接呼び出し）が無いことを確認する。

### 変更: 適用先が広がることで虚偽になる既存コメント

**識別子の改名は 01 が済ませている。本チケットは「四択（英→日）だけ」と限定している文面を直す。**文言がファイルごとに違い 1 本の grep では拾えないので、次のチェックリストで潰す。

| ファイル | 直す記述 |
| --- | --- |
| `prisma/schema.prisma` | `QuizDefaultSetting` / `Drill` の 2 フィールドの行コメント（「四択（英→日）の選択肢で先頭の訳語のみ表示」「元テストの『四択で先頭の訳語のみ表示』設定」） |
| `src/lib/schema/quiz.ts` | `startQuizInputSchema` のコメント「四択（英→日）の選択肢表示。CHOICE 以外では下流で無視される。」 |
| `src/lib/quiz/generation/build-quiz.ts` | 型レベルコメント「buildQuiz の形式別オプション。**CHOICE の選択肢表示のみ参照する**。」と、`firstMeaningTextOnly` フィールドの JSDoc「四択（英→日）の選択肢を…」 |
| `src/lib/quiz/generation/material.ts` | `firstMeaningText` の docstring「**英語→日本語の四択**の選択肢表示と、日本語→英語の問題文（意味の提示）で共用する」（実際には `firstMeaningDisplayText` の OFF 経路になる）、`firstMeaningHeadText` の docstring「四択（英語→日本語）で…設定が ON のときの選択肢表示に使う」 |
| `src/lib/quiz/generation/choice-ja-en.ts` / `self-judge-ja-en.ts` / `spelling.ts` | 各ファイル冒頭の「問題文は（target の）全 Meaning」（設定 ON では先頭の訳語 1 つになる） |
| `src/lib/quiz-default-settings.ts` | **3 箇所**: `QuizDefaults` のフィールド JSDoc「四択（英→日）の選択肢で先頭の訳語のみ表示する。null = ON…」、「…は挙動設定だが、**選択肢の生成結果に影響し**…」、「**四択先頭訳語のみ表示**（…）」 |
| `src/lib/quiz/generation/build-quiz.unit.test.ts` | テスト名 `"forwards choiceFirstMeaningTextOnly to the CHOICE generator"`（01 で識別子だけ新名になっている）を 4 形式へ広げた内容に合わせて書き換える |
| `src/lib/drill-round-generate.integration.test.ts` | テスト名 `"sourceTest reflects the Drill row (occurrenceId / sourceRange / format / timeout / **choice option**)"` の「choice option」（識別子を含まないため 01 の機械的改名では引っかからない）。**テスト名の文字列 1 本の変更のみで挙動は変えない**ため、本チケットに integration の実行は要らない |

`src/lib/quiz/generation/choice-tg.ts` の「TG四択（英→日）のダミー候補…」は**対象外**（TG 形式は設定の適用先ではない）。

### 変更: `src/lib/quiz/generation/choice-ja-en.ts`

シグネチャに boolean を足し、問題文の組み立てをヘルパ経由にする。ダミー候補（`toHeadwordCandidate`）は**触らない**（03 の担当）。

```ts
export function buildChoiceJaEnQuestions(
  material: QuizSourceMaterial,
  rng: Rng,
  firstMeaningTextOnly: boolean,
): ChoiceJaEnQuestion[]
// prompt: firstMeaningText(target) → prompt: firstMeaningDisplayText(target, firstMeaningTextOnly)
```

### 変更: `src/lib/quiz/generation/self-judge-ja-en.ts`

```ts
export function buildSelfJudgeJaEnQuestions(
  material: QuizSourceMaterial,
  rng: Rng,
  firstMeaningTextOnly: boolean,
): SelfJudgeJaEnQuestion[]
// prompt: firstMeaningText(target) → prompt: firstMeaningDisplayText(target, firstMeaningTextOnly)
```

### 変更: `src/lib/quiz/generation/spelling.ts`

```ts
export function buildSpellingQuestions(
  material: QuizSourceMaterial,
  rng: Rng,
  firstMeaningTextOnly: boolean,
): SpellingQuestion[]
// prompt: firstMeaningText(target) → prompt: firstMeaningDisplayText(target, firstMeaningTextOnly)
```

### 変更: `src/lib/quiz/generation/build-quiz.ts`

`buildQuestions` の switch で、`CHOICE_JA_EN` / `SELF_JUDGE_JA_EN` / `SPELLING` の 3 case にも `options.firstMeaningTextOnly ?? false` を渡す（`CHOICE` は既存どおり）。

この switch の 4 case が「設定が効く形式」の一次情報になる。UI 側は別途 `format-options.ts` に述語を持つ（06）ため、**出題形式を増やすときは両方の更新が要る**（[03-ui.md](../../design/quiz-first-meaning-only/03-ui.md) 決定 1 が述語の参照元を開始フォームだけに限定した結果。plan ハブ「形式追加時の注意」）。

## 完了条件（Definition of Done）

- [ ] unit（`src/lib/quiz/generation/material.unit.test.ts`）: `firstMeaningDisplayText` が ON で先頭 MeaningText 1 つ、OFF で「; 」連結を返す。訳語未登録（`meanings` 空 / `texts` 空）で空文字を返す
- [ ] unit（`src/lib/quiz/generation/choice-ja-en.unit.test.ts` / `self-judge-ja-en.unit.test.ts` / `spelling.unit.test.ts`）: ON のとき `prompt` が先頭の訳語 1 つになる。OFF のときは従来どおり「; 」連結（既存ケースが担う）。**`spelling.unit.test.ts` は `src/lib/quiz/spelling.unit.test.ts` にも同名ファイルがあるので取り違えないこと**
- [ ] unit（`build-quiz.unit.test.ts`）: 生成オプションが `CHOICE` / `CHOICE_JA_EN` / `SELF_JUDGE_JA_EN` / `SPELLING` の 4 形式それぞれのビルダーへ渡ることを検証する（既存の `CHOICE` 1 形式ぶんのケースを 4 形式へ広げる）
- [ ] unit（`choice.unit.test.ts`）: 既存の `describe("firstMeaningTextOnly = true")` を**そのまま維持**して通る（`choice.ts` の内部引数名は元から `firstMeaningTextOnly` のため改名の影響を受けない）。四択（英→日）の生成結果が本チケットで変わっていないこと
- [ ] 「適用先が広がることで虚偽になる既存コメント」のチェックリスト（表 8 行・実ファイル 10 本）を上から順に潰し、すべて直っている（文言がファイルごとに違うため grep 1 本では検出できない。表の各行を目視で確認する）
- [ ] `pnpm format`（整形）の上で `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る

## 競合注意

- `src/lib/quiz/generation/build-quiz.ts` / `build-quiz.unit.test.ts`: 01 のマージ後に着手し、03 より先にマージすること
- `prisma/schema.prisma` / `src/lib/schema/quiz.ts` / `src/lib/quiz-default-settings.ts` / `src/lib/drill-round-generate.integration.test.ts`: 01 が識別子を改名済み。本チケットは**コメント・テスト名の本文だけ**を直す。`prisma/schema.prisma` で触るのは `//` の行コメントだけなので、**マイグレーションの追加も `prisma generate` も不要**（`///` のドキュメントコメントではなく、データモデルにも生成クライアントにも影響しない）
- `src/lib/quiz/generation/material.ts`: 本チケットの単独所有（01 は触らない。当該識別子を含まないため）
- `src/lib/quiz/generation/choice-ja-en.ts`: 03 より先にマージすること（03 がダミー候補キーを触る）

## 実装メモ

- ビルダーの `firstMeaningTextOnly` は必須引数（チケット記載どおり、既存 `buildChoiceQuestions` に揃えた）。既存 unit テストの呼び出し 11 箇所に `false` を明示する追随変更が発生（挙動は不変）
- `build-quiz.unit.test.ts` に `QuizQuestionsPayload` 型 import を追加。形式でループしながら `prompt` を取り出すため、`"prompt" in q` で絞るローカルヘルパ `promptOf` をテスト内に置いた（cast なし）
- integration テストは `drill-round-generate.integration.test.ts` のテスト名文字列 1 本のみの変更（アサーション・SUT は無変更）
- **03 へ**: `choice-ja-en.ts` の `toHeadwordCandidate`・`build-quiz.ts` の `checkFormatAvailability` の `CHOICE_JA_EN` 分岐は無変更のまま。`buildChoiceJaEnQuestions` の第 3 引数が既に `firstMeaningTextOnly` として通っているので、03 はそれを `toHeadwordCandidate` 側へ引き回すだけで済む
- チェックリスト外で「四択」限定表現が残っている箇所（本チケットのスコープ外と判断）: `src/lib/quiz-default-settings.integration.test.ts` のコメント 2 箇所／`src/app/quiz/_lib/build-start-drill-input.ts` のコメント（01 の所有）／`start-form.tsx`・`quiz-defaults-form.tsx` のコメント（**06 の所有**。06 の文言変更で一緒に直る想定）
- `src/generated/prisma/internal/class.ts` の inline schema 文字列に旧コメントが残るが、gitignore 対象かつデータモデル未変更のため実害なし（`prisma generate` で消える）
