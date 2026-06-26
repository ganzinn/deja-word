"use client";

import type { Ref } from "react";

import { Button } from "@/components/ui/button";

import type { QuestionOutcome } from "./question-outcome";

type Props = {
  /** 回答確定後の結果。CORRECT のときだけ「うろ覚えだった」降格ボタンを併せて出す。 */
  outcome: QuestionOutcome;
  /** onComplete を 1 回に絞る連打ガード（親が保持）。ボタンの無効化に使う。 */
  completed: boolean;
  /** 「次へ」または「うろ覚えだった」で確定する。親側で 1 回だけ呼ばれるよう guard する。 */
  onComplete: (outcome: QuestionOutcome) => void;
  /** 「次へ」ボタンの ref（スペル確認の Enter / フォーカス移動用）。 */
  nextButtonRef?: Ref<HTMLButtonElement>;
};

/**
 * 出題形式（四択・多義語選択・スペル確認）共通の「回答確定後フッター」。
 * 「次へ」は常に先頭（位置固定）に置き、正解で答えた場合のみ「うろ覚えだった」
 * （CORRECT → VAGUE へ降格）ボタンをその下に追加する。こうすることで正誤に依らず
 * 「次へ」の位置がぶれない。降格しても自分の回答（answerDisplay）は保持する。
 * 自己判定はこのフッターを使わない（3 ボタンで直接 CORRECT / VAGUE / INCORRECT を申告するため）。
 */
export function AnswerAdvanceFooter({ outcome, completed, onComplete, nextButtonRef }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <Button
        ref={nextButtonRef}
        type="button"
        size="lg"
        className="h-auto min-h-14 py-4"
        disabled={completed}
        onClick={() => onComplete(outcome)}
      >
        次へ
      </Button>
      {outcome.result === "CORRECT" ? (
        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={completed}
          onClick={() => onComplete({ result: "VAGUE", answerDisplay: outcome.answerDisplay })}
          className="h-auto min-h-14 border-amber-600 bg-amber-50 py-4 text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:hover:bg-amber-900"
        >
          うろ覚えだった
        </Button>
      ) : null}
    </div>
  );
}
