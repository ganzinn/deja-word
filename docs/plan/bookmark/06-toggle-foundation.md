# 06. toggle-foundation

状態: **実装中**　PR: （未作成）

## 目的

ブックマーク付け外しの server action（`toggleBookmark` / `getBookmarkStates`）と、4 導線で使い回す共有トグル部品（`BookmarkButton` / `RowBookmarkButton`）を新設する。本チケットでは画面へ設置しない（未参照モジュールの先行追加。設置は 07・08）。

スコープ外: 各画面への設置・フィルタ UI（07・08）、quiz 開始フォーム（09）。

## 依存チケット

- 02: `setBookmarkForUser` / `getBookmarkedWordIdsForUser` / `BookmarkWordNotInScopeError` / `getBookmarkStatesInputSchema` を使う

## 前提（設計決定の再掲）

- `src/app/words/actions.ts`（新規、`"use server"`）に `toggleBookmark(wordId: string, bookmarked: boolean): Promise<ToggleBookmarkResult>` を置く（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 2）:
  - Result 型: `{ ok: true } | { ok: false; error: "unauthorized" | "forbidden" | "unknown"; message: string }`（ADR-0016 の流儀）
  - `getCurrentSession()` で未ログイン → `unauthorized`。`BookmarkWordNotInScopeError` → `forbidden`、それ以外 → `console.error` ＋ `unknown`。前例 `togglePresetSetting`（src/app/settings/occurrences/actions.ts）と同じインライン instanceof 判定とし、共有 error-map は使わない
  - 引数がプリミティブ 2 つのみのため zod スキーマは作らない（togglePresetSetting と同じ）
  - **`revalidatePath` は呼ばない**（楽観的更新・router.refresh なしの方針に従う。一覧・詳細のサーバ供給値は次の遷移・リロードで最新が取得される）
- action は「トグル」ではなく**目標状態を受け取る冪等な set**（連打しても最後の意図に収束）（[04-ui.md](../../design/bookmark/04-ui.md) 決定 3）
- `getBookmarkStates(input: { wordIds: string[] }): Promise<GetBookmarkStatesResult>` も同ファイルに置く（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 3）:
  - Result: `{ ok: true; bookmarkedWordIds: string[] } | { ok: false; error: "unauthorized" | "invalid" | "unknown"; message: string }`
  - 入力は `getBookmarkStatesInputSchema`（wordIds 上限 3000）で検証し、超過・不正は `invalid`。セッション必須（未ログイン → `unauthorized`）。返すのは本人のブックマーク行のみ（`getBookmarkedWordIdsForUser`）で、wordIds の scoped 検証は不要
- `src/components/bookmark-button.tsx` に `BookmarkButton` を新設し、4 導線すべてで使い回す。横断共有なので src/components/ 配置（[04-ui.md](../../design/bookmark/04-ui.md) 決定 1）
- 行内用 `RowBookmarkButton` は `row-audio-button.tsx` と同じ方式の薄いラッパ: `<span className="contents">` で包み、onClick で `preventDefault()` ＋ `stopPropagation()`、onKeyDown では `stopPropagation()` のみ（ボタン自身の Enter/Space 発火を潰さないため preventDefault は付けない）（[04-ui.md](../../design/bookmark/04-ui.md) 決定 1）
- 反映は楽観的更新: タップで即座に反転表示し、失敗時のみ元に戻してエラー toast。成功時は toast を出さない。`router.refresh()` は呼ばない。`BookmarkButton` は action を直接 import する（[04-ui.md](../../design/bookmark/04-ui.md) 決定 3、[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 2）
- アイコンは lucide-react の `BookmarkIcon`（`Icon` サフィックス import の既存慣習）。ON は fill 塗りつぶし＋強調色、OFF はアウトライン。`aria-pressed={bookmarked}` ＋ `aria-label="ブックマーク"`（AudioPlayButton の aria-pressed 慣習に整合）（[04-ui.md](../../design/bookmark/04-ui.md) 決定 9）

## 実装内容

### 作成: `src/app/words/actions.ts`

前提のとおり `toggleBookmark` / `getBookmarkStates`（と Result 型 export）。

### 作成: `src/components/bookmark-button.tsx`

`BookmarkButton`（client component。props は wordId・初期 bookmarked・サイズ等の表示調整・状態変更通知用の `onBookmarkChange?: (bookmarked: boolean) => void` を想定 — 詳細な props 設計は既存の audio-play-button.tsx / row-audio-button.tsx に合わせて実装裁量）と `RowBookmarkButton`（contents ラッパ）。楽観的更新・巻き戻し・toast・aria は前提のとおり。

## 完了条件（Definition of Done）

- [ ] action 層の専用テストは作らない（インライン error-map の薄い分岐のみ。UseCase の integration（02）と E2E（07〜09）でカバー。入力スキーマの境界は 02 の unit で担保済み）（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 5）
- [ ] `pnpm lint` / `pnpm typecheck` が通る（未設置のため画面確認は 07 以降で行う）

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
