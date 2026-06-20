import "server-only";

import { prisma } from "@/lib/prisma";
import { ALL_QUIZ_FORMATS } from "@/lib/quiz/format-options";
import { scopedOwnerIds } from "@/lib/system-user";
import type { QuizFormat } from "@/generated/prisma/enums";
import type { StartQuizInput } from "@/lib/schema/quiz";

/** テスト開始画面のデフォルト設定。全項目任意（null = 未設定）。 */
export type QuizDefaults = {
  occurrenceId: string | null;
  rangeFrom: number | null;
  rangeTo: number | null;
  format: QuizFormat | null;
  /** 出題形式ごとの制限時間（秒）。全形式キーを持ち、null = その形式は制限なし（行なし）。 */
  timeoutByFormat: Record<QuizFormat, number | null>;
  showCountdown: boolean | null;
  /** 発音の自動再生。null = 有効（デフォルト）。OFF（false）で出題時の自動再生を無効化する。 */
  autoplayPronunciation: boolean | null;
  /** 正誤の効果音。null = 有効（デフォルト）。OFF（false）で正解・不正解の効果音を無効化する。 */
  enableAnswerSound: boolean | null;
  /** 日→英の解答表示時の発音自動再生。null = 有効（デフォルト）。OFF（false）で解答表示時の発音再生を無効化する。 */
  autoplayAnswerAudioJaEn: boolean | null;
  /** 開始画面「この設定をデフォルト設定とする」トグルの初期状態。null = OFF（デフォルト）。 */
  saveOnStart: boolean | null;
};

/**
 * 開始フォームに渡すデフォルトの初期値。挙動設定（showCountdown / autoplay* /
 * enableAnswerSound）と saveOnStart は「初期値」ではなく別経路で扱うため除外する。
 */
export type StartFormDefaults = Omit<
  QuizDefaults,
  | "showCountdown"
  | "autoplayPronunciation"
  | "enableAnswerSound"
  | "autoplayAnswerAudioJaEn"
  | "saveOnStart"
>;

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

/** occurrence がユーザーの可視範囲にあることを検証する（範囲外なら throw）。 */
async function assertOccurrenceInScope(userId: string, occurrenceId: string): Promise<void> {
  const occurrence = await prisma.occurrence.findFirst({
    where: { id: occurrenceId, ownerId: { in: scopedOwnerIds(userId) } },
    select: { id: true },
  });
  if (!occurrence) throw new DefaultOccurrenceNotInScopeError();
}

/** 形式別デフォルト制限時間 1 行の同期 prisma 操作。null = 行削除（制限なし）、値あり = upsert。 */
function syncTimeout(userId: string, format: QuizFormat, seconds: number | null) {
  return seconds === null
    ? prisma.quizDefaultTimeout.deleteMany({ where: { userId, format } })
    : prisma.quizDefaultTimeout.upsert({
        where: { userId_format: { userId, format } },
        create: { userId, format, timeoutSeconds: seconds },
        update: { timeoutSeconds: seconds },
      });
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
      autoplayPronunciation: null,
      enableAnswerSound: null,
      autoplayAnswerAudioJaEn: null,
      saveOnStart: null,
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
    autoplayPronunciation: setting.autoplayPronunciation,
    enableAnswerSound: setting.enableAnswerSound,
    autoplayAnswerAudioJaEn: setting.autoplayAnswerAudioJaEn,
    saveOnStart: setting.saveOnStart,
  };
}

/** デフォルトを upsert する（QuizDefaultSetting 1 行 + 形式別 timeout 行を 1 トランザクションで同期）。 */
export async function saveQuizDefaultsForUser(userId: string, input: QuizDefaults): Promise<void> {
  if (input.occurrenceId !== null) await assertOccurrenceInScope(userId, input.occurrenceId);

  const { timeoutByFormat, ...settingInput } = input;

  await prisma.$transaction([
    prisma.quizDefaultSetting.upsert({
      where: { userId },
      create: { userId, ...settingInput },
      update: settingInput,
    }),
    // 形式別 timeout の同期: 値ありは upsert、null は行削除（= 制限なし）。
    ...ALL_QUIZ_FORMATS.map((format) => syncTimeout(userId, format, timeoutByFormat[format])),
  ]);
}

/**
 * 開始画面で設定した内容をデフォルトに上書きする（開始画面トグル ON でテスト開始時）。
 * 開始画面にある項目だけの部分更新: occurrence / range / format と、選択中形式の制限時間
 * のみを書き換える。他形式の制限時間・カウントダウン/発音/効果音などの挙動設定・saveOnStart
 * 自体は既存値を保持する（upsert の update に開始画面の 4 項目しか渡さないため温存される）。
 */
export async function saveStartSettingsAsDefaultsForUser(
  userId: string,
  input: StartQuizInput,
): Promise<void> {
  await assertOccurrenceInScope(userId, input.occurrenceId);

  // 開始画面にある項目のみ。rangeFrom / rangeTo は空欄が undefined のため null に正規化する。
  const settingInput = {
    occurrenceId: input.occurrenceId,
    rangeFrom: input.rangeFrom ?? null,
    rangeTo: input.rangeTo ?? null,
    format: input.format,
  };

  await prisma.$transaction([
    prisma.quizDefaultSetting.upsert({
      where: { userId },
      create: { userId, ...settingInput },
      update: settingInput,
    }),
    // 制限時間は選択中形式の 1 行だけ同期（null = 行削除 = 制限なし）。他形式の行には触れない。
    syncTimeout(userId, input.format, input.timeoutSeconds),
  ]);
}
