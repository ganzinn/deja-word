"use client";

import { TgExampleMeaning } from "@/components/tg-example-text";
import type { SelfJudgeTgQuestion } from "@/lib/quiz/payload";
import type { QuizResult } from "@/generated/prisma/enums";

import type { QuestionOutcome } from "./question-outcome";
import { SelfJudgePanel } from "./self-judge-panel";

type Props = {
  question: SelfJudgeTgQuestion;
  /** 1 問あたりの制限時間（秒）。null = 制限なし。 */
  timeoutSeconds: number | null;
  onComplete: (outcome: QuestionOutcome) => void;
  /** 正誤が確定した瞬間（判定ボタン／時間切れ）に 1 回だけ呼ばれる。 */
  onReveal: (result: QuizResult) => void;
  /** 解答が可視化された瞬間に 1 回だけ呼ばれる（英→日。上部見出しの「詳細」ゲート用）。 */
  onAnswerShown?: () => void;
};

/** TG自己判定（英語→日本語）。問題文は TG 例文の英文（quiz-flow 側）、解答はその意味。 */
export function QuestionSelfJudgeTg({
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
      {/* MeaningBlocks（自己判定 英→日）とカードの体裁を揃えつつ、TG ハイライトで表示する。 */}
      <div className="border-border bg-card/50 font-content w-full rounded-lg border p-3">
        <p className="text-sm">
          <TgExampleMeaning text={question.answer} />
        </p>
      </div>
    </SelfJudgePanel>
  );
}
