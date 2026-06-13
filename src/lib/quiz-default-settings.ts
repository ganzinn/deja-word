import "server-only";

import { prisma } from "@/lib/prisma";
import { ALL_QUIZ_FORMATS } from "@/lib/quiz/format-options";
import { scopedOwnerIds } from "@/lib/system-user";
import type { QuizFormat } from "@/generated/prisma/enums";

/** テスト開始画面のデフォルト設定。全項目任意（null = 未設定）。 */
export type QuizDefaults = {
  occurrenceId: string | null;
  rangeFrom: number | null;
  rangeTo: number | null;
  format: QuizFormat | null;
  /** 出題形式ごとの制限時間（秒）。全形式キーを持ち、null = その形式は制限なし（行なし）。 */
  timeoutByFormat: Record<QuizFormat, number | null>;
  showCountdown: boolean | null;
};

export class DefaultOccurrenceNotInScopeError extends Error {
  constructor() {
    super("default occurrence is not in scope");
    this.name = "DefaultOccurrenceNotInScopeError";
  }
}

/** 全形式キーを null で初期化した制限時間 map を作る（部分設定でも全キー保持を保証）。 */
function emptyTimeoutByFormat(): Record<QuizFormat, number | null> {
  return Object.fromEntries(ALL_QUIZ_FORMATS.map((f) => [f, null])) as Record<
    QuizFormat,
    number | null
  >;
}

/**
 * 保存済みデフォルトを返す（未保存なら null）。
 * occurrence が削除済み（DB の SetNull）または可視範囲外になった場合は
 * occurrenceId だけ null に落とし、range / format は残す。
 * 制限時間は形式別の子テーブル（QuizDefaultTimeout）から組み立てる。
 * QuizDefaultSetting 行が無くても制限時間だけ設定済みのケースがあるため、
 * 両テーブルとも空のときだけ null を返す。
 */
export async function getQuizDefaultsForUser(userId: string): Promise<QuizDefaults | null> {
  const [setting, timeouts] = await Promise.all([
    prisma.quizDefaultSetting.findUnique({
      where: { userId },
      include: { occurrence: { select: { ownerId: true } } },
    }),
    prisma.quizDefaultTimeout.findMany({ where: { userId } }),
  ]);
  if (!setting && timeouts.length === 0) return null;

  const timeoutByFormat = emptyTimeoutByFormat();
  for (const row of timeouts) {
    timeoutByFormat[row.format] = row.timeoutSeconds;
  }

  if (!setting) {
    return {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat,
      showCountdown: null,
    };
  }

  const occurrenceVisible =
    setting.occurrence !== null && scopedOwnerIds(userId).includes(setting.occurrence.ownerId);
  return {
    occurrenceId: occurrenceVisible ? setting.occurrenceId : null,
    rangeFrom: setting.rangeFrom,
    rangeTo: setting.rangeTo,
    format: setting.format,
    timeoutByFormat,
    showCountdown: setting.showCountdown,
  };
}

/** デフォルトを upsert する（QuizDefaultSetting 1 行 + 形式別 timeout 行を 1 トランザクションで同期）。 */
export async function saveQuizDefaultsForUser(userId: string, input: QuizDefaults): Promise<void> {
  if (input.occurrenceId !== null) {
    const occurrence = await prisma.occurrence.findFirst({
      where: { id: input.occurrenceId, ownerId: { in: scopedOwnerIds(userId) } },
      select: { id: true },
    });
    if (!occurrence) throw new DefaultOccurrenceNotInScopeError();
  }

  const { timeoutByFormat, ...settingInput } = input;

  await prisma.$transaction([
    prisma.quizDefaultSetting.upsert({
      where: { userId },
      create: { userId, ...settingInput },
      update: settingInput,
    }),
    // 形式別 timeout の同期: 値ありは upsert、null は行削除（= 制限なし）。
    ...ALL_QUIZ_FORMATS.map((format) => {
      const seconds = timeoutByFormat[format];
      if (seconds === null) {
        return prisma.quizDefaultTimeout.deleteMany({ where: { userId, format } });
      }
      return prisma.quizDefaultTimeout.upsert({
        where: { userId_format: { userId, format } },
        create: { userId, format, timeoutSeconds: seconds },
        update: { timeoutSeconds: seconds },
      });
    }),
  ]);
}

/** デフォルトを削除する（両テーブルとも未保存でも安全＝冪等）。 */
export async function clearQuizDefaultsForUser(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.quizDefaultSetting.deleteMany({ where: { userId } }),
    prisma.quizDefaultTimeout.deleteMany({ where: { userId } }),
  ]);
}
