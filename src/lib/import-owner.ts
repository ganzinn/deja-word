// 一括取り込み系（bulk-word-import / related-word-import）で共有する owner 解決。
// email 未指定なら system ユーザー宛て（共有マスタ）。tsx から呼べるよう prisma は引数注入で、
// `server-only` や `@/` 実行時 import を持たない（PrismaClient は type-only import）。

import { SYSTEM_USER_ID } from "./system-user";

import type { PrismaClient } from "@/generated/prisma/client";

export class UserNotFoundByEmailError extends Error {
  constructor(public readonly email: string) {
    super(`USER_NOT_FOUND: ${email}`);
    this.name = "UserNotFoundByEmailError";
  }
}

export class SystemUserMissingError extends Error {
  constructor() {
    super("SYSTEM_USER_MISSING");
    this.name = "SystemUserMissingError";
  }
}

export type ResolvedOwner = { ownerId: string; ownerEmail: string; isSystem: boolean };

export async function resolveImportOwner(
  prisma: PrismaClient,
  email: string | undefined,
): Promise<ResolvedOwner> {
  if (!email) {
    const sys = await prisma.user.findUnique({
      where: { id: SYSTEM_USER_ID },
      select: { email: true },
    });
    if (!sys) throw new SystemUserMissingError();
    return { ownerId: SYSTEM_USER_ID, ownerEmail: sys.email, isSystem: true };
  }
  const normalized = email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, email: true },
  });
  if (!user) throw new UserNotFoundByEmailError(normalized);
  return { ownerId: user.id, ownerEmail: user.email, isSystem: false };
}
