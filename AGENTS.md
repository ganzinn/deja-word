<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Testing

テストは Vitest。SUT の隣にコロケートし、拡張子で種類を分ける。

- `*.unit.test.ts` — DB なし。`pnpm test:unit` で実行（高速、env 非依存、CI でも走る）。
- `*.integration.test.ts` — docker-compose の Postgres 上の **別 DB `dejaword_test`** を使う。`pnpm test:integration` で実行（ローカルのみ、CI では走らせない）。

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

DB 操作の運用ツールは `scripts/*.ts` に置き、`tsx` 経由で `pnpm db:*` として実行する
（例: `db:seed` / `db:create-user` / `db:purge-occurrence` / `db:import-words`）。接続先は
`DIRECT_URL → DATABASE_URL_UNPOOLED → DATABASE_URL` の順で解決し（`$transaction` のため直結を優先）、
`PrismaClient` はスクリプトで生成して注入する。`docs/ops/` に各ツールのドキュメントを置く。

**アプリ本体のサービス関数を tsx から直接 import してはいけない。** 単語登録の正規パス
（`createWordForUser` → `writeWordChildren` → `src/lib/words/handlers/*`）や `@/lib/prisma` などは
グラフ全体が `import "server-only"` を持ち、実行時に `@/` エイリアス import を使う。tsx はこのどちらも
解決できず、import 時点で落ちる。

→ ops ツールのコアロジックは **server-only 非依存・DI 対応のモジュール**として `src/lib/` に新設する
（`occurrence-purge.ts` / `bulk-word-import.ts` が手本）。具体的には:

- `prisma`（必要なら `blob` も）は**引数注入**。シングルトン `@/lib/prisma` を import しない。
- `@/` 参照は **`import type` のみ**（型は実行時に消えるので tsx でも安全）。実行時に値が要るものは
  相対 import（例 `./system-user`）で、かつその依存先も server-only / `@/` 実行時 import を持たないこと
  （`./prisma-errors` は内部で `@/generated` を実行時 import するので、tsx から使うコアでは使わない）。
- 書き込みは正規パスを再利用できないぶん、`prisma/seed.ts` の raw ネスト create を手本に最小限を書く。

スクリプト側（`scripts/*.ts`）は CSV 読込・引数解析・対話プロンプト（`node:readline/promises`、
`stdin.isTTY` で対話/非対話を分岐）・レポート整形を担い、既定はドライラン、`--execute` で実行する。
