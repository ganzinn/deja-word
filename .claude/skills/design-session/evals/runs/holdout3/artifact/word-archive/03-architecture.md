# 03. アーキテクチャ

状態: **確定**（2026-07-08）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- アーカイブは単語単位のオン/オフで本人専用（01 確定）。
- アーカイブ済みは通常の単語一覧から隠し、絞り込みで見返せる（01 確定）。
- 保存は中間テーブル UserWordArchive、単語削除時はアーカイブ状態も削除（02 確定）。

## 検討事項リスト

- [x] アーカイブ済み除外の適用方式（一覧取得クエリ側の既定除外 / 表示側のフィルタ）
- [x] 除外の適用範囲（どの一覧・ナビ経路に効かせるか）
- [x] アーカイブ/解除の書き込み経路
- [x] テスト戦略

## 議論・決定

### 決定 1: アーカイブ済み除外は一覧取得クエリ側で既定除外する

一覧取得クエリの `where` にアーカイブ除外述語を組み込み、既定でアーカイブ済みを取得対象から外す。「アーカイブ済みを見返す」絞り込みは、既存の `q` / `sort` / `match` と同様に検索クエリパラメータで受け取り、この述語を「除外」→「アーカイブのみ」へ切り替える。

- 実装方式: `UserWordArchive` は (userId, wordId) の中間テーブル（02 確定）なので、`Word` に逆リレーション `userWordArchives` を追加し、関係フィルタで除外する。
  - 既定（未指定）: `userWordArchives: { none: { userId } }`（本人のアーカイブ行が無いものだけ）
  - アーカイブのみ表示: `userWordArchives: { some: { userId } }`
  - 述語は本人の `userId` で閉じる（本人のアーカイブ行だけを見る）。他ユーザーや system のアーカイブ行は評価しない。
- 採用理由: `total` とページングは `where` から算出される（`listWordsForUser` は `findMany(where)` と `count(where)` を `Promise.all` で回す。src/lib/words-list.ts:132-141）。除外を `where` に入れれば取得件数・ページングが自動的に整合する。既存クエリは filtering を shared な `where` / where-builder に集約しており、隣接ナビ helper も同じ where を再利用して集合定義を一致させている。除外述語もここに組み込むのが既存方針と唯一整合する。
- 却下した代替案: 表示側（Server Component / クライアント）でのフィルタリング — `count` は `where` から出るため、取得後にアーカイブ済みを間引くと `total`・ページング・「1ページ分の件数」が実データと乖離する。

### 決定 2: 除外は全一覧・ナビ経路で統一適用する

除外述語を、単語一覧を導出する共有 where / where-builder すべてに効かせる。対象は `listWordsForUser`（words-view）、`buildWordsByOccurrenceWhere` 経由の `listWordsByOccurrence`（occurrence-view）、および隣接ナビ helper（`findAdjacentWordsByOccurrence` / `findAdjacentWordsByOccurrenceNumber`）。

- 採用理由: 集合定義がビュー・ナビ間で食い違うと「一覧から消えたのに前後ナビで到達できる」「occurrence-view にだけアーカイブ済みが残る」といった不整合が出る。既存コードは where-builder を共有して集合を一致させており（src/lib/words-list.ts の隣接 helper が同じ where を再利用）、その設計に除外述語を1箇所で足すことで全経路に一様に効く。
- 却下した代替案: words-view だけ除外 — occurrence-view と前後ナビでアーカイブ済みが露出し、01 の「通常の一覧から隠す」を満たせない。

### 決定 3: アーカイブ/解除は Server Action → UseCase 経由で書き込む

アーカイブ・解除は Server Action を入口にし、UseCase（`src/lib/words-archive.ts`, `server-only`）の `archiveWord` / `unarchiveWord` が `UserWordArchive` 行を作成 / 削除する。Server Action は Result 型（`{ ok: true } | { ok: false, error, message }`）を返す。

- スコープ: アーカイブは本人専用状態。対象 `Word` は本人の単語も system 共有単語もあり得るので、対象の可視性は読み系の慣習どおり `scopedOwnerIds(userId)` で確認し、`UserWordArchive` 行は本人の `userId` で作る（読み=scoped / 書き=userId 行、の非対称に沿う。src/lib/CLAUDE.md）。
- 冪等性: 既にアーカイブ済みで再アーカイブ、未アーカイブで解除、を呼んでもエラーにしない（`upsert` 相当 / 行が無ければ no-op）。UI の二重操作・再送に耐える。
- 削除耐性: 単語削除時は `UserWordArchive` 行が Cascade で消える（02 確定・ADR-0009）。解除操作が対象行の消滅と競合しても no-op で吸収する。
- 却下した代替案: Server Component / page から直接 `prisma` を変更 — 認可・Result 変換・トランザクション境界の層分け（src/app / src/lib の慣習）に反する。

### 決定 4: 除外述語を純関数として unit テスト、操作〜一覧反映は E2E を1本

- unit: 除外述語を純ヘルパー `archiveExclusionWhere(userId, mode)`（`mode`: 既定=除外 / アーカイブのみ）として切り出し、unit テストする（`headwordCondition` と同様の純関数。src/lib/words-list.ts:110-114 が範）。既定で `none` 述語、絞り込み時に `some` 述語を返し、`userId` が述語内に正しく閉じ込められることを検証する。
- E2E: アーカイブ操作〜一覧反映の流れを1本（`scripts/e2e/verify-archive.ts` / `pnpm e2e:archive`）。`test1` で単語をアーカイブ → `/words` から消える → アーカイブ絞り込みで見える → 解除で一覧に戻る、を通す（e2e-verify スキルのハーネスを使う）。
- 採用理由: 一覧クエリ本体（`listWordsForUser` 等）は DB 依存で、ADR-0056 によりクエリの検証層は integration（`words-list.integration.test.ts`）であって unit ではない（クエリの unit テストは存在しない）。そのため「除外込みの一覧クエリを unit で検証したい」という要求は、除外述語を純関数として切り出す seam に落とし込むことで満たす。実 DB での反映（除外・絞り込み・解除の end-to-end）は E2E が端から端まで担保する。
- 却下した代替案:
  - (a) `prisma` をモックして `listWordsForUser` を直接 unit テスト — ADR-0056（クエリは integration で検証）に反し、`findMany` / `count` に `where` が渡ることを確認するだけで検証価値が低い。
  - (b) integration テストで除外を検証 — E2E と守備範囲が重複し、今回ユーザーが確定したテスト範囲（unit + E2E 1本）を超える。将来 DB レベルの回帰固定が要れば `words-list.integration.test.ts` に追加できる（除外・スコープの既存アサーション群に並べる）。
