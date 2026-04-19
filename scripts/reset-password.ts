// Local dev utility. DO NOT use in production.
// Usage: pnpm dlx tsx scripts/reset-password.ts <email> <newPassword>
import "dotenv/config";
import { hashPassword } from "better-auth/crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const MIN = 8;
const MAX = 128;

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];
  if (!email || !newPassword) {
    console.error("usage: tsx scripts/reset-password.ts <email> <newPassword>");
    process.exit(1);
  }
  if (newPassword.length < MIN || newPassword.length > MAX) {
    console.error(`password length must be between ${MIN} and ${MAX}`);
    process.exit(1);
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`user not found: ${email}`);
      process.exit(1);
    }
    const hash = await hashPassword(newPassword);
    const { count } = await prisma.account.updateMany({
      where: { userId: user.id, providerId: "credential" },
      data: { password: hash },
    });
    if (count === 0) {
      console.error(`no credential account for ${email}`);
      process.exit(1);
    }
    console.log(`password updated for ${email} (user.id=${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
