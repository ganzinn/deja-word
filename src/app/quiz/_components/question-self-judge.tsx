"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { commonPartOfSpeechFullLabel } from "@/lib/mock/parts-of-speech";
import type { SelfJudgeQuestion } from "@/lib/quiz/payload";
import type { QuizResult } from "@/generated/prisma/enums";

import type { QuestionOutcome } from "./question-outcome";
import { QuestionTimerBar } from "./question-timer-bar";
import { useQuestionTimer } from "./use-question-timer";

type Props = {
  question: SelfJudgeQuestion;
  /**
   * 1 問あたりの制限時間（秒）。null = 制限なし。
   * 自己判定はタイマーを「解答を表示」までの区間にのみ適用し、表示後の判定操作は無制限。
   */
  timeoutSeconds: number | null;
  onComplete: (outcome: QuestionOutcome) => void;
  /** 正誤が確定した瞬間（判定ボタン／時間切れ）に 1 回だけ呼ばれる。 */
  onReveal: (result: QuizResult) => void;
};

// 解答表示の状態。byTimeout: 時間切れによる自動表示（判定ボタンは出さず「次へ」のみ）
type Revealed = { byTimeout: boolean };

export function QuestionSelfJudge({ question, timeoutSeconds, onComplete, onReveal }: Props) {
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [completed, setCompleted] = useState(false);
  const revealedRef = useRef(false);
  const timer = useQuestionTimer({
    timeoutSeconds,
    stopped: revealed !== null,
    // 期限到達と「解答を表示」クリックの競合に備え、表示済みなら上書きしない
    onTimeout: () => setRevealed((prev) => prev ?? { byTimeout: true }),
  });

  // 時間切れで自動表示された瞬間に × フラッシュ＋効果音を要求（TIMEOUT は×と同じ扱い）。
  // 手動の「解答を表示」（byTimeout=false）は正誤未確定なのでここでは発火しない。
  useEffect(() => {
    if (revealed?.byTimeout && !revealedRef.current) {
      revealedRef.current = true;
      onReveal("TIMEOUT");
    }
  }, [revealed, onReveal]);

  function handleJudge(result: QuestionOutcome["result"]) {
    if (completed) return; // onComplete は 1 回だけ（3 ボタンの連打ガード）
    setCompleted(true);
    // 自己申告は判定ボタンを押したこの瞬間に確定。時間切れ後の「次へ」は
    // 上の effect で onReveal 済みのため、ここでは二重発火させない。
    if (!revealedRef.current) {
      revealedRef.current = true;
      onReveal(result);
    }
    onComplete({ result, answerDisplay: null });
  }

  if (revealed === null) {
    return (
      <div className="flex flex-col gap-4">
        {timer !== null ? <QuestionTimerBar state={timer} timedOut={false} /> : null}
        <Button size="lg" onClick={() => setRevealed({ byTimeout: false })}>
          解答を表示
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {timer !== null ? <QuestionTimerBar state={timer} timedOut={revealed.byTimeout} /> : null}
      <div className="flex flex-col gap-3">
        {question.answer.map((meaning, index) => (
          <div
            key={index}
            className="border-border bg-card/50 flex flex-col gap-2 rounded-lg border p-3"
          >
            {meaning.partOfSpeech ? (
              <div>
                <Badge variant="outline">{commonPartOfSpeechFullLabel(meaning.partOfSpeech)}</Badge>
              </div>
            ) : null}
            {meaning.texts.length === 1 ? (
              <p className="text-sm whitespace-pre-wrap">{meaning.texts[0]}</p>
            ) : (
              <ul className="ml-4 list-disc text-sm">
                {meaning.texts.map((text, i) => (
                  <li key={i} className="whitespace-pre-wrap">
                    {text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {revealed.byTimeout ? (
        <Button size="lg" disabled={completed} onClick={() => handleJudge("TIMEOUT")}>
          次へ
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            disabled={completed}
            onClick={() => handleJudge("CORRECT")}
            className="border-green-600 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-400 dark:hover:bg-green-900"
            variant="outline"
          >
            合っていた
          </Button>
          <Button
            size="lg"
            disabled={completed}
            onClick={() => handleJudge("INCORRECT")}
            className="border-red-600 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
            variant="outline"
          >
            間違っていた
          </Button>
          <Button
            size="lg"
            disabled={completed}
            onClick={() => handleJudge("GAVE_UP")}
            variant="outline"
            className="text-muted-foreground"
          >
            思い浮かばなかった
          </Button>
        </div>
      )}
    </div>
  );
}
