"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isSpellingCorrect } from "@/lib/quiz/spelling";
import { cn } from "@/lib/utils";
import type { SpellingQuestion } from "@/lib/quiz/payload";
import type { QuizResult } from "@/generated/prisma/enums";

import { AnswerAdvanceFooter } from "./answer-advance-footer";
import type { QuestionOutcome } from "./question-outcome";
import { QuestionTimerBar } from "./question-timer-bar";
import { RevealedHeadwordCard } from "./revealed-headword-card";
import { useQuestionTimer } from "./use-question-timer";

type Props = {
  question: SpellingQuestion;
  /** 1 問あたりの制限時間（秒）。null = 制限なし。 */
  timeoutSeconds: number | null;
  onComplete: (outcome: QuestionOutcome) => void;
  /** 正誤が確定した瞬間（回答／わからない／時間切れ）に 1 回だけ呼ばれる。 */
  onReveal: (result: QuizResult) => void;
  /** 解答（英単語）が可視化された瞬間に 1 回だけ呼ばれる。日→英のみ指定される。 */
  onAnswerReveal?: () => void;
  /** 「詳細」ボタンのタップ。解答（英単語）の隣に詳細ボタンを出す。 */
  onShowDetail?: () => void;
};

// 解答確定状態。input: 入力したスペル、null =「わからない」または時間切れ
type Answered = { input: string | null; timedOut: boolean };

/** 確定状態から結果＋表示文字列を導出する（onReveal / onComplete で共用）。 */
function outcomeFor(question: SpellingQuestion, answered: Answered): QuestionOutcome {
  const { input, timedOut } = answered;
  if (timedOut) return { result: "TIMEOUT", answerDisplay: null };
  if (input === null) return { result: "GAVE_UP", answerDisplay: null };
  return {
    result: isSpellingCorrect(input, question.headword) ? "CORRECT" : "INCORRECT",
    answerDisplay: input,
  };
}

/** スペル確認（日本語→英語）。問題文は意味（quiz-flow 側）、英単語のスペルを入力して自動採点。 */
export function QuestionSpelling({
  question,
  timeoutSeconds,
  onComplete,
  onReveal,
  onAnswerReveal,
  onShowDetail,
}: Props) {
  const [input, setInput] = useState("");
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [completed, setCompleted] = useState(false);
  const revealedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const timer = useQuestionTimer({
    timeoutSeconds,
    stopped: answered !== null,
    // 「回答する」前の未確定入力は採点せず時間切れ扱い。確定済みなら上書きしない
    onTimeout: () => setAnswered((prev) => prev ?? { input: null, timedOut: true }),
  });

  // 解答が確定した瞬間に正誤フラッシュ＋効果音と、解答（英単語）の可視化を 1 回だけ要求する
  useEffect(() => {
    if (answered === null || revealedRef.current) return;
    revealedRef.current = true;
    onReveal(outcomeFor(question, answered).result);
    onAnswerReveal?.();
  }, [answered, question, onReveal, onAnswerReveal]);

  // 画面状態に応じて自動でフォーカスを移す:
  //   入力画面 → スペル入力欄、解答表示画面 →「次へ」ボタン（Enter で次問へ進める）
  useEffect(() => {
    if (answered === null) inputRef.current?.focus();
    else nextButtonRef.current?.focus();
  }, [answered]);

  const correct = answered !== null && outcomeFor(question, answered).result === "CORRECT";

  function handleSubmit() {
    if (answered) return; // 確定後の連打ガード
    if (input.trim().length === 0) return; // 空入力は「わからない」で明示してもらう
    setAnswered({ input, timedOut: false });
  }

  function handleGiveUp() {
    if (answered) return; // 確定後の連打ガード
    setAnswered({ input: null, timedOut: false });
  }

  function handleComplete(outcome: QuestionOutcome) {
    if (!answered || completed) return; // onComplete は 1 回だけ
    setCompleted(true);
    onComplete(outcome);
  }

  return (
    <div className="flex flex-col gap-4">
      {timer !== null ? (
        <QuestionTimerBar state={timer} timedOut={answered?.timedOut === true} />
      ) : null}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <Input
          ref={inputRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="英単語のスペルを入力"
          aria-label="英単語のスペル"
          value={answered === null ? input : (answered.input ?? "")}
          disabled={answered !== null}
          onChange={(e) => setInput(e.target.value)}
          className={cn(
            "h-14",
            answered !== null &&
              correct &&
              "border-green-600 bg-green-50 text-green-700 disabled:opacity-100 dark:bg-green-950 dark:text-green-400",
            answered !== null &&
              !correct &&
              answered.input !== null &&
              "border-red-600 bg-red-50 text-red-700 disabled:opacity-100 dark:bg-red-950 dark:text-red-400",
          )}
        />

        {/* 確定後は正解（英単語）を自己判定（日→英）と揃えたカードで提示する */}
        {answered !== null ? (
          <RevealedHeadwordCard
            headword={question.headword}
            pronunciationAudioUrl={question.pronunciationAudioUrl}
            ttsText={question.ttsText}
            onShowDetail={onShowDetail}
          />
        ) : null}

        {answered === null ? (
          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              size="lg"
              className="h-auto min-h-14 py-4"
              disabled={input.trim().length === 0}
            >
              回答する
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground h-auto min-h-14 py-4"
              onClick={handleGiveUp}
            >
              わからない
            </Button>
          </div>
        ) : (
          <AnswerAdvanceFooter
            outcome={outcomeFor(question, answered)}
            completed={completed}
            onComplete={handleComplete}
            nextButtonRef={nextButtonRef}
          />
        )}
      </form>
    </div>
  );
}
