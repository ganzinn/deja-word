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
