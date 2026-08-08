# 02. ui-bulk-button

状態: **完了（2026-08-08）**　PR: [#246](https://github.com/ganzinn/deja-word/pull/246)

## 目的

テスト結果画面に一括ブックマークボタンを追加する: 対象 wordId 群を算出する純関数 `computeBulkBookmarkTargetIds`（新規ファイル）、`result-list.tsx` へのボタン描画（表示・disabled 条件）、`quiz-flow.tsx` への実行本体（楽観的更新・ロールバック・toast）。

スコープ外: サーバ側（スキーマ・UseCase・action）はチケット 01。機能紹介ドキュメント・撮影はチケット 03。ブックマーク機能自体の仕様変更（データモデル・絞り込み・既存トグルの挙動）はしない。一括解除・Undo・結果画面以外での一括操作は機能スコープ外。

## 依存チケット

- 01: Server Action `addBookmarks({ wordIds })`（`src/app/words/actions.ts` から import）とその Result 型（`bookmarkedWordIds` / `skippedWordIds` / エラー `message`）を呼び出す

## 前提（設計決定の再掲）

### 要求・対象定義

- 一括登録はユーザーがボタンを押したときだけ実行する。自動登録はしない。チェック OFF ではボタンを出さない（[01-requirements.md](../../design/quiz-result-bulk-bookmark/01-requirements.md) 決定 1）
- 全モード共通（TEST / DRILL / DRILL_RETRY）。仕様・挙動は同じで、判定源が送信状態の変種（`success` / `drill-success`）で分かれるのは妨げない（[01-requirements.md](../../design/quiz-result-bulk-bookmark/01-requirements.md) 決定 2）
- 対象単語 = チェック ON 時に表示されている行の単語から削除済みを除いたもの。定義の正は絞り込み条件 `result !== "CORRECT"`（結果種別の列挙は例示）（[01-requirements.md](../../design/quiz-result-bulk-bookmark/01-requirements.md) 決定 3）
- 削除済み判定の源は履歴送信の応答: TEST / DRILL_RETRY は `skippedWordIds` に含まれること、DRILL は応答の残数一覧 `remaining` に該当 wordId の行が無いこと。行の表示自体は変えない（削除済み行は表示に残る）（[01-requirements.md](../../design/quiz-result-bulk-bookmark/01-requirements.md) 決定 3）
- 一括操作は履歴送信の成功後のみ。「成功」= `success`（TEST / DRILL_RETRY）と `drill-success`（DRILL）の両方（[01-requirements.md](../../design/quiz-result-bulk-bookmark/01-requirements.md) 決定 3）
- 対象 wordId 群はクライアントから渡す（結果行はクライアント状態にのみ存在し、サーバーは再導出できない）。同一単語が複数行に出ることは無い前提（[01-requirements.md](../../design/quiz-result-bulk-bookmark/01-requirements.md) 決定 3）
- 既ブックマーク済みの単語も除外せず対象に含める（冪等）（[01-requirements.md](../../design/quiz-result-bulk-bookmark/01-requirements.md) 決定 4）

### 呼び出す action の契約（チケット 01 の成果物）

- `addBookmarks({ wordIds })` は成功時 `{ ok: true; bookmarkedWordIds; skippedWordIds }`、失敗時 `{ ok: false; error: "unauthorized" | "invalid" | "unknown"; message }`（日本語 message 付き）を返す。`revalidatePath` は呼ばれない（[02-server-action.md](../../design/quiz-result-bulk-bookmark/02-server-action.md) 決定 4）。失敗は常に全体失敗（部分適用なし）で再実行が安全（同 決定 3）。同じ入力での再実行は同じ結果（冪等）（同 決定 5）
- 全件スキップ時も `ok: true` ＋ `bookmarkedWordIds: []` になり得る。`skippedWordIds` は削除済み・範囲外の区別なし（[02-server-action.md](../../design/quiz-result-bulk-bookmark/02-server-action.md) 決定 2・決定 5）
- 空配列は `invalid` に落ちるため、**対象 0 件では action を呼ばない UI にする**（[02-server-action.md](../../design/quiz-result-bulk-bookmark/02-server-action.md) 決定 6）

### UI 仕様

- ボタン配置: 「間違えた問題だけ表示」チェックボックス行の直下・行リスト `<ul>` の上。誤答 0 件のチェック ON（「間違えた問題はありません。」表示）ではボタンも非表示（disabled で残さない）（[03-ui.md](../../design/quiz-result-bulk-bookmark/03-ui.md) 決定 1）
- ラベル: `N語をまとめてブックマーク`（`BookmarkIcon` 付き）。N = 表示行から削除済みを除いた対象単語数で、削除済み判定は行表示と同じ計算を使う。送信成功前は N が誤答行数のままになるが、その間は disabled のため押下されない。外観は `variant="outline"` `size="sm"`、親が `flex flex-col`（stretch）のため `self-start` で内容幅・左寄せ（[03-ui.md](../../design/quiz-result-bulk-bookmark/03-ui.md) 決定 2）
- 非表示条件（いずれか）: チェック OFF／誤答行 0 件／`bookmarkStates === null`（取得前・取得失敗。取得失敗時のリトライは既存どおり行わない）（[03-ui.md](../../design/quiz-result-bulk-bookmark/03-ui.md) 決定 3）
- disabled 条件（いずれか）: 履歴送信が成功状態でない（`sending` / `error`）／対象 0 件（全行削除済みで N = 0）／一括登録の実行中。**対象が全件既ブックマーク済みであることは disabled に含めない**（押下は無害で成功 toast が出る）（[03-ui.md](../../design/quiz-result-bulk-bookmark/03-ui.md) 決定 3）
- 役割分担: `ResultList` は対象算出とボタン描画のみ。`bookmarkStates` Map を所有する `QuizFlow` が実行本体（スナップショット・`useTransition`・action 呼び出し・ロールバック・toast・実行中フラグ）を持ち、`ResultList` へ新規 props 2 つ（実行用コールバック＝対象 wordId 群を引数に渡す・実行中フラグ）を渡す（[03-ui.md](../../design/quiz-result-bulk-bookmark/03-ui.md) 決定 4）
- 押下時の流れ（既存 `BookmarkButton` のスナップショット＋`useTransition`＋失敗時ロールバックと同型。[03-ui.md](../../design/quiz-result-bulk-bookmark/03-ui.md) 決定 4）:
  1. 対象 wordId 群の現在のブックマーク状態をスナップショット
  2. `bookmarkStates` Map 上で対象全 wordId を ON に一括更新（先行反映）。**1 件用 `onBookmarkChange` の繰り返しではなく 1 回の Map コピーで全件更新**（繰り返しは対象数に対して二乗のコピーになるため不可）。行の `RowBookmarkButton` は Map の値変化（key 再マウント）で ON 表示になり、行側の新規機構は不要
  3. `startTransition` 内で `addBookmarks({ wordIds: 対象 })` を呼ぶ
  4. 成功応答の `skippedWordIds` に入った wordId はスナップショット値へ戻す
  5. 失敗時は対象全 wordId をスナップショット値へ戻す
- 実行本体が常時マウントの `QuizFlow` 側にあるため、実行中にボタンが消えても（チェック OFF 等）実行・ロールバック・toast は継続する（[03-ui.md](../../design/quiz-result-bulk-bookmark/03-ui.md) 決定 4）
- 成功時 toast の 3 分岐（N = 応答 `bookmarkedWordIds` の件数、M = `skippedWordIds` の件数。ラベルの N とは別の値。[03-ui.md](../../design/quiz-result-bulk-bookmark/03-ui.md) 決定 5）:
  - 全件登録（`skippedWordIds` 空）: `toast.success("N語をブックマークしました")`
  - 一部スキップ（両方 1 件以上）: `toast.success("N語をブックマークしました（M語は登録できませんでした）")`
  - 全件スキップ（`bookmarkedWordIds` 空）: `toast.info("ブックマークできる単語がありませんでした")`（成功 toast は出さない）
- 失敗（`ok: false`）時: `toast.error(result.message)` ＋対象全件ロールバック。エラー種別で挙動は分けない。専用リトライ導線は設けず再押下で対応。多重押下は実行中フラグ（`QuizFlow` 側 `useTransition` の `isPending`）による disabled で防止（フラグが `QuizFlow` 側にあるためボタン再マウントでも維持）（[03-ui.md](../../design/quiz-result-bulk-bookmark/03-ui.md) 決定 6）
- 実行中も各行の個別トグルは既存どおり操作可能のまま（disabled にしない）。一括と個別の操作が重なった場合の表示競合は既知・許容（行トグルの再操作で正せる）（[03-ui.md](../../design/quiz-result-bulk-bookmark/03-ui.md) 決定 6）

### ファイル配置・テスト

- 対象算出は純関数 `computeBulkBookmarkTargetIds(rows, submitState): string[]` として `src/app/quiz/_components/bulk-bookmark-targets.ts`（result-list 隣接・新規）に切り出す。関数内で誤答絞り込み（`result !== "CORRECT"`）と削除済み除外（`skippedWordIds` / `remaining`）を行う。引数型 `ResultRow` / `SubmitState` は `result-list.tsx` の定義を `import type` で参照（型のみなので実行時循環なし。型の移動はしない）（[04-architecture.md](../../design/quiz-result-bulk-bookmark/04-architecture.md) 決定 3）
- ボタン描画は `result-list.tsx` に直接追加し、新規コンポーネントファイルは作らない（[04-architecture.md](../../design/quiz-result-bulk-bookmark/04-architecture.md) 決定 3）
- UI コンポーネントのレンダリングテストは書かない。結合の動作確認は e2e-verify スキルの手順で行い、本チケットの完了条件とする（[04-architecture.md](../../design/quiz-result-bulk-bookmark/04-architecture.md) 決定 4）

## 実装内容

### 作成: `src/app/quiz/_components/bulk-bookmark-targets.ts`

`computeBulkBookmarkTargetIds(rows, submitState): string[]` を前提のとおり実装。既存コードの参照名: `result-list.tsx` の `SubmitState` は `success`（`skippedWordIds: string[]` 付き）／`drill-success`（`remaining: { wordId: string; remaining: number }[]` 付き）／`sending`／`error` の判別 union。削除済み判定は `result-list.tsx` の既存計算（`skippedWordIds` の Set 化・`remainingByWordId` の Map 化）と同じロジックにする。

### 作成: `src/app/quiz/_components/bulk-bookmark-targets.unit.test.ts`

検証観点は完了条件を参照。

### 変更: `src/app/quiz/_components/result-list.tsx`

- 新規 props 2 つを追加: 実行用コールバック（対象 wordId 群を引数に受ける）・実行中フラグ
- チェックボックス行直下に一括ボタンを描画。表示条件（`wrongOnly` ON・誤答行あり・`bookmarkStates !== null`）・disabled 条件（送信未成功・対象 0 件・実行中）・ラベル（`computeBulkBookmarkTargetIds` の件数入り）を前提のとおり実装

### 変更: `src/app/quiz/_components/quiz-flow.tsx`

一括実行の本体を追加し、`ResultList` の使用箇所へ新規 props を渡す。スナップショット・Map 一括更新（1 回のコピー）・`useTransition`・`addBookmarks` 呼び出し・`skippedWordIds` の部分戻し・失敗時全件ロールバック・toast 3 分岐＋エラー toast を前提のとおり実装。既存の 1 件用 `handleBookmarkChange` は変更しない。

## 完了条件（Definition of Done）

- [ ] unit: `computeBulkBookmarkTargetIds` — 誤答絞り込み（`result !== "CORRECT"`）／TEST・DRILL_RETRY の `skippedWordIds` 除外／DRILL の `remaining` 除外／`sending`・`error` 時は削除済み判定なしで誤答全行
- [ ] `pnpm format`（整形）の上で `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る
- [ ] e2e-verify スキルの手順で結合確認: チェック ON で件数入りボタンが表示される／押下で対象行のトグルが即時 ON になり成功 toast（件数入り）が出る／再押下しても件数・状態が破綻しない（冪等）／チェック OFF でボタンが消える

## 実装メモ

実装は計画どおりで設計との差分なし。

- 追加した props は `onBulkBookmark: (wordIds: string[]) => void` / `bulkBookmarking: boolean`。
- `QuizFlow` に内部ヘルパ `applyBulkBookmarkStates(values: Map<string, boolean>)` を追加（先行反映・部分戻し・全件ロールバックで共用し、いずれも Map コピー 1 回で済ませる）。既存の `handleBookmarkChange` は未変更。
- 一括ボタンの表示条件は `wrongOnly && visibleRows.length > 0 && bookmarkStates !== null`、disabled は `!submitSucceeded || bulkTargetIds.length === 0 || bulkBookmarking`（`submitSucceeded` = `success` または `drill-success`）。
- E2E 結合確認は e2e-verify スキルの手順で実施し 4 観点すべて PASS（一回きりの検証スクリプトは実行後に削除、コミットに含まない）。headless 実行のため**画面の目視確認は未実施**。
- **チケット 03 への申し送り**: 撮影対象のボタンは「間違えた問題だけ表示」チェックボックス行の直下・行リストの上、`variant="outline" size="sm"` の内容幅・左寄せ（`self-start`）、ラベルは `N語をまとめてブックマーク`（`BookmarkIcon` 付き）。**履歴送信の成功前は disabled** なので、撮影は送信完了後（「結果を送信中…」が消えた後）に行う。
