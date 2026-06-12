"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  /** 問題データの取得状況（取得は quiz-flow がカウントダウンの裏で行う）。 */
  status: "loading" | "ready" | "error";
  errorMessage: string | null;
  /** カウント終了かつデータ取得完了で呼ばれる（出題へ遷移）。 */
  onFinished: () => void;
  /** 取得失敗時の「開始画面に戻る」。リトライは開始からやり直し。 */
  onBackToStart: () => void;
};

/** 全画面オーバーレイの「3・2・1」カウントダウン。 */
export function Countdown({ status, errorMessage, onFinished, onBackToStart }: Props) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (count <= 0) return;
    const timer = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count]);

  const countFinished = count <= 0;

  useEffect(() => {
    if (countFinished && status === "ready") onFinished();
  }, [countFinished, status, onFinished]);

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6">
      {status === "error" ? (
        <>
          <p className="text-destructive text-center text-sm" role="alert">
            {errorMessage ?? "テストの準備に失敗しました。"}
          </p>
          <Button variant="outline" onClick={onBackToStart}>
            開始画面に戻る
          </Button>
        </>
      ) : !countFinished ? (
        <span aria-hidden className="text-7xl font-bold tabular-nums">
          {count}
        </span>
      ) : (
        // カウント終了時に問題データが未ロードなら待機
        <p className="text-muted-foreground text-sm">準備中…</p>
      )}
    </div>
  );
}
