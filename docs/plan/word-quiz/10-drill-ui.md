# 10. drill-ui

状態: **完了（2026-06-13）**　PR: （未作成）

## 目的

定着モード（drill）の UI を完成させ、ダッシュボードに「単語テスト」ボタンを配線して機能全体を公開する（終端チケット）。drill 系 Server Action 4 本の追記、開始画面の進行中 drill 一覧（再開・削除）、結果画面の drill 差分（残数バッジ・ラウンド遷移・完了表示）を含む。

スコープ外:

- なし（本チケットで word-quiz の MVP が完成する）

## 依存チケット

- 08: quiz-flow / start-form / result-list / page.tsx に drill 差分を追記する（同一ファイルの共有のためマージ後に着手）
- 09: drill 系 5 UseCase を呼ぶ

## 前提（設計決定の再掲）

### drill 系 Server Action（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 2 の表）

| 用途 | Action | 入出力 |
| --- | --- | --- |
| drill 生成 | `startDrill` | `{ occurrenceId: string, format: QuizFormat, results: { wordId: string, correct: boolean }[] }` → `{ drillId }`（format は `Drill.format` に保存。results の型はチケット 09 の `createDrillForUser` 入力と同一） |
| drill ラウンド生成 | `startDrillRound` | `{ drillId }` → `{ quiz: QuizPayload, roundCount }`（初回・再開とも同一経路。形式は `Drill.format` から導出） |
| drill ラウンド送信 | `submitDrillRound` | `{ drillId, expectedRoundCount, answers }` → `{ remaining: { wordId, remaining }[], completed, alreadyApplied }` |
| drill 削除 | `deleteDrill` | `{ drillId }` → 成功のみ（追加 payload なし） |

- format はクライアントが drill 生成（`startDrill`）のトップレベルで 1 回だけ送る（zod の enum で検証）。drill のラウンド系 Action は `Drill.format` から導出するため format を受け取らない（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 2、[06-drill-mode.md](../../design/word-quiz/06-drill-mode.md) 決定 4）

### UI（drill 差分）

- エントリポイント: ダッシュボード（`src/app/dashboard/page.tsx`）のアクションボタン群に「単語テスト」を追加し `/quiz` へ遷移。MVP の導線はここのみ（[04-ui.md](../../design/word-quiz/04-ui.md) 「エントリポイント・ルーティング」）
- drill のラウンド（カウントダウン → 出題 → ラウンド結果）はテストと同じクライアントフローを mode 違いで再利用。入口は「テスト結果画面からの開始」と「開始画面の進行中一覧からの再開」の 2 つ（[04-ui.md](../../design/word-quiz/04-ui.md) 「エントリポイント・ルーティング」、[06-drill-mode.md](../../design/word-quiz/06-drill-mode.md) 決定 8）
- 開始画面下部に「進行中の定着モード」一覧（元テストの範囲・残単語数・最終実施日＋「再開」ボタン）。進行中 drill がなければセクションごと非表示。各行に削除ボタン（確認ダイアログ付き）。削除しても解答履歴（QuizAnswer）は残る（[04-ui.md](../../design/word-quiz/04-ui.md) 「開始画面（/quiz）」）
- テスト結果画面の導線「定着モードをはじめる」: drill 生成 → ラウンド 1 のカウントダウンへ。履歴送信が成功するまで無効（drill 生成は履歴の確定が前提）（[04-ui.md](../../design/word-quiz/04-ui.md) 「結果一覧画面（テスト）」）
- drill ラウンド結果画面: テスト結果一覧と同構成（単語詳細ダイアログ含む）＋単語ごとに残数バッジ「あと◯回」・残数 0 は「卒業」バッジ。残数バッジは送信成功レスポンスの確定残数に基づいて表示（クライアント見込み計算で先出ししない）。送信失敗中は残数表示を保留（[04-ui.md](../../design/word-quiz/04-ui.md) 「drill ラウンド結果画面」）
- ラウンド送信失敗時はアラート＋「再送」ボタン。送信成功まで「次のラウンドへ」を無効化（[04-ui.md](../../design/word-quiz/04-ui.md) 「drill ラウンド結果画面」）
- 導線: 未卒業が残っていれば「次のラウンドへ」（カウントダウンから再開）と「終了」（開始画面へ。確定済み残数は保持）。全単語卒業で完了メッセージを表示し「次のラウンドへ」は出さない（[06-drill-mode.md](../../design/word-quiz/06-drill-mode.md) 決定 6）
- 離脱ガード（「途中の結果は破棄されます」）は drill のラウンド中（カウントダウン開始〜ラウンド結果の履歴送信完了前）にも適用。ラウンド途中の離脱はそのラウンド分のみ破棄（[04-ui.md](../../design/word-quiz/04-ui.md) 「中断＝破棄の具体挙動」）

## 実装内容

### 変更: `src/app/quiz/actions.ts`（＋ unit test 追記）

drill 系 4 Action を追記（既存 4 Action と同パターン: 認証 → zod → UseCase → エラーマップ）。`startDrill` → `createDrillForUser`、`startDrillRound` → `generateDrillRoundForUser`、`submitDrillRound` → `submitDrillRoundForUser`、`deleteDrill` → `deleteDrillForUser`。

### 変更: `src/lib/schema/quiz.ts` / `src/lib/quiz/error-map.ts`

drill 系入力スキーマ（`startDrill` の results・format、`submitDrillRound` の expectedRoundCount 等）と、drill 系エラー（NotFound・`DrillRoundConflictError` 等）のマップを追記。

### 変更: `src/app/quiz/page.tsx`

`listActiveDrillsForUser` の結果（進行中 drill 一覧）を取得して client へ渡す処理を追記。

### 変更: `src/app/quiz/_components/start-form.tsx`

画面下部に「進行中の定着モード」一覧セクションを追加（前提の表示項目・再開ボタン・削除ボタン＋確認ダイアログ。0 件ならセクション非表示）。再開は `startDrillRound` → quiz-flow の DRILL モードでカウントダウンへ。

### 変更: `src/app/quiz/_components/quiz-flow.tsx`

DRILL モードの配線: テスト結果からの drill 開始（`startDrill` → `startDrillRound`）、ラウンド結果からの「次のラウンドへ」（`startDrillRound` 再呼び出し）、離脱ガードの DRILL 適用。

### 変更: `src/app/quiz/_components/result-list.tsx`

mode 差分を追加。DRILL 時: `submitDrillRound` で送信（single-flight・失敗時アラート＋再送・成功まで「次のラウンドへ」無効）、確定残数による「あと◯回」「卒業」バッジ、「次のラウンドへ」/「終了」/ 完了メッセージ。TEST 時: 「定着モードをはじめる」を有効化（履歴送信成功後のみ）。

### 変更: `src/app/dashboard/page.tsx`

アクションボタン群に「単語テスト」ボタン（`/quiz` への Link）を追加。

## 完了条件（Definition of Done）

- [ ] `actions.ts` の unit test 追記: drill 系 4 Action の認証なし・zod 不正・エラーマップ。`deleteDrill` は特殊ロジックがないためここでカバー（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 9）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が通る
- [ ] 手動確認: テスト → 結果 → 「定着モードをはじめる」→ ラウンド繰り返し → 全卒業の完了表示、まで一連で動く
- [ ] 手動確認: 開始画面の進行中一覧から再開・削除（確認ダイアログ・削除後も履歴が残る）が動く
- [ ] 手動確認: ダッシュボードに「単語テスト」ボタンが表示され `/quiz` へ遷移する

## 競合注意

- `src/app/quiz/actions.ts` / `src/lib/schema/quiz.ts` / `src/lib/quiz/error-map.ts`: チケット 06 が作成済み（マージ後に追記）
- `src/app/quiz/page.tsx` / `_components/quiz-flow.tsx` / `_components/start-form.tsx` / `_components/result-list.tsx`: チケット 08 が作成済み（マージ後に追記）

## 実装メモ

- 09 申し送りの判断: `EmptyDrillResultsError` は error-map に追加した（`not_found`、「定着モードの対象になる単語が見つかりません。」）。削除レースでユーザー到達可能なため、`unknown` フォールバック（console.error ログ付き）を避けた。
- `QuizErrorCode` に `conflict` を追加（`DrillRoundConflictError` 用。UI 上は既存の送信失敗アラート＋再送で扱い、専用ハンドリングは設けず「終了」で離脱可能）。
- drill 開始/再開/次ラウンドの取得失敗はテスト開始と同じ Countdown のエラー表示（メッセージ＋開始画面に戻る）に乗せた（設計のカウントダウン仕様を mode 共通で再利用）。
- 開始画面へ戻る際（`resetToStart`）に `router.refresh()` を追加し、進行中一覧の鮮度（新規生成・完了・残数進行・削除）をサーバー再取得で担保。
- DRILL 結果画面で確定残数に行がない単語（ラウンド中削除）は「削除済み」バッジ表示（TEST の skippedWordIds 表示と同形）。
- 結果画面の見出しは TEST「テスト結果」/ DRILL「ラウンド結果」。
- 手動確認（テスト→結果→定着モード→全卒業の完了表示／進行中一覧から再開・削除／ダッシュボードの「単語テスト」ボタン）は未実施。
