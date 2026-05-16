// system ユーザー (id="system") に Better Auth credential を投入/更新する。
// `prisma/seed.ts` で system ユーザーが作成済みであることを前提とし、
// Account(providerId="credential") のパスワードを upsert する。
//
// Usage:
//   SYSTEM_USER_PASSWORD=... pnpm db:set-system-password
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { SYSTEM_USER_ID } from "../src/lib/system-user";

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

async function main() {
  const password = process.env["SYSTEM_USER_PASSWORD"];
  if (!password) {
    console.error("SYSTEM_USER_PASSWORD is not set");
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    console.error(`password length must be between ${MIN_PASSWORD} and ${MAX_PASSWORD}`);
    process.exit(1);
  }

  const connectionString =
    process.env["DIRECT_URL"] ??
    process.env["DATABASE_URL_UNPOOLED"] ??
    process.env["DATABASE_URL"];
  if (!connectionString) {
    console.error("DATABASE_URL / DATABASE_URL_UNPOOLED / DIRECT_URL is not set");
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const user = await prisma.user.findUnique({ where: { id: SYSTEM_USER_ID } });
    if (!user) {
      console.error(
        `system user not found. run \`pnpm db:seed\` first to create id="${SYSTEM_USER_ID}".`,
      );
      process.exit(1);
    }

    const hash = await hashPassword(password);
    const existing = await prisma.account.findFirst({
      where: { userId: SYSTEM_USER_ID, providerId: "credential" },
    });
    if (existing) {
      await prisma.account.update({
        where: { id: existing.id },
        data: { password: hash },
      });
      console.log(`updated credential password for system user (${user.email})`);
    } else {
      await prisma.account.create({
        data: {
          id: randomUUID(),
          userId: SYSTEM_USER_ID,
          providerId: "credential",
          accountId: SYSTEM_USER_ID,
          password: hash,
        },
      });
      console.log(`created credential for system user (${user.email})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
