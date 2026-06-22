import "server-only";

import { prisma } from "@/lib/prisma";
import type { SaveUserPreferencesInput } from "@/lib/schema/user-preferences";

/** ユーザー全般設定。全項目任意（null = 未設定 = アプリ既定値）。 */
export type UserPreferences = {
  /** 発音音源が未登録のとき自動音声で代用する。null = 有効（デフォルト）。 */
  ttsFallback: boolean | null;
};

/**
 * 発音音源が未登録のときに自動音声フォールバックを使うかどうかの解決値。
 * 行が無い／null（未設定）は既定で有効（true）とする。
 */
export async function getTtsFallbackEnabled(userId: string): Promise<boolean> {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: { ttsFallback: true },
  });
  return pref?.ttsFallback ?? true;
}

/** ユーザー全般設定を upsert する（ユーザーごと 1 行）。 */
export async function saveUserPreferences(
  userId: string,
  input: SaveUserPreferencesInput,
): Promise<void> {
  await prisma.userPreference.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
  });
}
