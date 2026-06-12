# 07. question-components

状態: **未着手**　PR: （未作成）

## 目的

出題形式ごとの解答 UI（四択・自己判定・多義語選択）を payload 駆動の表示専用クライアントコンポーネントとして実装する。即時正誤フィードバックまで各コンポーネント内で完結させる。フロー（チケット 08）から独立して先行追加できる（未参照モジュールの先行追加）。

スコープ外:

- 出題画面の共通枠（プログレスバー・見出し語・音声自動再生はチケット 08 の quiz-flow 側）
- 状態機械・画面遷移・履歴送信（チケット 08）

## 依存チケット

- 03: `payload.ts` の問題型（`ChoiceQuestion` / `SelfJudgeQuestion` / `MultiMeaningQuestion`）を props に使う

## 前提（設計決定の再掲）

- 四択: 選択肢ボタンを縦に並べ、末尾にスタイル違いの「わからない」。タップで即確定し、正解の選択肢を緑・選んだ誤答を赤でハイライトして即時フィードバックとする（[04-ui.md](../../design/word-quiz/04-ui.md) 「形式ごとの解答 UI」）
- 自己判定: 「解答を表示」ボタン → 全 Meaning を一覧表示（品詞・MeaningText。単語詳細の Meaning 表示を簡略化した形）→「合っていた / 間違っていた / 思い浮かばなかった」の 3 ボタン。選択したら即「次へ」相当で進む（解答表示済みのため追加のフィードバック画面は挟まない）（[04-ui.md](../../design/word-quiz/04-ui.md) 「形式ごとの解答 UI」）
- 多義語選択: MeaningText 単位のトグル選択（複数選択可）＋「回答する」確定ボタン＋「わからない」。確定後、正解集合を緑・誤って選んだものを赤で表示して即時フィードバックとする（[04-ui.md](../../design/word-quiz/04-ui.md) 「形式ごとの解答 UI」）
- 解答後は即時フィードバックを表示する: 正誤（緑/赤）＋正解内容をその場で見せ、「次へ」ボタンで次問へ進む（[04-ui.md](../../design/word-quiz/04-ui.md) 「出題画面（共通構成）」）
- 採点はクライアントで行う（正解情報は payload に含まれる）（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「問題データの生成場所: サーバーで全問生成」）
- 多義語選択の判定: 選択集合が正解集合と完全一致（全部選び、かつ余計に選ばない）で CORRECT、それ以外は INCORRECT（部分点なし）（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「多義語選択の選択肢構成」）
- 「わからない」は GAVE_UP として記録（四択・多義語選択）。自己判定の「思い浮かばなかった」も GAVE_UP（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「多義語選択の選択肢構成」「自己判定形式の判定段階」）
- 自分の回答内容は結果一覧で表示するため上位へ通知する: 四択＝選んだ選択肢、多義語選択＝選んだ意味の組、自己判定＝結果のみ（[04-ui.md](../../design/word-quiz/04-ui.md) 「結果一覧画面（テスト）」）

## 実装内容

3 ファイルとも `"use client"`。共通の親子契約:

- props: `question`（各形式の payload 型）＋ `onComplete(outcome: QuestionOutcome)` コールバック
- 「次へ」押下（自己判定は 3 ボタン押下）で `onComplete` を 1 回だけ呼ぶ。次問への切替・進捗管理は親（チケット 08 の quiz-flow）が行う

### 作成: `src/app/quiz/_components/question-outcome.ts`

3 コンポーネント共通の解答結果型（チケットでの具体化。「自分の回答」の表示要件は [04-ui.md](../../design/word-quiz/04-ui.md) 「結果一覧画面（テスト）」）。チケット 08 の quiz-flow / result-list もこの型を import する:

```ts
import type { QuizResult } from "@prisma/client"; // 既存の enum import 形に合わせる

export type QuestionOutcome = {
  result: QuizResult;
  // 結果一覧の「自分の回答」表示用文字列。
  // 四択＝選んだ選択肢テキスト、多義語選択＝選んだ意味の組（「; 」連結）、
  // 自己判定＝null、「わからない」（GAVE_UP）＝null
  answerDisplay: string | null;
};
```

### 作成: `src/app/quiz/_components/question-choice.tsx`

`ChoiceQuestion` を受け、選択肢縦並び＋「わからない」。タップで確定 → 正解を緑・選んだ誤答を赤にハイライト → 「次へ」表示。判定: 選択 index === `correctIndex` で CORRECT、別選択肢で INCORRECT、「わからない」で GAVE_UP。

### 作成: `src/app/quiz/_components/question-self-judge.tsx`

`SelfJudgeQuestion` を受け、「解答を表示」→ `answer`（品詞・MeaningText 群）の一覧表示 → 「合っていた（CORRECT）/ 間違っていた（INCORRECT）/ 思い浮かばなかった（GAVE_UP）」の 3 ボタンで即 `onComplete`。

### 作成: `src/app/quiz/_components/question-multi-meaning.tsx`

`MultiMeaningQuestion` を受け、options のトグル選択＋「回答する」＋「わからない」。確定時に選択集合と `isCorrect` 集合の完全一致判定 → 正解集合を緑・誤選択を赤で表示 → 「次へ」。

## 完了条件（Definition of Done）

- [ ] 3 形式とも、確定前は正解情報を画面に出さないこと・`onComplete` が 1 回だけ呼ばれることを実装上保証する（連打ガード）
- [ ] `pnpm lint` / `pnpm typecheck` が通る（設計のテスト戦略（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 9）で UI コンポーネントは自動テスト対象外。動作確認はチケット 08 の手動確認でカバー）

## 競合注意

なし（新規 3 ファイルのみ。チケット 08 が import する側）

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
