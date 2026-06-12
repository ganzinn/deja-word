"use client";

import { CircleCheckIcon, CircleHelpIcon, CircleXIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { QuizResult } from "@/generated/prisma/enums";

import { WordDetailDialog } from "./word-detail-dialog";

/** 結果一覧の 1 行分。quiz-flow が問題ごとの解答結果（QuestionOutcome）を収集して組み立てる。 */
export type ResultRow = {
  wordId: string;
  headword: string;
  /** 正解の表示文字列（四択・自己判定＝最初の Meaning の「; 」連結、多義語選択＝正解選択肢の連結）。 */
  correctDisplay: string;
  result: QuizResult;
  /** 自分の回答（四択＝選んだ選択肢、多義語選択＝選んだ意味の組。自己判定・GAVE_UP は null）。 */
  answerDisplay: string | null;
};

/** 履歴送信の状態（single-flight は quiz-flow 側で担保。再送ボタンは失敗確定後のみ表示）。 */
export type SubmitState =
  | { status: "sending" }
  | { status: "success"; skippedWordIds: string[] }
  | { status: "error"; message: string };

type Props = {
  rows: ResultRow[];
  submitState: SubmitState;
  onResend: () => void;
  onBackToStart: () => void;
};

export function ResultList({ rows, submitState, onResend, onBackToStart }: Props) {
  const [dialogWordId, setDialogWordId] = useState<string | null>(null);

  const total = rows.length;
  const correctCount = rows.filter((r) => r.result === "CORRECT").length;
  const rate = total === 0 ? 0 : Math.round((correctCount / total) * 100);
  const skippedWordIds =
    submitState.status === "success" ? new Set(submitState.skippedWordIds) : null;

  return (
    <div className="flex flex-col gap-4">
      {submitState.status === "error" ? (
        <div
          role="alert"
          className="border-destructive/50 bg-destructive/10 flex items-center gap-2 rounded-lg border p-3"
        >
          <TriangleAlertIcon className="text-destructive size-4 shrink-0" />
          <p className="text-destructive flex-1 text-sm">
            結果の送信に失敗しました。{submitState.message}
          </p>
          <Button variant="outline" size="sm" onClick={onResend}>
            再送
          </Button>
        </div>
      ) : submitState.status === "sending" ? (
        <p className="text-muted-foreground text-sm">結果を送信中…</p>
      ) : null}

      <p className="text-lg font-semibold">
        正解 {correctCount} / {total} 問
        <span className="text-muted-foreground ml-2 text-sm font-normal">（正答率 {rate}%）</span>
      </p>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.wordId}>
            <button
              type="button"
              onClick={() => setDialogWordId(row.wordId)}
              className="border-border bg-card/50 hover:bg-muted/60 flex w-full flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors"
            >
              <div className="flex w-full flex-wrap items-center gap-2">
                <ResultIcon result={row.result} />
                <span className="text-sm font-semibold break-words">{row.headword}</span>
                {skippedWordIds?.has(row.wordId) ? (
                  <Badge variant="secondary" className="ml-auto">
                    削除済み
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm whitespace-pre-wrap">
                <span className="text-muted-foreground">正解: </span>
                {row.correctDisplay}
              </p>
              {row.answerDisplay !== null ? (
                <p className="text-sm whitespace-pre-wrap">
                  <span className="text-muted-foreground">自分の回答: </span>
                  {row.answerDisplay}
                </p>
              ) : row.result === "GAVE_UP" ? (
                <p className="text-muted-foreground text-sm">自分の回答: わからなかった</p>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 pt-2">
        {/* チケット 10 で drill 生成（startDrill）を配線する。送信成功までは無効のままにすること */}
        <Button size="lg" disabled>
          定着モードをはじめる
        </Button>
        <Button size="lg" variant="outline" onClick={onBackToStart}>
          開始画面に戻る
        </Button>
      </div>

      <WordDetailDialog wordId={dialogWordId} onClose={() => setDialogWordId(null)} />
    </div>
  );
}

function ResultIcon({ result }: { result: QuizResult }) {
  switch (result) {
    case "CORRECT":
      return (
        <CircleCheckIcon
          aria-label="正解"
          className="size-4 shrink-0 text-green-600 dark:text-green-400"
        />
      );
    case "INCORRECT":
      return (
        <CircleXIcon
          aria-label="不正解"
          className="size-4 shrink-0 text-red-600 dark:text-red-400"
        />
      );
    case "GAVE_UP":
      return (
        <CircleHelpIcon
          aria-label="わからなかった"
          className="text-muted-foreground size-4 shrink-0"
        />
      );
  }
}
