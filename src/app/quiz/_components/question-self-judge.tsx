"use client";

import type { SelfJudgeQuestion } from "@/lib/quiz/payload";
import type { QuizResult } from "@/generated/prisma/enums";

import { MeaningBlocks } from "./meaning-blocks";
import type { QuestionOutcome } from "./question-outcome";
import { SelfJudgePanel } from "./self-judge-panel";

type Props = {
  question: SelfJudgeQuestion;
  /** 1 問あたりの制限時間（秒）。null = 制限なし。 */
  timeoutSeconds: number | null;
  onComplete: (outcome: QuestionOutcome) => void;
  /** 正誤が確定した瞬間（判定ボタン／時間切れ）に 1 回だけ呼ばれる。 */
  onReveal: (result: QuizResult) => void;
  /** 解答が可視化された瞬間に 1 回だけ呼ばれる（英→日。上部見出し語の「詳細」ゲート用）。 */
  onAnswerShown?: () => void;
};

/** 自己判定（英語→日本語）。問題文は headword（quiz-flow 側）、解答は全 Meaning。 */
export function QuestionSelfJudge({
  question,
  timeoutSeconds,
  onComplete,
  onReveal,
  onAnswerShown,
}: Props) {
  return (
    <SelfJudgePanel
      timeoutSeconds={timeoutSeconds}
      onComplete={onComplete}
      onReveal={onReveal}
      onAnswerShown={onAnswerShown}
    >
      <MeaningBlocks meanings={question.answer} emphasizeFirstText />
    </SelfJudgePanel>
  );
}
