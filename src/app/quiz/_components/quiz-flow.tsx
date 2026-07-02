"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AudioPlayButton } from "@/components/audio-play-button";
import { ScreenHeader } from "@/components/screen-header";
import { useTtsFallbackEnabled } from "@/components/tts-fallback-context";
import { isJaToEnFormat, isSelfJudgeFormat } from "@/lib/quiz/format-options";
import {
  DEFAULT_INITIAL_CORRECT_REMAINING,
  DEFAULT_RESET_REMAINING,
  DEFAULT_VAGUE_REMAINING,
  parseRemainingCount,
} from "@/lib/quiz/remaining-options";
import { cancelSpeech, speakEnglish } from "@/lib/speech";
import type { QuizMode, QuizResult } from "@/generated/prisma/enums";
import type { ActiveDrill } from "@/lib/drill-list";
import type { StartFormDefaults } from "@/lib/quiz-default-settings";
import type { QuizPayload } from "@/lib/quiz/payload";
import type { StartQuizInput } from "@/lib/schema/quiz";

import {
  getQuizPreview,
  startDrill,
  startDrillRetry,
  startDrillRound,
  startQuiz,
  submitDrillRetry,
  submitDrillRound,
  submitQuizAnswers,
} from "../actions";
import {
  AnswerFeedbackOverlay,
  feedbackKindForResult,
  type Feedback,
} from "./answer-feedback-overlay";
import { playAnswerSound } from "./answer-sound";
import { Countdown } from "./countdown";
import { QuestionChoice } from "./question-choice";
import { QuestionMultiMeaning } from "./question-multi-meaning";
import type { QuestionOutcome } from "./question-outcome";
import { QuestionSelfJudge } from "./question-self-judge";
import { QuestionSelfJudgeJaEn } from "./question-self-judge-ja-en";
import { QuestionSpelling } from "./question-spelling";
import {
  ResultList,
  type DrillRemainingText,
  type ResultRow,
  type SourceTestPreview,
  type SubmitState,
} from "./result-list";
import { StartForm, type OccurrenceOption } from "./start-form";
import { WordDetailButton } from "./word-detail-button";
import { WordDetailDialog } from "./word-detail-dialog";

type Props = {
  occurrences: OccurrenceOption[];
  activeDrills: ActiveDrill[];
  /** 開始フォームの初期値。未保存ユーザーには page.tsx が推奨デフォルトを解決して渡す。 */
  defaults: StartFormDefaults;
  /** カウントダウン演出の表示（設定画面のみで変更。開始フォームには出さない）。 */
  showCountdown: boolean;
  /** 発音の自動再生（設定画面のみで変更）。false で出題時の自動再生を無効化する。 */
  autoplayPronunciation: boolean;
  /** 正誤の効果音（設定画面のみで変更）。false で正解・不正解の効果音を無効化する。 */
  enableAnswerSound: boolean;
  /** 日→英の解答表示時の発音自動再生（設定画面のみで変更）。false で無効化する。 */
  autoplayAnswerAudioJaEn: boolean;
  /** 開始画面「この設定をデフォルト設定とする」トグルの初期状態（設定画面のメタ設定由来）。 */
  saveAsDefaultInitial: boolean;
  /** テスト結果画面「正解した問題も定着モードで出題する」トグルの初期状態（設定画面由来）。false = 誤答のみ。 */
  drillIncludeCorrectInitial: boolean;
};

/** クライアント状態機械: start → countdown → play → result（URL 遷移しない）。 */
type Phase =
  | { name: "start" }
  | { name: "countdown" }
  | { name: "play"; index: number }
  | { name: "result" };

/** 進行中の drill（DRILL モードのラウンド生成・送信に使う）。 */
type DrillState = {
  drillId: string;
  /** 直近の `startDrillRound` 応答の roundCount（ラウンド送信の CAS 期待値）。 */
  expectedRoundCount: number;
  /** 元テストの開始入力（完了画面の「同じ範囲でもう一度テストする」に使う。サーバー供給）。 */
  sourceTest: StartQuizInput;
  /** 掲載箇所名（完了画面の元テスト範囲表示に使う。サーバー供給）。 */
  occurrenceName: string;
};

/**
 * 完了画面の元テスト範囲ラベル（進行中一覧 `ActiveDrillRow` の表記に合わせる）。
 * 例: 「本A No.1〜100」「本A No.1〜」「本A（範囲指定なし）」
 */
function sourceTestLabelOf(drill: DrillState): string {
  const { rangeFrom, rangeTo } = drill.sourceTest;
  if (rangeFrom === undefined && rangeTo === undefined) {
    return `${drill.occurrenceName}（範囲指定なし）`;
  }
  return `${drill.occurrenceName} No.${rangeFrom ?? ""}〜${rangeTo ?? ""}`;
}

/**
 * 音声プリロード（05-architecture.md 決定 10）: payload 内の発音音源 URL を
 * `new Audio(url)` で生成・保持して先読みする。取得失敗は無視して進行に影響させない。
 */
function preloadAudio(
  cache: Map<string, HTMLAudioElement>,
  url: string | null,
): HTMLAudioElement | null {
  if (!url) return null;
  const cached = cache.get(url);
  if (cached) return cached;
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = url;
  audio.load();
  cache.set(url, audio);
  return audio;
}

/** 結果一覧の「正解」表示文字列を payload から導出する。 */
function correctAnswerDisplay(quiz: QuizPayload, index: number): string {
  switch (quiz.format) {
    case "CHOICE": {
      const question = quiz.questions[index];
      return question.choices[question.correctIndex]?.text ?? "";
    }
    case "SELF_JUDGE": {
      // 最初の Meaning の MeaningText を「; 」連結（04-ui.md「結果一覧画面（テスト）」）
      const question = quiz.questions[index];
      return question.answer[0]?.texts.join("; ") ?? "";
    }
    case "MULTI_MEANING": {
      // 正解集合（payload の正解選択肢）を「; 」連結
      const question = quiz.questions[index];
      return question.options
        .filter((option) => option.isCorrect)
        .map((option) => option.text)
        .join("; ");
    }
    case "CHOICE_JA_EN": {
      const question = quiz.questions[index];
      return question.choices[question.correctIndex]?.text ?? "";
    }
    case "SELF_JUDGE_JA_EN":
    case "SPELLING":
      // 日本語→英語の正解は英単語（headword）
      return quiz.questions[index].headword;
  }
}

/** 日本語→英語の問題文（最初の Meaning を「; 」連結した文字列）。英語→日本語形式は null（問題文は headword）。 */
function jaEnPromptOf(quiz: QuizPayload, index: number): string | null {
  // 全形式を列挙し default を置かないことで、形式追加時の更新漏れを型で検出する
  // （英語→日本語は問題文が headword のため null）。
  switch (quiz.format) {
    case "CHOICE":
    case "SELF_JUDGE":
    case "MULTI_MEANING":
      return null;
    case "CHOICE_JA_EN":
    case "SELF_JUDGE_JA_EN":
    case "SPELLING":
      return quiz.questions[index].prompt;
  }
}

function QuestionView({
  quiz,
  index,
  onComplete,
  onReveal,
  onAnswerReveal,
  onAnswerShown,
  onShowDetail,
}: {
  quiz: QuizPayload;
  index: number;
  onComplete: (outcome: QuestionOutcome) => void;
  /** 正誤が確定した瞬間に 1 回だけ呼ばれる（フラッシュ＋効果音は QuizFlow が集中処理）。 */
  onReveal: (result: QuizResult) => void;
  /** 解答（英単語）が画面に現れた瞬間に 1 回だけ呼ばれる（日→英のみ。発音再生は QuizFlow が集中処理）。 */
  onAnswerReveal: () => void;
  /** 解答が画面に現れた瞬間に呼ばれる（英→日。上部見出し語の「詳細」ボタン表示ゲートに使う）。 */
  onAnswerShown: () => void;
  /** 「詳細」ボタンのタップ（日→英。解答の英単語の隣に置く）。現在問題の wordId に束縛済み。 */
  onShowDetail: () => void;
}) {
  // key=wordId で問題ごとに解答 UI の内部状態（タイマー含む）をリセットする
  switch (quiz.format) {
    case "CHOICE": {
      const question = quiz.questions[index];
      return (
        <QuestionChoice
          key={question.wordId}
          question={question}
          timeoutSeconds={quiz.timeoutSeconds}
          onComplete={onComplete}
          onReveal={onReveal}
          onAnswerShown={onAnswerShown}
        />
      );
    }
    case "SELF_JUDGE": {
      const question = quiz.questions[index];
      return (
        <QuestionSelfJudge
          key={question.wordId}
          question={question}
          timeoutSeconds={quiz.timeoutSeconds}
          onComplete={onComplete}
          onReveal={onReveal}
          onAnswerShown={onAnswerShown}
        />
      );
    }
    case "MULTI_MEANING": {
      const question = quiz.questions[index];
      return (
        <QuestionMultiMeaning
          key={question.wordId}
          question={question}
          timeoutSeconds={quiz.timeoutSeconds}
          onComplete={onComplete}
          onReveal={onReveal}
          onAnswerShown={onAnswerShown}
        />
      );
    }
    case "CHOICE_JA_EN": {
      // 選択肢が英単語になるだけで挙動は四択と同一のため QuestionChoice を共用する
      const question = quiz.questions[index];
      return (
        <QuestionChoice
          key={question.wordId}
          question={question}
          timeoutSeconds={quiz.timeoutSeconds}
          onComplete={onComplete}
          onReveal={onReveal}
          onAnswerReveal={onAnswerReveal}
          onShowDetail={onShowDetail}
          showCorrectAudio
        />
      );
    }
    case "SELF_JUDGE_JA_EN": {
      const question = quiz.questions[index];
      return (
        <QuestionSelfJudgeJaEn
          key={question.wordId}
          question={question}
          timeoutSeconds={quiz.timeoutSeconds}
          onComplete={onComplete}
          onReveal={onReveal}
          onAnswerReveal={onAnswerReveal}
          onShowDetail={onShowDetail}
        />
      );
    }
    case "SPELLING": {
      const question = quiz.questions[index];
      return (
        <QuestionSpelling
          key={question.wordId}
          question={question}
          timeoutSeconds={quiz.timeoutSeconds}
          onComplete={onComplete}
          onReveal={onReveal}
          onAnswerReveal={onAnswerReveal}
          onShowDetail={onShowDetail}
        />
      );
    }
  }
}

/** 「定着までの回数」編集テキストの初期値（デフォルト設定→未設定はアプリ既定 3 / 2 / 1）。 */
function initialDrillRemaining(defaults: StartFormDefaults): DrillRemainingText {
  return {
    reset: (defaults.resetRemaining ?? DEFAULT_RESET_REMAINING).toString(),
    vague: (defaults.vagueRemaining ?? DEFAULT_VAGUE_REMAINING).toString(),
    initialCorrect: (
      defaults.initialCorrectRemaining ?? DEFAULT_INITIAL_CORRECT_REMAINING
    ).toString(),
  };
}

export function QuizFlow({
  occurrences,
  activeDrills,
  defaults,
  showCountdown,
  autoplayPronunciation,
  enableAnswerSound,
  autoplayAnswerAudioJaEn,
  saveAsDefaultInitial,
  drillIncludeCorrectInitial,
}: Props) {
  const router = useRouter();
  // 発音音源が無いとき自動音声で代用する設定（出題時／解答表示時の自動再生に使う）
  const ttsFallbackEnabled = useTtsFallbackEnabled();
  // TEST / DRILL / DRILL_RETRY は同じ状態機械を mode 違いで再利用する（06-drill-mode.md 決定 8・10）
  const [mode, setMode] = useState<QuizMode>("TEST");
  const [phase, setPhase] = useState<Phase>({ name: "start" });
  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [submitState, setSubmitState] = useState<SubmitState | null>(null);
  // テスト開始時の入力。drill 生成（occurrenceId・元テスト範囲の申告）と TEST 結果画面の
  // 「同じ範囲でもう一度テストする」の再開始入力に使う。再開経路の drill では null のまま
  // （完了画面の再テストは drill.sourceTest を使うため影響しない）
  const [startInput, setStartInput] = useState<StartQuizInput | null>(null);
  // テスト結果画面「正解した問題も定着モードで出題する」トグル。テスト開始ごとに設定デフォルトへ戻す。
  const [drillIncludeCorrect, setDrillIncludeCorrect] = useState(drillIncludeCorrectInitial);
  // テスト結果画面「定着までの回数」の編集テキスト。テスト開始ごとに設定デフォルトへ戻す。
  const [drillRemaining, setDrillRemaining] = useState<DrillRemainingText>(() =>
    initialDrillRemaining(defaults),
  );
  const [drill, setDrill] = useState<DrillState | null>(null);
  // 直近のラウンド送信で drill が完了（全卒業）したか。再テスト結果画面の「次のラウンドへ」の
  // 表示判定に使う（再テスト送信の応答には完了情報が含まれないため、ラウンド送信時の値を保持する）。
  const [drillCompleted, setDrillCompleted] = useState(false);
  // 完了画面の「同じ範囲でもう一度テストする」直上に出す対象件数（getQuizPreview のライブ値）。
  // null = 取得前・取得中（完了画面では「確認中…」表示）。
  const [sourceTestPreview, setSourceTestPreview] = useState<SourceTestPreview | null>(null);
  // 対象件数の重複取得ガード（実行世代 × drill 単位で 1 回。state を挟まず effect 内で同期判定する）
  const sourceTestFetchKeyRef = useRef<string | null>(null);
  // 結果一覧・出題中に開いている単語詳細ダイアログの単語 ID スタック（空 = 閉。back ガードの最上段の層）。
  // 末尾が現在表示中の単語。関連語タップで push、ブラウザバックで 1 語ずつ pop し、空になるとダイアログが閉じる。
  const [dialogStack, setDialogStack] = useState<string[]>([]);
  const dialogWordId = dialogStack.at(-1) ?? null;
  // 出題中、現在の問題の解答が画面に出たか（英→日の上部見出し語に「詳細」ボタンを出すゲート）。
  const [answerShown, setAnswerShown] = useState(false);
  // テスト実行の世代番号。リセット後に届いた古い応答を捨てる
  const runIdRef = useRef(0);
  const audioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  // 正誤フラッシュ（中央オーバーレイ）。null = 非表示
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const feedbackKeyRef = useRef(0);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** countdown へ遷移する前の共通リセット（payload・結果・送信状態を破棄）。 */
  function resetRunState() {
    setQuiz(null);
    setLoadError(null);
    setRows([]);
    setSubmitState(null);
    // 完了画面の対象件数は結果画面ごとに取り直す（表示時点のライブ値を出すため）
    setSourceTestPreview(null);
    // 新しい出題に備えて「詳細」ボタンを解答前の非表示状態へ戻す
    setAnswerShown(false);
  }

  function handleStart(input: StartQuizInput) {
    const runId = ++runIdRef.current;
    setMode("TEST");
    setDrill(null);
    setDrillCompleted(false);
    setStartInput(input);
    // 結果画面の設定（正解も出題トグル・定着までの回数）は各テスト開始時に設定デフォルトへ戻す
    setDrillIncludeCorrect(drillIncludeCorrectInitial);
    setDrillRemaining(initialDrillRemaining(defaults));
    resetRunState();
    setPhase({ name: "countdown" });
    // カウントダウンの裏で問題データを一括取得し、取得完了後ただちに第 1 問の音声をプリロード
    void startQuiz(input).then((result) => {
      if (runId !== runIdRef.current) return;
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      setQuiz(result.quiz);
      preloadAudio(audioCacheRef.current, result.quiz.questions[0]?.pronunciationAudioUrl ?? null);
    });
  }

  /** drill ラウンド生成（初回・再開・次ラウンドとも単一経路）。countdown の裏で取得する。 */
  function loadDrillRound(drillId: string, runId: number) {
    void startDrillRound({ drillId }).then((result) => {
      if (runId !== runIdRef.current) return;
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      setDrill({
        drillId,
        expectedRoundCount: result.roundCount,
        sourceTest: result.sourceTest,
        occurrenceName: result.occurrenceName,
      });
      setQuiz(result.quiz);
      preloadAudio(audioCacheRef.current, result.quiz.questions[0]?.pronunciationAudioUrl ?? null);
    });
  }

  /** テスト結果画面の「定着モードをはじめる」: drill 生成 → ラウンド 1 のカウントダウンへ。 */
  function handleStartDrill() {
    if (quiz === null || startInput === null) return;
    // drill 生成は履歴の確定が前提（result-list 側でも送信成功までボタンを無効化している）
    if (submitState?.status !== "success") return;
    // 結果画面で入力された「定着までの回数」を 1..9 へ解決する（未確定は result-list 側でもボタン無効）。
    // 「正解した問題」の回数は出題トグル ON のときだけ必須。OFF では正解語を投入しないため未使用だが、
    // startDrill は 1..9 を要求するので既定値にフォールバックして必ず有効値を送る。
    const resetRemaining = parseRemainingCount(drillRemaining.reset);
    const vagueRemaining = parseRemainingCount(drillRemaining.vague);
    const parsedCorrect = parseRemainingCount(drillRemaining.initialCorrect);
    const initialCorrectRemaining = drillIncludeCorrect
      ? parsedCorrect
      : (parsedCorrect ?? DEFAULT_INITIAL_CORRECT_REMAINING);
    if (
      resetRemaining === undefined ||
      vagueRemaining === undefined ||
      initialCorrectRemaining === undefined
    ) {
      return;
    }
    const input = {
      occurrenceId: startInput.occurrenceId,
      // 元テストの範囲を Drill に保存する（完了画面の「同じ範囲でもう一度テストする」用）
      sourceRangeFrom: startInput.rangeFrom,
      sourceRangeTo: startInput.rangeTo,
      format: quiz.format,
      // 元テストの制限時間を Drill に保存し、全ラウンドで引き継ぐ
      timeoutSeconds: quiz.timeoutSeconds,
      // 元テストの「四択で先頭の訳語のみ表示」設定も Drill に保存して引き継ぐ
      choiceFirstMeaningTextOnly: startInput.choiceFirstMeaningTextOnly,
      // 結果画面トグル: false（既定）= 誤答のみ、true で正答も出題
      drillIncludeCorrect,
      // 結果画面で設定した定着までの回数（残数設定）を Drill に保存し、生成・全ラウンドで引き継ぐ
      resetRemaining,
      vagueRemaining,
      initialCorrectRemaining,
      // result をそのまま渡し、投入要否（CORRECT のみトグル依存）と初期残数は drill-create が導出する
      results: rows.map((row) => ({ wordId: row.wordId, result: row.result })),
    };
    const runId = ++runIdRef.current;
    setMode("DRILL");
    setDrill(null);
    setDrillCompleted(false);
    resetRunState();
    setPhase({ name: "countdown" });
    void startDrill(input).then((result) => {
      if (runId !== runIdRef.current) return;
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      loadDrillRound(result.drillId, runId);
    });
  }

  /** 開始画面の進行中一覧からの「再開」: カウントダウン → 次ラウンド。 */
  function handleResumeDrill(drillId: string) {
    const runId = ++runIdRef.current;
    setMode("DRILL");
    setDrill(null);
    setDrillCompleted(false);
    resetRunState();
    setPhase({ name: "countdown" });
    loadDrillRound(drillId, runId);
  }

  /** drill ラウンド結果画面（再テスト結果画面含む）の「次のラウンドへ」: カウントダウンから再開。 */
  function handleNextRound() {
    if (drill === null) return;
    const runId = ++runIdRef.current;
    // 再テスト（DRILL_RETRY）結果からも呼ばれるため、通常ラウンドのモードへ戻す
    setMode("DRILL");
    resetRunState();
    setPhase({ name: "countdown" });
    loadDrillRound(drill.drillId, runId);
  }

  /**
   * 結果画面の再テスト導線。
   * - TEST: 「同じ範囲でもう一度テストする」— 同じ開始入力（掲載箇所・範囲・形式・制限時間）で
   *   新しい通常テストを開始する（既存の `handleStart` 経路の再利用。履歴も TEST のまま）
   * - DRILL / DRILL_RETRY: 「同じ問題でもう一度テストする」— 直前のラウンド（または再テスト）と
   *   同じ単語セットで、残数に影響しない再テストを開始する（06-drill-mode.md 決定 10）。
   *   wordIds は結果画面の rows（＝直前の出題セット）から拾い、サーバーへクライアント申告する
   */
  function handleStartRetry() {
    // 履歴の確定（送信成功）が前提。result-list 側でもボタンを無効化している
    if (mode === "TEST") {
      if (startInput === null || submitState?.status !== "success") return;
      handleStart(startInput);
      return;
    }
    if (drill === null) return;
    const submitted =
      mode === "DRILL"
        ? submitState?.status === "drill-success"
        : mode === "DRILL_RETRY" && submitState?.status === "success";
    if (!submitted) return;
    // resetRunState() が rows を消すため、先に出題セットを捕捉する
    const wordIds = rows.map((row) => row.wordId);
    if (wordIds.length === 0) return;
    const runId = ++runIdRef.current;
    setMode("DRILL_RETRY");
    resetRunState();
    setPhase({ name: "countdown" });
    void startDrillRetry({ drillId: drill.drillId, wordIds }).then((result) => {
      if (runId !== runIdRef.current) return;
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      setQuiz(result.quiz);
      preloadAudio(audioCacheRef.current, result.quiz.questions[0]?.pronunciationAudioUrl ?? null);
    });
  }

  /**
   * 定着完了画面の「同じ範囲でもう一度テストする」: 元テストの開始入力（範囲・形式・制限時間）で
   * 新しい通常テストを開始する（06-drill-mode.md 決定 11）。TEST の再テストと違い `startInput` は
   * 再開経路で null のため、`startDrillRound` 応答由来の `drill.sourceTest` を使う。
   */
  function handleStartSourceTest() {
    if (drill === null || !drillCompleted) return;
    // 履歴の確定（送信成功）が前提。result-list 側でもボタンを無効化している
    const submitted =
      mode === "DRILL"
        ? submitState?.status === "drill-success"
        : mode === "DRILL_RETRY" && submitState?.status === "success";
    if (!submitted) return;
    handleStart(drill.sourceTest);
  }

  function resetToStart() {
    runIdRef.current += 1;
    audioCacheRef.current.clear();
    setMode("TEST");
    setDrill(null);
    setDrillCompleted(false);
    setStartInput(null);
    setDialogStack([]);
    resetRunState();
    setPhase({ name: "start" });
    // 進行中の定着モード一覧（server 取得）を最新化する（完了・残数進行・新規生成を反映）
    router.refresh();
  }

  function submitAnswers(format: QuizPayload["format"], allRows: ResultRow[]) {
    const runId = runIdRef.current;
    setSubmitState({ status: "sending" });
    if (mode === "DRILL_RETRY") {
      // DRILL_RETRY: 履歴保存のみ（残数・roundCount・completedAt に触れない。06-drill-mode.md 決定 10）。
      // TEST と同じ success 変種を使うことで削除済みバッジ・送信ゲートをそのまま再利用する
      if (drill === null) return;
      void submitDrillRetry({
        drillId: drill.drillId,
        answers: allRows.map((row) => ({ wordId: row.wordId, result: row.result })),
      }).then((result) => {
        if (runId !== runIdRef.current) return;
        if (result.ok) {
          setSubmitState({ status: "success", skippedWordIds: result.skippedWordIds });
        } else {
          setSubmitState({ status: "error", message: result.message });
        }
      });
      return;
    }
    if (mode === "DRILL") {
      // DRILL: ラウンド送信（履歴一括保存＋残数更新。roundCount CAS で冪等）
      if (drill === null) return;
      void submitDrillRound({
        drillId: drill.drillId,
        expectedRoundCount: drill.expectedRoundCount,
        answers: allRows.map((row) => ({ wordId: row.wordId, result: row.result })),
      }).then((result) => {
        if (runId !== runIdRef.current) return;
        if (result.ok) {
          // 完了（全卒業）フラグの持ち主はこの state（result-list へは props で渡す）
          setDrillCompleted(result.completed);
          setSubmitState({ status: "drill-success", remaining: result.remaining });
        } else {
          setSubmitState({ status: "error", message: result.message });
        }
      });
      return;
    }
    void submitQuizAnswers({
      format,
      answers: allRows.map((row) => ({ wordId: row.wordId, result: row.result })),
    }).then((result) => {
      if (runId !== runIdRef.current) return;
      if (result.ok) {
        setSubmitState({ status: "success", skippedWordIds: result.skippedWordIds });
      } else {
        setSubmitState({ status: "error", message: result.message });
      }
    });
  }

  /**
   * 正誤が確定した瞬間（onReveal）に中央フラッシュ＋効果音を出す。集中処理にすることで
   * 自己判定の即時 onComplete（次問へ遷移）でもオーバーレイが生き残る。
   * GAVE_UP（わからない）・VAGUE（うろ覚え）は kind=null で表示も音もなし。
   * 自己判定形式の本人申告（CORRECT/INCORRECT）も演出なし（本人が正誤を把握済みのため）。
   */
  function handleReveal(result: QuizResult) {
    const kind = feedbackKindForResult(result);
    if (kind === null) return;
    // 自己判定形式で本人が押した正誤判定（合っていた/間違っていた）は、ユーザー自身が
    // 正誤を分かっているためフラッシュ・効果音を出さない。時間切れ(TIMEOUT)は本人の
    // 判定ではないため従来どおり × を出す。
    if (quiz !== null && isSelfJudgeFormat(quiz.format) && result !== "TIMEOUT") return;
    feedbackKeyRef.current += 1;
    setFeedback({ kind, key: feedbackKeyRef.current });
    if (enableAnswerSound) playAnswerSound(kind);
    if (feedbackTimerRef.current !== null) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 800);
  }

  /**
   * 日→英で解答（英単語）が画面に現れた瞬間（onAnswerReveal）に発音を自動再生する。
   * 出題時の発音再生は解答漏れのため抑止しているが、解答が見えた後なら漏れないため
   * ここで再生する。OFF 設定・音源なし・再生ブロック時はスキップ（手動の再生ボタンは従来どおり）。
   */
  function handleAnswerReveal() {
    if (!autoplayAnswerAudioJaEn) return;
    if (phase.name !== "play" || quiz === null) return;
    const question = quiz.questions[phase.index];
    const audio = preloadAudio(audioCacheRef.current, question?.pronunciationAudioUrl ?? null);
    if (audio) {
      audio.currentTime = 0;
      void audio.play().catch(() => {});
      return;
    }
    // 発音音源が無いときは自動音声フォールバック（設定 ON のとき）で読み上げる
    if (ttsFallbackEnabled && question?.headword) speakEnglish(question.headword);
  }

  // アンマウント時に保留中のフラッシュ消去タイマーを解放する
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  // 完了状態の結果画面で「同じ範囲でもう一度テストする」の対象件数を取得する
  // （表示時点のライブ値。開始画面のプレビューと同じ getQuizPreview を再利用）。
  // 重複取得は fetchKey（実行世代 × drill）の ref で防ぎ、古い応答は runId で捨てる。
  // 取得失敗は範囲ラベルのみの表示になるだけでボタンには影響しない。
  useEffect(() => {
    if (phase.name !== "result" || !drillCompleted || drill === null) return;
    const runId = runIdRef.current;
    const fetchKey = `${runId}:${drill.drillId}`;
    if (sourceTestFetchKeyRef.current === fetchKey) return;
    sourceTestFetchKeyRef.current = fetchKey;
    const { occurrenceId, rangeFrom, rangeTo } = drill.sourceTest;
    void getQuizPreview({ occurrenceId, rangeFrom, rangeTo }).then((result) => {
      if (runId !== runIdRef.current) return;
      setSourceTestPreview(
        result.ok
          ? { status: "ready", targetCount: result.preview.targetCount }
          : { status: "error" },
      );
    });
  }, [phase.name, drillCompleted, drill]);

  function handleQuestionComplete(outcome: QuestionOutcome) {
    if (phase.name !== "play" || quiz === null) return;
    const index = phase.index;
    const question = quiz.questions[index];
    const nextRows: ResultRow[] = [
      ...rows,
      {
        wordId: question.wordId,
        headword: question.headword,
        prompt: jaEnPromptOf(quiz, index),
        correctDisplay: correctAnswerDisplay(quiz, index),
        result: outcome.result,
        answerDisplay: outcome.answerDisplay,
        pronunciationAudioUrl: question.pronunciationAudioUrl,
      },
    ];
    setRows(nextRows);
    if (index + 1 < quiz.questions.length) {
      // 次問では解答前に戻すため「詳細」ボタンを隠す
      setAnswerShown(false);
      setPhase({ name: "play", index: index + 1 });
      return;
    }
    // 履歴送信は結果画面の表示時に一括送信（single-flight。再送は失敗確定後のみ）
    setPhase({ name: "result" });
    submitAnswers(quiz.format, nextRows);
  }

  function handleResend() {
    if (quiz === null || submitState?.status !== "error") return;
    submitAnswers(quiz.format, rows);
  }

  // beforeunload ガード: リロード・タブ閉じで途中結果が失われる局面（送信完了前）のみ警告する
  const submitted = submitState?.status === "success" || submitState?.status === "drill-success";
  const dataLossActive =
    phase.name === "countdown" || phase.name === "play" || (phase.name === "result" && !submitted);

  useEffect(() => {
    if (!dataLossActive) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // 独自テキストは近年のブラウザでは表示されないが、確認ダイアログ自体は出る
      e.preventDefault();
      e.returnValue = "途中の結果は破棄されます";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dataLossActive]);

  // ブラウザバックのガード（LIFO・単一オーナー）。/quiz 内で開いている「層」の数だけ
  // ダミー履歴エントリを積み、ブラウザバック 1 回で最上段の層を 1 つだけ閉じる。
  //   層 = 進行中テスト（phase ≠ start）＋ 単語詳細ダイアログのスタック各段（dialogStack の要素数。result の最上段）。
  // 重要: ダミーの新規 push は必ず "コミット phase の effect"（reconcile）で行う。Next 16 は popstate を
  // 監視して router を restore する（app-router.js）ため、popstate ハンドラの "中で" pushState すると
  // その同一イベントの restore に巻き込まれてエントリが確定せず、履歴が壊れる（実機で観測済み）。
  // 一方、back で消費したダミーは forward 側に残るので、「留まる」時はハンドラ内で history.forward() を
  // 使い、既存エントリへ戻して再武装する（pushState のような新規生成をしないため Next と競合しない）。
  const guardDepth = (phase.name !== "start" ? 1 : 0) + dialogStack.length;
  // ハンドラからは最新値を latest-ref 経由で読む（render 中に ref を書かず、dep 無し effect で同期）。
  const phaseRef = useRef(phase);
  const modeRef = useRef(mode);
  const drillCompletedRef = useRef(drillCompleted);
  const dialogStackRef = useRef(dialogStack);
  const resetToStartRef = useRef(resetToStart);
  const guardDepthRef = useRef(guardDepth);
  // armedRef: 現在積んでいるダミー数。pendingSelfBackRef: 自前 back/forward 由来で無視する popstate 数。
  const armedRef = useRef(0);
  const pendingSelfBackRef = useRef(0);
  useEffect(() => {
    phaseRef.current = phase;
    modeRef.current = mode;
    drillCompletedRef.current = drillCompleted;
    dialogStackRef.current = dialogStack;
    resetToStartRef.current = resetToStart;
    guardDepthRef.current = guardDepth;
  });

  // reconcile: 積んでいるダミー数を guardDepth に一致させる（push も取り消しもコミット phase で実行）。
  useEffect(() => {
    while (armedRef.current < guardDepth) {
      window.history.pushState({ quizGuard: true }, "");
      armedRef.current += 1;
    }
    while (armedRef.current > guardDepth) {
      // 画面内操作（× ボタン・Escape・「開始画面に戻る」・「終了」）で余ったダミーを自前 back で取り消す。
      pendingSelfBackRef.current += 1;
      armedRef.current -= 1;
      window.history.back();
    }
  }, [guardDepth]);

  // popstate（ユーザーのブラウザバック）: 履歴は触らず、最上段の層を 1 つ閉じる state 更新のみ。
  // 自前 history.back() の反射を確実に消費するため、リスナはコンポーネント生存中ずっと mount する。
  useEffect(() => {
    const handlePopState = () => {
      if (pendingSelfBackRef.current > 0) {
        pendingSelfBackRef.current -= 1; // 自前 history.back() / forward() の反射。無視する
        return;
      }
      if (guardDepthRef.current === 0) return; // ガード対象の層が無い（開始画面など）
      // ユーザー back: ダミーを 1 つ消費した
      armedRef.current = Math.max(0, armedRef.current - 1);
      // 最上段: ダイアログが開いていれば確認なしで 1 語 pop する（reconcile が depth 減で整合）。
      // 関連語をたどっていれば 1 語ずつ戻り、最後の 1 語を pop すると空配列＝閉になる。
      if (dialogStackRef.current.length > 0) {
        setDialogStack((s) => s.slice(0, -1));
        return;
      }
      // テスト層: phase・mode に応じた文言で中断確認。
      // 「定着モードには入れなくなります」は TEST 結果専用（drill 生成はテスト結果画面からのみ）。
      // DRILL / DRILL_RETRY の結果では残数は送信確定済みで、未完了なら開始画面の一覧から再開できる。
      const message =
        phaseRef.current.name === "result"
          ? modeRef.current === "TEST"
            ? "結果画面を離れますか？（定着モードには入れなくなります）"
            : drillCompletedRef.current
              ? "結果画面を離れますか？"
              : "結果画面を離れて終了しますか？（続きは開始画面の一覧から再開できます）"
          : "テストを中断して開始画面に戻りますか？";
      if (window.confirm(message)) {
        resetToStartRef.current(); // reconcile が depth 0 へ整合（残ダミーを取り消す）
      } else {
        // 留まる: back で消費したダミーは forward 側に残っているので forward() で取り戻す。
        // pushState で積み直すと Next の同一 popstate restore に巻き込まれ履歴が壊れる（観測済み）。
        armedRef.current += 1;
        pendingSelfBackRef.current += 1;
        window.history.forward();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // 出題画面の表示時: 発音音源の自動再生＋次問のプリロード（即時フィードバック表示中も保持される）
  const playIndex = phase.name === "play" ? phase.index : null;
  useEffect(() => {
    if (playIndex === null || quiz === null) return;
    const cache = audioCacheRef.current;
    const question = quiz.questions[playIndex];
    preloadAudio(cache, quiz.questions[playIndex + 1]?.pronunciationAudioUrl ?? null);
    const audio = preloadAudio(cache, question?.pronunciationAudioUrl ?? null);
    // 発音の自動再生 OFF のときは自動再生しない（手動の再生ボタンは従来どおり機能する）
    if (!autoplayPronunciation) return;
    // 日本語→英語は発音が解答（英単語）を漏らすため、出題時の自動再生はしない
    if (isJaToEnFormat(quiz.format)) return;
    if (audio) {
      audio.currentTime = 0;
      // 自動再生がブロック／取得失敗した場合はスキップし、手動の再生ボタンにフォールバック
      void audio.play().catch(() => {});
      return () => audio.pause();
    }
    // 発音音源が無いときは自動音声フォールバック（設定 ON のとき）で読み上げる
    if (ttsFallbackEnabled && question?.headword) {
      speakEnglish(question.headword);
      return () => cancelSpeech();
    }
  }, [playIndex, quiz, autoplayPronunciation, ttsFallbackEnabled]);

  if (phase.name === "countdown") {
    return (
      <Countdown
        enabled={showCountdown}
        status={loadError !== null ? "error" : quiz !== null ? "ready" : "loading"}
        errorMessage={loadError}
        onFinished={() => setPhase({ name: "play", index: 0 })}
        onBackToStart={resetToStart}
      />
    );
  }

  if (phase.name === "play" && quiz !== null) {
    const total = quiz.questions.length;
    const current = phase.index + 1;
    const question = quiz.questions[phase.index];
    // 日本語→英語は問題文が「意味」。headword（＝解答の英単語）と発音は伏せる
    const jaEnPrompt = jaEnPromptOf(quiz, phase.index);
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-4 pt-6 pb-16 md:max-w-2xl">
        <div className="flex flex-col gap-1.5">
          <div
            role="progressbar"
            aria-label="進捗"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={current}
            className="bg-muted h-2 w-full overflow-hidden rounded-full"
          >
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${(current / total) * 100}%` }}
            />
          </div>
          <p className="text-muted-foreground text-right text-sm tabular-nums">
            {current} / {total}
          </p>
        </div>

        {jaEnPrompt !== null ? (
          <div className="flex flex-wrap items-center justify-center py-4">
            <h1 className="text-3xl font-bold tracking-tight break-words whitespace-pre-wrap">
              {jaEnPrompt}
            </h1>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-4">
            <h1 className="text-center text-3xl font-bold tracking-tight break-words">
              {question.headword}
            </h1>
            {/* 見出し語と分けて、発音・詳細は1段下にまとめて横並びにする（横一列の圧迫感を避ける）。 */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <AudioPlayButton
                src={question.pronunciationAudioUrl}
                label="発音"
                ttsText={question.headword}
              />
              {/* 英→日は見出し語が常時表示。解答が出た後だけ「詳細」を出す（解答前はネタバレ防止で隠す）。 */}
              {answerShown ? (
                <WordDetailButton onClick={() => setDialogStack([question.wordId])} />
              ) : null}
            </div>
          </div>
        )}

        <QuestionView
          quiz={quiz}
          index={phase.index}
          onComplete={handleQuestionComplete}
          onReveal={handleReveal}
          onAnswerReveal={handleAnswerReveal}
          onAnswerShown={() => setAnswerShown(true)}
          onShowDetail={() => setDialogStack([question.wordId])}
        />
        <AnswerFeedbackOverlay feedback={feedback} />
        <WordDetailDialog
          wordId={dialogWordId}
          onClose={() => setDialogStack([])}
          onSelectRelated={(id) => setDialogStack((s) => [...s, id])}
        />
      </main>
    );
  }

  if (phase.name === "result") {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-4 px-4 pt-6 pb-16 md:max-w-2xl">
        <h1 className="text-xl font-bold tracking-tight">
          {mode === "TEST" ? "テスト結果" : mode === "DRILL" ? "ラウンド結果" : "再テスト結果"}
        </h1>
        <ResultList
          mode={mode}
          rows={rows}
          submitState={submitState ?? { status: "sending" }}
          onResend={handleResend}
          onBackToStart={resetToStart}
          onStartDrill={handleStartDrill}
          onNextRound={handleNextRound}
          onStartRetry={handleStartRetry}
          onStartSourceTest={handleStartSourceTest}
          sourceTestLabel={drill !== null ? sourceTestLabelOf(drill) : null}
          sourceTestPreview={sourceTestPreview}
          drillCompleted={drillCompleted}
          drillIncludeCorrect={drillIncludeCorrect}
          onDrillIncludeCorrectChange={setDrillIncludeCorrect}
          drillRemaining={drillRemaining}
          onDrillRemainingChange={setDrillRemaining}
          onOpenDialog={(id) => setDialogStack([id])}
        />
        {/* 単語詳細ダイアログは状態の所有者（QuizFlow）が play / result 両フェーズで一元描画する */}
        <WordDetailDialog
          wordId={dialogWordId}
          onClose={() => setDialogStack([])}
          onSelectRelated={(id) => setDialogStack((s) => [...s, id])}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-0 pb-16 md:max-w-2xl">
      <ScreenHeader backHref="/menu" title="単語テスト" />
      <div className="px-4 pt-6">
        <StartForm
          occurrences={occurrences}
          activeDrills={activeDrills}
          defaults={defaults}
          saveAsDefaultInitial={saveAsDefaultInitial}
          onStart={handleStart}
          onResumeDrill={handleResumeDrill}
        />
      </div>
    </main>
  );
}
