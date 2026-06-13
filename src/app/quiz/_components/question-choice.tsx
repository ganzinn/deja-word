"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChoiceQuestion } from "@/lib/quiz/payload";

import type { QuestionOutcome } from "./question-outcome";
import { QuestionTimerBar } from "./question-timer-bar";
import { useQuestionTimer } from "./use-question-timer";

type Props = {
  question: ChoiceQuestion;
  /** 1 問あたりの制限時間（秒）。null = 制限なし。 */
  timeoutSeconds: number | null;
  onComplete: (outcome: QuestionOutcome) => void;
};

// 解答確定状態。selectedIndex: 選んだ選択肢の index、null =「わからない」または時間切れ
type Answered = { selectedIndex: number | null; timedOut: boolean };

export function QuestionChoice({ question, timeoutSeconds, onComplete }: Props) {
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [completed, setCompleted] = useState(false);
  const timer = useQuestionTimer({
    timeoutSeconds,
    stopped: answered !== null,
    // 期限到達と選択クリックの競合に備え、確定済みなら上書きしない
    onTimeout: () => setAnswered((prev) => prev ?? { selectedIndex: null, timedOut: true }),
  });

  function handleSelect(index: number | null) {
    if (answered) return; // 確定後の連打ガード
    setAnswered({ selectedIndex: index, timedOut: false });
  }

  function handleNext() {
    if (!answered || completed) return; // onComplete は 1 回だけ
    setCompleted(true);
    const { selectedIndex, timedOut } = answered;
    if (timedOut) {
      onComplete({ result: "TIMEOUT", answerDisplay: null });
      return;
    }
    if (selectedIndex === null) {
      onComplete({ result: "GAVE_UP", answerDisplay: null });
      return;
    }
    onComplete({
      result: selectedIndex === question.correctIndex ? "CORRECT" : "INCORRECT",
      answerDisplay: question.choices[selectedIndex].text,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {timer !== null ? (
        <QuestionTimerBar state={timer} timedOut={answered?.timedOut === true} />
      ) : null}
      <div className="flex flex-col gap-2">
        {question.choices.map((choice, index) => {
          const isCorrect = answered !== null && index === question.correctIndex;
          const isWrongSelected =
            answered !== null &&
            answered.selectedIndex === index &&
            index !== question.correctIndex;
          return (
            <Button
              key={index}
              variant="outline"
              size="lg"
              disabled={answered !== null}
              onClick={() => handleSelect(index)}
              className={cn(
                "h-auto min-h-9 justify-start py-2 text-left whitespace-normal",
                isCorrect &&
                  "border-green-600 bg-green-50 text-green-700 disabled:opacity-100 dark:bg-green-950 dark:text-green-400",
                isWrongSelected &&
                  "border-red-600 bg-red-50 text-red-700 disabled:opacity-100 dark:bg-red-950 dark:text-red-400",
              )}
            >
              {choice.text}
            </Button>
          );
        })}
      </div>

      {answered === null ? (
        <Button
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => handleSelect(null)}
        >
          わからない
        </Button>
      ) : (
        <Button size="lg" disabled={completed} onClick={handleNext}>
          次へ
        </Button>
      )}
    </div>
  );
}
