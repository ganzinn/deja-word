# ADR-0094: ブックマーク一括登録は検証落ちを skip、変換は action 内・UseCase は bookmark-settings.ts へ相乗り

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-08-08

## 背景

単語テストの結果画面で「間違えた問題だけ表示」が ON のとき、表示中の単語をまとめてブックマークできるようにする。1 件ずつの `toggleBookmark` を対象数ぶん呼ぶのではなく、サーバ側に一括登録の入口（UseCase `addBookmarksForUser` / Server Action `addBookmarks`）を新設する。

一括にすると 1 件版では起きない選択が生じる。結果画面が保持する wordId は quiz 開始時点のスナップショットで、その後に単語が削除されたり（共有マスタから外れる等で）scoped 範囲外になったりしうる。1 件版 `setBookmarkForUser` はこの場合 `BookmarkWordNotInScopeError` を throw し、action は `forbidden` を返す。同じ方針を一括版に持ち込むと、1 件の巻き添えで数十件の登録がすべて失敗する。

あわせて、置き場も既存規約に対する判断を要した。UseCase は `src/lib/*.ts` の flat ファイル・動詞プレフィクス命名（[ADR-0014](0014-three-layer-architecture.md)）が原則で、素直に従えば `bookmarks-add.ts` を新設することになる。エラー → Result 変換も、[ADR-0016](0016-server-action-result-type.md) は error-map への集約を定めている。

## 決定内容

1. **検証で弾かれた wordId は理由を区別せずまとめて skip し、残りを登録する**。削除済みか scoped 範囲外かは区別せず `skippedWordIds` に入れる。**全件が弾かれてもエラーにしない**（`ok: true` ＋ `bookmarkedWordIds: []`）。したがって `addBookmarks` は `forbidden` 変種を持たず、エラーは `unauthorized` / `invalid` / `unknown` の 3 種のみ。1 件版 `setBookmarkForUser` が範囲外を拒否するのとの**非対称は意図的**である。1 件版はユーザーが今見ている 1 単語への明示操作なので、失敗を黙らせず伝えるのが正しい。一括版の入力はスナップショット由来で、古い id が混ざるのは異常ではなく想定内であり、部分的な古さを理由に操作全体を失敗させる価値がない。
2. **エラー → Result 変換は action ファイル内の try/catch 分岐に置き、error-map モジュールを導入しない**。これは [ADR-0063](0063-error-map-boundary.md) の線引き（error-map に集約するのは複数 action から共有されるドメインエラーのみ）の適用例である。`addBookmarks` が変換するのは自分専用の unknown フォールバックだけで、共有されるカスタム Error を持たない（決定 1 により、UseCase は「対象が無い」を例外にしない）。同居する既存 2 action（`toggleBookmark` / `getBookmarkStates`）も同じ形をしており、揃う。UseCase 内の handler / policy 分割も、処理が検証 1 クエリ + 登録 1 クエリで完結するため行わない。
3. **UseCase は既存 `src/lib/bookmark-settings.ts` に追加し、新規 flat ファイルを作らない**。これは [ADR-0014](0014-three-layer-architecture.md) の動詞プレフィクス命名（`bookmarks-add.ts`）からの**明示的な逸脱**である。`bookmark-settings.ts` は per-user 設定という 1 つの関心でまとまった小さいファイルで、`scopedOwnerIds` による検証パターン・「書き込み先は本人行のみ」という不変条件を既存関数と共有する。同じ不変条件を持つ関数を別ファイルに分けると、非対称（決定 1）が離れた 2 ファイルに散り、どちらが正なのか読み手に伝わらない。同様の per-user 設定モジュール（`occurrence-preset-settings.ts` 等）も設定単位でまとまっている。

## 採らなかった代替案

- **一括版でも範囲外を拒否する（1 件版と同じ挙動に揃える）** — 古い id 1 件で操作全体が失敗する。結果画面のスナップショットは古くなりうるという前提と噛み合わない。
- **skip の理由（削除済み / 範囲外）を区別して返す** — UI は「◯件をブックマークしました」しか出さないため使い道がない。区別するには検証クエリを scoped 有無で 2 本に増やす必要もある。将来 UI が理由別の表示を求めたら、そのとき戻り値を拡張する。
- **検証を省いて `createMany` だけ実行する** — 他ユーザー所有の単語 id を投げれば本人のブックマーク行として登録できてしまう（存在を推測できる oracle にもなる）。テナント分離（[ADR-0018](0018-scoped-owner-ids-read-scope.md)）を崩すので採らない。
- **UseCase を `bookmarks-add.ts` として新設する（ADR-0014 に忠実）** — 関数 1 つのファイルが増え、同じ不変条件を持つ 3 関数が 2 ファイルに割れる。決定 3 の理由そのもの。
- **`src/lib/bookmark/error-map.ts` を新設する** — マップ対象のカスタム Error が存在せず、間接参照だけが増える（ADR-0063 が「単一 action 専用の変換は action 内でよい」とした事例）。

## 影響

- `addBookmarks` の呼び出し側（UI）は、成功時に `bookmarkedWordIds` を「操作後に ON 状態の wordId 群」として扱えばよく、`skippedWordIds` が空でないケースをエラーとして扱う必要がない。
- 一括登録は冪等（`createMany` + `skipDuplicates`、検証と登録は同一トランザクション）なので、再送・連打が安全。失敗時は部分適用されない。
- 一括版の入力上限は既存 `BOOKMARK_WORD_IDS_MAX_COUNT`（`src/lib/schema/bookmark.ts`）を流用する。同ファイル内で一括取得側だけ `min` を持たないのは、0 件取得が無害な正常系であるため（意図的な非対称）。
- 今後 bookmark に関数を追加するときの置き場は `bookmark-settings.ts` が既定になる。ファイルが per-user 設定以外の関心を抱え始めたら、そのとき分割を再検討する。

## 根拠（コード・コミット・文書参照）

- `src/lib/bookmark-settings.ts`（`setBookmarkForUser` / `addBookmarksForUser`）、`src/app/words/actions.ts`、`src/lib/schema/bookmark.ts`
- [ADR-0014](0014-three-layer-architecture.md)（UseCase の flat ファイル・動詞プレフィクス命名）、[ADR-0016](0016-server-action-result-type.md)（Result 型と error-map 境界）、[ADR-0063](0063-error-map-boundary.md)（変換集約の線引き）
- [ADR-0018](0018-scoped-owner-ids-read-scope.md)（scopedOwnerIds による読み取り認可）、[ADR-0069](0069-bookmark-per-user-side-table-start-time-eval.md)（ブックマークの per-user side table）
