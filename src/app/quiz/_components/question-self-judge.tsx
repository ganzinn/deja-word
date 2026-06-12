"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { commonPartOfSpeechFullLabel } from "@/lib/mock/parts-of-speech";
import type { SelfJudgeQuestion } from "@/lib/quiz/payload";

import type { QuestionOutcome } from "./question-outcome";

type Props = {
  question: SelfJudgeQuestion;
  onComplete: (outcome: QuestionOutcome) => void;
};

export function QuestionSelfJudge({ question, onComplete }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(false);

  function handleJudge(result: QuestionOutcome["result"]) {
    if (completed) return; // onComplete は 1 回だけ（3 ボタンの連打ガード）
    setCompleted(true);
    onComplete({ result, answerDisplay: null });
  }

  if (!revealed) {
    return (
      <Button size="lg" onClick={() => setRevealed(true)}>
        解答を表示
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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
    </div>
  );
}
