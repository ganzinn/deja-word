"use client";

import { CheckIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MultiMeaningQuestion } from "@/lib/quiz/payload";
import type { QuizResult } from "@/generated/prisma/enums";

import { AnswerAdvanceFooter } from "./answer-advance-footer";
import type { QuestionOutcome } from "./question-outcome";
import { QuestionTimerBar } from "./question-timer-bar";
import { useQuestionTimer } from "./use-question-timer";

type Props = {
  question: MultiMeaningQuestion;
  /** 1 問あたりの制限時間（秒）。null = 制限なし。 */
  timeoutSeconds: number | null;
  onComplete: (outcome: QuestionOutcome) => void;
  /** 正誤が確定した瞬間（回答／わからない／時間切れ）に 1 回だけ呼ばれる。 */
  onReveal: (result: QuizResult) => void;
  /** 解答が可視化された瞬間に 1 回だけ呼ばれる（英→日。上部見出し語の「詳細」ゲート用）。 */
  onAnswerShown?: () => void;
};

// 解答確定状態。selectedIndexes: 選んだ選択肢の index 集合、null =「わからない」または時間切れ
type Answered = { selectedIndexes: ReadonlySet<number> | null; timedOut: boolean };

/** 確定状態から結果＋表示文字列を導出する（onReveal / onComplete で共用）。 */
function outcomeFor(question: MultiMeaningQuestion, answered: Answered): QuestionOutcome {
  const { selectedIndexes, timedOut } = answered;
  if (timedOut) return { result: "TIMEOUT", answerDisplay: null };
  if (selectedIndexes === null) return { result: "GAVE_UP", answerDisplay: null };
  // 選択集合が正解集合と完全一致（全部選び、かつ余計に選ばない）で CORRECT
  const isExactMatch = question.options.every(
    (option, index) => option.isCorrect === selectedIndexes.has(index),
  );
  return {
    result: isExactMatch ? "CORRECT" : "INCORRECT",
    answerDisplay: question.options
      .filter((_, index) => selectedIndexes.has(index))
      .map((option) => option.text)
      .join("; "),
  };
}

export function QuestionMultiMeaning({
  question,
  timeoutSeconds,
  onComplete,
  onReveal,
  onAnswerShown,
}: Props) {
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [completed, setCompleted] = useState(false);
  const revealedRef = useRef(false);
  const timer = useQuestionTimer({
    timeoutSeconds,
    stopped: answered !== null,
    // 「回答する」前の未確定選択は採点せず時間切れ扱い。確定済みなら上書きしない
    onTimeout: () => setAnswered((prev) => prev ?? { selectedIndexes: null, timedOut: true }),
  });

  // 解答が確定した瞬間に正誤フラッシュ＋効果音を 1 回だけ要求する
  useEffect(() => {
    if (answered === null || revealedRef.current) return;
    revealedRef.current = true;
    onReveal(outcomeFor(question, answered).result);
    onAnswerShown?.();
  }, [answered, question, onReveal, onAnswerShown]);

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
    setAnswered({ selectedIndexes: selected, timedOut: false });
  }

  function handleGiveUp() {
    if (answered) return; // 確定後の連打ガード
    setAnswered({ selectedIndexes: null, timedOut: false });
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
              <RichText text={option.text} />
            </Button>
          );
        })}
      </div>

      {answered === null ? (
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            className="h-auto min-h-14 py-4"
            disabled={selected.size === 0}
            onClick={handleSubmit}
          >
            回答する
          </Button>
          <Button
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
        />
      )}
    </div>
  );
}
