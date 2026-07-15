# 04. quiz-persist

状態: **完了（2026-07-16）**　PR: （未作成）

## 目的

quiz バックエンドを「ブックマークのみ」＋「掲載箇所なし（全件モード）」に対応させて完結させる: Drill / QuizDefaultSetting の migration、入力スキーマ（schema/quiz）の拡張、quiz-generate / drill-create / quiz-default-settings / quiz-preview の配線、Drill nullable 化に伴う drill 系 3 ファイルの対応。マージ後はプレビュー含むバックエンド全体で全件モード・ブックマーク絞り込みが機能する（UI 導線は 09）。

スコープ外: 開始フォーム・設定画面・drill ラベルなど UI（09）、quiz-source 内部の述語（03 で実装済み）。

## 依存チケット

- 01: migration の直列前提（Bookmark migration が先行）
- 03: `occurrenceId` 未指定・`bookmarkedOnly` を受けられる quiz-source 3 関数を使う

## 前提（設計決定の再掲）

- Drill テーブルの変更（[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 4）:
  - `occurrenceId` / `rangeFrom` / `rangeTo` を nullable 化（掲載箇所なし drill では 3 つとも null。実効範囲の min/max 計算は掲載箇所ありのときだけ行う）
  - `sourceBookmarkedOnly Boolean @default(false)` を追加（元テストの「ブックマークのみ」指定。`sourceRangeFrom/To` と同役割の再テスト導線用）
  - occurrence リレーションの `onDelete: Cascade` は維持（null 行は削除連鎖の対象外になるだけ）
  - マイグレーションは nullable 化（既存データ影響なし）＋ default false の加算のみで backfill 不要
- `QuizDefaultSetting` に `bookmarkedOnly Boolean?` を追加（null = アプリ既定 OFF。既存の nullable Boolean 項目と同じ流儀）。設定画面（`saveQuizDefaultsInputSchema`）・開始画面の「デフォルトとして保存」（`saveStartSettingsAsDefaultsForUser` の部分 upsert 対象）の両方に含め、`StartFormDefaults` にも載せる。Occurrence 削除（SetNull）で `occurrenceId` だけ null になっても `bookmarkedOnly` は残す（結果の「occurrenceId null ＋ bookmarkedOnly true」はそのまま全件モードの初期値として成立する）（[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 6）
- `quizRangeInputSchema`（プレビュー・開始両経路の基底）に `bookmarkedOnly` を追加する。zod では `.default(false)` とし省略時は false（パース後の型は必須 boolean のまま、未更新のフォームからの送信も後方互換で通る）（[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 1）
- `occurrenceId` を optional 化し、クロスフィールド検証を追加する: **未指定を許すのは `bookmarkedOnly: true` のときだけ。かつそのとき `rangeFrom` / `rangeTo` も未指定であること**。違反は入口（スキーマ）で拒否する（逆転範囲を拒否しない既存規約とは別扱い — こちらは形として無効）（[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 3）
- `quizRangeInputSchema` の変更は `.extend()` している各 action 入力スキーマ（`getQuizPreviewInputSchema` / `startQuizInputSchema`）へ自動波及する（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 4）
- `quiz-generate.ts` / `drill-create.ts` は bookmarkedOnly の pass-through と、Drill（occurrenceId / rangeFrom / rangeTo nullable ＋ sourceBookmarkedOnly）への保存を行う（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 4）
- 再テスト: `Drill.sourceBookmarkedOnly` を含めて `sourceTest`（`StartQuizInput`）を復元し、再テスト開始時点のブックマーク集合で出題する（条件保存＋開始時再評価、ADR-0042 と一貫）。drill 本体は DrillWord スナップショットのままで、開始後にブックマークを外しても drill からは消えない（ラウンド生成・同一問題再挑戦にブックマーク条件は再適用しない）（[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 5）
- `drill-list.ts` / `drill-round-generate.ts` / `drill-retry-generate.ts` は Drill nullable 化への型対応（ActiveDrill 型・occurrence null 時の扱い）と sourceTest 復元への sourceBookmarkedOnly 反映を行う（設計ハブ「変更対象の一覧」、[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 4・5 の帰結）
- `quiz-preview.ts`（getQuizPreviewForUser）は入力の occurrenceId optional 化＋ bookmarkedOnly 追加・count 系 2 関数への受け渡し・`assertOccurrenceVisible` の occurrenceId あり時のみ呼び出しを行う。action の getQuizPreview は quiz-preview.ts へ委譲しているだけのため型波及で無変更（設計ハブ「変更対象の一覧」、[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 1・3 の帰結）
- 対象 0 件（ブックマーク 0 個＋ON 含む）はスキーマ・UseCase で特別扱いせず既存の対象 0 件処理に乗せる（プレビュー 0 件、開始は `QuizGenerationError`）（[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 7）

## 実装内容

### 変更: `prisma/schema.prisma` ＋ 作成: migration

Drill（nullable 化 3 列＋ `sourceBookmarkedOnly`）と QuizDefaultSetting（`bookmarkedOnly Boolean?`）。migration 1 本（加算のみ、backfill なし）。

### 変更: `src/lib/schema/quiz.ts` ＋ `src/lib/schema/quiz.unit.test.ts`（新設または拡張）

`quizRangeInputSchema`: `occurrenceId` optional 化・`bookmarkedOnly: z.boolean().default(false)`・クロスフィールド検証（前提のとおり）。`saveQuizDefaultsInputSchema` にも `bookmarkedOnly` を追加する。

### 変更: `src/lib/quiz-generate.ts`

`fetchQuizSource` へ `input.bookmarkedOnly` / 未指定 `occurrenceId` を受け渡し、drill 作成経路へ引き継ぐ。

### 変更: `src/lib/drill-create.ts`

掲載箇所なし（occurrenceId / rangeFrom / rangeTo = null）での Drill 作成と `sourceBookmarkedOnly` の保存。実効範囲の min/max 計算は掲載箇所ありのときだけ行う。

### 変更: `src/lib/quiz-default-settings.ts`

`QuizDefaults` / `StartFormDefaults` 型と `getQuizDefaultsForUser` / `saveQuizDefaultsForUser` / `saveStartSettingsAsDefaultsForUser` に `bookmarkedOnly` を追加する。

### 変更: `src/lib/drill-list.ts` / `src/lib/drill-round-generate.ts` / `src/lib/drill-retry-generate.ts`

`ActiveDrill` 型の nullable 化（`occurrenceName` は occurrence null 時 null）、nullable な drill 行の pass-through（03 で広げた quiz-source シグネチャに乗せる）、sourceTest 復元への `sourceBookmarkedOnly` 反映。

### 変更: `src/lib/quiz-preview.ts`

`QuizRangeInput` の `occurrenceId` optional 化＋ `bookmarkedOnly?: boolean` の **optional 追加**（getQuizPreviewForUser 側で未指定を false として扱う。`QuizRangeInput` は action 呼び出し元が満たす parse 前の入力型のため、必須にすると 09 まで bookmarkedOnly を送らない start-form / quiz-flow が型エラーになる — zod 側の `.default(false)` と同じ「省略時 false」の型表現）、`assertOccurrenceVisible` を occurrenceId があるときのみ呼ぶ、`countQuizTargets` / `countQuizSourceExclusions` へ bookmarkedOnly / 未指定 occurrenceId を受け渡す（`QuizPreview.excluded.noNumber` の null 許容化は 03 で先行済み）。

### 変更: integration テスト（drill-create / quiz-default-settings / quiz-generate の既存テストを拡張）

### マージ後の中間状態

フォーム（09 未実装）は bookmarkedOnly を送らないため default false で従来動作。全件モードの quiz / drill は API 上は可能になるが UI 導線がなく発生しない（`ActiveDrill` のラベル表示の null 対応は 09）。

## 完了条件（Definition of Done）

- [ ] unit（schema/quiz）: クロスフィールド検証の組合せ — 掲載箇所指定 × bookmarkedOnly false = 従来どおり / 未指定 × true × 範囲なし = 許可 / 未指定 × false = 拒否 / 未指定 × 範囲あり = 拒否。bookmarkedOnly 省略時に false が補われること（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 5、[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 1・3）
- [ ] integration: 掲載箇所なし drill の作成（3 列 null）と `sourceBookmarkedOnly` の保存 / QuizDefaultSetting の `bookmarkedOnly` 保存・SetNull 後も bookmarkedOnly が残ること（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 5、[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 6）
- [ ] 既存テストが通る（既存フォーム経路の後方互換確認）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` / `pnpm test:integration` が通る

## 競合注意

- `prisma/schema.prisma` / migration: 01 が先行（依存で直列）。本チケット以降のスキーマ変更はなし
- `src/lib/schema/quiz.ts`: 本チケットのみが触る。09 はスキーマを変更しない（extend 波及で足りる）
- `src/lib/quiz-preview.ts`: 03 が型の追随（noNumber の null 許容）を先行済み（依存で直列）。本チケットが本対応

## 実装メモ

チケット列挙外だが「occurrenceId optional 化＋ .default() 追加」の帰結として 04 単独で typecheck / test を通すために不可避だった変更（いずれも共有ファイル制約には抵触しない）:

- `startDrillInputSchema` に occurrenceId optional 化＋ `sourceBookmarkedOnly: z.boolean().default(false)` を追加（startDrill にクロスフィールド検証は付けない＝cheating-accepted 方針）
- `StartQuizInput` / `StartDrillInput` / `SaveQuizDefaultsInput` を `z.infer` → **`z.input`** に変更（`.default()` により z.infer だと必須化し、未指定で送る 09 のフォーム群が型エラーになるため）
- `quizRangeInputSchema` は superRefine で ZodEffects 化するため `.extend()` 不可 → raw ZodObject `quizRangeInputObject` を private に置き、3 スキーマへ共通 refine 関数を適用（zod v3 制約の回避）
- `src/lib/quiz/default-settings.ts` の DEFAULT_QUIZ_SETTINGS に `bookmarkedOnly: null` 追加
- `.default()` の値補完に伴い既存 action unit テストの `toHaveBeenCalledWith` を更新（quiz / quiz-defaults）。saveStartSettingsAsDefaultsForUser が bookmarkedOnly を部分 upsert 対象に含めた（決定 6）ため既存 integration 2 ケースの期待値にも追加

**09 への申し送り**:
- `drill-round-generate.ts` の `occurrenceName` は型 `string` のまま全件モードで `""` を暫定返却。**全件モード drill のラベル表示（「ブックマークのみ」）と ActiveDrill の null 対応は 09**（drill-list.ts の ActiveDrill は nullable 化済み）
- 完了画面の再テスト前ライブプレビュー（quiz-flow.tsx）が全件モード drill で getQuizPreview にブックマーク条件 / occurrenceId 未指定を渡す対応は **09**（未対応だと入力検証に落ちる。pre-09 は全件モード drill が生成されないため顕在化しない）
- migration は `20260715185254_add_bookmark_quiz_persist`（純加算・backfill なし）
- 追補（09 実装時）: drill-list.ts の ActiveDrill に `sourceBookmarkedOnly` を追加（決定 8 の進行中一覧ラベルに必要だった。09 がリード承認のうえ実施）
