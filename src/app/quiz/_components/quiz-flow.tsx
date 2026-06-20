"use client";

import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AudioPlayButton } from "@/components/audio-play-button";
import { buttonVariants } from "@/components/ui/button";
import { isJaToEnFormat } from "@/lib/quiz/format-options";
import { cn } from "@/lib/utils";
import type { QuizMode, QuizResult } from "@/generated/prisma/enums";
import type { ActiveDrill } from "@/lib/drill-list";
import type { StartFormDefaults } from "@/lib/quiz-default-settings";
import type { QuizPayload } from "@/lib/quiz/payload";
import type { StartQuizInput } from "@/lib/schema/quiz";

import {
  startDrill,
  startDrillRound,
  startQuiz,
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
import { ResultList, type ResultRow, type SubmitState } from "./result-list";
import { StartForm, type OccurrenceOption } from "./start-form";

type Props = {
  occurrences: OccurrenceOption[];
  activeDrills: ActiveDrill[];
  /** 開始フォームの初期値（デフォルト設定。未保存なら null）。 */
  defaults: StartFormDefaults | null;
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
};

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
}: {
  quiz: QuizPayload;
  index: number;
  onComplete: (outcome: QuestionOutcome) => void;
  /** 正誤が確定した瞬間に 1 回だけ呼ばれる（フラッシュ＋効果音は QuizFlow が集中処理）。 */
  onReveal: (result: QuizResult) => void;
  /** 解答（英単語）が画面に現れた瞬間に 1 回だけ呼ばれる（日→英のみ。発音再生は QuizFlow が集中処理）。 */
  onAnswerReveal: () => void;
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
        />
      );
    }
  }
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
}: Props) {
  const router = useRouter();
  // TEST と DRILL は同じ状態機械を mode 違いで再利用する（06-drill-mode.md 決定 8）
  const [mode, setMode] = useState<QuizMode>("TEST");
  const [phase, setPhase] = useState<Phase>({ name: "start" });
  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [submitState, setSubmitState] = useState<SubmitState | null>(null);
  // テスト開始時の入力（drill 生成の occurrenceId に使う）
  const [startInput, setStartInput] = useState<StartQuizInput | null>(null);
  const [drill, setDrill] = useState<DrillState | null>(null);
  // 結果一覧で開いている単語詳細ダイアログの単語 ID（null = 閉。back ガードの最上段の層）
  const [dialogWordId, setDialogWordId] = useState<string | null>(null);
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
  }

  function handleStart(input: StartQuizInput) {
    const runId = ++runIdRef.current;
    setMode("TEST");
    setDrill(null);
    setStartInput(input);
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
      setDrill({ drillId, expectedRoundCount: result.roundCount });
      setQuiz(result.quiz);
      preloadAudio(audioCacheRef.current, result.quiz.questions[0]?.pronunciationAudioUrl ?? null);
    });
  }

  /** テスト結果画面の「定着モードをはじめる」: drill 生成 → ラウンド 1 のカウントダウンへ。 */
  function handleStartDrill() {
    if (quiz === null || startInput === null) return;
    // drill 生成は履歴の確定が前提（result-list 側でも送信成功までボタンを無効化している）
    if (submitState?.status !== "success") return;
    const input = {
      occurrenceId: startInput.occurrenceId,
      format: quiz.format,
      // 元テストの制限時間を Drill に保存し、全ラウンドで引き継ぐ
      timeoutSeconds: quiz.timeoutSeconds,
      results: rows.map((row) => ({ wordId: row.wordId, correct: row.result === "CORRECT" })),
    };
    const runId = ++runIdRef.current;
    setMode("DRILL");
    setDrill(null);
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
    resetRunState();
    setPhase({ name: "countdown" });
    loadDrillRound(drillId, runId);
  }

  /** drill ラウンド結果画面の「次のラウンドへ」: カウントダウンから再開。 */
  function handleNextRound() {
    if (drill === null) return;
    const runId = ++runIdRef.current;
    resetRunState();
    setPhase({ name: "countdown" });
    loadDrillRound(drill.drillId, runId);
  }

  function resetToStart() {
    runIdRef.current += 1;
    audioCacheRef.current.clear();
    setMode("TEST");
    setDrill(null);
    setStartInput(null);
    setDialogWordId(null);
    resetRunState();
    setPhase({ name: "start" });
    // 進行中の定着モード一覧（server 取得）を最新化する（完了・残数進行・新規生成を反映）
    router.refresh();
  }

  function submitAnswers(format: QuizPayload["format"], allRows: ResultRow[]) {
    const runId = runIdRef.current;
    setSubmitState({ status: "sending" });
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
          setSubmitState({
            status: "drill-success",
            remaining: result.remaining,
            completed: result.completed,
          });
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
   * GAVE_UP（わからない・思い浮かばなかった）は kind=null で表示も音もなし。
   */
  function handleReveal(result: QuizResult) {
    const kind = feedbackKindForResult(result);
    if (kind === null) return;
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
    const url = quiz.questions[phase.index]?.pronunciationAudioUrl ?? null;
    const audio = preloadAudio(audioCacheRef.current, url);
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  }

  // アンマウント時に保留中のフラッシュ消去タイマーを解放する
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

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
  //   層 = 進行中テスト（phase ≠ start）＋ 単語詳細ダイアログ（dialogWordId ≠ null。result の最上段）。
  // 重要: ダミーの新規 push は必ず "コミット phase の effect"（reconcile）で行う。Next 16 は popstate を
  // 監視して router を restore する（app-router.js）ため、popstate ハンドラの "中で" pushState すると
  // その同一イベントの restore に巻き込まれてエントリが確定せず、履歴が壊れる（実機で観測済み）。
  // 一方、back で消費したダミーは forward 側に残るので、「留まる」時はハンドラ内で history.forward() を
  // 使い、既存エントリへ戻して再武装する（pushState のような新規生成をしないため Next と競合しない）。
  const guardDepth = (phase.name !== "start" ? 1 : 0) + (dialogWordId !== null ? 1 : 0);
  // ハンドラからは最新値を latest-ref 経由で読む（render 中に ref を書かず、dep 無し effect で同期）。
  const phaseRef = useRef(phase);
  const dialogWordIdRef = useRef(dialogWordId);
  const resetToStartRef = useRef(resetToStart);
  const guardDepthRef = useRef(guardDepth);
  // armedRef: 現在積んでいるダミー数。pendingSelfBackRef: 自前 back/forward 由来で無視する popstate 数。
  const armedRef = useRef(0);
  const pendingSelfBackRef = useRef(0);
  useEffect(() => {
    phaseRef.current = phase;
    dialogWordIdRef.current = dialogWordId;
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
      // 最上段: ダイアログが開いていれば確認なしで閉じる（reconcile が depth 減で整合）
      if (dialogWordIdRef.current !== null) {
        setDialogWordId(null);
        return;
      }
      // テスト層: phase に応じた文言で中断確認
      const message =
        phaseRef.current.name === "result"
          ? "結果画面を離れますか？（定着モードには入れなくなります）"
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
    preloadAudio(cache, quiz.questions[playIndex + 1]?.pronunciationAudioUrl ?? null);
    const audio = preloadAudio(cache, quiz.questions[playIndex]?.pronunciationAudioUrl ?? null);
    if (!audio) return;
    // 発音の自動再生 OFF のときは自動再生しない（手動の再生ボタンは従来どおり機能する）
    if (!autoplayPronunciation) return;
    // 日本語→英語は発音が解答（英単語）を漏らすため、出題時の自動再生はしない
    if (isJaToEnFormat(quiz.format)) return;
    audio.currentTime = 0;
    // 自動再生がブロック／取得失敗した場合はスキップし、手動の再生ボタンにフォールバック
    void audio.play().catch(() => {});
    return () => audio.pause();
  }, [playIndex, quiz, autoplayPronunciation]);

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
          <div className="flex flex-wrap items-center justify-center gap-3 py-4">
            <h1 className="text-3xl font-bold tracking-tight break-words">{question.headword}</h1>
            <AudioPlayButton src={question.pronunciationAudioUrl} label="発音" />
          </div>
        )}

        <QuestionView
          quiz={quiz}
          index={phase.index}
          onComplete={handleQuestionComplete}
          onReveal={handleReveal}
          onAnswerReveal={handleAnswerReveal}
        />
        <AnswerFeedbackOverlay feedback={feedback} />
      </main>
    );
  }

  if (phase.name === "result") {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-4 px-4 pt-6 pb-16 md:max-w-2xl">
        <h1 className="text-xl font-bold tracking-tight">
          {mode === "TEST" ? "テスト結果" : "ラウンド結果"}
        </h1>
        <ResultList
          mode={mode}
          rows={rows}
          submitState={submitState ?? { status: "sending" }}
          onResend={handleResend}
          onBackToStart={resetToStart}
          onStartDrill={handleStartDrill}
          onNextRound={handleNextRound}
          dialogWordId={dialogWordId}
          onOpenDialog={setDialogWordId}
          onCloseDialog={() => setDialogWordId(null)}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-0 pb-16 md:max-w-2xl">
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-3 backdrop-blur">
        <Link
          href="/menu"
          aria-label="戻る"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ChevronLeftIcon />
        </Link>
        <h1 className="text-base font-semibold">単語テスト</h1>
      </header>
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
