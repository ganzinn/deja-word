# 03. generation

状態: **完了（2026-06-13）**　PR: （未作成）

## 目的

問題データ生成の純関数群（`src/lib/quiz/generation/`）と問題データ型 `payload.ts` を実装する。すべて RNG 注入の純関数で、シード付き PRNG によるユニットテストを内包する。DB 非依存。

スコープ外:

- 素材取得クエリ `fetchQuizSource`（チケット 04。本チケットは素材型 `QuizSourceMaterial` と分割純関数 `partitionMaterial` まで）
- UseCase からの呼び出し（チケット 05・09）

## 依存チケット

- 02: Prisma 生成の enum 型（`QuizFormat` / `QuizResult`）を import する

## 前提（設計決定の再掲）

### 生成ロジック共通

- 生成ロジックは RNG（`() => number`、`Math.random` 互換）を引数に取る純関数として実装する。本番は `Math.random` を渡し、unit test はシード付き PRNG を注入して決定的に検証する（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「ランダム性の実装方針」）
- シャッフルは Fisher–Yates。出題順・四択の選択肢順・多義語選択の選択肢順に適用する。シードの永続化はしない（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「ランダム性の実装方針」）
- 選択肢構成・シャッフルまで済んだ完成品の問題データ一式をサーバーで生成する。採点はクライアントで行うため正解情報も payload に含める（DevTools でのカンニング許容）（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「問題データの生成場所: サーバーで全問生成」）
- 意味（MeaningText）が 1 件も登録されていない単語は全形式共通で出題対象から除外する（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「出題対象の例外: 意味未登録の単語は除外」）。※除外はチケット 04 のクエリ条件で実現され、本チケットの生成器は「全単語が意味 1 件以上」を入力前提としてよい

### 四択（CHOICE）

- 1 選択肢 = 1 単語。表示は最初の Meaning（sortOrder 先頭）の MeaningText を「; 」で連結した文字列（例: `走る; 駆ける`）。2 つ目以降の Meaning は表示しない。正解・ダミーとも同じルール（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「選択肢に並べる「意味」の単位」）
- ダミーのプール戦略: (1) 優先プール＝同一 Occurrence に紐づく他の単語（出題単語自身を除く）、(2) 重複排除後の有効候補が 3 語に満たない場合のみ、不足分をユーザーの全登録単語から補完（同一 Occurrence 由来の候補は保持）。プールから無作為に 3 語を選ぶ（品詞一致等の選定基準は MVP では設けない）（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「四択のダミー選択肢」）
- 重複排除: ダミー候補の表示対象 MeaningText のいずれかが正解単語のいずれかの MeaningText と一致（trim 後の完全一致）する場合は除外。ダミー同士の重複も同様に排除（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「四択のダミー選択肢」）
- 縮退: 補完後も有効候補が 3 語未満なら選択肢数を縮退。最低 2 択（＝ダミー 1 件）＋「わからない」。ダミー 0 件は問題生成エラー（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「四択のダミー選択肢」）

### 多義語選択（MULTI_MEANING）

- 正解選択肢はその単語の全 Meaning 横断の全 MeaningText（各 1 選択肢）。trim 後に同じテキストが複数ある場合は 1 選択肢に統合（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「多義語選択の選択肢構成」）
- ダミー候補は他単語の全 Meaning 横断の全 MeaningText（同一単語から複数可）。優先順（同一 Occurrence → 不足分のみ全登録単語）と重複排除（正解集合・ダミー同士と trim 後完全一致で除外）は四択と同じ（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「多義語選択の選択肢構成」）
- ダミー数は 2〜5 のランダム（総選択肢数 = 正解数 + 2〜5）。プール不足時はある分まで縮退（最低 1）。ダミー 0 件は問題生成エラー（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「多義語選択の選択肢構成」）
- 判定（クライアント側）: 選択集合が正解集合と完全一致で CORRECT、それ以外は INCORRECT（部分点なし）。「わからない」（GAVE_UP）も置く（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「多義語選択の選択肢構成」）

### 自己判定（SELF_JUDGE）

- 解答表示は全 Meaning を見せる。判定は「合っていた / 間違っていた / 思い浮かばなかった」の 3 段階で、3 つ目は GAVE_UP として記録（enum 変更不要）（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「自己判定形式の判定段階」）

### payload 型と拡張点

- 問題データは discriminated union。形式追加の拡張点は (1) Prisma enum 値追加 (2) `generation/<format>.ts` 生成器追加 (3) `payload.ts` union メンバ追加 (4) `question-<format>.tsx` 追加の 4 箇所に閉じ、ディスパッチャ `buildQuiz(format, material, rng)` と成立判定 `checkFormatAvailability(format, material)` は exhaustive switch（`never` チェック）にする（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 6）:

```ts
// src/lib/quiz/payload.ts
export type QuestionBase = { wordId: string; headword: string; pronunciationAudioUrl: string | null };
export type ChoiceQuestion = QuestionBase & { choices: { text: string }[]; correctIndex: number };
export type MultiMeaningQuestion = QuestionBase & { options: { text: string; isCorrect: boolean }[] };
export type SelfJudgeQuestion = QuestionBase & {
  answer: { partOfSpeech: string | null; texts: string[] }[]; // 全 Meaning の表示用データ
};
export type QuizPayload =
  | { format: "CHOICE"; questions: ChoiceQuestion[] }
  | { format: "SELF_JUDGE"; questions: SelfJudgeQuestion[] }
  | { format: "MULTI_MEANING"; questions: MultiMeaningQuestion[] };
```

- 各問題の共通項目として発音音源 URL（最初の Meaning の発音音源。未登録なら null）を含める（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「問題データの生成場所: サーバーで全問生成」の音声拡張）
- `payload.ts`・純関数には `server-only` を付けない（クライアントから型 import 可とする。呼び出し元の UseCase / クエリが server-only）（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 1・7）
- 素材型 `QuizSourceMaterial` は対象単語の headword＋全 Meaning / MeaningText＋音源 URL＋ダミープールを持ち、`partitionMaterial(rows, range)` が取得行を (a) 出題対象（occurrenceNumber が範囲内）、(b) 同一 Occurrence プール、(c) 全登録プールの互いに素な 3 つに分割する。ある問題のダミー候補は (a)∪(b) から出題中の単語自身を除いたもの（(c) は不足時の補完用）（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 8）

### drill 残数遷移

- 残数モデル: 元テスト誤答=3・正答=1 から開始。正解で −1、間違い（GAVE_UP 含む）で 3 にリセット、0 で卒業（[06-drill-mode.md](../../design/word-quiz/06-drill-mode.md) 決定 1）。遷移は純関数 `nextRemaining(current, result)` として実装する（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 4）

## 実装内容

ファイル構成は [05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 7 のとおり:

### 作成: `src/lib/quiz/payload.ts`

前提に再掲した discriminated union をそのまま定義する。

### 作成: `src/lib/quiz/generation/shuffle.ts`（＋ `.unit.test.ts`）

`type Rng = () => number`、`fisherYatesShuffle<T>(items: T[], rng: Rng): T[]`、`pickN<T>(items: T[], n: number, rng: Rng): T[]`。

### 作成: `src/lib/quiz/generation/material.ts`

`QuizSourceMaterial` 型と `partitionMaterial(rows, range)` 純関数（前提の (a)(b)(c) 分割）。range は `{ from?: number; to?: number }`（空欄＝制限なし、片側のみ可）。

### 作成: `src/lib/quiz/generation/dummy-pool.ts`（＋ `.unit.test.ts`）

ダミープールの優先順（同一 Occurrence → 不足時のみ全登録へ補完）・trim 完全一致の重複排除（対正解・対ダミー同士）・縮退判定を、四択（単語単位）と多義語選択（MeaningText 単位）の両方が使える形で実装する。

### 作成: `src/lib/quiz/generation/choice.ts`（＋ `.unit.test.ts`）

`buildChoiceQuestions(material, rng)`。前提の四択ルール（「; 」連結・ダミー 3 語・縮退最低 2 択・ダミー 0 件はエラー・選択肢シャッフル・correctIndex 設定）。

### 作成: `src/lib/quiz/generation/multi-meaning.ts`（＋ `.unit.test.ts`）

`buildMultiMeaningQuestions(material, rng)`。前提の多義語選択ルール（正解＝全 MeaningText 統合・ダミー数 2〜5 ランダム・縮退最低 1・ダミー 0 件はエラー・シャッフル済み options）。

### 作成: `src/lib/quiz/generation/self-judge.ts`（＋ `.unit.test.ts`）

`buildSelfJudgeQuestions(material, rng)`。全 Meaning（品詞・MeaningText 群）を answer に詰め、出題順をシャッフル。

### 作成: `src/lib/quiz/generation/build-quiz.ts`（＋ `.unit.test.ts`）

`buildQuiz(format, material, rng): QuizPayload` と `checkFormatAvailability(format, material)`（1 形式分の成立可否＋不成立理由を返す）。両方 exhaustive switch（`never` チェック）。

### 作成: `src/lib/quiz/generation/next-remaining.ts`（＋ `.unit.test.ts`）

`nextRemaining(current: number, result: QuizResult): number`。CORRECT で −1（下限 0）、INCORRECT / GAVE_UP で 3 にリセット。

### 作成: `tests/setup/` のシード付き PRNG ヘルパ

mulberry32 等の小さな決定的 PRNG（`seededRng(seed: number): Rng`）を追加する（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 7）。

## 完了条件（Definition of Done）

- [ ] `generation/` 全純関数の unit test: シード付き PRNG 注入で決定的に検証。縮退（四択 3 語未満→最低 2 択、ダミー 0 件エラー、多義語 2〜5・最低 1）・trim 重複排除（対正解・対ダミー）・シャッフル（Fisher–Yates の並び再現）・残数遷移 `nextRemaining`（CORRECT/INCORRECT/GAVE_UP×境界 0・3）を網羅（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 9）
- [ ] `buildQuiz` / `checkFormatAvailability` の exhaustive switch が `never` チェックでコンパイル保証されている
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る

## 実装メモ

- `QuizGenerationError`（ダミー 0 件等のエラークラス）は `generation/dummy-pool.ts` に定義（縮退判定が dummy-pool の責務のため）。**05 の生成 UseCase・06 の error-map はここから import すること**。
- `checkFormatAvailability` の戻り値は 05 の `QuizPreview.formats[].reason: string | null` に合わせ `{ available: true; reason: null } | { available: false; reason: string }`。reason はそのまま UI 注記に使える日本語文字列。
- `material.ts` に 3 生成器共用ヘルパ `questionBaseOf` / `allMeaningTexts` を追加。
- `QuizSourceRow` は 03（`generation/material.ts`、手書き構造型・DB 非依存）と 04（`queries/quiz-source.ts`、クエリ戻り値の導出型）の両方が export する二重定義。オーケストレーターがマージ時に代入可能性を型チェックで確認済み（クエリ戻り型 → 構造型へ代入可）。**05 は `fetchQuizSource` の結果をそのまま `partitionMaterial` に渡せる**。名称統一は不要と判断（構造的部分型で接続。material.ts の DB 非依存を維持）。
- `material.ts` のコロケート unit test は決定 7 のファイル一覧（test なしと明示）に準拠して未作成。`partitionMaterial` の直接検証は 05 の UseCase テストで担保される想定。
- `tests/setup/seeded-rng.ts` に mulberry32 の `seededRng(seed)` を追加（unit test 用の決定的 PRNG）。
