"use client";

import { useState } from "react";

import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleHelpIcon,
  CircleXIcon,
  ClockIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { RowAudioButton } from "@/components/row-audio-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  parseRemainingCount,
  REMAINING_MAX_COUNT,
  REMAINING_MIN_COUNT,
} from "@/lib/quiz/remaining-options";
import type { QuizMode, QuizResult } from "@/generated/prisma/enums";

/** 結果一覧の 1 行分。quiz-flow が問題ごとの解答結果（QuestionOutcome）を収集して組み立てる。 */
export type ResultRow = {
  wordId: string;
  headword: string;
  /** 日本語→英語の問題文（最初の Meaning の「; 」連結）。英語→日本語は null。主見出しは prompt があればそれ、無ければ headword。 */
  prompt: string | null;
  /** 正解の表示文字列（四択・自己判定＝最初の Meaning の「; 」連結、多義語選択＝正解選択肢の連結）。 */
  correctDisplay: string;
  result: QuizResult;
  /** 自分の回答（四択＝選んだ選択肢、多義語選択＝選んだ意味の組。自己判定・GAVE_UP・TIMEOUT・VAGUE は null）。
   *  うろ覚え（VAGUE）は全形式とも null で、結果一覧では一律「うろ覚え」と表示する。 */
  answerDisplay: string | null;
  /** 英単語の発音音源 URL（最初の Meaning）。未登録なら null。 */
  pronunciationAudioUrl: string | null;
};

/**
 * 履歴送信の状態（single-flight は quiz-flow 側で担保。再送ボタンは失敗確定後のみ表示）。
 * success は TEST（`submitQuizAnswers`）と DRILL_RETRY（`submitDrillRetry`）、drill-success は
 * DRILL（`submitDrillRound`）の成功。
 * 残数バッジは drill-success の確定残数のみに基づき、クライアント見込み計算で先出ししない
 * （DRILL_RETRY は残数不変・応答にも含まれないため表示しない）。
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

/**
 * 定着までの回数（残数設定）の編集テキスト。テスト結果画面で編集し、drill 開始時に
 * `parseRemainingCount` で 1..9 の整数へ解決する（空欄・範囲外は未確定）。state は quiz-flow が持つ。
 */
export type DrillRemainingText = {
  reset: string;
  vague: string;
  initialCorrect: string;
};

type Props = {
  mode: QuizMode;
  rows: ResultRow[];
  submitState: SubmitState;
  onResend: () => void;
  /** TEST: 「開始画面に戻る」／DRILL・DRILL_RETRY: 「終了」（確定済み残数は保持される）。 */
  onBackToStart: () => void;
  /** TEST: 「定着モードをはじめる」。履歴送信成功後のみ有効。 */
  onStartDrill: () => void;
  /** DRILL・DRILL_RETRY: 「次のラウンドへ」。送信成功後のみ有効。 */
  onNextRound: () => void;
  /** DRILL・DRILL_RETRY: 「同じ問題でもう一度テストする」（残数に影響しない再テスト）。送信成功後のみ有効。 */
  onStartRetry: () => void;
  /**
   * drill が完了（全卒業）したか（quiz-flow がラウンド送信の応答から保持する値）。
   * DRILL は完了メッセージの表示に、DRILL_RETRY は「次のラウンドへ」を出すかの判定に使う
   * （再テスト送信の応答には完了情報が含まれないため props で受ける）。
   */
  drillCompleted: boolean;
  /** TEST: 「正解した問題も定着モードで出題する」トグルの状態（false = 誤答のみ）。 */
  drillIncludeCorrect: boolean;
  onDrillIncludeCorrectChange: (value: boolean) => void;
  /** TEST: 「定着までの回数」の編集テキスト（drill 直前の 1 回だけ設定。各テスト開始でデフォルトへ戻る）。 */
  drillRemaining: DrillRemainingText;
  onDrillRemainingChange: (value: DrillRemainingText) => void;
  /** 行タップで単語詳細を開く。ダイアログの状態・描画は親（QuizFlow）が持つ（back ガードの最上段の層）。 */
  onOpenDialog: (wordId: string) => void;
};

export function ResultList({
  mode,
  rows,
  submitState,
  onResend,
  onBackToStart,
  onStartDrill,
  onNextRound,
  onStartRetry,
  drillCompleted,
  drillIncludeCorrect,
  onDrillIncludeCorrectChange,
  drillRemaining,
  onDrillRemainingChange,
  onOpenDialog,
}: Props) {
  const [wrongOnly, setWrongOnly] = useState(false);
  // 残数が 1..9 の整数のときだけ定着モードを開始できる（空欄・範囲外は開始をゲート）。
  // 「正解した問題」の回数は出題トグル ON のときだけ効かせる（OFF は正解語を投入しないため不問）。
  const remainingValid =
    parseRemainingCount(drillRemaining.reset) !== undefined &&
    parseRemainingCount(drillRemaining.vague) !== undefined &&
    (!drillIncludeCorrect || parseRemainingCount(drillRemaining.initialCorrect) !== undefined);
  const total = rows.length;
  const correctCount = rows.filter((r) => r.result === "CORRECT").length;
  const wrongCount = total - correctCount;
  const rate = total === 0 ? 0 : Math.round((correctCount / total) * 100);
  // 表示専用フィルタ。集計（correctCount 等）は全行ベースのまま、一覧だけを誤答（CORRECT 以外）に絞る。
  const visibleRows = wrongOnly ? rows.filter((r) => r.result !== "CORRECT") : rows;
  // 誤答のみ（トグル OFF）かつ全問正解だと定着対象が 0 件になるため開始を抑止する。
  const noDrillWords = !drillIncludeCorrect && wrongCount === 0;
  const skippedWordIds =
    submitState.status === "success" ? new Set(submitState.skippedWordIds) : null;
  // DRILL: 送信成功までは残数表示を保留する（04-ui.md「drill ラウンド結果画面」）。
  // DRILL_RETRY は success 変種のため自動的に null（残数バッジなし）になる。
  const remainingByWordId =
    submitState.status === "drill-success"
      ? new Map(submitState.remaining.map((r) => [r.wordId, r.remaining]))
      : null;

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

      {total > 0 ? (
        <Label
          htmlFor="result-wrong-only"
          className="text-muted-foreground flex cursor-pointer items-center gap-2 text-sm font-normal"
        >
          <Checkbox
            id="result-wrong-only"
            checked={wrongOnly}
            onCheckedChange={(checked) => setWrongOnly(checked === true)}
          />
          間違えた問題だけ表示
        </Label>
      ) : null}

      {wrongOnly && visibleRows.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          間違えた問題はありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibleRows.map((row) => (
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
                row.result === "VAGUE" ||
                remainingByWordId !== null ? (
                  <div className="flex w-full items-start gap-2">
                    {row.result === "VAGUE" ? (
                      // うろ覚えは正解時のみ選べる＝回答内容は正解と同じ。全形式とも「うろ覚え」と表示する。
                      <p className="text-muted-foreground text-sm">自分の回答: うろ覚え</p>
                    ) : row.answerDisplay !== null ? (
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
      )}

      <div className="flex flex-col gap-2 pt-2">
        {mode === "TEST" ? (
          <>
            {/* 定着モードの設定（残数・対象）は、定着モードに入る直前のこの結果画面だけで出す
                （DRILL ラウンド結果には出さない）。各テスト開始でデフォルトへ戻る。 */}
            <section className="flex flex-col gap-2">
              <Label>定着までの回数</Label>
              {/* 「正解した問題」の回数はトグル側のカードに内包する（OFF では出題しないため）。
                  ここは常に効く「間違えた問題」「うろ覚えの問題」の 2 値のみ。 */}
              <div className="grid grid-cols-2 gap-2">
                <RemainingCountInput
                  id="result-remaining-reset"
                  label="間違えた問題"
                  value={drillRemaining.reset}
                  onChange={(reset) => onDrillRemainingChange({ ...drillRemaining, reset })}
                />
                <RemainingCountInput
                  id="result-remaining-vague"
                  label="うろ覚えの問題"
                  value={drillRemaining.vague}
                  onChange={(vague) => onDrillRemainingChange({ ...drillRemaining, vague })}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                定着モードで各単語を何回連続正解すれば定着とするか（{REMAINING_MIN_COUNT}〜
                {REMAINING_MAX_COUNT}）。間違えるたびにこの回数に戻ります。
              </p>
            </section>
            {/* 定着モードの対象を「正解も含める / 誤答のみ」で切り替える（既定は誤答のみ）。
                ON のときだけ「正解した問題」の定着回数入力をカード内に展開する（OFF では無関係のため隠す）。
                Input は Label の内側に置けない（クリックでチェックが切り替わる）ため、
                チェックボックス行（Label）と入力行を兄弟にしてカード <div> でまとめる。 */}
            <div className="border-border bg-card/50 flex flex-col gap-3 rounded-lg border p-3">
              <Label
                htmlFor="result-drill-include-correct"
                className="flex min-h-8 cursor-pointer items-center gap-3 font-normal"
              >
                <Checkbox
                  id="result-drill-include-correct"
                  checked={drillIncludeCorrect}
                  onCheckedChange={(checked) => onDrillIncludeCorrectChange(checked === true)}
                />
                正解した問題も定着モードで出題する
              </Label>
              {drillIncludeCorrect ? (
                <div className="flex items-center gap-2 pl-7">
                  <Label
                    htmlFor="result-remaining-correct"
                    className="text-muted-foreground text-sm font-normal"
                  >
                    定着までの回数
                  </Label>
                  <Input
                    id="result-remaining-correct"
                    type="number"
                    min={REMAINING_MIN_COUNT}
                    max={REMAINING_MAX_COUNT}
                    inputMode="numeric"
                    value={drillRemaining.initialCorrect}
                    onChange={(e) =>
                      onDrillRemainingChange({ ...drillRemaining, initialCorrect: e.target.value })
                    }
                    className="h-12 w-20"
                  />
                </div>
              ) : null}
            </div>
            {noDrillWords ? (
              <p className="text-muted-foreground text-sm" role="status">
                全問正解のため、定着させる単語はありません。
              </p>
            ) : null}
            {/* drill 生成は履歴の確定が前提のため、履歴送信成功までは無効。
                残数が未確定（空欄・範囲外）のときも開始させない。 */}
            <Button
              size="lg"
              className="h-auto min-h-14 py-4"
              disabled={submitState.status !== "success" || noDrillWords || !remainingValid}
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
        ) : mode === "DRILL" ? (
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
            {/* 残数に影響しない再テスト（06-drill-mode.md 決定 10）。履歴の確定（送信成功）までは無効 */}
            <Button
              size="lg"
              variant="outline"
              className="h-auto min-h-14 py-4"
              disabled={submitState.status !== "drill-success"}
              onClick={onStartRetry}
            >
              同じ問題でもう一度テストする
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-auto min-h-14 py-4"
              onClick={onBackToStart}
            >
              終了
            </Button>
          </>
        ) : (
          // DRILL_RETRY: 残数バッジ・完了メッセージなし。drill 完了済みなら「次のラウンドへ」も出さない
          <>
            {!drillCompleted ? (
              <Button
                size="lg"
                className="h-auto min-h-14 py-4"
                disabled={submitState.status !== "success"}
                onClick={onNextRound}
              >
                次のラウンドへ
              </Button>
            ) : null}
            <Button
              size="lg"
              variant="outline"
              className="h-auto min-h-14 py-4"
              disabled={submitState.status !== "success"}
              onClick={onStartRetry}
            >
              同じ問題でもう一度テストする
            </Button>
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

/** 定着までの回数の 1 項目（ラベル＋1..9 の数値入力）。 */
function RemainingCountInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-muted-foreground text-xs font-normal">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={REMAINING_MIN_COUNT}
        max={REMAINING_MAX_COUNT}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-14"
      />
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
    case "VAGUE":
      return (
        <CircleDashedIcon
          aria-label="うろ覚え"
          className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
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
