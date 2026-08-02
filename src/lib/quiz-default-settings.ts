import "server-only";

import { prisma } from "@/lib/prisma";
import { DEFAULT_QUIZ_SETTINGS } from "@/lib/quiz/default-settings";
import { ALL_QUIZ_FORMATS } from "@/lib/quiz/format-options";
import { scopedOwnerIds } from "@/lib/system-user";
import type { QuizFormat } from "@/generated/prisma/enums";
import type { StartQuizInput } from "@/lib/schema/quiz";

/** テスト開始画面のデフォルト設定。全項目任意（null = 未設定）。 */
export type QuizDefaults = {
  occurrenceId: string | null;
  rangeFrom: number | null;
  rangeTo: number | null;
  /** 「ブックマークのみ」絞り込みのデフォルト。null = アプリ既定 OFF。occurrence 削除で occurrenceId が null になっても残す（全件モードの初期値として成立）。 */
  bookmarkedOnly: boolean | null;
  /** 出題数のデフォルト。null = 未設定（範囲の全問出題）。掲載箇所に従属しないため occurrence 削除でも残す。 */
  questionCount: number | null;
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
  /** 四択（英→日）の選択肢で先頭の訳語のみ表示する。null = ON（デフォルト＝先頭の訳語のみ）。OFF（false）で全訳語を「; 」連結。 */
  choiceFirstMeaningTextOnly: boolean | null;
  /** 掲載番号の昇順に出題する。null = アプリ既定 OFF（＝ランダム）。掲載箇所を指定したときのみ有効（docs/adr/0072-quiz-order-by-occurrence-number.md）。 */
  orderByOccurrenceNumber: boolean | null;
  /** 定着モードに正答単語も含める（テスト結果画面トグルの初期値）。null = OFF（デフォルト＝誤答のみ）。true で正答も出題。 */
  drillIncludeCorrect: boolean | null;
  /** 定着までの回数（残数設定）の初期値。各 null = アプリ既定（誤答3 / うろ覚え2 / 正答1）。各 1..9。 */
  resetRemaining: number | null;
  vagueRemaining: number | null;
  initialCorrectRemaining: number | null;
  /** 開始画面「この設定をデフォルト設定とする」トグルの初期状態。null = OFF（デフォルト）。 */
  saveOnStart: boolean | null;
};

/**
 * 開始フォームに渡すデフォルトの初期値。挙動設定（showCountdown / autoplay* /
 * enableAnswerSound）と saveOnStart は「初期値」ではなく別経路で扱うため除外する。
 * choiceFirstMeaningTextOnly は挙動設定だが、選択肢の生成結果に影響し開始画面でも選べる
 * （StartQuizInput 経由で生成に渡す）ため、初期値として除外せず残す。
 * resetRemaining / vagueRemaining / initialCorrectRemaining（定着までの回数）は開始フォームでは使わないが、
 * テスト結果画面「定着までの回数」の初期値として QuizFlow が消費する（initialDrillRemaining）ため除外せず残す。
 */
export type StartFormDefaults = Omit<
  QuizDefaults,
  | "showCountdown"
  | "autoplayPronunciation"
  | "enableAnswerSound"
  | "autoplayAnswerAudioJaEn"
  | "drillIncludeCorrect"
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
      bookmarkedOnly: null,
      questionCount: null,
      format: null,
      timeoutByFormat,
      showCountdown: null,
      autoplayPronunciation: null,
      enableAnswerSound: null,
      autoplayAnswerAudioJaEn: null,
      choiceFirstMeaningTextOnly: null,
      orderByOccurrenceNumber: null,
      drillIncludeCorrect: null,
      resetRemaining: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
      saveOnStart: null,
    };
  }

  const occurrenceVisible =
    setting.occurrence !== null && scopedOwnerIds(userId).includes(setting.occurrence.ownerId);
  return {
    occurrenceId: occurrenceVisible ? setting.occurrenceId : null,
    rangeFrom: setting.rangeFrom,
    rangeTo: setting.rangeTo,
    // occurrence 削除（SetNull）で occurrenceId が null になっても bookmarkedOnly は残す（決定 6）。
    bookmarkedOnly: setting.bookmarkedOnly,
    questionCount: setting.questionCount,
    format: setting.format,
    timeoutByFormat,
    showCountdown: setting.showCountdown,
    autoplayPronunciation: setting.autoplayPronunciation,
    enableAnswerSound: setting.enableAnswerSound,
    autoplayAnswerAudioJaEn: setting.autoplayAnswerAudioJaEn,
    choiceFirstMeaningTextOnly: setting.choiceFirstMeaningTextOnly,
    // 掲載番号順も occurrence 削除（SetNull）で occurrenceId が null になっても残す
    // （掲載箇所を選び直せばそのまま効く。bookmarkedOnly と同じ扱い）。
    orderByOccurrenceNumber: setting.orderByOccurrenceNumber,
    drillIncludeCorrect: setting.drillIncludeCorrect,
    resetRemaining: setting.resetRemaining,
    vagueRemaining: setting.vagueRemaining,
    initialCorrectRemaining: setting.initialCorrectRemaining,
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
 * 開始画面にある項目だけの部分更新: occurrence / range / format / 四択先頭訳語のみ表示
 * （choiceFirstMeaningTextOnly）/ 掲載番号順（orderByOccurrenceNumber）と、選択中形式の制限時間のみを書き換える。他形式の制限時間・
 * カウントダウン/発音/効果音などの挙動設定・定着までの回数（残数設定）・saveOnStart 自体は既存値を保持する
 * （upsert の update に開始画面の項目しか渡さないため温存される）。
 *
 * 例外として「初回保存」（QuizDefaultSetting も QuizDefaultTimeout も未存在）のときだけは、
 * 選択中形式に加えて推奨デフォルト（DEFAULT_QUIZ_SETTINGS.timeoutByFormat）の全形式 timeout も
 * 確立する。未保存時の開始画面は推奨デフォルトを「全形式に制限時間が入っている」状態で表示する
 * が、選択中 1 形式だけ書くと残りが「行なし = 制限なし」に化け、再訪問時に未選択形式の制限時間が
 * 消えて見える。初回のみ全形式を確立し、画面表示と保存後の再構築状態を一致させる。
 */
export async function saveStartSettingsAsDefaultsForUser(
  userId: string,
  input: StartQuizInput,
): Promise<void> {
  // 掲載箇所ありのときだけ可視性を検証する（全件モードは掲載箇所を指定しない）。
  const occurrenceId = input.occurrenceId ?? null;
  if (occurrenceId !== null) await assertOccurrenceInScope(userId, occurrenceId);

  // 開始画面にある項目のみ。rangeFrom / rangeTo は空欄が undefined のため null に正規化する。
  const settingInput = {
    occurrenceId,
    rangeFrom: input.rangeFrom ?? null,
    rangeTo: input.rangeTo ?? null,
    // 「ブックマークのみ」も開始画面項目。省略時 false（決定 6）。
    bookmarkedOnly: input.bookmarkedOnly ?? false,
    // 出題数も開始画面項目。空欄（undefined）は「全問出題」の意思として null で上書きする。
    questionCount: input.questionCount ?? null,
    format: input.format,
    choiceFirstMeaningTextOnly: input.choiceFirstMeaningTextOnly,
    // 「掲載番号順に出題する」も開始画面項目。省略時 false（bookmarkedOnly と同じ流儀）。
    orderByOccurrenceNumber: input.orderByOccurrenceNumber ?? false,
  };

  // 初回保存（設定行・timeout 行ともゼロ）の判定。getQuizDefaultsForUser が null を返す状態。
  const [existingSetting, existingTimeoutCount] = await Promise.all([
    prisma.quizDefaultSetting.findUnique({ where: { userId }, select: { userId: true } }),
    prisma.quizDefaultTimeout.count({ where: { userId } }),
  ]);
  const isFirstSave = !existingSetting && existingTimeoutCount === 0;

  // 通常は選択中形式の 1 行だけ同期（他形式の行には触れない）。初回のみ推奨デフォルトで全形式を
  // 確立し、選択中形式だけ開始画面の入力値で上書きする。null = 行削除（= 制限なし）。
  const timeoutOps = isFirstSave
    ? ALL_QUIZ_FORMATS.map((format) =>
        syncTimeout(
          userId,
          format,
          format === input.format
            ? input.timeoutSeconds
            : DEFAULT_QUIZ_SETTINGS.timeoutByFormat[format],
        ),
      )
    : [syncTimeout(userId, input.format, input.timeoutSeconds)];

  await prisma.$transaction([
    prisma.quizDefaultSetting.upsert({
      where: { userId },
      create: { userId, ...settingInput },
      update: settingInput,
    }),
    ...timeoutOps,
  ]);
}
