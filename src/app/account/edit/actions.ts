"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { accountProfileSchema, type AccountProfileValues } from "@/lib/schema/account-profile";
import { getCurrentSession } from "@/lib/session";

export type UpdateProfileError = "unauthorized" | "invalid" | "unknown";

export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; error: UpdateProfileError; message: string };

export async function updateProfile(input: AccountProfileValues): Promise<UpdateProfileResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      error: "unauthorized",
      message: "ログインが必要です。再度ログインしてください。",
    };
  }

  const parsed = accountProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid", message: "入力内容を確認してください。" };
  }

  try {
    await auth.api.updateUser({
      body: { name: parsed.data.name },
      headers: await headers(),
    });
    return { ok: true };
  } catch (e) {
    console.error("[account] updateProfile failed", e);
    return {
      ok: false,
      error: "unknown",
      message: "更新に失敗しました。しばらくしてから再度お試しください。",
    };
  }
}
