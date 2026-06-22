"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { createEmailVerificationToken } from "better-auth/api";

import { deleteUserForAdmin, UserNotFoundError } from "@/lib/admin-user-delete";
import { auth } from "@/lib/auth";
import { captureResetToken } from "@/lib/auth-reset-link";
import { seedOccurrencePresetSettingsForUser } from "@/lib/occurrence-preset-settings";
import { prisma } from "@/lib/prisma";
import { adminInviteSchema } from "@/lib/schema/admin-invite";
import { changeUserEmailSchema } from "@/lib/schema/change-user-email";
import { getCurrentSession } from "@/lib/session";
import { SYSTEM_USER_ID } from "@/lib/system-user";

export type InviteUserError = "unauthorized" | "invalid" | "unknown";

export type InviteUserResult =
  | { ok: true; email: string; url: string; isNewUser: boolean }
  | { ok: false; error: InviteUserError; message: string };

export type ChangeUserEmailError = "unauthorized" | "invalid" | "conflict" | "unknown";

export type ChangeUserEmailResult =
  | { ok: true; email: string; url: string }
  | { ok: false; error: ChangeUserEmailError; message: string };

export type DeleteUserError = "unauthorized" | "invalid" | "unknown";

export type DeleteUserResult =
  | { ok: true }
  | { ok: false; error: DeleteUserError; message: string };

// メール変更の検証リンク（change-email-verification トークン）の有効期限。招待リンクと揃えて 24h。
const EMAIL_CHANGE_TOKEN_EXPIRES_IN = 60 * 60 * 24;

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

export async function changeUserEmail(input: {
  userId: string;
  newEmail: string;
}): Promise<ChangeUserEmailResult> {
  const session = await getCurrentSession();
  if (!session || session.user.id !== SYSTEM_USER_ID) {
    return { ok: false, error: "unauthorized", message: "権限がありません。" };
  }

  const parsed = changeUserEmailSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid",
      message: parsed.error.issues[0]?.message ?? "入力内容を確認してください。",
    };
  }
  const { userId, newEmail } = parsed.data;

  if (userId === SYSTEM_USER_ID) {
    return { ok: false, error: "invalid", message: "system ユーザーは変更できません。" };
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        accounts: { where: { providerId: "credential" }, select: { id: true } },
      },
    });
    if (!target) {
      return { ok: false, error: "invalid", message: "対象のユーザーが見つかりません。" };
    }
    // パスワード未設定（credential アカウント無し）のユーザーは変更不可。
    // 変更リンクを踏むだけで未設定のまま自動ログインできてしまうのを防ぐ。
    if (target.accounts.length === 0) {
      return {
        ok: false,
        error: "invalid",
        message: "パスワード未設定のユーザーはメールアドレスを変更できません。",
      };
    }
    if (target.email === newEmail) {
      return { ok: false, error: "invalid", message: "現在のメールアドレスと同じです。" };
    }

    const conflict = await prisma.user.findUnique({
      where: { email: newEmail },
      select: { id: true },
    });
    if (conflict) {
      return {
        ok: false,
        error: "conflict",
        message: "このメールアドレスは既に使われています。",
      };
    }

    // ここでは user.email を変更しない。Better Auth の change-email-verification トークン
    // （updateTo 付き JWT）を発行し、本人がリンクを踏んだ瞬間に verify-email エンドポイントが
    // 新アドレスへ切替＋emailVerified=true をコミットする（踏むまで現アドレスのまま）。
    // 署名 secret は auth インスタンスと一致させる必要があるため $context から取得する。
    const { secret } = await auth.$context;
    const token = await createEmailVerificationToken(
      secret,
      target.email, // 現アドレス（verify 時に user を引く識別子）
      newEmail, // updateTo: 切替先
      EMAIL_CHANGE_TOKEN_EXPIRES_IN,
      { requestType: "change-email-verification" },
    );

    // callbackURL は /menu。踏むとセッションが作られ自動ログイン状態で着地する。
    const url = `${await resolveOrigin()}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent("/menu")}`;
    return { ok: true, email: newEmail, url };
  } catch (e) {
    console.error("[admin] changeUserEmail failed", e);
    return {
      ok: false,
      error: "unknown",
      message: "処理に失敗しました。しばらくしてから再度お試しください。",
    };
  }
}

export async function deleteUser(input: { userId: string }): Promise<DeleteUserResult> {
  const session = await getCurrentSession();
  if (!session || session.user.id !== SYSTEM_USER_ID) {
    return { ok: false, error: "unauthorized", message: "権限がありません。" };
  }

  if (input.userId === SYSTEM_USER_ID) {
    return { ok: false, error: "invalid", message: "system ユーザーは削除できません。" };
  }

  try {
    await deleteUserForAdmin(input.userId);
    return { ok: true };
  } catch (e) {
    if (e instanceof UserNotFoundError) {
      return { ok: false, error: "invalid", message: "対象のユーザーが見つかりません。" };
    }
    console.error("[admin] deleteUser failed", e);
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
