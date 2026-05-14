import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { SYSTEM_USER_ID } from "../src/lib/system-user";

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

  const systemOccurrences = [
    { location: "ターゲット1900", sortOrder: 0 },
    { location: "システム英単語", sortOrder: 1 },
  ];
  for (const o of systemOccurrences) {
    await prisma.occurrence.upsert({
      where: {
        ownerId_location: { ownerId: SYSTEM_USER_ID, location: o.location },
      },
      update: { sortOrder: o.sortOrder },
      create: {
        ownerId: SYSTEM_USER_ID,
        location: o.location,
        sortOrder: o.sortOrder,
      },
    });
  }
  console.log(
    `Seeded ${systemOccurrences.length} system occurrence(s): ${systemOccurrences
      .map((o) => o.location)
      .join(", ")}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
