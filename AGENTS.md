<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Testing

テストは Vitest。SUT の隣にコロケートし、拡張子で種類を分ける。

- `*.unit.test.ts` — DB なし。`pnpm test:unit` で実行（高速、env 非依存、CI でも走る）。
- `*.integration.test.ts` — docker-compose の Postgres 上の **別 DB `dejaword_test`** を使う。`pnpm test:integration` で実行（ローカルのみ、CI では走らせない）。

include は `.ts` のみ（`src/**/*.unit.test.ts` / `src/**/*.integration.test.ts`）。`.test.tsx` を作っても実行されない。

初回セットアップ:

```sh
docker exec -it deja-word-db psql -U dejaword -d postgres -c 'CREATE DATABASE dejaword_test;'
cp .env.test.example .env.test
```

`pnpm test:integration` の初回起動で `prisma migrate deploy` が自動実行される。各テストの前にテーブルが `TRUNCATE ... CASCADE` され、system user / system occurrences が再 seed される。両方一括で走らせるなら `pnpm test`。

## Worktree（複数機能の並行開発）

git worktree でブランチごとに作業ディレクトリを分けて並行開発する。前提として docker の `deja-word-db` を起動しておくこと（**DB は本体と共有する**）。

```sh
scripts/wt-new.sh <feature-name> [base-branch]   # 作成（branch feat/<name>, dir ../deja-word-<name>）
scripts/wt-rm.sh  <feature-name> [--delete-branch] # 撤去
```

`wt-new.sh` は worktree 作成・`.env` / `.env.test` のコピー・`pnpm install`（`prisma generate` 含む）までを行う。`node_modules` / `src/generated` / `.next` は worktree ごとに独立する。

**DB は単一 `dejaword` を共有**する。dev サーバは1つずつ起動する運用なので同時アクセスの競合は無いが、ブランチ間で migration が食い違うと drift が出る。アクティブな worktree を切り替えた直後は:

- 通常（追加 migration のみ）: `pnpm db:migrate`
- drift / 不整合時: `pnpm prisma migrate reset && pnpm db:seed`

**発音音源（`.dev-blob/`）も本体と共有**する。DB には相対 key だけが入る（`src/lib/blob-client.ts`）ため、共有しないと「DB に URL はあるが実体が別 worktree にしか無い → 404」が起きる。`wt-new.sh` が各 worktree の `.env` に `DEV_BLOB_ROOT="<本体>/.dev-blob"` を追記して共有させる。

同時に 2 つの dev を見比べたい場合のみ、片方を `PORT=3001 pnpm dev` で起動する。

## Ops スクリプト（運用ツール）

DB 操作の運用ツールは `scripts/*.ts` に置き、`tsx` 経由で `pnpm db:*` として実行する。実装規約は `scripts/CLAUDE.md` と `src/lib/CLAUDE.md`（ops コアモジュール節）にある。ドキュメントは `docs/ops/`。
