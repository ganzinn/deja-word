"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { captureResetToken } from "@/lib/auth-reset-link";
import { seedOccurrencePresetSettingsForUser } from "@/lib/occurrence-preset-settings";
import { prisma } from "@/lib/prisma";
import { adminInviteSchema } from "@/lib/schema/admin-invite";
import { getCurrentSession } from "@/lib/session";
import { SYSTEM_USER_ID } from "@/lib/system-user";

export type InviteUserError = "unauthorized" | "invalid" | "unknown";

export type InviteUserResult =
  | { ok: true; email: string; url: string; isNewUser: boolean }
  | { ok: false; error: InviteUserError; message: string };

export async function inviteUser(input: { email: string }): Promise<InviteUserResult> {
  const session = await getCurrentSession();
  if (!session || session.user.id !== SYSTEM_USER_ID) {
    return { ok: false, error: "unauthorized", message: "権限がありません。" };
  }

  const parsed = adminInviteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid",
      message: parsed.error.issues[0]?.message ?? "入力内容を確認してください。",
    };
  }
  const { email } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    let isNewUser = false;
    if (!existing) {
      const user = await prisma.user.create({
        data: {
          id: randomUUID(),
          email,
          // 管理者は email のみ登録する。名前は仮値（ローカル部）とし、本人が後から変更できる。
          name: localPart(email),
          emailVerified: false,
        },
        select: { id: true },
      });
      // databaseHooks は raw create では発火しないため、プリセット付与を明示的に行う。
      await seedOccurrencePresetSettingsForUser(user.id);
      isNewUser = true;
    }

    // 正規パス（requestPasswordReset）でトークンを発行し、sendResetPassword 経由で捕捉する。
    const token = await captureResetToken(async () => {
      await auth.api.requestPasswordReset({
        body: { email },
        headers: await headers(),
      });
    });
    if (!token) {
      return {
        ok: false,
        error: "unknown",
        message: "設定リンクの発行に失敗しました。しばらくしてから再度お試しください。",
      };
    }

    const url = `${await resolveOrigin()}/set-password?token=${token}`;
    return { ok: true, email, url, isNewUser };
  } catch (e) {
    console.error("[admin] inviteUser failed", e);
    return {
      ok: false,
      error: "unknown",
      message: "処理に失敗しました。しばらくしてから再度お試しください。",
    };
  }
}

function localPart(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

async function resolveOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  // ヘッダから解決できない場合のフォールバック。
  return (
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "")
  );
}
