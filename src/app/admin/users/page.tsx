import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { AdminUsersClient, type AdminUserRow } from "./admin-users-client";

export default async function AdminUsersPage() {
  const session = await getCurrentSession();
  // system ユーザー以外には存在を隠す（sign-up と同じ notFound 方針）。
  if (!session || session.user.id !== SYSTEM_USER_ID) notFound();

  const users = await prisma.user.findMany({
    where: { id: { not: SYSTEM_USER_ID } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      accounts: { where: { providerId: "credential" }, select: { id: true } },
    },
  });

  const rows: AdminUserRow[] = users.map((u) => ({
    email: u.email,
    name: u.name,
    hasPassword: u.accounts.length > 0,
    createdAt: u.createdAt.toISOString(),
  }));

  return <AdminUsersClient users={rows} />;
}
