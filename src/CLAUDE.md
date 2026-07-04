# src 共通

- Prisma の型・値は `@/generated/prisma/client`、enum は `@/generated/prisma/enums` から import する。generator の出力先が `src/generated/prisma` のため、`@prisma/client` からの import は動かない。
- zod は `zod/v3` サブパスから import する。パッケージは v4 だが全スキーマが v3 互換 API (`.cuid()` 等) で書かれており、`"zod"` からの import を混ぜると型が合わない。
- ミドルウェアは `src/proxy.ts` の `export function proxy()`。Next.js 16 で middleware は proxy にリネームされており、`middleware.ts` を新規作成しても無視される。
- `import "server-only"` 付きモジュールも unit テストできる (`tests/setup/unit.setup.ts` が `vi.mock("server-only")` 済み)。
