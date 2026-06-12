# 08. quiz-flow-ui

状態: **完了（2026-06-13）**　PR: （未作成）

## 目的

`/quiz` ページとテストフロー UI 一式（開始 → カウントダウン → 出題 → 結果一覧）を実装し、通常テスト（mode=TEST）を URL 直アクセスで一通り実行できる状態にする。音声の自動再生・先読み、離脱ガード、履歴送信（single-flight＋再送）まで含む。

スコープ外:

- ダッシュボードへの導線（チケット 10 の最終配線。それまで `/quiz` は直接 URL でのみ到達可能）
- drill 系すべて: 進行中 drill 一覧・結果画面の drill 導線・残数バッジ・ラウンド遷移（チケット 10）。本チケットの状態機械・結果画面は drill 差分を後付けできる構造にしておく

## 依存チケット

- 01: `src/components/word-detail-view.tsx` を単語詳細ダイアログで使う
- 06: `getQuizPreview` / `startQuiz` / `submitQuizAnswers` / `getWordDetailForDialog` を呼ぶ
- 07: 形式別 question コンポーネント 3 つを出題画面に組み込む

## 前提（設計決定の再掲）

### ルーティング・状態遷移

- `/quiz` が開始画面。server component がデータ取得し client コンポーネントに渡す（既存画面と同じパターン）。カウントダウン → 出題 → 結果は `/quiz` 内のクライアント状態遷移とし URL 遷移しない。drill のラウンドも同じクライアントフローを mode 違いで再利用する（[04-ui.md](../../design/word-quiz/04-ui.md) 「エントリポイント・ルーティング」）
- app 側構成: `page.tsx`（server component）/ `actions.ts` / `_components/`（quiz-flow＝クライアント状態機械 start → countdown → play → result、start-form、countdown、result-list、word-detail-dialog、question-*）（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 1）

### 開始画面（start-form）

- 構成（上から順）: (1) Occurrence 選択＝shadcn Select で 1 つ選択・各項目に単語数併記、(2) 掲載番号範囲＝from / to の数値入力 2 つ・空欄は「制限なし」・片側のみ可、(3) 出題形式選択＝3 形式のラジオ相当トグルカード、(4) 対象件数プレビュー＝「対象 ◯語」、(5) 開始ボタン＝対象 0 件または選択形式が不成立のとき無効（[04-ui.md](../../design/word-quiz/04-ui.md) 「開始画面（/quiz）」）
- プレビューは Occurrence・範囲の変更時に Server Action（debounce）で取得。除外注記「掲載番号なしの単語 ◯語・意味未登録の単語 ◯語は対象外」を表示し、除外 0 件なら注記自体を出さない（[04-ui.md](../../design/word-quiz/04-ui.md) 「開始画面（/quiz）」）
- 不成立の形式は選択不可＋理由を注記（成立可否はプレビュー応答に含まれるサーバー判定）。形式選択後に範囲変更で不成立になった場合は選択を自動解除せず、注記表示＋開始ボタン無効（[04-ui.md](../../design/word-quiz/04-ui.md) 「開始画面（/quiz）」）
- debounce プレビューは応答順逆転に備え、クライアント側でリクエストトークンを比較し古い応答を捨てる（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 2 の実装メモ）

### カウントダウン

- 全画面オーバーレイで「3・2・1」。裏で問題データを一括取得し、取得完了後ただちに第 1 問の音声をプリロード。カウント終了時に未ロードなら「準備中…」のローディング表示で待機。取得失敗時はエラーメッセージ＋「開始画面に戻る」ボタン（リトライは開始からやり直し）（[04-ui.md](../../design/word-quiz/04-ui.md) 「カウントダウン画面」）

### 出題画面（共通枠）

- 上部: プログレスバー＋「n / N」。中央: 見出し語を大きく表示＋横に発音再生ボタン（既存 `AudioPlayButton`）。その下に形式ごとの解答 UI（チケット 07）を出し分け（[04-ui.md](../../design/word-quiz/04-ui.md) 「出題画面（共通構成）」）
- 出題画面の表示時に発音音源を自動再生（最初の Meaning の発音音源。未登録なら何もせず再生ボタンも非表示＝`AudioPlayButton` の既存挙動）。再生ボタンで再再生可。ブロックされた環境では自動再生せず手動ボタンにフォールバック（[04-ui.md](../../design/word-quiz/04-ui.md) 「出題での音声利用」）
- 音声先読み: カウントダウン中に第 1 問、各問題の表示中に次問をプリロード（即時フィードバック表示中も継続）。取得失敗は無視して進行（自動再生をスキップし、ボタン押下時に再取得）。意味音源（読み上げ）は使わない（[04-ui.md](../../design/word-quiz/04-ui.md) 「出題での音声利用」）
- プリロードは新規 API なし: payload 内の発音音源 URL を `new Audio(url)` で生成・保持して先読みする（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 10）

### 離脱ガード

- テスト中（カウントダウン開始〜結果の履歴送信完了前）は、ブラウザバックをガードし、リロード・タブ閉じには beforeunload で確認を出す。確認テキスト「途中の結果は破棄されます」。離脱したら破棄（解答済み分も履歴に残さない・再開なし）（[04-ui.md](../../design/word-quiz/04-ui.md) 「中断＝破棄の具体挙動」、[01-requirements.md](../../design/word-quiz/01-requirements.md) 「中断の扱い: 破棄」）

### 結果一覧画面

- 上部サマリ: 正解数 / 全問数（正答率）。一覧: 単語ごとに見出し語・正誤アイコン・正解（最初の Meaning の「; 」連結）・自分の回答（四択＝選んだ選択肢、多義語選択＝選んだ意味の組、自己判定＝結果のみ）。各行に発音ボタンは置かない（[04-ui.md](../../design/word-quiz/04-ui.md) 「結果一覧画面（テスト）」）
- 履歴送信は結果画面の表示時に一括送信。失敗時は画面上部にアラート＋「再送」ボタンを表示し、送信成功まで drill への導線を無効化（[04-ui.md](../../design/word-quiz/04-ui.md) 「結果一覧画面（テスト）」）
- 多重送信防止はクライアント single-flight（送信中はボタン無効、再送ボタンは失敗確定後のみ表示）（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 3）
- 送信応答の `skippedWordIds` に入った単語は結果一覧の該当行に「削除済み」注記を表示（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 3）
- 単語タップで `/words/[id]` と同等の内容をフルスクリーンダイアログ表示（表示専用・編集導線なし・閉じると結果画面へ）。詳細データはダイアログを開いたときに取得（[04-ui.md](../../design/word-quiz/04-ui.md) 「結果一覧画面（テスト）」）
- 導線: 「定着モードをはじめる」（本チケットでは無効のプレースホルダまたは非表示とし、チケット 10 で配線）と「開始画面に戻る」（[04-ui.md](../../design/word-quiz/04-ui.md) 「結果一覧画面（テスト）」）

## 実装内容

### 作成: `src/app/quiz/page.tsx`

server component。Occurrence 一覧（各項目の単語数つき）を取得し `quiz-flow.tsx` に渡す。進行中 drill 一覧の取得はチケット 10 で追記。

### 作成: `src/app/quiz/_components/quiz-flow.tsx`

`"use client"`。状態機械 `start → countdown → play → result`。mode（TEST / DRILL）を状態に持ち、本チケットでは TEST のみ配線（DRILL 分岐の器だけ用意してよい）。出題画面の共通枠（プログレス・見出し語・AudioPlayButton・自動再生・次問プリロード）と question-* の出し分け、離脱ガード（popstate ガード＋beforeunload）もここ。

### 作成: `src/app/quiz/_components/start-form.tsx`

前提の開始画面仕様。`getQuizPreview` を debounce＋リクエストトークン比較で呼ぶ。トークンはクライアント内の単調増加カウンタ（`useRef`）で、応答受信時に「自分のトークン ≠ 最新トークン」なら破棄する（クライアント内で完結し、Action の入出力にトークンは含めない。チケットでの具体化。要件は [05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 2 の実装メモ）。開始押下で `startQuiz` → quiz-flow へ payload を渡し countdown へ遷移。

### 作成: `src/app/quiz/_components/countdown.tsx`

「3・2・1」オーバーレイ。データ取得＋第 1 問音声プリロードの完了待ち・「準備中…」・取得失敗時のエラー＋「開始画面に戻る」。

### 作成: `src/app/quiz/_components/result-list.tsx`

前提の結果一覧仕様（サマリ・一覧・自分の回答・削除済み注記・履歴送信 single-flight＋失敗時アラート・再送・単語タップでダイアログ）。「自分の回答」はチケット 07 の `QuestionOutcome.answerDisplay`（quiz-flow が問題ごとに収集して渡す）を表示する。drill 差分（残数バッジ等）はチケット 10 で追記。

### 作成: `src/app/quiz/_components/word-detail-dialog.tsx`

フルスクリーンダイアログ。開いたときに `getWordDetailForDialog` で取得し、`src/components/word-detail-view.tsx`（チケット 01）で表示。表示専用・編集導線なし。

## 完了条件（Definition of Done）

- [ ] `pnpm lint` / `pnpm typecheck` が通る（UI のため自動テストは設計のテスト戦略（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 9）の対象外。Action・UseCase・純関数のテストは依存チケットで担保済み）
- [ ] 手動確認: `/quiz` に直接アクセスし、3 形式それぞれで 開始（プレビュー・除外注記・不成立形式の無効化）→ カウントダウン → 出題（音声自動再生・再再生・次問プリロード）→ 結果一覧（正答率・自分の回答・単語詳細ダイアログ・履歴送信）が一通り動く
- [ ] 手動確認: テスト中のリロードで確認ダイアログが出る・離脱後に履歴が残っていない
- [ ] 手動確認: 履歴送信失敗（ネットワーク遮断等）でアラート＋再送ボタンが出て、再送で成功する

## 競合注意

- `src/app/quiz/page.tsx` / `_components/quiz-flow.tsx` / `_components/start-form.tsx` / `_components/result-list.tsx`: チケット 10 が drill 差分を追記する（10 は本チケットのマージ後に着手すること）

## 実装メモ

- **結果一覧の「正解」表示（多義語選択）**: 設計は「最初の Meaning の『; 』連結」だが、MULTI_MEANING の payload には Meaning 構造がなく、正解集合（全 Meaning 横断）と最初の Meaning は一致しない。payload の正解選択肢（`isCorrect`）を「; 」連結して表示する解釈で実装（四択・自己判定は最初の Meaning 連結と一致）。
- ブラウザバックのガードは「確認なしで押し戻す（ダミー履歴エントリの積み直し）」で実装。確認ダイアログはリロード・タブ閉じ（beforeunload）のみ。独自テキストは近年のブラウザでは表示されない（ブラウザ標準文言になる）。
- **10 への申し送り**: DRILL 分岐の器は quiz-flow の `mode` state（`submitAnswers` 内に `mode !== "TEST"` の分岐点コメント）と result-list の無効ボタン「定着モードをはじめる」（コメントあり）。`OccurrenceOption` / `ResultRow` / `SubmitState` 型は start-form / result-list から export 済み。
- **既知の小穴**: 結果画面の単語詳細ダイアログ内で関連語リンク（`WordDetailView` 内の `/words/[id]` Link）を踏むとクライアント遷移して結果画面の状態が失われる（離脱ガードは popstate / beforeunload のみで in-app Link は対象外）。設計上「編集導線なし」は満たすが、関連語リンクの扱いは設計に記載がないため現状のまま。
- プレビュー取得は debounce 300ms＋単調増加トークンで応答順逆転を破棄。lint の新 react-hooks ルール（`set-state-in-effect` / `refs`）対応で「応答＋key を保持し render 側で鮮度判定」する形。
- 手動確認（3 形式の一連フロー／リロード確認ダイアログ・離脱後履歴なし／送信失敗→再送）は未実施。
