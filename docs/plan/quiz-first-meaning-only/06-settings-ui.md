# 06. settings-ui

状態: **実装中**　PR: （未作成）

## 目的

四択（英→日）専用として置かれているトグルを、共通設定として置き直す。開始フォームの表示条件を対象 4 形式へ広げ、デフォルト設定画面では `CHOICE` の形式カード内から形式カード群の直後へ移し、文言を四択前提から共通のものに変える。

スコープ外:

- 設定の適用ロジック（02 / 03）
- 赤字強調（04 / 05）
- 機能紹介ドキュメント・スクリーンショット・E2E 手順書の更新（07）
- 開始フォーム・デフォルト設定画面の他項目の配置・文言

## 依存チケット

- 01: フラグが `firstMeaningTextOnly` へ改名済みで、両フォームの state 変数名・`id` が新名になっていること

## 前提（設計決定の再掲）

- 設定が効くのは**対象 4 形式**: `CHOICE`（四択（英→日）の選択肢）、`CHOICE_JA_EN` / `SELF_JUDGE_JA_EN` / `SPELLING`（日→英 3 形式の問題文）。対象外は残り 6 形式（`SELF_JUDGE` / `MULTI_MEANING` / `CHOICE_TG` / `CHOICE_TG_JA_EN` / `SELF_JUDGE_TG` / `SELF_JUDGE_TG_JA_EN`）（[01-requirements.md](../../design/quiz-first-meaning-only/01-requirements.md) 決定 1）
- 判定は `src/lib/quiz/format-options.ts` に述語 `isFirstMeaningTextOnlyFormat(format: QuizFormat): boolean` を足す（`isJaToEnFormat` / `isTgExampleFormat` / `isSelfJudgeFormat` と同じ置き場・同じ命名族）。既存の `isJaToEnFormat` は TG 2 形式を含むため**流用しない**。この述語の参照元は**開始フォームの表示条件だけ**（生成側は網羅 switch の各 case から boolean を渡すため述語を呼ぶ箇所が生じない）（[03-ui.md](../../design/quiz-first-meaning-only/03-ui.md) 決定 1）
- 開始フォーム: 表示位置は現状どおり「出題形式」セクションの Select と説明文の直下。表示条件を `format === "CHOICE"` から**対象 4 形式**へ広げる。対象外の形式を選んでいる間は描画しない（[03-ui.md](../../design/quiz-first-meaning-only/03-ui.md) 決定 1）
- 開始フォームの状態保持: 対象外の形式へ切り替えてトグルが消えている間も **state は保持し、送信値には常に含める**（現行の挙動を変えない）（[03-ui.md](../../design/quiz-first-meaning-only/03-ui.md) 決定 1）
- デフォルト設定画面: `CHOICE` の形式カード内（制限時間ブロックの中）から出し、`role="radiogroup"` の形式カード群の**直後**・「出題形式」セクションの末尾に独立行として**常時描画**する。形式の選択状態には連動しない（[03-ui.md](../../design/quiz-first-meaning-only/03-ui.md) 決定 1）
- 文言（**両画面で同一**）（[03-ui.md](../../design/quiz-first-meaning-only/03-ui.md) 決定 2）:
  - ラベル: `最初の訳語だけを表示する`
  - 補足文: `オフにすると、複数の訳語を「; 」で連結して表示します。`
  - **開始フォームにも補足文を新設する**（現在は無い）
- あわせて開始フォームの「この設定をデフォルト設定とする」の補足文の列挙に本項目を加える。現状は `saveStartSettingsAsDefaults` 経由で保存されるのに列挙に無く、事実と食い違っている（[03-ui.md](../../design/quiz-first-meaning-only/03-ui.md) 決定 2）
- UI 文言は「最初の訳語」、設計・用語集の内部呼称は「先頭の訳語」（`firstMeaningTextOnly`）とずれるが、現行ラベルからの変更を「選択肢に」の削除だけに留める方を優先した意図的なずれ（[03-ui.md](../../design/quiz-first-meaning-only/03-ui.md) 決定 2）

## 実装内容

### 変更: `src/lib/quiz/format-options.ts`

既存 3 述語と同じ書式（`Set<QuizFormat>` の定数＋述語関数）で追加する。

この Set は**生成側（`build-quiz.ts` の網羅 switch で設定を渡す 4 case）と独立に存在する**（[03-ui.md](../../design/quiz-first-meaning-only/03-ui.md) 決定 1 が述語の参照元を開始フォームだけに限定したため）。出題形式を増やすときは両方の更新が要る。この Set が守るのは「トグルを出すか」だけで、実際に効くかは生成側の switch が決める。

```ts
/**
 * 「最初の訳語だけを表示する」設定が効く出題形式。
 * 四択（英→日）は選択肢、日本語→英語 3 形式は問題文に効く。TG 例文形式は訳語を表示しないため含めない。
 */
const FIRST_MEANING_TEXT_ONLY_FORMATS = new Set<QuizFormat>([
  "CHOICE",
  "CHOICE_JA_EN",
  "SELF_JUDGE_JA_EN",
  "SPELLING",
]);

/** 「最初の訳語だけを表示する」設定が効く出題形式か（開始フォームのトグル表示条件）。 */
export function isFirstMeaningTextOnlyFormat(format: QuizFormat): boolean {
  return FIRST_MEANING_TEXT_ONLY_FORMATS.has(format);
}
```

### 変更: `src/app/quiz/_components/start-form.tsx`

1. 表示条件: `{format === "CHOICE" ? (` → `{format !== null && isFirstMeaningTextOnlyFormat(format) ? (`
2. ラベルを `最初の訳語だけを表示する` に変更
3. ラベルの下に補足文を新設する。同フォームの他項目（ブックマークのみ・出題数）と同じ体裁に揃える

   ```tsx
   <p className="text-muted-foreground text-xs">
     オフにすると、複数の訳語を「; 」で連結して表示します。
   </p>
   ```

4. state 宣言のコメント（「四択（英→日）の選択肢で先頭の訳語のみ表示する」）を共通設定の説明に書き換える
5. 「この設定をデフォルト設定とする」の補足文の列挙に本項目を加える。現行文は

   `オンで開始すると、上の掲載箇所・掲載番号範囲・ブックマークのみ・出題数・出題形式・掲載番号順・制限時間をデフォルト設定として保存します。`

   で、実際には本項目も保存されるため列挙に含める。既存の列挙は画面の並び順・体言止めの短い呼称で揃っているので、同じ体裁で「出題形式」の直後に入れる。**確定文字列**:

   `オンで開始すると、上の掲載箇所・掲載番号範囲・ブックマークのみ・出題数・出題形式・最初の訳語の表示・掲載番号順・制限時間をデフォルト設定として保存します。`

**state の初期化（`defaults.firstMeaningTextOnly ?? true`）と送信ペイロードへの常時同梱は変えない。**

### 変更: `src/app/settings/quiz-defaults/_components/quiz-defaults-form.tsx`

1. `{option.value === "CHOICE" ? (...) : null}` のブロック（Checkbox ＋ Label ＋ 補足文の `<>...</>`）を形式カードの内側から**削除**する
2. `role="radiogroup"` の `</div>`（カード群を閉じる div）の**直後**、「出題形式」`</section>` の直前に、独立行として置き直す。現行はカード内の階層に合わせた `pl-6`（Checkbox の幅ぶんのインデント）が補足文に付いているが、**移設後は落とす**。同画面のセクション直下のチェックボックス項目（「ブックマークのみ」「掲載番号順に出題する」）の補足文はいずれも `text-muted-foreground text-xs` のみで `pl-6` を持たないため、そちらに揃える（`pl-6` が付いているのは形式カード内部の要素だけ）:

   ```tsx
   <div className="flex flex-col gap-1 pt-1">
     <div className="flex items-center gap-2">
       <Checkbox
         id="quiz-defaults-first-meaning-text-only"
         checked={firstMeaningTextOnly}
         onCheckedChange={(checked) => setFirstMeaningTextOnly(checked === true)}
       />
       <Label htmlFor="quiz-defaults-first-meaning-text-only" className="font-normal">
         最初の訳語だけを表示する
       </Label>
     </div>
     <p className="text-muted-foreground text-xs">
       オフにすると、複数の訳語を「; 」で連結して表示します。
     </p>
   </div>
   ```

3. コメント `{/* 四択（英→日）固有: 選択肢に先頭の訳語だけを表示するか */}` を共通設定である旨に書き換える

**state の初期化・保存・「デフォルト設定に戻す」でのリセットは変えない。**

## 完了条件（Definition of Done）

- [ ] unit（`src/lib/quiz/format-options.unit.test.ts`）: `isFirstMeaningTextOnlyFormat` が対象 4 形式で `true`、残り 6 形式で `false` を返す（全 10 形式を網羅する）
- [ ] 手動確認（開始フォーム）: 四択（英語→日本語）・四択（日本語→英語）・自己判定（日本語→英語）・スペル確認を選ぶとトグルと補足文が出る。自己判定（英語→日本語）・多義語選択・TG 4 種を選ぶと出ない
- [ ] 手動確認（開始フォーム）: 対象形式でトグルを OFF にし、対象外の形式へ切り替えてから対象形式に戻すと OFF が保持されている。対象外の形式のまま「この設定をデフォルト設定とする」で開始しても、保存されたデフォルト設定の値が消えない
- [ ] 手動確認（デフォルト設定画面）: トグルが形式カード群の直後に 1 つだけ表示され、どの形式を選んでも（未選択でも）表示が消えない。保存後に再読み込みして値が復元される。「デフォルト設定に戻す」で ON に戻る
- [ ] 手動確認: 両画面のラベルが `最初の訳語だけを表示する`、補足文が `オフにすると、複数の訳語を「; 」で連結して表示します。` になっている
- [ ] 手動確認（デフォルト設定画面）: 移設後のトグルの体裁（Checkbox・ラベル・補足文のインデント）が同画面の他のチェックボックス項目（ブックマークのみ・掲載番号順）と揃っている
- [ ] 「この設定をデフォルト設定とする」の補足文が確定文字列どおりになっている（`オンで開始すると、上の掲載箇所・掲載番号範囲・ブックマークのみ・出題数・出題形式・最初の訳語の表示・掲載番号順・制限時間をデフォルト設定として保存します。`）
- [ ] `pnpm format`（整形）の上で `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る

手動確認の手順は e2e-verify スキル（`.claude/skills/e2e-verify/references/quiz.md`）に従う。Checkbox は `id` セレクタで操作せず `getByRole("checkbox", { name: "<ラベル文言>" })` で取ること（`id` は不可視の hidden input に付くため click がタイムアウトする）。

## 競合注意

- `src/app/quiz/_components/start-form.tsx` / `src/app/settings/quiz-defaults/_components/quiz-defaults-form.tsx`: 01 のマージ後に着手すること（01 が変数名・`id` を改名済み）

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
