// Local/admin utility. Creates or updates a credential user without going through sign-up.
// Usage: pnpm dlx tsx scripts/create-user.ts <email> <password> <name>
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../src/lib/password-policy";

async function main() {
  const [, , emailRaw, password, name] = process.argv;
  if (!emailRaw || !password || !name) {
    console.error("usage: tsx scripts/create-user.ts <email> <password> <name>");
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    console.error(
      `password length must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH}`,
    );
    process.exit(1);
  }

  const email = emailRaw.toLowerCase();
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
    const hash = await hashPassword(password);
    const user = await prisma.user.upsert({
      where: { email },
      update: { name },
      create: { id: randomUUID(), email, name, emailVerified: false },
    });

    const existing = await prisma.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
    });
    if (existing) {
      await prisma.account.update({
        where: { id: existing.id },
        data: { password: hash },
      });
      console.log(`updated credential password for ${email} (user.id=${user.id})`);
    } else {
      await prisma.account.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: hash,
        },
      });
      console.log(`created credential user ${email} (user.id=${user.id})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
