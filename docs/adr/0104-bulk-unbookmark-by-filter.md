# ADR-0104: ブックマーク一括解除は絞り込み条件のサーバ再評価で行う（wordIds 列挙不採用）

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-08-22

## 背景

単語一覧の「ブックマークのみ」絞り込み中に、絞り込み結果のブックマークをまとめて解除する導線を追加する。対象は「絞り込み結果の全件（全ページ）」で、検索語・掲載箇所・掲載番号範囲で絞り込んでいればその範囲だけを対象にする（設計判断としてユーザーが選択済み。表示中ページ限定・チェックボックス選択式は不採用）。

既存の一括登録 `addBookmarks`（[ADR-0094](0094-bulk-bookmark-skip-and-colocation.md)）は、テスト結果画面が保持する表示中の wordIds を明示列挙して渡す方式である。同じ方式を一括解除に流用するか、別の入力契約にするかの判断を要した。前提が異なる: 一括登録の対象「表示中の誤答単語」はクライアントが全件を配列で保持しているが、単語一覧は 20 件ずつのページングでクライアントは 1 ページ分しか持っていない。

## 決定内容

1. **入力は wordIds ではなく絞り込み条件（`kind` 判別付き union: `word` / `occurrence` ビュー）とし、サーバが一覧と同じ where builder で条件を再評価して `deleteMany` する**。`words-list.ts` の `buildWordListWhere` / `buildWordsByOccurrenceWhere` を export し、UseCase `removeBookmarksForUser`（`bookmark-settings.ts`）が再利用する。builder の共有により「一覧に表示される集合」と「解除される集合」の定義が乖離しない（隣接取得が同じ builder を共有しているのと同じ理由づけ）。
2. **`forbidden` 変種を持たず、0 件解除も正常系とする**。削除は本人のブックマーク行のみ（`userId` 固定の `deleteMany`）で、他ユーザーの行には到達できない。範囲外の `occurrenceId` を渡されても builder の `ownerId` 条件で空集合＝0 件解除になるだけで、`getBookmarkedWordIdsForUser` が scoped 検証を持たないのと同じ理由づけ。エラーは `unauthorized` / `invalid` / `unknown` の 3 種のみ（ADR-0094 決定 1 と整合）。
3. **反映は楽観的更新ではなく、確認ダイアログ → 実行 → 成功後に `router.refresh()`**。行単位トグル `toggleBookmark` が refresh せず楽観的更新（誤タップの付け直し猶予）なのとの非対称は意図的で、確認ダイアログを挟む全件操作では「絞り込み ON の一覧から解除済みの行が消える」のが期待挙動のため。ボタン・確認文言の件数はサーバ描画時点の total で、実行時の `deleteMany` 実件数と食い違いうるため、成功トーストは実件数を出す。

## 採らなかった代替案

- **表示中ページの wordIds を `addBookmarks` と同型で渡す** — ページを跨げず、全件解除にはページ数ぶんの操作の繰り返しが要る。ユーザーが選択した「絞り込み結果の全件」を満たさない。
- **全ページの wordIds をクライアントで収集して渡す** — 一覧はページ単位でしか取得しておらず、収集専用の追加取得が要る。取得と実行の間の鮮度問題（後から付いたブックマークの取り漏れ）と `BOOKMARK_WORD_IDS_MAX_COUNT` 上限も引きずる。条件で表せる集合を id 列挙に展開する意味がない。
- **絞り込みを無視した「全ブックマーク解除」専用入口** — 画面の件数表示・絞り込みと実挙動が食い違う。絞り込み無しなら条件式が自然に全件へ退化するので、専用入口を分ける必要がない。
- **解除条件の where を `bookmark-settings.ts` 内に再実装する** — 一覧の絞り込み仕様（照合規則・範囲・scoped）が変わるたびに 2 か所の同期が要り、乖離すると「表示されていない単語が解除される／表示されている単語が残る」事故になる。

## 影響

- `words-list.ts` の where builder が `bookmark-settings.ts` から共有される。一覧の絞り込み条件を変えると一括解除の対象も一緒に変わる（意図した連動。両ファイルのコメントに明記）。
- UseCase の置き場は ADR-0094 決定 3 に従い `bookmark-settings.ts` へ相乗り、エラー → Result 変換も action 内（[ADR-0063](0063-error-map-boundary.md) の適用例）。
- 解除は冪等（条件に一致する行を消すだけ）で、再送・連打が安全。
- 入力スキーマ `removeBookmarksByFilterInputSchema`（`src/lib/schema/bookmark.ts`）の `q` は正規化せず受け、正規化は builder 側の責務（一覧の URL パラメータ処理と同じ流れ）。

## 根拠（コード・コミット・文書参照）

- `src/lib/bookmark-settings.ts`（`removeBookmarksForUser`）、`src/lib/words-list.ts`（builder export）、`src/app/words/actions.ts`（`removeBookmarksByFilter`）、`src/app/words/_components/remove-bookmarks-button.tsx`
- [ADR-0094](0094-bulk-bookmark-skip-and-colocation.md)（一括登録の skip・置き場）、[ADR-0089](0089-word-detail-nav-list-context.md)（一覧と where 共有の前例）、[ADR-0018](0018-scoped-owner-ids-read-scope.md)（scopedOwnerIds）、[ADR-0069](0069-bookmark-per-user-side-table-start-time-eval.md)（per-user side table）
