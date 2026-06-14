import "server-only";

import { prisma } from "@/lib/prisma";

export class AutoNumberOccurrenceNotOwnedError extends Error {
  constructor() {
    super("auto-numbering occurrence is not owned by the user");
    this.name = "AutoNumberOccurrenceNotOwnedError";
  }
}

export class AutoNumberRequiresPresetError extends Error {
  constructor() {
    super("auto-numbering requires the occurrence to be a preset");
    this.name = "AutoNumberRequiresPresetError";
  }
}

/**
 * 掲載箇所の「掲載番号の自動採番」を ON/OFF する（一覧画面のトグル用）。
 *
 * - 自動採番は「自分の掲載箇所のみ適用可能」なので own（ownerId === userId）に限定する。
 * - 自動採番はプリセットのサブ設定。ON にできるのはプリセット ON の掲載箇所のみ。
 */
export async function setAutoNumberingForUser(
  userId: string,
  occurrenceId: string,
  autoNumbering: boolean,
): Promise<void> {
  const occurrence = await prisma.occurrence.findFirst({
    where: { id: occurrenceId, ownerId: userId },
    select: { id: true },
  });
  if (!occurrence) throw new AutoNumberOccurrenceNotOwnedError();

  if (autoNumbering) {
    const preset = await prisma.occurrencePresetSetting.findUnique({
      where: { userId_occurrenceId: { userId, occurrenceId } },
      select: { userId: true },
    });
    if (!preset) throw new AutoNumberRequiresPresetError();
  }

  await prisma.occurrence.update({
    where: { id: occurrenceId },
    data: { autoNumbering },
  });
}

/**
 * プリセットを外した時の連動クリア。自動採番はプリセット ON が前提なので OFF に落とす。
 * own のみ対象（共通 / 他人の掲載箇所は no-op）。
 */
export async function disableAutoNumberingForUser(
  userId: string,
  occurrenceId: string,
): Promise<void> {
  await prisma.occurrence.updateMany({
    where: { id: occurrenceId, ownerId: userId },
    data: { autoNumbering: false },
  });
}
