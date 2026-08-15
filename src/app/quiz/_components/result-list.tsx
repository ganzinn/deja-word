"use client";

import { Fragment, useState } from "react";

import {
  BookmarkIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleHelpIcon,
  CircleXIcon,
  ClockIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { RowBookmarkButton } from "@/components/bookmark-button";
import { MeaningText } from "@/components/meaning-text";
import { RowAudioButton } from "@/components/row-audio-button";
import { TgExampleMeaning, TgExampleText } from "@/components/tg-example-text";
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

import type { CorrectDisplay } from "../_lib/correct-answer-display";
import { computeBulkBookmarkTargetIds } from "./bulk-bookmark-targets";

/**
 * 結果一覧の見出し種別（quiz-flow の `promptViewOf` 由来）。主見出しの内容・TG ハイライトの
 * 適用・発音ボタンの行（英語がある行に置く）をこの種別から導出する。
 * headword = 英→日（見出しは英単語）/ ja-plain = 日→英（見出しは意味のプレーン表示）/
 * tg-text = TG四択 英→日（見出しは TG 例文の英文）/ tg-meaning = TG四択 日→英（見出しは TG 例文の意味）。
 */
export type PromptKind = "headword" | "ja-plain" | "tg-text" | "tg-meaning";

/** 結果一覧の 1 行分。quiz-flow が問題ごとの解答結果（QuestionOutcome）を収集して組み立てる。 */
export type ResultRow = {
  wordId: string;
  headword: string;
  /** 見出しの種別。headword 以外は prompt（問題文）を主見出しにする。 */
  promptKind: PromptKind;
  /** 問題文（ja-plain=意味の「; 」連結、tg-text=TG 例文の英文、tg-meaning=TG 例文の意味）。headword では null。 */
  prompt: string | null;
  /** 正解の表示データ（強調ありは自己判定（英→日）のみ）。 */
  correctDisplay: CorrectDisplay;
  result: QuizResult;
  /** 自分の回答（四択＝選んだ選択肢、多義語選択＝選んだ意味の組。自己判定・GAVE_UP・TIMEOUT・VAGUE は null）。
   *  うろ覚え（VAGUE）は全形式とも null で、結果一覧では一律「うろ覚え」と表示する。 */
  answerDisplay: string | null;
  /**
   * この行の発音ボタンが鳴らす音源 URL（未登録なら null）。TG 形式の行は TG 例文の音源、
   * それ以外は英単語（最初の Meaning）の音源（`QuestionBase.pronunciationAudioUrl` のコピー）。
   */
  pronunciationAudioUrl: string | null;
  /** 上記の音源が無いとき自動音声で読み上げる英語（`QuestionBase.ttsText` のコピー）。 */
  ttsText: string;
};

/**
 * 主見出しの内容。TG四択は出題画面・単語詳細と同じ TG ハイライトを再現する。
 * ja-plain（訳語）は装飾記法の対象欄、headword（英単語）は対象外のため素で出す。
 */
function promptDisplayOf(row: ResultRow): React.ReactNode {
  switch (row.promptKind) {
    case "headword":
      return row.headword;
    case "ja-plain":
      return <MeaningText text={row.prompt ?? ""} />;
    case "tg-text":
      return <TgExampleText text={row.prompt ?? ""} />;
    case "tg-meaning":
      return <TgExampleMeaning text={row.prompt ?? ""} />;
  }
}

/**
 * 解答側（正解・自分の回答）テキストの表示。TG四択は解答側も TG ハイライトを再現する
 * （英→日 tg-text の解答側は TG 例文の意味、日→英 tg-meaning の解答側は TG 例文の英文）。
 * 見出しが headword の形式は解答側が訳語（装飾記法の対象欄）、
 * ja-plain の形式は解答側が英単語（対象外）という対応になる。
 */
function answerSideDisplayOf(kind: PromptKind, text: string): React.ReactNode {
  if (kind === "tg-text") return <TgExampleMeaning text={text} />;
  if (kind === "tg-meaning") return <TgExampleText text={text} />;
  if (kind === "headword") return <MeaningText text={text} />;
  return text;
}

/**
 * 正解列の表示。強調なしのときは形式分岐を持つ既存ヘルパへ委譲し、
 * 強調ありのとき（自己判定（英→日）＝ kind は "headword"）だけ配列を組み立てて先頭を赤字にする。
 *
 * 強調ありが 1 形式だけ（＝ kind は訳語表示のもの 1 つ）という前提で書いてある。
 * 他形式へ強調を広げるなら、この前提から見直すこと（ADR-0100 決定 2）。
 */
function correctDisplayNode(kind: PromptKind, display: CorrectDisplay): React.ReactNode {
  if (!display.emphasizeFirst) return answerSideDisplayOf(kind, display.texts[0] ?? "");
  return display.texts.map((text, i) => (
    <Fragment key={i}>
      {i > 0 ? "; " : null}
      <MeaningText text={text} baseClassName={i === 0 ? "text-red-500" : undefined} />
    </Fragment>
  ));
}

/**
 * その行に「自分の回答」として出す内容があるか。自己判定形式の正解・不正解は回答内容を持たない
 * （`answerDisplay` が null で、VAGUE / GAVE_UP / TIMEOUT のような固定文言にも当たらない）ため false。
 */
function hasMyAnswer(row: ResultRow): boolean {
  return (
    row.answerDisplay !== null ||
    row.result === "VAGUE" ||
    row.result === "GAVE_UP" ||
    row.result === "TIMEOUT"
  );
}

/**
 * 履歴送信の状態（single-flight は quiz-flow 側で担保。再送ボタンは失敗確定後のみ表示）。
 * success は TEST（`submitQuizAnswers`）と DRILL_RETRY（`submitDrillRetry`）、drill-success は
 * DRILL（`submitDrillRound`）の成功。
 * 残数バッジは drill-success の確定残数のみに基づき、クライアント見込み計算で先出ししない
 * （DRILL_RETRY は残数不変・応答にも含まれないため表示しない）。
 * drill の完了（全単語定着）は quiz-flow の state が持ち、props の `drillCompleted` で受ける。
 */
export type SubmitState =
  | { status: "sending" }
  | { status: "success"; skippedWordIds: string[] }
  | {
      status: "drill-success";
      remaining: { wordId: string; remaining: number }[];
    }
  | { status: "error"; message: string };

/**
 * 完了画面の「同じ範囲でもう一度テストする」直上に出す対象件数の取得結果
 * （`getQuizPreview` のライブ値。quiz-flow が完了状態の結果画面で取得する）。
 * 取得前・取得中は null（完了画面では「確認中…」表示になる）。
 */
export type SourceTestPreview = { status: "ready"; targetCount: number } | { status: "error" };

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
  /**
   * 再テスト導線。TEST: 「同じ範囲でもう一度テストする」（同じ開始入力で新しいテスト）／
   * DRILL・DRILL_RETRY: 「同じ問題でもう一度テストする」（残数に影響しない再テスト）。
   * いずれも送信成功後のみ有効。
   */
  onStartRetry: () => void;
  /**
   * DRILL・DRILL_RETRY の定着完了時のみ: 「同じ範囲でもう一度テストする」（元テストの範囲・形式で
   * 新しい通常テストを開始）。送信成功後のみ有効。
   */
  onStartSourceTest: () => void;
  /**
   * 「同じ範囲でもう一度テストする」直上に出す元テストの範囲ラベル
   * （例「本A No.1〜100」。進行中一覧と同表記）。drill 未確立時は null。
   */
  sourceTestLabel: string | null;
  /** 同・対象件数の取得状態（quiz-flow が完了状態の結果画面でのみ取得する）。 */
  sourceTestPreview: SourceTestPreview | null;
  /**
   * drill が完了（全単語定着）したか（quiz-flow がラウンド送信の応答から保持する値）。
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
  /**
   * 行タップで単語詳細を開く。ダイアログの状態・描画は親（QuizFlow）が持つ（back ガードの最上段の層）。
   * navOrder は開いた時点の表示行（`wrongOnly` 適用後）の wordId 配列スナップショットで、
   * ダイアログの前後ナビの順序になる（docs/adr/0088-quiz-dialog-list-order-nav.md）。
   */
  onOpenDialog: (wordId: string, navOrder: string[]) => void;
  /**
   * 行のブックマークトグルの状態マップ（wordId → boolean。quiz-flow が結果フェーズ入りで一括取得）。
   * null = 未取得（取得前・取得失敗）でトグルを描画しない。
   */
  bookmarkStates: Map<string, boolean> | null;
  /** 行・ダイアログのトグルをマップへ同期する（楽観的更新の確定・巻き戻しの両方で呼ばれる）。 */
  onBookmarkChange: (wordId: string, bookmarked: boolean) => void;
  /**
   * 「間違えた問題だけ表示」ON 時の一括ブックマークの実行（対象 wordId 群を渡す）。
   * 実行本体（楽観的更新・ロールバック・toast）は bookmarkStates を持つ QuizFlow 側にある。
   */
  onBulkBookmark: (wordIds: string[]) => void;
  /** 一括ブックマークの実行中（多重押下防止の disabled に使う。QuizFlow 側の isPending）。 */
  bulkBookmarking: boolean;
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
  onStartSourceTest,
  sourceTestLabel,
  sourceTestPreview,
  drillCompleted,
  drillIncludeCorrect,
  onDrillIncludeCorrectChange,
  drillRemaining,
  onDrillRemainingChange,
  onOpenDialog,
  bookmarkStates,
  onBookmarkChange,
  onBulkBookmark,
  bulkBookmarking,
}: Props) {
  const [wrongOnly, setWrongOnly] = useState(false);
  // 「自分の回答」の表示切替。既定は非表示で、確認したいときだけ開く（ADR-0097）。
  const [showMyAnswer, setShowMyAnswer] = useState(false);
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
  // 「自分の回答を表示」トグルを出すか。誤答フィルタと同じく全行ベースで判定する（絞り込みで
  // トグルが出入りしないように）。
  const anyMyAnswer = rows.some(hasMyAnswer);
  // 誤答のみ（トグル OFF）かつ全問正解だと定着対象が 0 件になるため開始を抑止する。
  const noDrillWords = !drillIncludeCorrect && wrongCount === 0;
  const skippedWordIds =
    submitState.status === "success" ? new Set(submitState.skippedWordIds) : null;
  // DRILL: 送信成功までは残数表示を保留する。
  // DRILL_RETRY は success 変種のため自動的に null（残数バッジなし）になる。
  const remainingByWordId =
    submitState.status === "drill-success"
      ? new Map(submitState.remaining.map((r) => [r.wordId, r.remaining]))
      : null;
  // 一括ブックマークの対象（誤答行から削除済みを除いたもの）。履歴送信の成功前は削除済みが未確定で
  // 誤答行数のままになるが、その間はボタンが disabled のため押下されない。
  const bulkTargetIds = computeBulkBookmarkTargetIds(rows, submitState);
  // 送信成功後のみ実行できる（削除済みの確定が前提）。success = TEST / DRILL_RETRY、drill-success = DRILL。
  const submitSucceeded =
    submitState.status === "success" || submitState.status === "drill-success";

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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ListToggle
            id="result-wrong-only"
            label="間違えた問題だけ表示"
            checked={wrongOnly}
            onCheckedChange={setWrongOnly}
          />
          {/* 「自分の回答」は既定で非表示（正解を先に確認したいときに視界へ入れない）。
              回答内容を持つ行が 1 つも無い一覧（自己判定だけの結果など）では効かないため出さない。 */}
          {anyMyAnswer ? (
            <ListToggle
              id="result-show-my-answer"
              label="自分の回答を表示"
              checked={showMyAnswer}
              onCheckedChange={setShowMyAnswer}
            />
          ) : null}
        </div>
      ) : null}

      {/* 誤答だけを表示している間の一括ブックマーク導線。誤答 0 件・状態マップ未取得では出さない
          （disabled で残さない）。親が flex-col（stretch）のため self-start で内容幅・左寄せにする。 */}
      {wrongOnly && visibleRows.length > 0 && bookmarkStates !== null ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={!submitSucceeded || bulkTargetIds.length === 0 || bulkBookmarking}
          onClick={() => onBulkBookmark(bulkTargetIds)}
        >
          <BookmarkIcon />
          {bulkTargetIds.length}語をまとめてブックマーク
        </Button>
      ) : null}

      {wrongOnly && visibleRows.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          間違えた問題はありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibleRows.map((row) => {
            // 発音ボタンは英語（headword / TG 英文）が見出し行にある形式では見出し行の右端、
            // 英語が正解行に出る形式（日→英）では正解行の右端に置く。
            const audioOnHeading = row.promptKind === "headword" || row.promptKind === "tg-text";
            // 単語削除済みの行にはブックマークトグルを出さない（wordId の参照先なし）。
            // 削除の判定源は送信応答: TEST / DRILL_RETRY は skippedWordIds、DRILL は確定残数に行が無いこと。
            const deleted =
              (skippedWordIds?.has(row.wordId) ?? false) ||
              (remainingByWordId !== null && !remainingByWordId.has(row.wordId));
            const bookmarked = bookmarkStates?.get(row.wordId) ?? false;
            return (
              <li key={row.wordId}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    onOpenDialog(
                      row.wordId,
                      visibleRows.map((r) => r.wordId),
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenDialog(
                        row.wordId,
                        visibleRows.map((r) => r.wordId),
                      );
                    }
                  }}
                  className="border-border bg-card/50 hover:bg-muted/60 flex w-full cursor-pointer flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors"
                >
                  <div className="flex w-full flex-wrap items-center gap-2">
                    <ResultIcon result={row.result} />
                    <span className="font-content text-sm font-semibold break-words whitespace-pre-wrap">
                      {promptDisplayOf(row)}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      {skippedWordIds?.has(row.wordId) ? (
                        <Badge variant="secondary">削除済み</Badge>
                      ) : null}
                      {audioOnHeading ? (
                        <RowAudioButton
                          src={row.pronunciationAudioUrl}
                          label="発音"
                          ttsText={row.ttsText}
                        />
                      ) : null}
                      {/* ボタンは内部 state 初期化子で表示するため、マップ値の変化（ダイアログでの
                          トグル同期・失敗時の巻き戻し）は key の再マウントで反映する */}
                      {bookmarkStates !== null && !deleted ? (
                        <RowBookmarkButton
                          key={`bookmark-${bookmarked}`}
                          wordId={row.wordId}
                          bookmarked={bookmarked}
                          onBookmarkChange={(next) => onBookmarkChange(row.wordId, next)}
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="flex w-full items-start gap-2">
                    <p className="text-sm whitespace-pre-wrap">
                      <span className="text-muted-foreground">正解: </span>
                      <span className="font-content font-semibold">
                        {correctDisplayNode(row.promptKind, row.correctDisplay)}
                      </span>
                    </p>
                    {!audioOnHeading ? (
                      <div className="ml-auto shrink-0">
                        <RowAudioButton
                          src={row.pronunciationAudioUrl}
                          label="発音"
                          ttsText={row.ttsText}
                        />
                      </div>
                    ) : null}
                  </div>
                  {/* 「自分の回答」行。非表示のときも残数バッジ（DRILL）はこの行に残す。 */}
                  {(showMyAnswer && hasMyAnswer(row)) || remainingByWordId !== null ? (
                    <div className="flex w-full items-start gap-2">
                      {!showMyAnswer ? null : row.result === "VAGUE" ? (
                        // うろ覚えは正解時のみ選べる＝回答内容は正解と同じ。全形式とも「うろ覚え」と表示する。
                        <p className="text-muted-foreground text-sm">自分の回答: うろ覚え</p>
                      ) : row.answerDisplay !== null ? (
                        <p className="text-sm whitespace-pre-wrap">
                          <span className="text-muted-foreground">自分の回答: </span>
                          <span className="font-content">
                            {answerSideDisplayOf(row.promptKind, row.answerDisplay)}
                          </span>
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
            );
          })}
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
            {/* 同じ開始入力（掲載箇所・範囲・形式・制限時間）で新しいテストを開始する。
                履歴の確定（送信成功）までは無効（開始すると送信中の履歴が失われるため） */}
            <Button
              size="lg"
              variant="outline"
              className="h-auto min-h-14 py-4"
              disabled={submitState.status !== "success"}
              onClick={onStartRetry}
            >
              同じ範囲でもう一度テストする
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
              <>
                <p className="text-center text-base font-semibold" role="status">
                  すべての単語が定着しました！
                  <br />
                  おつかれさまでした！
                </p>
                {/* 元テストの範囲・形式で新しい通常テストを開始し、定着を確認する（docs/adr/0042-retest-same-range.md）。
                    直上に元テストの範囲と対象件数を出し、押す前に確認できるようにする。
                    履歴の確定（送信成功）までは無効 */}
                <SourceTestInfo label={sourceTestLabel} preview={sourceTestPreview} />
                <Button
                  size="lg"
                  className="h-auto min-h-14 py-4"
                  disabled={submitState.status !== "drill-success"}
                  onClick={onStartSourceTest}
                >
                  同じ範囲でもう一度テストする
                </Button>
              </>
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
            {/* 残数に影響しない再テスト（docs/adr/0041-drill-retry.md）。履歴の確定（送信成功）までは無効 */}
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
          // DRILL_RETRY: 残数バッジ・完了メッセージなし。drill 完了済みなら「次のラウンドへ」の
          // 代わりに「同じ範囲でもう一度テストする」（DRILL 完了画面と同じ前進導線）を出す
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
            ) : (
              <>
                <SourceTestInfo label={sourceTestLabel} preview={sourceTestPreview} />
                <Button
                  size="lg"
                  className="h-auto min-h-14 py-4"
                  disabled={submitState.status !== "success"}
                  onClick={onStartSourceTest}
                >
                  同じ範囲でもう一度テストする
                </Button>
              </>
            )}
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

/** 結果一覧の表示切替（誤答フィルタ・自分の回答）の 1 項目。 */
function ListToggle({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Label
      htmlFor={id}
      className="text-muted-foreground flex cursor-pointer items-center gap-2 text-sm font-normal"
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      {label}
    </Label>
  );
}

/**
 * 完了画面の元テスト範囲・対象件数の 1 行表示（「同じ範囲でもう一度テストする」の直上）。
 * 件数はライブ値のため取得中は「確認中…」、取得失敗時は範囲ラベルのみに落とす（ボタンは影響なし）。
 */
function SourceTestInfo({
  label,
  preview,
}: {
  label: string | null;
  preview: SourceTestPreview | null;
}) {
  if (label === null) return null;
  const countText =
    preview === null
      ? "・対象件数を確認中…"
      : preview.status === "error"
        ? ""
        : `・対象 ${preview.targetCount}語`;
  return (
    <p className="text-muted-foreground text-center text-sm">
      {label}
      {countText}
    </p>
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
