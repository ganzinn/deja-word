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

export type ResolvedOwner = {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  isSystem: boolean;
};

export async function resolveImportOwner(
  prisma: PrismaClient,
  email: string | undefined,
): Promise<ResolvedOwner> {
  if (!email) {
    const sys = await prisma.user.findUnique({
      where: { id: SYSTEM_USER_ID },
      select: { name: true, email: true },
    });
    if (!sys) throw new SystemUserMissingError();
    return {
      ownerId: SYSTEM_USER_ID,
      ownerName: sys.name,
      ownerEmail: sys.email,
      isSystem: true,
    };
  }
  const normalized = email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, name: true, email: true },
  });
  if (!user) throw new UserNotFoundByEmailError(normalized);
  return { ownerId: user.id, ownerName: user.name, ownerEmail: user.email, isSystem: false };
}

/**
 * 取り込み先の候補ユーザーを列挙する（対話モードの選択 UI 用）。system を先頭に、
 * 以降は email 昇順。掲載箇所を 1 つも持たないユーザーも候補に含める。
 */
export async function listImportOwners(prisma: PrismaClient): Promise<ResolvedOwner[]> {
  const users = await prisma.user.findMany({
    orderBy: { email: "asc" },
    select: { id: true, name: true, email: true },
  });
  return users
    .map((u) => ({
      ownerId: u.id,
      ownerName: u.name,
      ownerEmail: u.email,
      isSystem: u.id === SYSTEM_USER_ID,
    }))
    .sort((a, b) => Number(b.isSystem) - Number(a.isSystem));
}
