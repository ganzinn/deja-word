# 03. generation-dummy

状態: **完了**（2026-08-15）　PR: （未作成）

## 目的

四択（日→英 `CHOICE_JA_EN`）で設定 ON のとき、**先頭の訳語が正解と衝突する単語をダミー選択肢から外す**。設定 ON では問題文が先頭の訳語 1 つになるため、同じ先頭訳語を持つ別単語がダミーに入ると正解と等価な選択肢が並んでしまう。そのためダミー候補のキーを「正解一致判定用」と「重複排除用」に分ける。

スコープ外:

- 問題文の表示切替（02）
- 四択（英→日）のキーの扱い（`choiceCandidateTexts` の使われ方は**変えない**）
- 自己判定（日→英）・スペル確認への同様の緩和（選択肢が無いため適用できない）
- 赤字強調（04 / 05）、UI（06）

## 依存チケット

- 02: `buildChoiceJaEnQuestions` が第 3 引数 `firstMeaningTextOnly` を受け取る形になっていること（本チケットはその引数をダミー候補のキー生成にも使う）。あわせて `choice-ja-en.ts` / `build-quiz.ts` / `build-quiz.unit.test.ts` を 02 と直列で触る

## 前提（設計決定の再掲）

- ダミー選定（`src/lib/quiz/generation/dummy-pool.ts`）の候補は現在 `texts` 1 つで「正解と一致するものを除外する」判定と「選定済みダミー同士の重複排除」の両方を担っている。四択（日→英）では選択肢の表示が headword なので、後者は headword で行うのが正しい。そこで候補に**正解一致判定にだけ使うキー**を足す（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 4）
- 四択（日→英）で設定 ON のとき: 正解側のキーに target の先頭訳語を加え、候補側の正解一致判定用キーにも候補単語の先頭訳語を加える。重複排除は従来どおり headword で行う（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 4）
- 設定 OFF のとき、および四択（英→日）: 現状と同じキー（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 4）
- **空文字（訳語が未登録の単語）はキーに載せない**（空文字同士を衝突と判定しないため）（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 4）
- キーの作り方は生成と成立判定（`checkFormatAvailability`）で**共有する**（四択（英→日）が `choiceCandidateTexts` を共有しているのと同じ形）（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 4）
- 追加するキーは**任意フィールドとし、省略時は従来のキーと同じ**として扱う。候補を組み立てている箇所は生成側 5 形式＋成立判定側 4 箇所あり、必須にすると今回関係しない形式まで touch することになるため（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 4）
- 四択（日→英）には既に「ダミーを確保できず成立しない」経路がある（`checkFormatAvailability` が headword ベースの衝突でダミー枯渇を判定する）。今回はその不成立条件が先頭訳語の衝突にも広がる。テスト開始時は成立判定で弾いて理由を表示できるが、**drill のラウンド生成・再テスト生成は成立判定を経ずに `buildQuiz` を直接呼ぶため、候補が尽きた場合は生成時のエラーになる**。プールが足りないだけなら既存の縮退規則（最低 2 択）に従うので、実際にエラーへ至るのは、ダミー候補（同一掲載箇所＋全登録単語）がすべて headword か先頭訳語で正解と衝突するとき—登録語数がごく少ないか、先頭訳語が極端に偏っているとき—に限られる。**このリスクは受け入れる**（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 4）

既存コードの事実（設計決定ではない。実装時に確認すること）:

- `src/lib/quiz/generation/dummy-pool.ts` の `dedupeKey(text)` は装飾記法（`**走る**`）を `stripRichTextMarkup` で取り除いてから `trim` する。追加するキーも同じ正規化を通す（`selectDummies` / `hasValidDummyCandidate` の内部で行われる）

## 実装内容

### 変更: `src/lib/quiz/generation/dummy-pool.ts`

`DummyCandidate` に正解一致判定専用の任意キーを足し、`selectDummies` と `hasValidDummyCandidate` が正解一致判定にだけそれを使うようにする。**重複排除は従来どおり `texts`**。

```ts
/** ダミー候補。`texts` は重複排除に使う表示対象テキスト（trim 前で渡してよい）。 */
export type DummyCandidate<T> = {
  value: T;
  texts: string[];
  /**
   * 正解一致判定にだけ使うキー（trim 前で渡してよい）。省略時は `texts` を使う。
   * 表示（重複排除の単位）と「正解と等価か」の判定単位が食い違う形式のためにある
   * （四択（日→英）で設定 ON のとき、表示は headword・正解一致判定は headword ＋先頭訳語）。
   */
  matchTexts?: string[];
};
```

- `selectDummies`: `const texts = candidate.texts.map(dedupeKey)` は重複排除用に残し、正解一致判定は `(candidate.matchTexts ?? candidate.texts).map(dedupeKey)` に対して行う。`usedTexts` へ入れるのは従来どおり `texts` 側だけ
- `hasValidDummyCandidate`: 同じく `matchTexts ?? texts` で正解一致判定する

### 変更: `src/lib/quiz/generation/choice-ja-en.ts`

キーの作り方を生成と成立判定で共有できるよう export する。

```ts
/**
 * 四択（日→英）の正解側テキスト（ダミーから除外する値）。
 * 設定 ON のときは問題文が先頭の訳語 1 つになるため、先頭訳語も衝突対象に含める。
 * 空文字（訳語未登録）は載せない。
 */
export function choiceJaEnCorrectTexts(word: QuizWord, firstMeaningTextOnly: boolean): string[]

/**
 * 四択（日→英）のダミー候補。表示・重複排除は headword、正解一致判定は設定 ON のとき
 * headword ＋先頭訳語。生成（buildChoiceJaEnQuestions）と成立判定（checkFormatAvailability）で共有する。
 */
export function choiceJaEnCandidate(word: QuizWord, firstMeaningTextOnly: boolean): DummyCandidate<QuizWord>
```

- `choiceJaEnCorrectTexts`: `firstMeaningTextOnly` が false なら `[word.headword]`。true なら先頭訳語（`firstMeaningHeadText(word)`）が空文字でない場合だけ足す
- `choiceJaEnCandidate`: `texts` は常に `[word.headword]`。`firstMeaningTextOnly` が true かつ先頭訳語が空文字でないときだけ `matchTexts: [word.headword, 先頭訳語]` を付ける（false のときは `matchTexts` を付けない＝従来どおり）
- 既存の private な `toHeadwordCandidate` は `choiceJaEnCandidate` に置き換えて削除する
- `buildChoiceJaEnQuestions` の `correctTexts: [target.headword]` を `correctTexts: choiceJaEnCorrectTexts(target, firstMeaningTextOnly)` に、`primaryPool` / `fallbackPool` の候補生成を `choiceJaEnCandidate(w, firstMeaningTextOnly)` に置き換える

### 変更: `src/lib/quiz/generation/build-quiz.ts`

`checkFormatAvailability` の `CHOICE_JA_EN` 分岐で、生成と同じヘルパを使う。

```ts
    case "CHOICE_JA_EN": {
      const firstMeaningTextOnly = options.firstMeaningTextOnly ?? false;
      const dummyless = findDummylessTarget(
        material,
        (word) => [choiceJaEnCandidate(word, firstMeaningTextOnly)],
        (word) => choiceJaEnCorrectTexts(word, firstMeaningTextOnly),
      );
      // 不成立理由の文言は既存のまま
    }
```

あわせて既存テスト名 `"CHOICE_JA_EN dummy availability is judged by headword, independent of meanings"`（`build-quiz.unit.test.ts`）を、設定 OFF のときの主張であることが分かる名前に直す（設定 ON では先頭訳語も判定に入るため、現行の名前は虚偽になる）。

## 完了条件（Definition of Done）

- [ ] unit（`dummy-pool.unit.test.ts`）: `matchTexts` 省略時は従来と同じ挙動（既存ケースが担う）。`matchTexts` 指定時は正解一致判定だけがそれを見て、重複排除は `texts` のまま行われる（`matchTexts` が重なる候補同士は排除されない／`texts` が重なる候補同士は排除される、の両方）
- [ ] unit（`choice-ja-en.unit.test.ts`）: 設定 ON のとき、先頭訳語が正解の先頭訳語と一致する単語がダミーに出ない。設定 OFF のときは従来どおり出る。訳語未登録（先頭訳語が空文字）の単語同士が衝突扱いされない。装飾記法付きの訳語（`**走る**` と `走る`）が同一と判定される
- [ ] unit（`build-quiz.unit.test.ts`）: 設定 ON のとき `checkFormatAvailability("CHOICE_JA_EN", ...)` の可否と `buildQuiz` の生成成否が一致する（既存の「availability agrees with generation success」と同じ観点を日→英四択の ON 条件で）
- [ ] unit（`build-quiz.unit.test.ts`）: **受け入れたリスクの経路**を明示的に押さえる。ダミー候補がすべて headword か先頭訳語で正解と衝突する素材で `buildQuiz("CHOICE_JA_EN", ...)` を直接呼ぶと `QuizGenerationError` を投げる（drill のラウンド生成・再テスト生成は成立判定を経ないため、この経路が実際に露出する）
- [ ] 既存テスト名 `"CHOICE_JA_EN dummy availability is judged by headword, independent of meanings"` が、設定 OFF 限定の主張と分かる名前に直っている
- [ ] unit: 四択（英→日）の生成結果が本チケットで変わっていない（`choice.unit.test.ts` の既存ケースが無変更で通る）
- [ ] `pnpm format`（整形）の上で `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る

## 競合注意

- `src/lib/quiz/generation/build-quiz.ts` / `build-quiz.unit.test.ts`: 01 → 02 のマージ後に着手すること（本チケットは既存テスト名の訂正とケース追加を行う。テスト名 `"forwards …"` の書き換えは 02 の担当なので触らない）
- `src/lib/quiz/generation/choice-ja-en.ts`: 02 のマージ後に着手すること

## 実装メモ

- 計画との差分なし（チケット記載のシグネチャ・実装方針どおり）。integration テストの新規・変更はなし
- `choiceJaEnCorrectTexts` / `choiceJaEnCandidate` は「設定 ON かつ先頭訳語が非空」のときだけ先頭訳語を足す（`matchTexts` も同条件でのみ付与）
- `dummy-pool.ts` の `selectDummies` JSDoc に「正解一致判定は `matchTexts ?? texts`、重複排除は常に `texts`」の 1 行を追記（キーが 2 種類になったため）
- 追加テストが実挙動を捉えていることを、実装を一時的に旧挙動へ戻して確認済み（`selectDummies` を `texts` に戻すと 6 件失敗、`hasValidDummyCandidate` で 2 件失敗。確認後に復元）
- **07 へ**: 四択（日→英）の設定 ON では不成立条件が広がる（先頭訳語の衝突でもダミー枯渇になる）。テスト開始時は成立判定で理由表示されるが、drill のラウンド生成・再テスト生成は成立判定を経ないため `QuizGenerationError` になる経路が残る（受け入れ済みリスク。`build-quiz.unit.test.ts` の `"CHOICE_JA_EN generation throws for collision-only material even without an availability check"` が押さえている）
