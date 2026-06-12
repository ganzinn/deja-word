"use client";

import { CheckIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MultiMeaningQuestion } from "@/lib/quiz/payload";

import type { QuestionOutcome } from "./question-outcome";

type Props = {
  question: MultiMeaningQuestion;
  onComplete: (outcome: QuestionOutcome) => void;
};

// 解答確定状態。selectedIndexes: 選んだ選択肢の index 集合、null =「わからない」
type Answered = { selectedIndexes: ReadonlySet<number> | null };

export function QuestionMultiMeaning({ question, onComplete }: Props) {
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [completed, setCompleted] = useState(false);

  function handleToggle(index: number) {
    if (answered) return; // 確定後の連打ガード
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function handleSubmit() {
    if (answered) return; // 確定後の連打ガード
    setAnswered({ selectedIndexes: selected });
  }

  function handleGiveUp() {
    if (answered) return; // 確定後の連打ガード
    setAnswered({ selectedIndexes: null });
  }

  function handleNext() {
    if (!answered || completed) return; // onComplete は 1 回だけ
    setCompleted(true);
    const { selectedIndexes } = answered;
    if (selectedIndexes === null) {
      onComplete({ result: "GAVE_UP", answerDisplay: null });
      return;
    }
    // 選択集合が正解集合と完全一致（全部選び、かつ余計に選ばない）で CORRECT
    const isExactMatch = question.options.every(
      (option, index) => option.isCorrect === selectedIndexes.has(index),
    );
    onComplete({
      result: isExactMatch ? "CORRECT" : "INCORRECT",
      answerDisplay: question.options
        .filter((_, index) => selectedIndexes.has(index))
        .map((option) => option.text)
        .join("; "),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {question.options.map((option, index) => {
          const isSelected =
            answered === null
              ? selected.has(index)
              : (answered.selectedIndexes?.has(index) ?? false);
          const showCorrect = answered !== null && option.isCorrect;
          const showWrongSelected = answered !== null && isSelected && !option.isCorrect;
          return (
            <Button
              key={index}
              variant="outline"
              size="lg"
              aria-pressed={isSelected}
              disabled={answered !== null}
              onClick={() => handleToggle(index)}
              className={cn(
                "h-auto min-h-9 justify-start py-2 text-left whitespace-normal",
                answered === null && isSelected && "border-primary bg-primary/10",
                showCorrect &&
                  "border-green-600 bg-green-50 text-green-700 disabled:opacity-100 dark:bg-green-950 dark:text-green-400",
                showWrongSelected &&
                  "border-red-600 bg-red-50 text-red-700 disabled:opacity-100 dark:bg-red-950 dark:text-red-400",
              )}
            >
              <CheckIcon className={cn("size-4", !isSelected && "invisible")} />
              {option.text}
            </Button>
          );
        })}
      </div>

      {answered === null ? (
        <div className="flex flex-col gap-2">
          <Button size="lg" disabled={selected.size === 0} onClick={handleSubmit}>
            回答する
          </Button>
          <Button variant="ghost" className="text-muted-foreground" onClick={handleGiveUp}>
            わからない
          </Button>
        </div>
      ) : (
        <Button size="lg" disabled={completed} onClick={handleNext}>
          次へ
        </Button>
      )}
    </div>
  );
}
