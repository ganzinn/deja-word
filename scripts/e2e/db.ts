// E2E の DB 直操作ヘルパ（ユーザー用意・後始末）。
// scripts/create-user.ts と同じ相対 import 規約（`../../src/generated/prisma/client` + adapter-pg、
// 接続文字列は DIRECT_URL → DATABASE_URL_UNPOOLED → DATABASE_URL）に従う。
// 掃除はアプリ層の削除ガードを迂回して直に消す（cascade で子行も落ちる）。
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

export type PrismaClientType = InstanceType<typeof PrismaClient>;

function connectionString(): string {
  const cs =
    process.env["DIRECT_URL"] ??
    process.env["DATABASE_URL_UNPOOLED"] ??
    process.env["DATABASE_URL"];
  if (!cs) {
    throw new Error("DATABASE_URL / DATABASE_URL_UNPOOLED / DIRECT_URL is not set");
  }
  return cs;
}

export function makePrisma(): PrismaClientType {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString() }) });
}

export type EnsuredUser = { id: string; email: string; password: string };

/**
 * credential ユーザーを冪等に用意する（無ければ作成、あればパスワード更新）。
 * create-user.ts と同じロジック。emailVerified は true（ログイン検証は元々不要だが明示）。
 */
export async function ensureUser(
  prisma: PrismaClientType,
  emailRaw: string,
  password: string,
  name: string,
): Promise<EnsuredUser> {
  const email = emailRaw.toLowerCase();
  const hash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: { id: randomUUID(), email, name, emailVerified: true },
  });

  const existing = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });
  if (existing) {
    await prisma.account.update({ where: { id: existing.id }, data: { password: hash } });
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
  }
  return { id: user.id, email, password };
}

/**
 * system ユーザー（id="system"）が seed 済み・パスワード設定済みかを確認する（読み取りのみ）。
 * 未整備なら分かりやすい remediation メッセージで throw する。system ユーザーは
 * ensureUser で作ってはいけない（id が "system" 固定という不変条件を壊すため）。
 */
export async function assertSystemUserReady(prisma: PrismaClientType): Promise<void> {
  const sys = await prisma.user.findUnique({
    where: { id: "system" },
    include: { accounts: { where: { providerId: "credential" }, select: { id: true } } },
  });
  if (!sys) {
    throw new Error(
      "system ユーザーが未 seed です。`pnpm db:seed && pnpm db:set-system-password` を実行してください。",
    );
  }
  if (sys.accounts.length === 0) {
    throw new Error(
      "system ユーザーにパスワードが未設定です。`pnpm db:set-system-password` を実行してください。",
    );
  }
}

/** headword 前置一致で単語を DB 直削除（cascade で子行も消える）。削除件数を返す。 */
export async function cleanupWordsByPrefix(
  prisma: PrismaClientType,
  prefix: string,
): Promise<number> {
  const res = await prisma.word.deleteMany({ where: { headword: { startsWith: prefix } } });
  return res.count;
}

/** メール指定でユーザーを削除（cascade で単語・履歴も消える）。使い捨てユーザーの後始末用。 */
export async function deleteUserByEmail(prisma: PrismaClientType, emailRaw: string): Promise<void> {
  await prisma.user.deleteMany({ where: { email: emailRaw.toLowerCase() } });
}
