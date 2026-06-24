"use client";

import {
  CircleCheckIcon,
  CircleHelpIcon,
  CircleXIcon,
  ClockIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { RowAudioButton } from "@/components/row-audio-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { QuizMode, QuizResult } from "@/generated/prisma/enums";

import { WordDetailDialog } from "./word-detail-dialog";

/** 結果一覧の 1 行分。quiz-flow が問題ごとの解答結果（QuestionOutcome）を収集して組み立てる。 */
export type ResultRow = {
  wordId: string;
  headword: string;
  /** 日本語→英語の問題文（最初の Meaning の「; 」連結）。英語→日本語は null。主見出しは prompt があればそれ、無ければ headword。 */
  prompt: string | null;
  /** 正解の表示文字列（四択・自己判定＝最初の Meaning の「; 」連結、多義語選択＝正解選択肢の連結）。 */
  correctDisplay: string;
  result: QuizResult;
  /** 自分の回答（四択＝選んだ選択肢、多義語選択＝選んだ意味の組。自己判定・GAVE_UP・TIMEOUT は null）。 */
  answerDisplay: string | null;
  /** 英単語の発音音源 URL（最初の Meaning）。未登録なら null。 */
  pronunciationAudioUrl: string | null;
};

/**
 * 履歴送信の状態（single-flight は quiz-flow 側で担保。再送ボタンは失敗確定後のみ表示）。
 * success は TEST（`submitQuizAnswers`）、drill-success は DRILL（`submitDrillRound`）の成功。
 * 残数バッジは drill-success の確定残数のみに基づき、クライアント見込み計算で先出ししない。
 */
export type SubmitState =
  | { status: "sending" }
  | { status: "success"; skippedWordIds: string[] }
  | {
      status: "drill-success";
      remaining: { wordId: string; remaining: number }[];
      completed: boolean;
    }
  | { status: "error"; message: string };

type Props = {
  mode: QuizMode;
  rows: ResultRow[];
  submitState: SubmitState;
  onResend: () => void;
  /** TEST: 「開始画面に戻る」／DRILL: 「終了」（確定済み残数は保持される）。 */
  onBackToStart: () => void;
  /** TEST: 「定着モードをはじめる」。履歴送信成功後のみ有効。 */
  onStartDrill: () => void;
  /** DRILL: 「次のラウンドへ」。ラウンド送信成功後のみ有効。 */
  onNextRound: () => void;
  /** 単語詳細ダイアログの状態は親（QuizFlow）が持ち、back ガードの最上段の層として一元管理する。 */
  dialogWordId: string | null;
  onOpenDialog: (wordId: string) => void;
  onCloseDialog: () => void;
};

export function ResultList({
  mode,
  rows,
  submitState,
  onResend,
  onBackToStart,
  onStartDrill,
  onNextRound,
  dialogWordId,
  onOpenDialog,
  onCloseDialog,
}: Props) {
  const total = rows.length;
  const correctCount = rows.filter((r) => r.result === "CORRECT").length;
  const rate = total === 0 ? 0 : Math.round((correctCount / total) * 100);
  const skippedWordIds =
    submitState.status === "success" ? new Set(submitState.skippedWordIds) : null;
  // DRILL: 送信成功までは残数表示を保留する（04-ui.md「drill ラウンド結果画面」）
  const remainingByWordId =
    submitState.status === "drill-success"
      ? new Map(submitState.remaining.map((r) => [r.wordId, r.remaining]))
      : null;
  const drillCompleted = submitState.status === "drill-success" && submitState.completed;

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
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpenDialog(row.wordId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenDialog(row.wordId);
                }
              }}
              className="border-border bg-card/50 hover:bg-muted/60 flex w-full cursor-pointer flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors"
            >
              <div className="flex w-full flex-wrap items-center gap-2">
                <ResultIcon result={row.result} />
                <span className="text-sm font-semibold break-words whitespace-pre-wrap">
                  {row.prompt ?? row.headword}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {skippedWordIds?.has(row.wordId) ? (
                    <Badge variant="secondary">削除済み</Badge>
                  ) : null}
                  {/* 英→日は見出し行が英単語。その右端に発音ボタン。 */}
                  {row.prompt === null ? (
                    <RowAudioButton
                      src={row.pronunciationAudioUrl}
                      label="発音"
                      ttsText={row.headword}
                    />
                  ) : null}
                </div>
              </div>
              <div className="flex w-full items-start gap-2">
                <p className="text-sm whitespace-pre-wrap">
                  <span className="text-muted-foreground">正解: </span>
                  <span className="font-semibold">{row.correctDisplay}</span>
                </p>
                {/* 日→英は正解行が英単語。その右端に発音ボタン。 */}
                {row.prompt !== null ? (
                  <div className="ml-auto shrink-0">
                    <RowAudioButton
                      src={row.pronunciationAudioUrl}
                      label="発音"
                      ttsText={row.headword}
                    />
                  </div>
                ) : null}
              </div>
              {row.answerDisplay !== null ||
              row.result === "GAVE_UP" ||
              row.result === "TIMEOUT" ||
              remainingByWordId !== null ? (
                <div className="flex w-full items-start gap-2">
                  {row.answerDisplay !== null ? (
                    <p className="text-sm whitespace-pre-wrap">
                      <span className="text-muted-foreground">自分の回答: </span>
                      {row.answerDisplay}
                    </p>
                  ) : row.result === "GAVE_UP" ? (
                    <p className="text-muted-foreground text-sm">自分の回答: わからなかった</p>
                  ) : row.result === "TIMEOUT" ? (
                    <p className="text-muted-foreground text-sm">自分の回答: 時間切れ</p>
                  ) : null}
                  {/* 定着モードの残数バッジ（あと◯回 / 定着 / 削除済み）。自分の回答の右端に置く。 */}
                  {remainingByWordId !== null ? (
                    <div className="ml-auto shrink-0">
                      <DrillRemainingBadge remaining={remainingByWordId.get(row.wordId)} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 pt-2">
        {mode === "TEST" ? (
          <>
            {/* drill 生成は履歴の確定が前提のため、履歴送信成功までは無効 */}
            <Button
              size="lg"
              className="h-auto min-h-14 py-4"
              disabled={submitState.status !== "success"}
              onClick={onStartDrill}
            >
              定着モードをはじめる
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-auto min-h-14 py-4"
              onClick={onBackToStart}
            >
              開始画面に戻る
            </Button>
          </>
        ) : (
          <>
            {drillCompleted ? (
              <p className="text-center text-base font-semibold" role="status">
                すべての単語が定着しました！
                <br />
                おつかれさまでした！
              </p>
            ) : (
              // 残数未更新のまま次ラウンドを生成すると不整合になるため、送信成功までは無効
              <Button
                size="lg"
                className="h-auto min-h-14 py-4"
                disabled={submitState.status !== "drill-success"}
                onClick={onNextRound}
              >
                次のラウンドへ
              </Button>
            )}
            <Button
              size="lg"
              variant="outline"
              className="h-auto min-h-14 py-4"
              onClick={onBackToStart}
            >
              終了
            </Button>
          </>
        )}
      </div>

      <WordDetailDialog wordId={dialogWordId} onClose={onCloseDialog} />
    </div>
  );
}

/**
 * DRILL の残数バッジ。確定残数に行が無い単語はラウンド中に削除されたもの
 * （DrillWord は Cascade 削除済み）として「削除済み」を表示する。
 */
function DrillRemainingBadge({ remaining }: { remaining: number | undefined }) {
  if (remaining === undefined) {
    return <Badge variant="secondary">削除済み</Badge>;
  }
  if (remaining === 0) {
    return <Badge>定着</Badge>;
  }
  return <Badge variant="secondary">あと{remaining}回</Badge>;
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
    case "TIMEOUT":
      return (
        <ClockIcon
          aria-label="時間切れ"
          className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
        />
      );
  }
}
