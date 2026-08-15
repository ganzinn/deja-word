# 01. rename-flag

状態: **完了**（2026-08-15）　PR: （未作成）

## 目的

四択（英→日）専用だったフラグ `choiceFirstMeaningTextOnly` を、形式横断の共通設定を表す名前 `firstMeaningTextOnly`（DB 列 `first_meaning_text_only`）へ改名する。**挙動は一切変えない**。以降のチケットが新しい名前の上で作業できる共有基盤を先に入れる。

スコープ外:

- 設定の適用範囲を日→英 3 形式へ広げること（02）
- ダミー選択肢の除外ロジック（03）
- 先頭訳語の赤字強調（04 / 05）
- **UI の表示条件・配置・ラベル文言・補足文の変更（06）**。本チケットが UI 2 ファイルで触るのは state 変数名・`id` 属性・送信フィールド名だけで、`format === "CHOICE"` の表示条件も「選択肢に最初の訳語だけを表示する」の文言もそのまま残す
- 進行中 drill に保存済みの値の移行（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 6 により**移行しない**）

## 依存チケット

なし（並行着手可）

## 前提（設計決定の再掲）

- コード名 `choiceFirstMeaningTextOnly` → `firstMeaningTextOnly`、DB 列 `choice_first_meaning_text_only` → `first_meaning_text_only`（`quiz_default_setting` / `drill` の 2 テーブル）。マイグレーションは `ALTER TABLE ... RENAME COLUMN` を手書きする（2 テーブル分。データのコピーは不要）（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 1）
- リネームは旧コードとの後方互換が無い。「新列追加 → 二重書き → 旧列 DROP」の段階移行は**採らない**。マイグレーション適用から新コード配備までの短時間の不整合は許容する。この列を参照する raw SQL・ops スクリプトは無く（Prisma 経由のみ）、リネーム漏れの隠れ経路はない（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 1）
- 既定値の非対称は 4 層とも**現状のまま維持する**（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 2）:

  | 層 | 未設定・未指定のときの値 |
  | --- | --- |
  | デフォルト設定（`QuizDefaultSetting`、nullable） | null = ON（アプリ既定） |
  | 画面の初期値・推奨値（`DEFAULT_QUIZ_SETTINGS`、両フォームの `?? true`） | true |
  | drill 列（`NOT NULL @default(false)`） | false |
  | 生成オプション（`BuildQuizOptions`、optional） | false |

- デフォルト設定の既存保存値は変換せず、そのまま共通設定の値として引き継ぐ（[01-requirements.md](../../design/quiz-first-meaning-only/01-requirements.md) 決定 3）

## 実装内容

### 変更: `prisma/schema.prisma`

2 箇所のフィールド名と `@map` を変更する。型・`@default`・nullable は現状のまま。

```prisma
// model QuizDefaultSetting（現状）
  choiceFirstMeaningTextOnly Boolean? @map("choice_first_meaning_text_only") // 四択（英→日）の選択肢で先頭の訳語のみ表示。null = ON（デフォルト＝先頭の訳語のみ）。false で全訳語を「; 」連結
// → firstMeaningTextOnly Boolean? @map("first_meaning_text_only")

// model Drill（現状）
  choiceFirstMeaningTextOnly Boolean @default(false) @map("choice_first_meaning_text_only") // 元テストの「四択で先頭の訳語のみ表示」設定。全ラウンドで引き継ぐ
// → firstMeaningTextOnly Boolean @default(false) @map("first_meaning_text_only")
```

**コメント本文は触らない**（識別子の改名のみ）。「四択（英→日）の選択肢で…」という限定表現は、実際に適用先が広がる 02 が直す。01 単独マージの時点ではまだ日→英 3 形式に効かないため、先に書き換えると一時的に虚偽になる。

### 作成: `prisma/migrations/<timestamp>_rename_first_meaning_text_only/migration.sql`

手書きする。データコピーなし。

```sql
-- AlterTable
ALTER TABLE "drill" RENAME COLUMN "choice_first_meaning_text_only" TO "first_meaning_text_only";

-- AlterTable
ALTER TABLE "quiz_default_setting" RENAME COLUMN "choice_first_meaning_text_only" TO "first_meaning_text_only";
```

### 変更: `src/lib/schema/quiz.ts`

3 箇所のフィールド名を改名する。zod の型・nullable / optional は変えない。

- `startQuizInputSchema` の `choiceFirstMeaningTextOnly: z.boolean()`（コメント「四択（英→日）の選択肢表示。CHOICE 以外では下流で無視される。」は**触らない**。書き換えは 02）
- `saveQuizDefaultsInputSchema` の `choiceFirstMeaningTextOnly: z.boolean().nullable()`
- `startDrillInputSchema` の `choiceFirstMeaningTextOnly: z.boolean()`

### 変更: `src/lib/quiz/generation/build-quiz.ts`

`BuildQuizOptions` のフィールド**名**と参照箇所を改名する。**受け渡し先を増やすのは 02 の担当**なので、`buildQuestions` の `CHOICE` case と `checkFormatAvailability` の `CHOICE` case の 2 箇所の参照名を変えるだけに留める。

```ts
  // 変更前
  choiceFirstMeaningTextOnly?: boolean;
  // 変更後
  firstMeaningTextOnly?: boolean;
```

**JSDoc とコメントの本文は触らない**。型レベルコメント `/** buildQuiz の形式別オプション。CHOICE の選択肢表示のみ参照する。 */` と、フィールドの JSDoc `/** 四択（英→日）の選択肢を先頭の訳語のみで表示する（false = 全訳語を「; 」連結）。 */` は、適用先が広がる 02 が書き換える（02 の作業対象を消さないため）。`occurrenceNumberByWordId` の JSDoc も現状のまま残す。

### 変更: 参照している既存ファイル（機械的な改名）

`choiceFirstMeaningTextOnly` を `firstMeaningTextOnly` に置き換える。

- `src/lib/quiz/default-settings.ts`（`DEFAULT_QUIZ_SETTINGS` の `choiceFirstMeaningTextOnly: true`）
- `src/lib/quiz-default-settings.ts`（保存・読み出し・`saveStartSettingsAsDefaultsForUser`）
- `src/lib/quiz-generate.ts`（入力型と `BuildQuizOptions` の組み立て）
- `src/lib/drill-create.ts` / `src/lib/drill-round-generate.ts` / `src/lib/drill-retry-generate.ts`
- `src/app/quiz/_lib/build-start-drill-input.ts`

`src/app/quiz/actions.ts` と `src/app/settings/quiz-defaults/actions.ts` は、zod の `parsed.data` をそのまま渡すだけで当該識別子を含まないため**変更不要**（設計ハブの変更対象一覧は型経由の影響を含めて挙げているが、実ファイルには出現しない）。

`src/lib/quiz-default-settings.ts` のコメント 2 箇所（「choiceFirstMeaningTextOnly は挙動設定だが、選択肢の生成結果に影響し…」「四択先頭訳語のみ表示（choiceFirstMeaningTextOnly）」）は、識別子部分のみ改名する。「選択肢」「四択」という**限定の記述は 02 が適用先の広がりに合わせて直す**。

### 変更: UI 2 ファイル（変数名・`id` のみ）

**文言・表示条件・配置は変えない。**

- `src/app/quiz/_components/start-form.tsx`: state 変数 `choiceFirstMeaningTextOnly` / `setChoiceFirstMeaningTextOnly`、送信ペイロードのフィールド名、`id="quiz-choice-first-meaning-text-only"` → `id="quiz-first-meaning-text-only"`（`htmlFor` も同時に）
- `src/app/settings/quiz-defaults/_components/quiz-defaults-form.tsx`: state 変数、送信フィールド、`id="quiz-defaults-choice-first-meaning-text-only"` → `id="quiz-defaults-first-meaning-text-only"`（`htmlFor` も同時に）

`src/lib/quiz/generation/choice.ts` の内部引数名は元から `firstMeaningTextOnly` のため変更不要。

### 変更: 既存テストの改名追随

`src/app/quiz/_lib/build-start-drill-input.unit.test.ts` / `src/app/quiz/actions.unit.test.ts` / `src/app/settings/quiz-defaults/actions.unit.test.ts` / `src/lib/schema/quiz.unit.test.ts` / `src/lib/quiz/generation/build-quiz.unit.test.ts` / `src/lib/quiz-default-settings.integration.test.ts` / `src/lib/quiz-generate.integration.test.ts` / `src/lib/drill-create.integration.test.ts` / `src/lib/drill-round-generate.integration.test.ts` / `src/lib/drill-retry-generate.integration.test.ts` / `src/lib/drill-retry-submit.integration.test.ts` / `src/lib/drill-round-submit.integration.test.ts`

**期待値そのものは変えない**（名前以外の差分が出たら挙動を変えてしまっている）。`drill-round-generate.integration.test.ts` の `sourceTest` を `toEqual` で比較しているケースは文字列キーで比較しているため型では守られない。新列名で通ることを必ず確認する。

`build-quiz.unit.test.ts` のテスト名 `"forwards choiceFirstMeaningTextOnly to the CHOICE generator"` は、**02 が 4 形式へ広げる際に書き換える**。本チケットでは識別子部分のみ新名に直す。

## 完了条件（Definition of Done）

- [ ] integration: `src/lib/quiz-default-settings.integration.test.ts` に `firstMeaningTextOnly` 単独の保存・再保存ケースを**新設**する（現在は他項目に混ざって入出力されるだけで専用ケースが無い）。`saveStartSettingsAsDefaultsForUser` が本項目を保存することも検証する
- [ ] integration: `src/lib/drill-round-generate.integration.test.ts` の `sourceTest` のアサートが新列名で通る
- [ ] integration（`src/lib/drill-round-generate.integration.test.ts`）: **drill 行に保存した値が変換されずそのままラウンド生成へ流れること**を明示的に検証する（`firstMeaningTextOnly` を明示的に立てた drill 行を作り、次ラウンドの `sourceTest` にその値が現れる）。データ移行・backfill をしない決定（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 6）を守る唯一の検証。**「マイグレーション前に作った行」は作れない**（`tests/setup/integration.global-setup.ts` が全テストに先立って `prisma migrate deploy` を実行するため）
- [ ] integration: `pnpm test:integration` 起動時の `prisma migrate deploy` が `RENAME COLUMN` を `dejaword_test` へ適用できる
- [ ] `rg 'choiceFirstMeaningTextOnly|choice_first_meaning_text_only' src/ prisma/schema.prisma scripts/` が 0 件（`prisma/migrations/` の履歴と `docs/` は検査対象外。用語集 `docs/reference/naming-book.md` の追随は 07 の担当）
- [ ] unit: `src/lib/schema/quiz.unit.test.ts` / `src/app/quiz/_lib/build-start-drill-input.unit.test.ts` / `src/app/quiz/actions.unit.test.ts` / `src/app/settings/quiz-defaults/actions.unit.test.ts` が新名で通る（型で守られない zod のフィールド名・オブジェクトリテラルの検証はここが担う）
- [ ] 既存テストの期待値を変えていない（差分が**識別子の改名（コメント内の識別子置換を含む）だけ**であること。コメント本文の書き換えは 02 の担当なので手を出さない）
- [ ] `pnpm format`（整形）の上で `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る
- [ ] integration テストはオーケストレーターの直列実行で `pnpm test:integration` が通る（実装エージェントは実行しない）

## 競合注意

- `src/lib/quiz/generation/build-quiz.ts` / `build-quiz.unit.test.ts`: 02・03 が後続。本チケットは `BuildQuizOptions` のフィールド改名と既存 2 箇所の参照名変更、テスト内の識別子改名に留める
- `prisma/schema.prisma` / `src/lib/schema/quiz.ts` / `src/lib/quiz-default-settings.ts` / `src/lib/drill-round-generate.integration.test.ts`: 02 がコメント・テスト名の本文を直す。本チケットは識別子のみ。`src/lib/quiz/generation/material.ts` は本チケットの対象外（当該識別子を含まない。02 の単独所有）
- `src/app/quiz/_components/start-form.tsx` / `src/app/settings/quiz-defaults/_components/quiz-defaults-form.tsx`: 06 が後続。本チケットは変数名・`id` のみ

## 実装メモ

- マージ後の直列 integration 実行で全通過（36 files / 341 tests）。`prisma migrate deploy` が `RENAME COLUMN` を `dejaword_test` へ適用できることも確認済み（DoD の integration 4 項目を充足）
- migration ディレクトリ名は `20260815110729_rename_first_meaning_text_only`。`pnpm exec prisma migrate dev --create-only` は非対話環境で使えない（`Prisma Migrate has detected that the environment is non-interactive`）ため、タイムスタンプを採番して `migration.sql` を手書きした
- DoD の「drill 行の値がそのまま流れる」検証のため、`drill-round-generate.integration.test.ts` のヘルパ `setupDrill` に `firstMeaningTextOnly?: boolean` オプションを追加（既定 `false` のため既存ケースの挙動は不変）
- 02 へ: `build-quiz.ts` の `checkFormatAvailability` 内 `const firstMeaningTextOnly = options.firstMeaningTextOnly ?? false;` は改名により左右が同名になった。受け渡しを広げる際に局所変数の要否を再検討してよい（本チケットでは据え置き）
- 02 へ（本チケットが意図的に触っていない限定表現・文言）: `prisma/schema.prisma` の 2 コメント／`src/lib/schema/quiz.ts` の `startQuizInputSchema` コメント／`build-quiz.ts` の型・フィールド JSDoc／`src/lib/quiz-default-settings.ts` の JSDoc とコメント 2 箇所／`build-quiz.unit.test.ts` のテスト名 `"forwards firstMeaningTextOnly to the CHOICE generator"`／`drill-round-generate.integration.test.ts` のテスト名末尾の `choice option`／`quiz-default-settings.integration.test.ts` の既存コメント「四択先頭訳語のみ表示」
- 06 へ: UI の `id` は `quiz-first-meaning-text-only` / `quiz-defaults-first-meaning-text-only` に変わった。表示条件（`format === "CHOICE"`）とラベル文言は未変更のまま残してある
- 07 へ: `docs/reference/naming-book.md` に旧名 `choiceFirstMeaningTextOnly` が残っている（本チケットの検査対象外）
