# 05. result-list-emphasis

状態: **完了**（2026-08-15）　PR: （未作成）

## 目的

結果一覧の正解列を「表示要素の配列＋先頭を強調するか」の構造へ変え、自己判定（英語→日本語 `SELF_JUDGE`）の正解列だけ先頭訳語を赤字にする。現状 `ResultRow.correctDisplay` は「; 」連結済みの 1 本の文字列で、先頭の訳語を切り出せない。

スコープ外:

- 解答表示側の赤字（04。本チケットはそこで開けた `baseClassName` を使う）
- **「自分の回答」列**（従来どおり文字列・強調なし）
- 自己判定（英→日）以外の形式の正解列（構造は通るが強調なし・見た目は不変）
- 共通設定（`firstMeaningTextOnly`）そのもの。本チケットは設定に連動しない常時強調だけを扱う

## 依存チケット

- 04: `MeaningText` が `baseClassName` を受け取れること（赤字の当て方はこの経路に載せる）

## 前提（設計決定の再掲）

- 対象は自己判定（英語→日本語 `SELF_JUDGE`）の解答表示と、**結果一覧のその形式の正解列**。赤くするのは先頭 Meaning の先頭 MeaningText 1 つ。共通設定の ON / OFF に連動せず常時適用する（[01-requirements.md](../../design/quiz-first-meaning-only/01-requirements.md) 決定 4）
- 対象外: 多義語選択の選択肢・正解列、四択（英→日）の選択肢と結果一覧の正解列・「自分の回答」列、日本語→英語の問題文、TG 例文形式（[01-requirements.md](../../design/quiz-first-meaning-only/01-requirements.md) 決定 4）
- 体裁は `text-red-500`・太字なし・`dark:` なし（[03-ui.md](../../design/quiz-first-meaning-only/03-ui.md) 決定 3）
- `ResultRow.correctDisplay` を文字列から「表示要素の配列＋先頭を強調するか」を持つ構造へ変え、形式別の導出（`correctAnswerDisplay`）でどちらを立てるかを決める。**自己判定（英→日）だけ配列（最初の Meaning の訳語）＋強調あり**とし、他形式は単一要素・強調なし（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 5）
- 描画は**正解列専用の関数を入口として設け、強調なしのときは既存のヘルパ（形式の種別で 4 分岐し、文字列を受け取る関数）へ委譲する**。形式による分岐の実装は 1 箇所に保ち、専用関数が持つのは「強調ありのときに配列を組み立てて先頭を赤字にする」経路だけとする。強調ありになるのは自己判定（英→日）だけであり、専用関数はその前提（種別は訳語表示のもの 1 つ）で書く。他形式へ強調を広げるなら、この前提から見直す（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 5）
  - 既存コードの事実（設計決定ではない。実装時に確認すること）: その「既存のヘルパ」は `src/app/quiz/_components/result-list.tsx` の `answerSideDisplayOf(kind, text)` で、`tg-text` / `tg-meaning` / `headword` / それ以外の 4 分岐を持つ。「訳語表示の種別」は `PromptKind` の `headword`
- **「自分の回答」列は従来どおり、そのヘルパを文字列で呼ぶ**（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 5）
- 配列の描画は要素ごとに訳語の描画コンポーネント（`MeaningText`）を通し、区切りの「; 」は要素の間に置く。装飾記法の解釈単位が「連結後の文字列全体」から「訳語 1 件ごと」に変わるが、記法は訳語 1 件の中で閉じるのが本来の使い方なので許容する（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 5）

## 実装内容

### 作成: `src/app/quiz/_lib/correct-answer-display.ts`

`quiz-flow.tsx` の `correctAnswerDisplay`（payload から正解表示を導出する形式網羅 switch）を `.ts` モジュールへ切り出し、戻り値を構造にする。**切り出しの目的は unit テスト可能にすること**（`.test.tsx` は実行対象外のため、`quiz-flow.tsx` に置いたままでは自動検証できない）。既存の `src/app/quiz/_lib/build-start-drill-input.ts` と同じ置き場。

```ts
/** 結果一覧の正解列の表示データ。強調ありは自己判定（英→日）のみ。 */
export type CorrectDisplay = {
  /** 表示要素。強調なしの形式は常に 1 要素。 */
  texts: string[];
  /** 先頭要素を赤字で強調するか。 */
  emphasizeFirst: boolean;
};

export function correctAnswerDisplay(quiz: QuizPayload, index: number): CorrectDisplay;
```

形式ごとの戻り値（現行の文字列導出を維持したうえで構造に載せる）:

| 形式 | `texts` | `emphasizeFirst` |
| --- | --- | --- |
| `CHOICE` / `CHOICE_JA_EN` / `CHOICE_TG` / `CHOICE_TG_JA_EN` | `[正解選択肢のテキスト]`（無ければ `[""]`） | `false` |
| `SELF_JUDGE` | `question.answer[0]?.texts ?? []`（最初の Meaning の訳語をそのまま配列で） | **`true`** |
| `MULTI_MEANING` | `[正解選択肢を「; 」連結した文字列]` | `false` |
| `SELF_JUDGE_JA_EN` / `SPELLING` | `[headword]` | `false` |
| `SELF_JUDGE_TG` / `SELF_JUDGE_TG_JA_EN` | `[question.answer]` | `false` |

`SELF_JUDGE` だけは従来の `question.answer[0]?.texts.join("; ")` をやめ、**連結せずに配列のまま渡す**（連結すると先頭の訳語を切り出せないため）。区切りの「; 」は描画側が要素の間に置く。

### 変更: `src/app/quiz/_components/result-list.tsx`

`ResultRow.correctDisplay` の型を差し替え、正解列専用の描画関数を足す。

```ts
export type ResultRow = {
  // ...
  /** 正解の表示データ（強調ありは自己判定（英→日）のみ）。 */
  correctDisplay: CorrectDisplay;
  // ...
};
```

```tsx
/**
 * 正解列の表示。強調なしのときは形式分岐を持つ既存ヘルパへ委譲し、
 * 強調ありのとき（自己判定（英→日）＝ kind は "headword"）だけ配列を組み立てて先頭を赤字にする。
 */
function correctDisplayNode(kind: PromptKind, display: CorrectDisplay): React.ReactNode {
  if (!display.emphasizeFirst) return answerSideDisplayOf(kind, display.texts[0] ?? "");
  return display.texts.map((text, i) => (
    <Fragment key={i}>
      {i > 0 ? "; " : null}
      <MeaningText text={text} baseClassName={i === 0 ? "text-red-500" : undefined} />
    </Fragment>
  ));
}
```

**`import { Fragment } from "react"` を足すこと。** 同ファイルは現在 `import { useState } from "react"` のみで `React` の値 import が無く、`tsconfig.json` が `"jsx": "react-jsx"` のため `React.Fragment` と書くと TS2686（React refers to a UMD global）になる。同ファイルで `React.ReactNode` が import 無しで使えているのは、型の位置では UMD 参照が許されるため。

- 正解列の JSX（`<span className="font-content font-semibold">…</span>` の中身）を `answerSideDisplayOf(row.promptKind, row.correctDisplay)` から `correctDisplayNode(row.promptKind, row.correctDisplay)` に差し替える
- **「自分の回答」列（`answerSideDisplayOf(row.promptKind, row.answerDisplay)`）は触らない**
- `answerSideDisplayOf` の 4 分岐（`tg-text` / `tg-meaning` / `headword` / それ以外）は**そのまま残す**。形式分岐の実装を 1 箇所に保つため

### 変更: `src/app/quiz/_components/quiz-flow.tsx`

- `correctAnswerDisplay` の定義を削除し、新モジュールから import する
- `ResultRow` を組み立てている箇所（`correctDisplay: correctAnswerDisplay(quiz, index)`）は呼び出しの形が変わらない（戻り値の型だけ変わる）
- `answerDisplay`（`outcome.answerDisplay`）は**文字列のまま**

## 完了条件（Definition of Done）

- [x] unit（`src/app/quiz/_lib/correct-answer-display.unit.test.ts` を新設）: 全 10 形式について `texts` / `emphasizeFirst` が上表のとおりになる。`SELF_JUDGE` だけ `emphasizeFirst: true` かつ最初の Meaning の訳語が**連結されずに配列で**返る。正解選択肢が無い / Meaning が空のときも例外を投げない
  - テストの入力は **`QuizPayload` を形式ごとに手書きする**（`buildQuiz` を通さない）。`buildQuiz` 経由にすると 03 の変更にテストが引きずられ、本チケットが検証したい「payload → 表示データの導出」以外の理由で落ちるため。`QuizPayload` は discriminated union なので、形式ごとに `format` と当該問題型の必要フィールドだけを埋めた最小オブジェクトでよい
- [x] 手動確認: 自己判定（英語→日本語）でテストを完走し、結果一覧の「正解:」の先頭訳語だけが赤字になる。2 番目以降の訳語は赤くならず、区切りが「; 」で表示される
- [ ] 手動確認: 四択（英→日）・四択（日→英）・スペル確認・多義語選択・TG 形式の結果一覧で、正解列の見た目が従来と変わらない
- [ ] 手動確認: 「自分の回答」列の見た目が全形式で従来と変わらない（赤字が入らない）
- [x] `pnpm format`（整形）の上で `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る

手動確認の手順は e2e-verify スキル（`.claude/skills/e2e-verify/references/quiz.md`）に従う。

## 競合注意

- `src/components/meaning-text.tsx`: 04 のマージ後に着手すること（`baseClassName` を使うため）

## 実装メモ

- 計画との差分なし（`CorrectDisplay` の型・`correctAnswerDisplay` のシグネチャ・形式ごとの戻り値表・`correctDisplayNode`・`Fragment` の import はチケット記載どおり）。integration テストの新規・変更はなし
- `answerSideDisplayOf` の 4 分岐と「自分の回答」列は未変更
- unit テストでは `test.each` で形式をパラメータ化した 3 ブロックの payload リテラルに `as QuizPayload` を使用（`format` が変数だと discriminated union へ直接代入できないため）。単一形式を直接書いた 4 テストは型注釈のみでキャストなし
- **E2E 検証（2026-08-15、統合ブランチ / 一回きりスクリプトで実行後に削除）**: 自己判定（英→日）を完走し、結果一覧の正解列で先頭訳語の要素色が `text-red-500` と一致・親要素の色は非赤で親テキストが `きびきびした、活発な; （風などが）さわやかな`（区切りが「; 」）であることを確認。対照として日→英・自己判定の結果一覧で赤字が入らないことも確認。**未確認は四択・スペル確認・多義語選択・TG 形式の正解列と「自分の回答」列の見た目**
- **07 へ**: `CorrectDisplay` は `src/app/quiz/_lib/correct-answer-display.ts` に定義。出題形式を増やすときは `build-quiz.ts` / `format-options.ts` に加えてこの形式網羅 switch も更新が要る（網羅チェックが効くのでコンパイルエラーで検出される）
