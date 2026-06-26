"use client";

import { useEffect, useRef, useState } from "react";

import { AudioPlayButton } from "@/components/audio-play-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChoiceQuestion } from "@/lib/quiz/payload";
import type { QuizResult } from "@/generated/prisma/enums";

import { AnswerAdvanceFooter } from "./answer-advance-footer";
import type { QuestionOutcome } from "./question-outcome";
import { QuestionTimerBar } from "./question-timer-bar";
import { useQuestionTimer } from "./use-question-timer";
import { WordDetailButton } from "./word-detail-button";

type Props = {
  question: ChoiceQuestion;
  /** 1 問あたりの制限時間（秒）。null = 制限なし。 */
  timeoutSeconds: number | null;
  onComplete: (outcome: QuestionOutcome) => void;
  /** 正誤が確定した瞬間（解答クリック／時間切れ）に 1 回だけ呼ばれる。 */
  onReveal: (result: QuizResult) => void;
  /** 解答（選択肢の正解）が可視化された瞬間に 1 回だけ呼ばれる。日→英のみ指定される。 */
  onAnswerReveal?: () => void;
  /** 解答が可視化された瞬間に 1 回だけ呼ばれる。英→日（上部見出し語の「詳細」ゲート）で指定される。 */
  onAnswerShown?: () => void;
  /** 「詳細」ボタンのタップ。日→英で正解（英単語）選択肢の右端に詳細ボタンを出す。 */
  onShowDetail?: () => void;
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
  onAnswerShown,
  onShowDetail,
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
    onAnswerShown?.();
  }, [answered, question, onReveal, onAnswerReveal, onAnswerShown]);

  function handleSelect(index: number | null) {
    if (answered) return; // 確定後の連打ガード
    setAnswered({ selectedIndex: index, timedOut: false });
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
        {question.choices.map((choice, index) => {
          const isCorrect = answered !== null && index === question.correctIndex;
          const isWrongSelected =
            answered !== null &&
            answered.selectedIndex === index &&
            index !== question.correctIndex;
          // 日→英は正解（英単語）の右端に発音ボタンを重ねる。自動再生とは独立した手動ボタン
          const showAudio =
            isCorrect && showCorrectAudio && question.pronunciationAudioUrl !== null;
          // 日→英は正解（英単語）の右端に「詳細」ボタンも重ねる（音源の有無に依らず出す）
          const showDetail = isCorrect && onShowDetail !== undefined;
          return (
            <div key={index} className="relative">
              <Button
                variant="outline"
                size="lg"
                disabled={answered !== null}
                onClick={() => handleSelect(index)}
                className={cn(
                  "h-auto min-h-16 w-full justify-start py-4 text-left whitespace-normal",
                  isCorrect &&
                    "border-green-600 bg-green-50 text-green-700 disabled:opacity-100 dark:bg-green-950 dark:text-green-400",
                  isWrongSelected &&
                    "border-red-600 bg-red-50 text-red-700 disabled:opacity-100 dark:bg-red-950 dark:text-red-400",
                  // 折り返した英単語が発音・詳細ボタンと重ならないよう右側を空ける
                  (showAudio || showDetail) && "pr-16",
                )}
              >
                {choice.text}
              </Button>
              {showAudio || showDetail ? (
                <div className="absolute top-1/2 right-2 flex -translate-y-1/2 flex-col items-end gap-1">
                  {showAudio ? (
                    <AudioPlayButton
                      src={question.pronunciationAudioUrl}
                      label="発音"
                      ttsText={question.headword}
                    />
                  ) : null}
                  {showDetail ? <WordDetailButton onClick={onShowDetail} /> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {answered === null ? (
        <Button
          variant="ghost"
          className="text-muted-foreground h-auto min-h-14 py-4"
          onClick={() => handleSelect(null)}
        >
          わからない
        </Button>
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
