// quiz handler 共通基盤。`words/handlers/shared.ts` と同定義の Tx 型を持つが、
// words への依存を作らないため import せずコピーする（チケット 05 / 05-architecture.md 決定 1）。

import type { Prisma } from "@/generated/prisma/client";

export type Tx = Prisma.TransactionClient;
