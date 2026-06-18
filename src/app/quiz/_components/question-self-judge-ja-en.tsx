"use client";

import { AudioPlayButton } from "@/components/audio-play-button";
import type { SelfJudgeJaEnQuestion } from "@/lib/quiz/payload";
import type { QuizResult } from "@/generated/prisma/enums";

import type { QuestionOutcome } from "./question-outcome";
import { SelfJudgePanel } from "./self-judge-panel";

type Props = {
  question: SelfJudgeJaEnQuestion;
  /** 1 問あたりの制限時間（秒）。null = 制限なし。 */
  timeoutSeconds: number | null;
  onComplete: (outcome: QuestionOutcome) => void;
  /** 正誤が確定した瞬間（判定ボタン／時間切れ）に 1 回だけ呼ばれる。 */
  onReveal: (result: QuizResult) => void;
};

/** 自己判定（日本語→英語）。問題文は意味（quiz-flow 側）、解答は headword（英単語）。 */
export function QuestionSelfJudgeJaEn({ question, timeoutSeconds, onComplete, onReveal }: Props) {
  return (
    <SelfJudgePanel timeoutSeconds={timeoutSeconds} onComplete={onComplete} onReveal={onReveal}>
      <div className="border-border bg-card/50 flex flex-wrap items-center justify-center gap-3 rounded-lg border p-4">
        <span className="text-2xl font-bold tracking-tight break-words">{question.headword}</span>
        <AudioPlayButton src={question.pronunciationAudioUrl} label="発音" />
      </div>
    </SelfJudgePanel>
  );
}
