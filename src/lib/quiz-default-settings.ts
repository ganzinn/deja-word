import "server-only";

import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";
import type { QuizFormat } from "@/generated/prisma/enums";

/** テスト開始画面のデフォルト設定。全項目任意（null = 未設定）。 */
export type QuizDefaults = {
  occurrenceId: string | null;
  rangeFrom: number | null;
  rangeTo: number | null;
  format: QuizFormat | null;
  timeoutSeconds: number | null;
};

export class DefaultOccurrenceNotInScopeError extends Error {
  constructor() {
    super("default occurrence is not in scope");
    this.name = "DefaultOccurrenceNotInScopeError";
  }
}

/**
 * 保存済みデフォルトを返す（未保存なら null）。
 * occurrence が削除済み（DB の SetNull）または可視範囲外になった場合は
 * occurrenceId だけ null に落とし、range / format は残す。
 */
export async function getQuizDefaultsForUser(userId: string): Promise<QuizDefaults | null> {
  const setting = await prisma.quizDefaultSetting.findUnique({
    where: { userId },
    include: { occurrence: { select: { ownerId: true } } },
  });
  if (!setting) return null;

  const occurrenceVisible =
    setting.occurrence !== null && scopedOwnerIds(userId).includes(setting.occurrence.ownerId);
  return {
    occurrenceId: occurrenceVisible ? setting.occurrenceId : null,
    rangeFrom: setting.rangeFrom,
    rangeTo: setting.rangeTo,
    format: setting.format,
    timeoutSeconds: setting.timeoutSeconds,
  };
}

/** デフォルトを upsert する（ユーザーごと 1 行）。 */
export async function saveQuizDefaultsForUser(userId: string, input: QuizDefaults): Promise<void> {
  if (input.occurrenceId !== null) {
    const occurrence = await prisma.occurrence.findFirst({
      where: { id: input.occurrenceId, ownerId: { in: scopedOwnerIds(userId) } },
      select: { id: true },
    });
    if (!occurrence) throw new DefaultOccurrenceNotInScopeError();
  }

  await prisma.quizDefaultSetting.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
  });
}

/** デフォルトを削除する（未保存でも安全）。 */
export async function clearQuizDefaultsForUser(userId: string): Promise<void> {
  await prisma.quizDefaultSetting.deleteMany({ where: { userId } });
}
