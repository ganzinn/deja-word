# 09. drill-usecases

状態: **実装中**　PR: （未作成）

## 目的

定着モード（drill、mode=DRILL）のサーバーロジックを完成させる: 生成・ラウンド生成・ラウンド送信・一覧・削除の 5 UseCase と、ラウンド適用 handler（`applyDrillRound`）。ラウンド送信の冪等性（roundCount CAS）を integration test で検証する。

スコープ外:

- drill 系 Server Action と UI（チケット 10）

## 依存チケット

- 05: `handlers/shared.ts`（Tx 型）・`insertQuizAnswers`（mode=DRILL で共有）・`fetchQuizSource`＋生成ロジックの呼び出しパターンを使う

## 前提（設計決定の再掲）

### 残数モデル・生成

- 元テストで間違えた単語は残数 3、正解した単語は残数 1 から開始。正解で −1、間違い（「わからない」含む）で 3 にリセット、残数 0 ＝卒業（以降のラウンドに出題されない）。各ラウンドは未卒業（残数 > 0）の単語を全て出題（[06-drill-mode.md](../../design/word-quiz/06-drill-mode.md) 決定 1）
- drill は元テストごとに独立生成し複数並存可。生成タイミングは結果画面で「定着モードへ」を押したとき。全単語卒業で `Drill.completedAt` を設定（[06-drill-mode.md](../../design/word-quiz/06-drill-mode.md) 決定 2）
- drill 生成の入力はクライアントから結果（`{ wordId, correct }[]`）と format を送る（QuizAnswer にテストセッション ID がなくサーバーで「今回のテストの結果」を特定できないため。改ざんはカンニング許容方針と整合）（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 2）
- `startDrill` に範囲（rangeFrom / rangeTo）は含めない。Drill の rangeFrom / rangeTo は results の単語の occurrenceNumber から実効範囲（min / max）をサーバーで計算して保存する（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 2）
- 出題形式は元テストを引き継ぐ: 生成時に format を `Drill.format` に保存し、ラウンドの問題生成と QuizAnswer.format の付与はサーバーが `Drill.format` から導出する（ラウンド系の入力に format はない）（[06-drill-mode.md](../../design/word-quiz/06-drill-mode.md) 決定 4）
- ラウンド間で出題順・選択肢は毎回変える: 各ラウンド開始時にサーバー再生成（シード永続化なし）（[06-drill-mode.md](../../design/word-quiz/06-drill-mode.md) 決定 5）
- 初回・再開とも `startDrillRound`（→ `generateDrillRoundForUser`）の単一経路。元テスト全問正解でも drill は開始できる（全単語が残数 1 から開始）（[06-drill-mode.md](../../design/word-quiz/06-drill-mode.md) 決定 6）

### ラウンド送信・冪等性

- drill 中の解答も QuizAnswer に mode=DRILL で残す（Drill への FK 参照は持たない）。履歴送信は各ラウンド終了時に一括送信し、同一トランザクションで残数を更新。ラウンド途中の離脱はそのラウンド分のみ破棄され、確定済みの残数は保持される（[06-drill-mode.md](../../design/word-quiz/06-drill-mode.md) 決定 3）
- `submitDrillRoundForUser` のフロー（全体が 1 tx）（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 4）:
  1. `tx.drill.updateMany({ where: { id: drillId, ownerId: userId, roundCount: expectedRoundCount }, data: { roundCount: { increment: 1 } } })`
  2. `count === 1`（通常経路）: `insertQuizAnswers`（mode=DRILL）→ 残数更新（純関数 `nextRemaining(current, result)`）→ 全 remaining=0 なら `completedAt` 設定 → 確定残数を返す。単語削除耐性は存在確認フィルタを適用し、ラウンド中に削除された単語は履歴 insert・残数更新とも skip（DrillWord は Cascade で削除済み。完了判定は残っている DrillWord 行だけで行う）
  3. `count === 0`: drill を再読込。`roundCount === expectedRoundCount + 1` なら適用済みと判断し、現在の DrillWord を読み直して `alreadyApplied: true` で成功応答（自分の再送だけでなく、別タブの同一ラウンド先行送信も含む）。それ以外の roundCount（2 ラウンド以上進んだ古いタブ等）は `DrillRoundConflictError`
- `expectedRoundCount` は ラウンド生成の応答でクライアントへ渡す（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 4）
- `completedAt` はラウンド送信の同一 tx 内で、全 remaining=0 を判定したサーバーが設定。完了した drill は進行中一覧（completedAt IS NULL が条件）から消える（[06-drill-mode.md](../../design/word-quiz/06-drill-mode.md) 決定 6）

### 一覧・削除・認可

- 進行中一覧の表示項目: 元テストの範囲・残単語数・最終実施日（[04-ui.md](../../design/word-quiz/04-ui.md) 「開始画面（/quiz）」）
- 削除は `ownerId: userId` 照合のうえ Drill を物理削除（DrillWord は Cascade）。QuizAnswer は Drill への FK を持たないため解答履歴は無傷で残る（[06-drill-mode.md](../../design/word-quiz/06-drill-mode.md) 決定 7）
- Drill / DrillWord / QuizAnswer は常にユーザー単独所有のため `ownerId: userId` で照合。ownerId は常にセッション由来。handler シグネチャは `(tx: Tx, userId: string, ...)`（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 5）
- UseCase の入出力（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 2 の表より）: 生成＝`{ occurrenceId, format, results: { wordId, correct }[] }` → `{ drillId }`、ラウンド生成＝`{ drillId }` → `{ quiz: QuizPayload, roundCount }`、ラウンド送信＝`{ drillId, expectedRoundCount, answers }` → `{ remaining: { wordId, remaining }[], completed, alreadyApplied }`、削除＝`{ drillId }` → 成功のみ

## 実装内容

UseCase は `src/lib/` 直下フラット、handler は `src/lib/quiz/handlers/`（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 1）。

### 作成: `src/lib/quiz/handlers/drill-round-handler.ts`（＋ `.unit.test.ts`）

`applyDrillRound(tx: Tx, userId: string, input)`: 前提の CAS フロー（updateMany → 分岐 → insertQuizAnswers 共有 → DrillWord 残数更新（`nextRemaining`）→ completedAt 判定）。

### 作成: `src/lib/drill-create.ts`（＋ `.integration.test.ts`）

`createDrillForUser(userId, input: { occurrenceId: string; format: QuizFormat; results: { wordId: string; correct: boolean }[] })` → `{ drillId }`。Occurrence 可視性確認 → results の単語の occurrenceNumber から実効範囲（min / max）を計算 → Drill（format・rangeFrom / rangeTo）＋DrillWord（誤答=3 / 正答=1）を作成。

### 作成: `src/lib/drill-round-generate.ts`

`generateDrillRoundForUser(userId, input: { drillId: string })` → `{ quiz: QuizPayload, roundCount }`。Drill を `ownerId: userId` で取得（不在は NotFound）→ 未卒業（remaining > 0）の DrillWord の単語を対象に、`fetchQuizSource`＋`partitionMaterial`＋`buildQuiz(Drill.format, material, Math.random)` で再生成 → 現在の `roundCount` を `expectedRoundCount` として返す。

### 作成: `src/lib/drill-round-submit.ts`（＋ `.integration.test.ts`）

`submitDrillRoundForUser(userId, input: { drillId, expectedRoundCount, answers: AnswerInput[] })` → `{ remaining, completed, alreadyApplied }`。`prisma.$transaction` で `applyDrillRound` を呼ぶ薄い UseCase。

### 作成: `src/lib/drill-list.ts`

`listActiveDrillsForUser(userId: string): Promise<ActiveDrill[]>`: `completedAt: null` かつ `ownerId: userId` の Drill を返す。

戻り値型（チケットでの具体化。表示項目の要件は [04-ui.md](../../design/word-quiz/04-ui.md) 「開始画面（/quiz）」の「元テストの範囲・残単語数・最終実施日」）。チケット 10 の進行中一覧 UI がこのフィールド名を使う:

```ts
type ActiveDrill = {
  id: string;
  occurrenceName: string; // Occurrence の表示名
  rangeFrom: number;
  rangeTo: number;
  format: QuizFormat;
  remainingWordCount: number; // remaining > 0 の DrillWord 数
  lastPlayedAt: Date; // Drill.updatedAt
};
```

### 作成: `src/lib/drill-delete.ts`

`deleteDrillForUser(userId, drillId)`: `ownerId: userId` 照合のうえ物理削除。特殊ロジックなし（テストはチケット 10 の actions unit でカバー。[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 9）。

## 完了条件（Definition of Done）

- [ ] `applyDrillRound` の unit test（tx-mock 流用）: CAS の 3 分岐（適用・alreadyApplied・Conflict）の分岐判定（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 9）
- [ ] `createDrillForUser` の integration test: 初期残数が誤答=3 / 正答=1 で作られる・実効範囲が min / max で保存される（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 9）
- [ ] `submitDrillRoundForUser` の integration test: 残数遷移（正解 −1・誤答 / GAVE_UP リセット 3）・全卒業で completedAt 設定・**冪等性＝同一 `expectedRoundCount` で 2 回呼び、2 回目が `alreadyApplied: true` を返し remaining と QuizAnswer 件数が 1 回分であること**（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 9）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が通る

## 競合注意

- `src/lib/quiz/handlers/`: チケット 05 が作成済みの `shared.ts`・`quiz-answer-handler.ts` を変更しない（使うのみ）
- `tests/setup/fixtures.ts`: チケット 04 で追加済みの fixture を再利用。不足分の追記は可（04 とは直列依存のため競合しない）

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
