# 02. bookmark-settings

状態: **未着手**　PR: （未作成）

## 目的

ブックマークの UseCase（冪等な付け外しと一括取得）を `src/lib/bookmark-settings.ts` に、一括取得 action 用の入力スキーマを `src/lib/schema/bookmark.ts` に新設する。server action（06）と各画面（07〜09）が使う土台。

スコープ外: server action（06）、UI（06 以降）、quiz 出題範囲への組み込み（03・04）。

## 依存チケット

- 01: Bookmark テーブル（Prisma クライアントの `bookmark` モデル）を使う

## 前提（設計決定の再掲）

- UseCase は新規ファイル `src/lib/bookmark-settings.ts`（`import "server-only"`）。手本は純 per-user 設定の `src/lib/occurrence-preset-settings.ts`（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 1）
- `setBookmarkForUser(userId: string, wordId: string, bookmarked: boolean): Promise<void>`（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 1）:
  - 認可: ON / OFF とも、対象 word を `findFirst({ where: { id: wordId, ownerId: { in: scopedOwnerIds(userId) } } })` で scoped 検証し、範囲外なら同ファイル定義の `BookmarkWordNotInScopeError` を throw する。scoped 検証により共有マスタ単語（ownerId=system）への本人ブックマークは許可、他ユーザーの単語は拒否される（src/lib/CLAUDE.md「純 per-user 設定は対象を scoped 検証してよい」の確立済み例外に該当）
  - 書き込み: ON は `upsert({ where: { userId_wordId: {...} }, create: {...}, update: {} })`（存在すれば no-op）、OFF は `deleteMany({ where: { userId, wordId } })`。どちらも冪等。書き込み先は本人行（userId 固定）のみ。単一書き込みのため `$transaction` は張らない
  - `userId_wordId` の複合 unique 入力は複合 PK `@@id([userId, wordId])` から生成される（[02-data-model.md](../../design/bookmark/02-data-model.md) 決定 1）
- 共有マスタ単語（ownerId=system）にも本人のブックマークを付けられる。ブックマークは常に本人だけのデータ（[01-requirements.md](../../design/bookmark/01-requirements.md) 決定 3）
- `getBookmarkedWordIdsForUser(userId: string, wordIds: readonly string[]): Promise<string[]>`（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 1）:
  - `findMany({ where: { userId, wordId: { in: wordIds } }, select: { wordId } })` でヒットした wordId 一覧を返す
  - 本人行のみの read のため wordIds の scoped 検証は不要（範囲外・削除済み wordId は非ヒット＝未ブックマーク扱いになり、他人のデータは漏れない）
  - 単語詳細ページ（07）もこれを 1 件配列で使う。read 専用関数は増やさない
- `src/lib/schema/bookmark.ts`（新規、`zod/v3`）: `getBookmarkStatesInputSchema` で `wordIds: z.array(z.string()).max(3000)` を検証する。上限 3000 は「結果一覧の単語数 = 1 回の quiz の出題数」の上限（現実の最大 ≒ 1900 語に余裕を持たせた値）で、定数化する（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 3）

## 実装内容

### 作成: `src/lib/bookmark-settings.ts`

前提のとおり `BookmarkWordNotInScopeError` / `setBookmarkForUser` / `getBookmarkedWordIdsForUser` を実装する（`import "server-only"`、occurrence-preset-settings.ts と同スタイル）。

### 作成: `src/lib/schema/bookmark.ts`

`getBookmarkStatesInputSchema`（`zod/v3`、wordIds 上限は定数 3000）と入力型 export。

### 作成: `src/lib/bookmark-settings.integration.test.ts`

occurrence-preset-settings.integration.test.ts と同粒度でコロケートする。

### 作成: `src/lib/schema/bookmark.unit.test.ts`

## 完了条件（Definition of Done）

- [ ] integration: ON の冪等性（二重 ON で 1 行）・OFF の冪等性（未存在 OFF が安全）・scope 外単語で `BookmarkWordNotInScopeError`・system 単語へ付与可・他ユーザー単語は拒否・`getBookmarkedWordIdsForUser` のヒット / 非ヒット（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 5）
- [ ] unit: `getBookmarkStatesInputSchema` の上限超過・型不正の拒否（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 5）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` / `pnpm test:integration` が通る

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
