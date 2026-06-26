"use client";

import type { SelfJudgeJaEnQuestion } from "@/lib/quiz/payload";
import type { QuizResult } from "@/generated/prisma/enums";

import type { QuestionOutcome } from "./question-outcome";
import { RevealedHeadwordCard } from "./revealed-headword-card";
import { SelfJudgePanel } from "./self-judge-panel";

type Props = {
  question: SelfJudgeJaEnQuestion;
  /** 1 問あたりの制限時間（秒）。null = 制限なし。 */
  timeoutSeconds: number | null;
  onComplete: (outcome: QuestionOutcome) => void;
  /** 正誤が確定した瞬間（判定ボタン／時間切れ）に 1 回だけ呼ばれる。 */
  onReveal: (result: QuizResult) => void;
  /** 解答（英単語）が可視化された瞬間に 1 回だけ呼ばれる（発音再生用）。 */
  onAnswerReveal?: () => void;
  /** 「詳細」ボタンのタップ。解答の英単語の隣に詳細ボタンを出す。 */
  onShowDetail?: () => void;
};

/** 自己判定（日本語→英語）。問題文は意味（quiz-flow 側）、解答は headword（英単語）。 */
export function QuestionSelfJudgeJaEn({
  question,
  timeoutSeconds,
  onComplete,
  onReveal,
  onAnswerReveal,
  onShowDetail,
}: Props) {
  return (
    <SelfJudgePanel
      timeoutSeconds={timeoutSeconds}
      onComplete={onComplete}
      onReveal={onReveal}
      onAnswerReveal={onAnswerReveal}
    >
      <RevealedHeadwordCard
        headword={question.headword}
        pronunciationAudioUrl={question.pronunciationAudioUrl}
        onShowDetail={onShowDetail}
      />
    </SelfJudgePanel>
  );
}
