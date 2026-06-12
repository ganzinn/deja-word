"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChoiceQuestion } from "@/lib/quiz/payload";

import type { QuestionOutcome } from "./question-outcome";

type Props = {
  question: ChoiceQuestion;
  onComplete: (outcome: QuestionOutcome) => void;
};

// 解答確定状態。selectedIndex: 選んだ選択肢の index、null =「わからない」
type Answered = { selectedIndex: number | null };

export function QuestionChoice({ question, onComplete }: Props) {
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [completed, setCompleted] = useState(false);

  function handleSelect(index: number | null) {
    if (answered) return; // 確定後の連打ガード
    setAnswered({ selectedIndex: index });
  }

  function handleNext() {
    if (!answered || completed) return; // onComplete は 1 回だけ
    setCompleted(true);
    const { selectedIndex } = answered;
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
