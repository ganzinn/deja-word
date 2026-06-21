import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { SYSTEM_USER_ID } from "../src/lib/system-user";

// 必要最小限のシードのみ。掲載箇所などのサンプルデータは投入しない（不要なため）。
// なお integration テストの再 seed は seed.ts に依存せず、独自に
// `tests/setup/fixtures.ts` が system user / 掲載箇所を用意する。

const adapter = new PrismaPg({
  connectionString:
    process.env["DIRECT_URL"] ??
    process.env["DATABASE_URL_UNPOOLED"] ??
    process.env["DATABASE_URL"],
});
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.user.upsert({
    where: { id: SYSTEM_USER_ID },
    update: {},
    create: {
      id: SYSTEM_USER_ID,
      email: "system@deja-word.internal",
      name: "共通",
      emailVerified: true,
    },
  });
  console.log(`Seeded system user: ${SYSTEM_USER_ID}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
