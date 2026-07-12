// quiz handler 共通基盤。`words/handlers/shared.ts` と同定義の Tx 型を持つが、
// words への依存を作らないため import せずコピーする（docs/adr/0014-three-layer-architecture.md）。

import type { Prisma } from "@/generated/prisma/client";

export type Tx = Prisma.TransactionClient;
