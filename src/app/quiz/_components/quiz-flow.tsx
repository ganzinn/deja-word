"use client";

import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AudioPlayButton } from "@/components/audio-play-button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QuizMode } from "@/generated/prisma/enums";
import type { QuizPayload } from "@/lib/quiz/payload";
import type { StartQuizInput } from "@/lib/schema/quiz";

import { startQuiz, submitQuizAnswers } from "../actions";
import { Countdown } from "./countdown";
import { QuestionChoice } from "./question-choice";
import { QuestionMultiMeaning } from "./question-multi-meaning";
import type { QuestionOutcome } from "./question-outcome";
import { QuestionSelfJudge } from "./question-self-judge";
import { ResultList, type ResultRow, type SubmitState } from "./result-list";
import { StartForm, type OccurrenceOption } from "./start-form";

type Props = {
  occurrences: OccurrenceOption[];
};

/** クライアント状態機械: start → countdown → play → result（URL 遷移しない）。 */
type Phase =
  | { name: "start" }
  | { name: "countdown" }
  | { name: "play"; index: number }
  | { name: "result" };

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
  }
}

function QuestionView({
  quiz,
  index,
  onComplete,
}: {
  quiz: QuizPayload;
  index: number;
  onComplete: (outcome: QuestionOutcome) => void;
}) {
  // key=wordId で問題ごとに解答 UI の内部状態をリセットする
  switch (quiz.format) {
    case "CHOICE": {
      const question = quiz.questions[index];
      return <QuestionChoice key={question.wordId} question={question} onComplete={onComplete} />;
    }
    case "SELF_JUDGE": {
      const question = quiz.questions[index];
      return (
        <QuestionSelfJudge key={question.wordId} question={question} onComplete={onComplete} />
      );
    }
    case "MULTI_MEANING": {
      const question = quiz.questions[index];
      return (
        <QuestionMultiMeaning key={question.wordId} question={question} onComplete={onComplete} />
      );
    }
  }
}

export function QuizFlow({ occurrences }: Props) {
  // mode は本チケットでは TEST のみ配線。DRILL（チケット 10）は同じ状態機械を mode 違いで再利用する
  const [mode] = useState<QuizMode>("TEST");
  const [phase, setPhase] = useState<Phase>({ name: "start" });
  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [submitState, setSubmitState] = useState<SubmitState | null>(null);
  // テスト実行の世代番号。リセット後に届いた古い応答を捨てる
  const runIdRef = useRef(0);
  const audioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  function handleStart(input: StartQuizInput) {
    const runId = ++runIdRef.current;
    setQuiz(null);
    setLoadError(null);
    setRows([]);
    setSubmitState(null);
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

  function resetToStart() {
    runIdRef.current += 1;
    audioCacheRef.current.clear();
    setQuiz(null);
    setLoadError(null);
    setRows([]);
    setSubmitState(null);
    setPhase({ name: "start" });
  }

  function submitAnswers(format: QuizPayload["format"], allRows: ResultRow[]) {
    // DRILL の送信（submitDrillRound）はチケット 10 で配線する
    if (mode !== "TEST") return;
    const runId = runIdRef.current;
    setSubmitState({ status: "sending" });
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

  function handleQuestionComplete(outcome: QuestionOutcome) {
    if (phase.name !== "play" || quiz === null) return;
    const index = phase.index;
    const question = quiz.questions[index];
    const nextRows: ResultRow[] = [
      ...rows,
      {
        wordId: question.wordId,
        headword: question.headword,
        correctDisplay: correctAnswerDisplay(quiz, index),
        result: outcome.result,
        answerDisplay: outcome.answerDisplay,
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

  // 離脱ガード: カウントダウン開始〜結果の履歴送信完了前
  const guardActive =
    phase.name === "countdown" ||
    phase.name === "play" ||
    (phase.name === "result" && submitState?.status !== "success");

  useEffect(() => {
    if (!guardActive) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // リロード・タブ閉じはブラウザの確認ダイアログ（独自テキストは近年のブラウザでは表示されない）
      e.preventDefault();
      e.returnValue = "途中の結果は破棄されます";
    };
    // ブラウザバックのガード: ダミーの履歴エントリを積み、back されたら積み直して押し戻す
    window.history.pushState({ quizGuard: true }, "");
    const handlePopState = () => {
      window.history.pushState({ quizGuard: true }, "");
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      // ガード解除時は積んだダミーエントリを取り除く
      if (window.history.state?.quizGuard) window.history.back();
    };
  }, [guardActive]);

  // 出題画面の表示時: 発音音源の自動再生＋次問のプリロード（即時フィードバック表示中も保持される）
  const playIndex = phase.name === "play" ? phase.index : null;
  useEffect(() => {
    if (playIndex === null || quiz === null) return;
    const cache = audioCacheRef.current;
    preloadAudio(cache, quiz.questions[playIndex + 1]?.pronunciationAudioUrl ?? null);
    const audio = preloadAudio(cache, quiz.questions[playIndex]?.pronunciationAudioUrl ?? null);
    if (!audio) return;
    audio.currentTime = 0;
    // 自動再生がブロック／取得失敗した場合はスキップし、手動の再生ボタンにフォールバック
    void audio.play().catch(() => {});
    return () => audio.pause();
  }, [playIndex, quiz]);

  if (phase.name === "countdown") {
    return (
      <Countdown
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

        <div className="flex flex-wrap items-center justify-center gap-3 py-4">
          <h1 className="text-3xl font-bold tracking-tight break-words">{question.headword}</h1>
          <AudioPlayButton src={question.pronunciationAudioUrl} label="発音" />
        </div>

        <QuestionView quiz={quiz} index={phase.index} onComplete={handleQuestionComplete} />
      </main>
    );
  }

  if (phase.name === "result") {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-4 px-4 pt-6 pb-16 md:max-w-2xl">
        <h1 className="text-xl font-bold tracking-tight">テスト結果</h1>
        <ResultList
          rows={rows}
          submitState={submitState ?? { status: "sending" }}
          onResend={handleResend}
          onBackToStart={resetToStart}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-0 pb-16 md:max-w-2xl">
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-3 backdrop-blur">
        <Link
          href="/dashboard"
          aria-label="戻る"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ChevronLeftIcon />
        </Link>
        <h1 className="text-base font-semibold">単語テスト</h1>
      </header>
      <div className="px-4 pt-6">
        <StartForm occurrences={occurrences} onStart={handleStart} />
      </div>
    </main>
  );
}
