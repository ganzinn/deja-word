# scripts (ops 運用ツール)

tsx で実行する (`pnpm db:*`)。tsx は `import "server-only"` と `@/` エイリアスの実行時 import を解決できないため:

- アプリ本体のサービス関数や `@/lib/prisma` を import しない。コアロジックは `src/lib/` に DI 対応モジュール (server-only なし・prisma 引数注入) として新設し、ここからは相対 import する (src/lib/CLAUDE.md の ops コア規約を参照)。
- PrismaClient は `../src/generated/prisma/client` の相対 import + `@prisma/adapter-pg` で生成して注入する。
- 接続文字列は `DIRECT_URL → DATABASE_URL_UNPOOLED → DATABASE_URL` の順で解決する (`$transaction` のため直結を優先)。
- 既定はドライラン、`--execute` 指定時のみ書き込む。対話は `node:readline/promises` を使い `stdin.isTTY` で対話/非対話を分岐する。
- スクリプト本体の責務は CSV 読込・引数解析・対話・レポート整形まで。ドキュメントは `docs/ops/` に置く。
- `$queryRawUnsafe` / `$executeRawUnsafe` は `src/lib/db-reset.ts` と `scripts/reset-prod-db.ts` の 2 箇所のみの文書化済み例外（識別子は `pg_tables` カタログ由来のみで、ユーザー入力の到達経路が無い）。SQL インジェクションとして指摘しない代わりに、**この 2 箇所以外での新規使用は禁止**。
