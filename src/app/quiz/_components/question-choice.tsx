"use client";

import { useEffect, useRef, useState } from "react";

import { AudioPlayButton } from "@/components/audio-play-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChoiceQuestion } from "@/lib/quiz/payload";
import type { QuizResult } from "@/generated/prisma/enums";

import type { QuestionOutcome } from "./question-outcome";
import { QuestionTimerBar } from "./question-timer-bar";
import { useQuestionTimer } from "./use-question-timer";

type Props = {
  question: ChoiceQuestion;
  /** 1 問あたりの制限時間（秒）。null = 制限なし。 */
  timeoutSeconds: number | null;
  onComplete: (outcome: QuestionOutcome) => void;
  /** 正誤が確定した瞬間（解答クリック／時間切れ）に 1 回だけ呼ばれる。 */
  onReveal: (result: QuizResult) => void;
  /** 解答（選択肢の正解）が可視化された瞬間に 1 回だけ呼ばれる。日→英のみ指定される。 */
  onAnswerReveal?: () => void;
  /** 正解選択肢の右端に発音ボタンを出すか。発音＝解答になる日→英のみ true。 */
  showCorrectAudio?: boolean;
};

// 解答確定状態。selectedIndex: 選んだ選択肢の index、null =「わからない」または時間切れ
type Answered = { selectedIndex: number | null; timedOut: boolean };

/** 確定状態から結果＋表示文字列を導出する（onReveal / onComplete で共用）。 */
function outcomeFor(question: ChoiceQuestion, answered: Answered): QuestionOutcome {
  const { selectedIndex, timedOut } = answered;
  if (timedOut) return { result: "TIMEOUT", answerDisplay: null };
  if (selectedIndex === null) return { result: "GAVE_UP", answerDisplay: null };
  return {
    result: selectedIndex === question.correctIndex ? "CORRECT" : "INCORRECT",
    answerDisplay: question.choices[selectedIndex].text,
  };
}

export function QuestionChoice({
  question,
  timeoutSeconds,
  onComplete,
  onReveal,
  onAnswerReveal,
  showCorrectAudio = false,
}: Props) {
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [completed, setCompleted] = useState(false);
  const revealedRef = useRef(false);
  const timer = useQuestionTimer({
    timeoutSeconds,
    stopped: answered !== null,
    // 期限到達と選択クリックの競合に備え、確定済みなら上書きしない
    onTimeout: () => setAnswered((prev) => prev ?? { selectedIndex: null, timedOut: true }),
  });

  // 解答が確定した瞬間（クリック・時間切れの両方）に正誤フラッシュ＋効果音と、
  // 解答（正解選択肢）の可視化を 1 回だけ要求する
  useEffect(() => {
    if (answered === null || revealedRef.current) return;
    revealedRef.current = true;
    onReveal(outcomeFor(question, answered).result);
    onAnswerReveal?.();
  }, [answered, question, onReveal, onAnswerReveal]);

  function handleSelect(index: number | null) {
    if (answered) return; // 確定後の連打ガード
    setAnswered({ selectedIndex: index, timedOut: false });
  }

  function handleNext() {
    if (!answered || completed) return; // onComplete は 1 回だけ
    setCompleted(true);
    onComplete(outcomeFor(question, answered));
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
          // 日→英は正解（英単語）の右端に発音ボタンを重ねる。自動再生とは独立した手動ボタン
          const showAudio =
            isCorrect && showCorrectAudio && question.pronunciationAudioUrl !== null;
          return (
            <div key={index} className="relative">
              <Button
                variant="outline"
                size="lg"
                disabled={answered !== null}
                onClick={() => handleSelect(index)}
                className={cn(
                  "h-auto min-h-9 w-full justify-start py-2 text-left whitespace-normal",
                  isCorrect &&
                    "border-green-600 bg-green-50 text-green-700 disabled:opacity-100 dark:bg-green-950 dark:text-green-400",
                  isWrongSelected &&
                    "border-red-600 bg-red-50 text-red-700 disabled:opacity-100 dark:bg-red-950 dark:text-red-400",
                  // 折り返した英単語が発音ボタンと重ならないよう右側を空ける
                  showAudio && "pr-16",
                )}
              >
                {choice.text}
              </Button>
              {showAudio ? (
                <div className="absolute top-1/2 right-2 -translate-y-1/2">
                  <AudioPlayButton
                    src={question.pronunciationAudioUrl}
                    label="発音"
                    ttsText={question.headword}
                  />
                </div>
              ) : null}
            </div>
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
