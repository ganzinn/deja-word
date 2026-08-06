# 03. quiz-dialog-order-nav

状態: **未着手**　PR: （未作成）

## 目的

テスト結果一覧から開く単語詳細ダイアログの前後ナビを、掲載番号昇順（サーバ隣接取得）から「結果一覧に並んでいる順（= 出題順、絞り込み中はその表示順）」のクライアント配列ナビへ変更する。全件ブックマークモードでもナビが出るようになる。隣接取得のサーバ経路は廃止する。ユーザー向けドキュメント・ADR の更新も本 PR に含む。

スコープ外: 詳細ページ側のナビ（→ 01 / 02）。関連語スタック先のナビ非表示の解除（設計スコープ外）。ダイアログのナビ行 UI の見た目変更（直書きマークアップを維持）。`quiz-flow.tsx` / `result-list.tsx` の `.tsx` はテスト対象外の方針を維持し、順序スナップショット構築（`visibleRows.map(...)` の自明な導出）の純関数抽出・専用テストは行わない（[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 4）。

## 依存チケット

なし（並行着手可。`src/lib/words-list.ts` の競合注意のみ参照）

## 前提（設計決定の再掲）

実装に必要な決定を具体値で再掲する。

- ナビ順序は「ダイアログを開いた時点の表示行」（`wrongOnly` フィルタ適用後の `visibleRows`）の wordId 配列のスナップショット。隣接判定はすべてクライアント側の配列 index で行う。ダイアログ表示中はフィルタを操作できない（モーダル）ため陳腐化しない。閉じて開き直せば再スナップショット（[03-quiz-result-dialog-nav.md](../../design/word-view-nav/03-quiz-result-dialog-nav.md) 決定 1）
- `ResultList` の `onOpenDialog(wordId)` を `onOpenDialog(wordId, navOrder: string[])` に拡張し、`visibleRows.map((r) => r.wordId)` を渡す。`quiz-flow.tsx` は `dialogNavOrder: string[] | null` state に保持し、`dialogStack` が空になったとき（閉じるボタン・ブラウザバックによる pop のいずれでも）null に戻す。出題中の詳細ボタン経由は順序なし（null のまま）（[03-quiz-result-dialog-nav.md](../../design/word-view-nav/03-quiz-result-dialog-nav.md) 決定 2）
- `WordDetailDialog` へは、スタック深さ 1 のときのみ `navOrder` を渡す（深さ 2 以上 = 関連語スタック先は null → ナビ非表示）。ナビの表示条件は「`navOrder` が非 null」のみとし、`occurrenceId` に依存しない → 全件ブックマークモード（`occurrenceId === null`）でもナビが出る（[03-quiz-result-dialog-nav.md](../../design/word-view-nav/03-quiz-result-dialog-nav.md) 決定 2）
- 現在位置は `navOrder.indexOf(表示中 wordId)` で解決（1 語 1 問で wordId は一覧内一意）。prev / next は前後の要素、端（index 0 / 末尾）は disabled。前後移動は従来どおり `setDialogStack([id])` の置換（深さ 1 維持・履歴エントリ数も不変）。応答待ちのナビ状態（初回はナビ行非描画・移動中は両ボタン disabled）は不要になり、ナビ行は開いた瞬間から確定表示する（[03-quiz-result-dialog-nav.md](../../design/word-view-nav/03-quiz-result-dialog-nav.md) 決定 2）
- `getAdjacentWordsForDialog` action・`GetAdjacentWordsForDialogResult`・`adjacentWordsInputSchema`（`AdjacentWordsInput`）・`findAdjacentWordsByOccurrenceNumber` を削除する。ダイアログ側の `navResponse` / `navCache` / `resolveNavView` / `resolveCurrentNav` は navOrder ベースの同期導出に置き換える。`findAdjacentWordsByOccurrence`（詳細ページ用）は別物であり存続する（[03-quiz-result-dialog-nav.md](../../design/word-view-nav/03-quiz-result-dialog-nav.md) 決定 3）
- 見出し語右の `#N` は、表示中の詳細データが持つ掲載箇所一覧から `dialogOccurrenceId` に一致する行の `occurrenceNumber` を引いて表示する。`dialogOccurrenceId` が null（全件ブックマークモード）・一致する掲載が無い・番号なしの場合は `#N` を出さない（ナビは出る）（[03-quiz-result-dialog-nav.md](../../design/word-view-nav/03-quiz-result-dialog-nav.md) 決定 4）
- 削除済み単語の行はナビからスキップしない。到達時は既存のエラービュー（「対象の単語が見つかりません。」）を表示し、前後ナビはそのまま操作できる（[03-quiz-result-dialog-nav.md](../../design/word-view-nav/03-quiz-result-dialog-nav.md) 決定 5）
- 先読みは `navOrder` 上の前後 1 件の未キャッシュ詳細（`kind: "detail"`）のみ。隣接先読み（`kind: "adjacent"`）は廃止。発火条件は「表示中単語の詳細が settle した後」。`occurrenceId` への依存を外し、`navOrder` がある間は先読みする（全件ブックマークモードでも有効化）。エラー応答をキャッシュしない既存方針は維持（[03-quiz-result-dialog-nav.md](../../design/word-view-nav/03-quiz-result-dialog-nav.md) 決定 6）
- ダイアログのナビ行は `AdjacentWordNav` と共通化せず、現状の直書きマークアップ（同一クラス構成の `<nav>` ＋ `buttonVariants` 相当 = `Button` コンポーネント）のまま navOrder ベースへ書き換える（[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 2）
- `docs/features/word-quiz.md` の該当記述（「掲載箇所から出題したテストでは…掲載番号順に隣の単語」）を改訂: 前後移動は結果一覧の並び順（「間違えた問題だけ表示」中はその表示順）で、全件ブックマークモードのテストでも使えること、`#N` は掲載箇所から出題した場合のみ付くことを書く。スクリーンショットの再撮影・追加はしない（[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 5）
- ADR ②「テスト結果ダイアログの前後ナビを結果一覧順のクライアント配列に変更する」を起票し（03 の決定を転記。番号は起票時点の最新 + 1）、ADR-0086 決定 3 の隣接先読み部分を置き換えることを明記する。ADR-0086 本文には置き換え先 ADR への改訂注記を 1 行追記する（[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 3・6）

## 実装内容

### 変更: `src/app/quiz/_components/result-list.tsx`

- props `onOpenDialog: (wordId: string) => void` を `(wordId: string, navOrder: string[]) => void` に拡張。行クリック（クリック・キーボード両ハンドラ）で `onOpenDialog(row.wordId, visibleRows.map((r) => r.wordId))` を渡す

### 変更: `src/app/quiz/_components/quiz-flow.tsx`

- `dialogNavOrder: string[] | null` state を追加。結果一覧の `onOpenDialog` でセット、`dialogStack` が空になるすべての経路（閉じるボタン・popstate の pop・スタート画面へ戻る `resetToStart` 等）で null に戻す。出題中の詳細ボタン（`setDialogStack([id])` 直呼び）はセットしない
- `WordDetailDialog` へ `navOrder={dialogStack.length === 1 ? dialogNavOrder : null}` を渡す
- `occurrenceId` prop は `#N` 導出用に引き続き渡す（ナビ可否には使わない）。渡し方は現状の深さ 1 限定（`dialogStack.length === 1 ? dialogOccurrenceId : null`）を維持する — 関連語スタック先で `#N` を出さない既存挙動（ADR-0087）は変えない（ナビ順序と無関係な既存挙動の変更はスコープ外）

### 変更: `src/app/quiz/_components/word-detail-dialog-state.ts`

- `resolveNavView` / `resolveCurrentNav` を navOrder ベースの同期導出に置き換える。シグネチャの目安（純関数・unit テスト対象）:
  - `resolveDialogNav(navOrder: string[] | null, wordId: string | null): { visible: false } | { visible: true; prevWordId: string | null; nextWordId: string | null }` — navOrder が null・wordId が null・indexOf が -1 なら非表示
  - `#N` 導出: 表示中詳細（`WordDetail`）と `occurrenceId` から一致する掲載の `occurrenceNumber` を返す純関数（null 分岐は前提のとおり）
- `resolvePrefetchTargets` を書き直す: `navOrder` 非 null かつ表示中単語の詳細が settle 済みのとき、`navOrder` の前後 1 件のうち詳細未キャッシュのものを `{ kind: "detail"; wordId }` で返す（`adjacent` kind と `occurrenceId` 依存を削除）
- 置き換えで不要になる隣接応答系の型・ヘルパ（`NavResponse` / `NavCache` / `navCacheKey` / `NavView` / `LastNav` 等、隣接応答にしか使われていない export）も削除する（応答待ちナビ状態の廃止の帰結 — [03-quiz-result-dialog-nav.md](../../design/word-view-nav/03-quiz-result-dialog-nav.md) 決定 2・3）

### 変更: `src/app/quiz/_components/word-detail-dialog.tsx`

- props: `occurrenceId` に加えて `navOrder: string[] | null` を受ける。`navResponse` / `navCache` / `lastNav`（`switchTo` 内の `setLastNav` 含む）の各 state と、隣接取得・隣接先読みの発行コード・キャッシュリセット effect の `navCache` 参照・孤立する import（`AdjacentWordsResult` 等）を削除
- ファイル冒頭の JSDoc と props コメント（「掲載箇所全体を掲載番号順に前後移動」「`occurrenceId` が null / 未指定ならナビを表示しない」「詳細＋隣接を前後 1 件先読み」等）を新仕様に合わせて更新
- ナビ行（直書き `<nav>`）を `resolveDialogNav` の結果で描画（`goPrev` / `goNext` は prev/nextWordId から構成、`useSwipeNav` への配線は既存のまま）
- `#N` は詳細応答由来の導出に置き換え

### 変更: `src/app/quiz/actions.ts` / `src/lib/schema/quiz.ts`

- `getAdjacentWordsForDialog`・`GetAdjacentWordsForDialogResult` を削除。`adjacentWordsInputSchema`・`AdjacentWordsInput` を削除
- `src/lib/schema/quiz.unit.test.ts` の `describe("adjacentWordsInputSchema", …)` と対応 import を削除

### 変更: `src/lib/words-list.ts`

- `findAdjacentWordsByOccurrenceNumber` を削除（他に呼び出し箇所が無いことを確認済み。`AdjacentWordsResult` 等の共有型は `findAdjacentWordsByOccurrence` が使うため残す）

### 変更: `docs/features/word-quiz.md`

- 前提のとおり該当記述を改訂

### 作成: `docs/adr/00XX-quiz-dialog-list-order-nav.md`（番号は起票時点の最新 + 1、スラッグは目安）

- ADR ② を起票（[03-quiz-result-dialog-nav.md](../../design/word-view-nav/03-quiz-result-dialog-nav.md) の決定 1〜6 を転記、ADR-0086 決定 3 の隣接先読み部分の置き換えを明記）。`docs/adr/README.md` の一覧にも追記

### 変更: `docs/adr/0086-word-nav-transition-feedback-prefetch.md`

- 決定 3 の隣接先読み記述の箇所に、置き換え先 ADR ② への改訂注記を 1 行追記（本文の書き換えはしない）

## 完了条件（Definition of Done）

- [ ] unit（`word-detail-dialog-state.unit.test.ts`）: navOrder ベース導出（index 解決と端の disabled、navOrder null / wordId 集合外で非表示。導出が詳細取得の成否と独立であること = 引数に詳細応答を取らない）、`#N` 導出の各分岐（`occurrenceId` null・一致なし・番号なしで非表示）、`resolvePrefetchTargets`（詳細のみ・前後 1 件・表示中詳細 settle 後・未キャッシュのみ）。旧 `resolveCurrentNav` / `resolveNavView` のテストは削除（[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 4）
- [ ] unit（`src/lib/schema/quiz.unit.test.ts`）: `adjacentWordsInputSchema` の describe と import を削除済みであること
- [ ] integration（`words-list.integration.test.ts`）: `findAdjacentWordsByOccurrenceNumber` の describe を削除（[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 4）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` / `pnpm test:integration` が通る
- [ ] 手動確認（e2e-verify スキル、[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 4 の「結果ダイアログの表示行順ナビ」経路）: 結果一覧からダイアログを開き、前後ナビが一覧の並び順で移動する／「間違えた問題だけ表示」中は表示行だけを辿る／全件ブックマークモードのテストでもナビが出て `#N` は出ない／関連語をたどった先ではナビが出ない／掲載箇所出題では `#N` が出る／テスト後に削除された単語の行へ移動するとエラービュー（「対象の単語が見つかりません。」）のまま前後ナビを継続操作できる
- [ ] `docs/features/word-quiz.md`・ADR ②・ADR-0086 注記の更新が同 PR に含まれている

## 競合注意

- `src/lib/words-list.ts` / `words-list.integration.test.ts`: チケット 01 / 02 が同じファイルの別関数を変更する。並行着手可だが、マージが重なる場合は後の側が rebase で解消する
- `docs/adr/README.md`: チケット 02（ADR ①）も一覧表へ行を追記する。後からマージする側が rebase で番号・行順を揃える

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
