
#### assistant
I'll start by reading the hub and topic 03 file for word-bookmark.
- TOOL Bash {"command":"ls -la /Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/docs/design/word-bookmark/","description":"List word-bookmark design files"}

#### assistant
I'm in session continuation mode. Let me read the hub and topic 03.
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/docs/design/word-bookmark/README.md"}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/docs/design/word-bookmark/03-ui.md"}

#### assistant
The user wants to overturn a confirmed decision (the `/bookmarks` dedicated page), which touches 01. Since this reversal propagates, let me read the affected files.
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/docs/design/word-bookmark/01-requirements.md"}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/docs/design/word-bookmark/02-data-model.md"}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/docs/design/word-bookmark/04-architecture.md"}

#### assistant
Now I have full context. Let me explore the existing word list page to ground the UI decisions (filter integration + star icon placement) in actual code.
- TOOL Agent {"subagent_type":"Explore","description":"Explore word list & detail UI","prompt":"deja-word プロジェクト（Next.js App Router）の単語一覧ページと単語詳細ページの UI 実装を調査してほしい。目的は「ブックマーク済みのみ表示するフィルタ」を単語一覧に追加し、各行と単語詳細に星アイコンのトグ

#### assistant
While the exploration runs, let me note the plan. The reversal and the two 03 answers are authorized. I'll wait for the exploration to ground the filter presentation recommendation, then write everything up.

#### assistant
I'll investigate the deja-word project structure for the word list and detail pages.
- TOOL Bash {"command":"git log --oneline -3 && echo \"---\" && cat docs/design/word-bookmark/../../reference/naming-book.md 2>/dev/null | head -50","description":"Check git and naming book"}
- TOOL Glob {"pattern":"src/app/**/words/**/*.tsx"}
- TOOL Glob {"pattern":"src/app/**/word*/**/*.tsx"}
- TOOL Bash {"command":"ls /Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app 2>/dev/null; echo \"---package---\"; cat /Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-00281
- TOOL Grep {"pattern":"bookmark|ブックマーク","path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/docs/reference/naming-book.md","output_mode":"content","-i":true}

#### assistant
lucide-react is present. Let me read the key files.

#### assistant
Let me wait for the exploration to complete before drafting the UI decisions.
- TOOL ToolSearch {"query":"select:Monitor","max_results":1}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app/words/page.tsx"}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app/words/_components/word-list-toolbar.tsx"}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app/words/_components/search-input.tsx"}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app/words/_components/occurrence-filter-toolbar.tsx"}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app/words/_components/view-mode-toggle.tsx"}

#### assistant
I've launched the exploration of the existing word list/detail UI to ground the filter and star-icon placement. I'll continue once it reports back.

#### assistant
Now let me look at the row-audio-button (the toggle pattern), the detail page, and its action components.
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/components/row-audio-button.tsx"}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app/words/[id]/page.tsx"}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app/words/_lib/search-params.ts"}

#### assistant
Let me look at the AudioPlayButton (the toggle-ish action pattern), the DeleteWordButton (client action button in detail header), and the WordListItem type and toolbar-url helper.
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/components/audio-play-button.tsx"}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app/words/[id]/_components/delete-word-button.tsx"}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app/words/_components/toolbar-url.ts"}

#### assistant
Let me check the WordListItem type definition and the WordDetailView to understand data shape and detail action placement.
- TOOL Grep {"pattern":"export type WordListItem|listWordsForUser|export type WordListSort|export type WordMatchMode","path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/lib/words-lis
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/components/word-detail-view.tsx"}

#### assistant
Let me quickly confirm there's no existing bookmark/favorite/star concept, and check the actions file structure for the detail route.
- TOOL Grep {"pattern":"bookmark|favorite|お気に入り|ブックマーク|StarIcon|isBookmarked","path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src","output_mode":"files_with_matches"}
- TOOL Bash {"command":"ls /Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app/words/[id]/ ; echo \"---star in lucide---\"; ls /Users/shusuke/rep/github.com/ganzinn/deja-word-eval-2026070
- TOOL Bash {"command":"ls \"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app/words/[id]/\"; echo \"---lucide star---\"; ls \"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260
- TOOL Bash {"command":"find \"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/node_modules/lucide-react/dist\" -iname \"*star*\" 2>/dev/null | head; echo \"---actions.ts head---\"; head -30 
- TOOL Bash {"command":"grep -ri \"star\" \"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/node_modules/lucide-react/dist/lucide-react.d.ts\" 2>/dev/null | grep -i \"declare\\|Star\" | head;

#### assistant
node_modules for lucide-react isn't installed locally, but lucide-react is a declared dependency (v1.11.0) and used throughout. Star/StarIcon are standard lucide exports. I have enough to report.

---

## 調査結果

既存の bookmark / favorite / star 概念はコードベースに存在しません（grep で該当ゼロ）。以下、設計に必要な既存構造をまとめます。

### 1. 単語一覧ページのルートと各行

- ルート: `/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app/words/page.tsx`（Server Component）
- 一覧は「単語単位」(`WordView`) と「掲載箇所単位」(`OccurrenceView`) の2ビューを持つ。ビュー切替は `?view=` パラメータ。
- 各行は同ファイル内のローカル関数 `WordRow`（page.tsx:272-320）。行全体が `<Link href={/words/${id}}>` になっている。表示列:
  - 掲載番号バッジ（掲載箇所ビューのみ、`No.N`）
  - 見出し語 `item.headword`
  - `MY` バッジ（`isSystem` が false のとき）
  - 発音再生ボタン `RowAudioButton`（右寄せ、`ml-auto`）
  - 品詞ショートラベルのバッジ + 意味テキスト（先頭を赤字、以降 `;` 連結、`line-clamp-2`）
- 行データ型 `WordListItem`（`/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/lib/words-list.ts:11-19`）: `id, headword, ownerId, isSystem, partOfSpeech, meaningTexts[], pronunciationAudioUrl`。**bookmark フラグはここに無いので追加が必要。**
- 一覧のデータ取得は同 `words-list.ts` の `listWordsForUser`（:116）と `listWordsByOccurrence`。`scopedOwnerIds(userId)` でテナント分離した Prisma クエリ。星フィルタを SQL に効かせるならこの where 条件に追加するのが自然。

### 2. 既存の絞り込み / フィルタ / 検索 UI

すべて **URL query param 方式**（client state は入力欄の debounce 用ローカルのみ）。状態は Server Component が `searchParams` から読み、client のツールバーが `router.replace` で URL を書き換える。

- 単語ビュー: `/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app/words/_components/word-list-toolbar.tsx`
  - 検索キーワード `q` + 一致方法 `match`（prefix/contains/suffix）+ 並び順 `sort`（recent/headword）。
- 掲載箇所ビュー: `.../src/app/words/_components/occurrence-filter-toolbar.tsx`（掲載箇所 `occ`、範囲 `from`/`to`、`order`、`q`、`match`）。
- 検索入力の共通プレゼンテーショナル部品: `.../src/app/words/_components/search-input.tsx`
- ビュー切替: `.../src/app/words/_components/view-mode-toggle.tsx`
- URL 同期ヘルパ: `.../src/app/words/_components/toolbar-url.ts`（`useDebouncedCommit` と、デフォルト値を URL に載せない `setParam`）
- param のパース / URL ビルダ（一覧・詳細で共有）: `.../src/app/words/_lib/search-params.ts`（`parseMatch`, `parseOrder`, `parseRangeNumber`, `buildWordsHref`, `buildWordDetailHref`）

**「ブックマークのみ表示」フィルタは、この URL param パターンに `bookmarked=1` のような param を1つ足すのが既存流儀**。追加箇所は: `page.tsx` の `RawParams` とパース、`word-list-toolbar.tsx` の `buildHref`/トグル UI（`ToggleGroup` か新規トグル）、`buildWordsHref`（デフォルト値省略ルール）、`listWordsForUser` の where。ビュー切替時に param を引き継ぐ設計なら `view-mode-toggle.tsx:23-31`（現状 `q` と `match` のみ継承）にも追加が要る。

### 3. 単語詳細ページのルートとアクション配置

- ルート: `/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app/words/[id]/page.tsx`（Server Component）
- ページ本体の描画は `/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/components/word-detail-view.tsx`（`WordDetailView`）。見出し語 `<h2>` の右に `MY` バッジ（:26-33）。星トグルを見出し行に置くならこの箇所が候補。
- **アクション類は `ScreenHeader` の `actions` プロップに集約**（page.tsx:93-114）: 編集 `<Link>`（`PencilIcon`, `ghost/icon-sm`）と削除ボタン `DeleteWordButton`。星トグルをヘッダーに置く選択肢もここ。
- 詳細画面用 Server Action は `/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app/words/[id]/actions.ts`（`"use server"`、Result 型 `{ ok: true } | { ok: false, error, message }` を返す規約）。ブックマーク切替の Server Action を足すならこのファイルに追加。
- 削除ボタン実装 `/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/app/words/[id]/_components/delete-word-button.tsx` は、client component + `useTransition` + Server Action await + `sonner` toast の定番パターン。星トグルの client 実装の雛形になる。

### 4. 行内・詳細内のオン/オフ操作アイコンの既存パターン（重要な参照）

- **発音トグル**が最も近い先行例:
  - 行内ラッパ: `/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/components/row-audio-button.tsx` — 行が `<Link>` になっているため、`onClick` で `preventDefault + stopPropagation`、`onKeyDown` で `stopPropagation` して行遷移を抑止する。**星トグルを行内に置く場合、この伝播抑止ラッパのパターンを踏襲する必要がある**（行全体が Link のため必須）。
  - 実体: `/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/src/components/audio-play-button.tsx` — `Button` に `aria-pressed={playing}` を付け、状態でアイコン（`PlayIcon`/`PauseIcon`）を差し替えるトグル。星トグルの `aria-pressed` + アイコン差し替え（`StarIcon` 塗り/枠）の参考になる。
- 詳細内の発音ボタンは `word-detail-view.tsx` で `AudioPlayButton` を直接使用（:130, :202、ラッパ不要＝行 Link が無いため）。

### 5. アイコンライブラリ

- **lucide-react v1.11.0** を dependency として全面採用（`PlusIcon, PencilIcon, Trash2Icon, ChevronLeft/RightIcon, SearchIcon, XIcon, PlayIcon, PauseIcon, LinkIcon` 等）。
- 星アイコンは lucide 標準の `Star` / `StarIcon`（および `StarOff`）が利用可能。塗り分けは `fill` クラス、または枠のみ `StarIcon` / 塗り `StarIcon className="fill-current"` の切替でトグル表現できる（発音の Play/Pause 差し替えと同じ流儀）。

### 補足（設計上の制約）

`src/app/CLAUDE.md` より: Server Action は throw せず Result 型を返す規約。テナント分離は `scopedOwnerIds` / row-policy がサーバ側で強制。ブックマークは owner 個別の状態になるため、Prisma スキーマ（未確認）へのカラム/テーブル追加と `scopedOwnerIds` を踏まえた per-user スコープが必要になる点に注意。

#### assistant
The exploration gives me everything I need. The existing word list already uses URL query-param filters (`q`, `match`, `sort`), rows are `<Link>` wrappers requiring propagation suppression for in-row controls (like the audio button), and lucide `StarIcon` with an `aria-pressed`/fill toggle matches the existing audio-toggle pattern. This makes the filter-integration reversal and the star-icon decisions land cleanly on existing conventions.

Let me apply the reversal and record the 03 decisions. Starting with 01 (the overturned decision):
- TOOL Edit {"replace_all":false,"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/docs/design/word-bookmark/01-requirements.md","old_string":"# 01. 要求\n\n状態: **確定**（2026-07-02）","
- TOOL Edit {"replace_all":false,"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/docs/design/word-bookmark/01-requirements.md","old_string":"### 決定 2: ブックマークした単語の一覧は専用ページ `/bookm

#### assistant
Now the 03 topic file — 前提, checklist, and decisions:
- TOOL Edit {"replace_all":false,"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/docs/design/word-bookmark/03-ui.md","old_string":"# 03. UI\n\n状態: **議論中**\n\n## 前提（確定事項の再掲）\n\nこの

#### assistant
Now 04's 前提 references the overturned `/bookmarks` — update it:
- TOOL Edit {"replace_all":false,"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/docs/design/word-bookmark/04-architecture.md","old_string":"- ブックマークした単語の一覧は専用ページ `/bookmarks` で提

#### assistant
Now the hub — summary, state table, recommended next topic:
- TOOL Edit {"replace_all":false,"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/docs/design/word-bookmark/README.md","old_string":"- **ブックマークは単語単位のオン/オフ**。フォルダ分け等の階層は持たない。→ [01]
- TOOL Edit {"replace_all":false,"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/docs/design/word-bookmark/README.md","old_string":"| [01-requirements.md](01-requirements.md) | 確

#### assistant
Now the mandatory consistency review. Let me verify no stale `/bookmarks` reference remains and the decisions are coherent across files:
- TOOL Grep {"pattern":"/bookmarks|専用ページ","path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-002810/docs/design/word-bookmark","output_mode":"content","-n":true}

#### assistant
All remaining hits are either the new decision text, the revision note, or explicitly-marked-as-overturned 却下案 — no stale confirmation survives. Consistency review passes:

- 01 決定 2 rewritten as overturned with revision marker; 03/04 前提 and hub summary all restate the filter-integration decision identically.
- 03 decisions layer cleanly on 01 (requirement) without duplication; 02 (data model, only depends on 単位) needed no change.
- Per-user authz correctly deferred to 04 via an explicit 申し送り note rather than silently assumed.

Now committing (authorized without confirmation):
- TOOL Bash {"command":"git add docs/design/word-bookmark && git commit -q -F - <<'EOF'\nword-bookmark 設計: 03 UI を確定\n\n見返し動線を専用ページ `/bookmarks` から単語一覧ページの絞り込み\n（ブックマーク済みのみ表示フィルタ）へ統合。トグルは一覧各行と単語詳細\nの星アイコン、表示項目は通常

#### assistant
03（UI）を確定し、コミットしました。

## 今回の成果

**確定した決定（03-ui.md）:**
1. **トグル操作** — 単語ビューの一覧各行と単語詳細に星アイコン（lucide `StarIcon`）。塗り/枠で状態表現。行は `<Link>` なので発音ボタン（`row-audio-button.tsx`）同様に伝播抑止、`aria-pressed`＋アイコン差し替えは `audio-play-button.tsx` を踏襲。掲載箇所ビューは対象外。
2. **見返し** — 単語一覧に「ブックマーク済みのみ表示」トグルを追加（既存フィルタと同じ URL query param 方式）。表示項目は通常の一覧と同じ、専用表示は作らない。
3. **詳細のアイコン配置** — 見出し語（`<h2>`）の `MY` バッジ横。編集・削除（`ScreenHeader` actions）とは分離。

**覆した決定:** 01 決定 2「専用ページ `/bookmarks`」→「一覧の絞り込みに統合」。01 本体・ハブサマリ・04 前提すべてに反映済み。

**整合性レビュー:** 残存する `/bookmarks` 参照は新決定文・改訂注記・「覆した却下案」のみ。02 は影響なし。per-user 認可は 04 へ申し送り。

## 次セッション

**推奨トピック: 04（アーキテクチャ）** — `bookmarked` param の配線、`listWordsForUser` の where 条件・`WordListItem` への bookmark フラグ、付け外しの Server Action（Result 型）と `scopedOwnerIds` スコープ、テスト戦略。これで全トピック確定となり、ハブに「実装への引き継ぎ」を追記して設計シリーズを閉じる流れです。

この後 `/clear` して次セッションで 04 に進むのがおすすめです。

---
result: subtype=success cost_usd=0.9668747499999999 turns=11 denials=1

---
result: subtype=success cost_usd=2.1441367500000004 turns=9 denials=0
