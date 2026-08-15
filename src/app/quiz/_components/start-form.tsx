"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FORMAT_GROUPS, formatLabelOf, isTgExampleFormat } from "@/lib/quiz/format-options";
import {
  DEFAULT_TIMEOUT_SECONDS,
  formatTimeoutLabel,
  TIMEOUT_MAX_SECONDS,
  TIMEOUT_MIN_SECONDS,
} from "@/lib/quiz/timeout-options";
import { cn } from "@/lib/utils";
import type { QuizFormat } from "@/generated/prisma/enums";
import type { ActiveDrill } from "@/lib/drill-list";
import type { StartFormDefaults } from "@/lib/quiz-default-settings";
import type { QuizPreview } from "@/lib/quiz-preview";
import type { StartQuizInput } from "@/lib/schema/quiz";

import { deleteDrill, getQuizPreview, saveStartSettingsAsDefaults } from "../actions";

/** 開始画面の Occurrence 選択肢（page.tsx が単語数つきで取得して渡す）。 */
export type OccurrenceOption = {
  id: string;
  location: string;
  wordCount: number;
};

type Props = {
  occurrences: OccurrenceOption[];
  /** 進行中（未完了）の drill 一覧（page.tsx が server 取得して渡す）。 */
  activeDrills: ActiveDrill[];
  /**
   * フォームの初期値（デフォルト設定）。未保存ユーザーには page.tsx が推奨デフォルトを
   * 解決して渡すため常に非 null（各フィールドは未設定として null を取り得る）。occurrenceId は
   * page.tsx が occurrences に存在するものだけに絞って渡す。初期 format が
   * プレビューで不成立でも自動解除しない（ユーザー選択と同じ扱い）。
   * showCountdown / autoplayPronunciation / enableAnswerSound / autoplayAnswerAudioJaEn は
   * 初期値ではなく挙動設定のため、ここには渡さない。saveOnStart も初期値ではなく
   * 下のトグルの初期状態（saveAsDefaultInitial）として別に渡す（StartFormDefaults で除外済み）。
   * 定着までの回数（resetRemaining / vagueRemaining / initialCorrectRemaining）は型には含まれるが
   * 開始画面では使用しない（テスト結果画面の初期値として QuizFlow が読む）。
   */
  defaults: StartFormDefaults;
  /** 「この設定をデフォルト設定とする」トグルの初期状態（設定画面のメタ設定 saveOnStart 由来）。 */
  saveAsDefaultInitial: boolean;
  onStart: (input: StartQuizInput) => void;
  /** 進行中一覧の「再開」: `startDrillRound` → DRILL モードのカウントダウンへ。 */
  onResumeDrill: (drillId: string) => void;
};

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; preview: QuizPreview }
  | { status: "error"; message: string };

/** プレビュー応答（どの入力に対する応答かを key で持ち、render 側で鮮度を判定する）。 */
type PreviewResponse =
  | { key: string; ok: true; preview: QuizPreview }
  | { key: string; ok: false; message: string };

function previewKeyOf(
  occurrenceId: string | null,
  rangeFrom: number | undefined,
  rangeTo: number | undefined,
  bookmarkedOnly: boolean,
  tgFormat: boolean,
): string {
  // TG 例文形式は対象件数・除外内訳が形式依存になるため、TG⇔非 TG の切替をキーに含めて
  // 再取得する（TG 形式同士は件数が同じため区別しない）。bookmarkedOnly の切替も対象件数を
  // 変えるためキーに含める。occurrenceId 未指定（全件モード）は空文字で表す。
  return `${occurrenceId ?? ""}:${rangeFrom ?? ""}:${rangeTo ?? ""}:${bookmarkedOnly ? "bm" : ""}:${tgFormat ? "tg" : ""}`;
}

const PREVIEW_DEBOUNCE_MS = 300;

/** 掲載箇所 Select の「指定なし」項目の値（cuid と衝突しないセンチネル。null 掲載箇所を表す）。 */
const NO_OCCURRENCE_VALUE = "__none__";

/** 空欄は undefined（制限なし）。0 以下・非整数はサーバー側 zod が invalid として弾く。 */
function parseRangeValue(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) return undefined;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? undefined : n;
}

export function StartForm({
  occurrences,
  activeDrills,
  defaults,
  saveAsDefaultInitial,
  onStart,
  onResumeDrill,
}: Props) {
  const [occurrenceId, setOccurrenceId] = useState<string | null>(defaults.occurrenceId);
  const [rangeFromText, setRangeFromText] = useState(defaults.rangeFrom?.toString() ?? "");
  const [rangeToText, setRangeToText] = useState(defaults.rangeTo?.toString() ?? "");
  // 「ブックマークのみ」絞り込み。初期値はデフォルト設定（未設定 null は OFF）。
  const [bookmarkedOnly, setBookmarkedOnly] = useState(defaults.bookmarkedOnly ?? false);
  // 出題数（空欄 = 全問出題）。初期値はデフォルト設定（未設定 null は空欄）。
  const [questionCountText, setQuestionCountText] = useState(
    defaults.questionCount?.toString() ?? "",
  );
  const initialFormat = defaults.format;
  // 初期選択形式があれば、その形式の保存済み制限時間を初期値に（未選択なら制限なし）
  const initialTimeout =
    initialFormat !== null ? (defaults.timeoutByFormat[initialFormat] ?? null) : null;
  const [format, setFormat] = useState<QuizFormat | null>(initialFormat);
  const [timeoutEnabled, setTimeoutEnabled] = useState(initialTimeout !== null);
  const [timeoutText, setTimeoutText] = useState(initialTimeout?.toString() ?? "");
  // 四択（英→日）の選択肢で先頭の訳語のみ表示する。初期値はデフォルト設定（未設定は ON）。
  const [firstMeaningTextOnly, setFirstMeaningTextOnly] = useState(
    defaults.firstMeaningTextOnly ?? true,
  );
  // 掲載番号順に出題する。初期値はデフォルト設定（未設定は OFF＝ランダム）。
  const [orderByOccurrenceNumber, setOrderByOccurrenceNumber] = useState(
    defaults.orderByOccurrenceNumber ?? false,
  );
  // 「この設定をデフォルト設定とする」トグル。初期状態は設定画面のメタ設定由来。
  // ON のままテスト開始すると開始画面の入力でデフォルトを部分上書きする（メタ設定自体は変えない）。
  const [saveAsDefault, setSaveAsDefault] = useState(saveAsDefaultInitial);

  /** 形式を選択し、その形式の保存済み制限時間を制限時間入力へ自動反映する。 */
  function selectFormat(value: QuizFormat) {
    setFormat(value);
    const saved = defaults.timeoutByFormat[value] ?? null;
    setTimeoutEnabled(saved !== null);
    setTimeoutText(saved?.toString() ?? "");
  }
  const [previewResponse, setPreviewResponse] = useState<PreviewResponse | null>(null);
  // 応答順逆転対策の単調増加トークン（クライアント内で完結。Action の入出力には含めない）
  const previewTokenRef = useRef(0);

  // 掲載箇所未指定（指定なし）の間は範囲を送信から除外する（入力テキストは保持したまま）。
  // これにより「掲載箇所未選択＋範囲指定」をスキーマが拒否する組が UI から送られない。
  const rangeFrom = occurrenceId === null ? undefined : parseRangeValue(rangeFromText);
  const rangeTo = occurrenceId === null ? undefined : parseRangeValue(rangeToText);
  // 掲載番号順も掲載箇所を指定したときだけ送る（全件モードは掲載番号を持たない。ADR-0072）。
  // 範囲入力と同じく、チェック状態は保持したまま送信値だけ false に落とす。
  const sendOrderByOccurrenceNumber = occurrenceId !== null && orderByOccurrenceNumber;
  // 出題数は掲載箇所に従属しない（ブックマーク全件モードでも有効）。空欄は undefined（全問出題）。
  const questionCount = parseRangeValue(questionCountText);
  // TG 例文形式のときだけ format をプレビューへ渡す（対象件数が TG 例文の有無で絞られる）
  const tgPreviewFormat = format !== null && isTgExampleFormat(format) ? format : undefined;
  // プレビューを取得するのは「掲載箇所が指定あり、または bookmarkedOnly=true」（＝開始しうる入力）のとき。
  // どちらでもなければ requestKey=null で idle 案内を出す。
  const canPreview = occurrenceId !== null || bookmarkedOnly;
  const requestKey = canPreview
    ? previewKeyOf(occurrenceId, rangeFrom, rangeTo, bookmarkedOnly, tgPreviewFormat !== undefined)
    : null;

  useEffect(() => {
    if (requestKey === null) return;
    // debounce: 入力が続く間は cleanup がタイマーを破棄して発火させない
    const timer = setTimeout(() => {
      const token = ++previewTokenRef.current;
      // 全件モード（occurrenceId=null）は undefined として送る（スキーマの optional に合わせる）
      void getQuizPreview({
        occurrenceId: occurrenceId ?? undefined,
        rangeFrom,
        rangeTo,
        bookmarkedOnly,
        format: tgPreviewFormat,
      }).then((result) => {
        // 自分のトークン ≠ 最新トークンなら古い応答として捨てる
        if (token !== previewTokenRef.current) return;
        if (result.ok) {
          setPreviewResponse({ key: requestKey, ok: true, preview: result.preview });
        } else {
          setPreviewResponse({ key: requestKey, ok: false, message: result.message });
        }
      });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [occurrenceId, rangeFrom, rangeTo, bookmarkedOnly, requestKey, tgPreviewFormat]);

  // 現在の入力に対する応答だけを採用（入力変更直後の古い応答は loading 扱い）
  const previewState: PreviewState =
    requestKey === null
      ? { status: "idle" }
      : previewResponse === null || previewResponse.key !== requestKey
        ? { status: "loading" }
        : previewResponse.ok
          ? { status: "ready", preview: previewResponse.preview }
          : { status: "error", message: previewResponse.message };

  const preview = previewState.status === "ready" ? previewState.preview : null;

  // ドロップダウンの value→label マップ。SelectValue がトリガー表示にのみ使う。
  // 閉じた状態でもグループが分かるよう、グループ名（薄色）＋形式名で表示する。
  const formatItems = FORMAT_GROUPS.flatMap((g) =>
    g.options.map((o) => ({
      value: o.value,
      label: (
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-xs">{g.category}</span>
          <span>{o.label}</span>
        </span>
      ),
    })),
  );
  const selectedOption =
    format !== null
      ? FORMAT_GROUPS.flatMap((g) => g.options).find((o) => o.value === format)
      : null;
  // ON かつ未入力・数値でない場合は開始をゲートする（範囲外は min/max とサーバー zod が弾く）
  const timeoutSeconds = timeoutEnabled ? parseRangeValue(timeoutText) : undefined;
  // 形式の成立可否は事前判定しない（開始時に generateQuizForUser が検証しエラー表示）。
  const canStart =
    (occurrenceId !== null || bookmarkedOnly) &&
    format !== null &&
    preview !== null &&
    preview.targetCount > 0 &&
    (!timeoutEnabled || timeoutSeconds !== undefined);

  function handleStart() {
    if (!canStart || format === null) {
      return;
    }
    const input: StartQuizInput = {
      // 全件モード（指定なし）は undefined として送る（スキーマの optional に合わせる）
      occurrenceId: occurrenceId ?? undefined,
      rangeFrom,
      rangeTo,
      bookmarkedOnly,
      questionCount,
      format,
      timeoutSeconds: timeoutSeconds ?? null,
      firstMeaningTextOnly,
      orderByOccurrenceNumber: sendOrderByOccurrenceNumber,
    };
    // トグル ON ならデフォルトへ部分上書き（非ブロッキング。失敗してもテストは進める）。
    if (saveAsDefault) {
      void saveStartSettingsAsDefaults(input).then((result) => {
        if (!result.ok) toast.error(result.message);
      });
    }
    onStart(input);
  }

  // 先頭に「指定なし」（全件モードの掲載箇所未指定）を常時表示する。トリガー表示用の value→label マップ。
  const selectItems = [
    { value: NO_OCCURRENCE_VALUE, label: "指定なし" },
    ...occurrences.map((o) => ({
      value: o.id,
      label: `${o.location}（${o.wordCount}語）`,
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <Label htmlFor="quiz-occurrence">掲載箇所</Label>
        <Select
          items={selectItems}
          value={occurrenceId ?? NO_OCCURRENCE_VALUE}
          onValueChange={(value) => setOccurrenceId(value === NO_OCCURRENCE_VALUE ? null : value)}
        >
          <SelectTrigger id="quiz-occurrence" className="w-full data-[size=default]:h-14">
            <SelectValue placeholder="掲載箇所を選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_OCCURRENCE_VALUE}>指定なし</SelectItem>
            {occurrences.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.location}（{o.wordCount}語）
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="flex flex-col gap-2">
        <Label htmlFor="quiz-range-from">掲載番号範囲</Label>
        <div className="flex items-center gap-2">
          <Input
            id="quiz-range-from"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="制限なし"
            value={rangeFromText}
            onChange={(e) => setRangeFromText(e.target.value)}
            aria-label="掲載番号（から）"
            className="h-14"
            disabled={occurrenceId === null}
          />
          <span className="text-muted-foreground shrink-0 text-sm">〜</span>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="制限なし"
            value={rangeToText}
            onChange={(e) => setRangeToText(e.target.value)}
            aria-label="掲載番号（まで）"
            className="h-14"
            disabled={occurrenceId === null}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          空欄は「制限なし」。片側のみも指定できます。
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="quiz-bookmarked-only"
            className="size-6"
            checked={bookmarkedOnly}
            onCheckedChange={(checked) => setBookmarkedOnly(checked === true)}
          />
          <Label htmlFor="quiz-bookmarked-only" className="font-normal">
            ブックマークのみ
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">
          ブックマークした単語だけを出題対象にします。掲載箇所「指定なし」でも全件からテストできます。
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <Label htmlFor="quiz-question-count">出題数</Label>
        <div className="flex items-center gap-2">
          <Input
            id="quiz-question-count"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="全問"
            value={questionCountText}
            onChange={(e) => setQuestionCountText(e.target.value)}
            aria-label="出題数"
            className="h-14 w-24"
          />
          <span className="text-muted-foreground shrink-0 text-sm">問</span>
        </div>
        <p className="text-muted-foreground text-xs">
          対象からランダムに選んで出題します。空欄は全問出題。対象より多い場合は全問出題します。
        </p>
      </section>

      <section className="flex flex-col gap-1" aria-live="polite">
        {previewState.status === "idle" ? (
          <p className="text-muted-foreground text-sm">
            掲載箇所を選択してください。「ブックマークのみ」をオンにすると、指定なしでも全件からテストできます。
          </p>
        ) : previewState.status === "loading" ? (
          <p className="text-muted-foreground text-sm">対象件数を確認中…</p>
        ) : previewState.status === "error" ? (
          <p className="text-destructive text-sm">{previewState.message}</p>
        ) : (
          <>
            <p className="text-sm">
              対象{" "}
              <span className="text-base font-semibold">{previewState.preview.targetCount}</span>語
              {questionCount !== undefined && previewState.preview.targetCount > 0 ? (
                <span>
                  ・うち{" "}
                  <span className="text-base font-semibold">
                    {Math.min(questionCount, previewState.preview.targetCount)}
                  </span>{" "}
                  問を出題
                </span>
              ) : null}
            </p>
            <ExcludedNote excluded={previewState.preview.excluded} />
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <Label htmlFor="quiz-format">出題形式</Label>
        <Select
          items={formatItems}
          value={format}
          onValueChange={(value) => {
            if (value !== null) selectFormat(value);
          }}
        >
          <SelectTrigger id="quiz-format" className="w-full data-[size=default]:h-14">
            <SelectValue placeholder="出題形式を選択" />
          </SelectTrigger>
          <SelectContent>
            {FORMAT_GROUPS.map((group) => (
              <SelectGroup key={group.category}>
                <SelectLabel>{group.category}</SelectLabel>
                {group.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span>{option.label}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {selectedOption ? (
          <p className="text-muted-foreground text-xs">{selectedOption.description}</p>
        ) : null}
        {format === "CHOICE" ? (
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="quiz-first-meaning-text-only"
              className="size-6"
              checked={firstMeaningTextOnly}
              onCheckedChange={(checked) => setFirstMeaningTextOnly(checked === true)}
            />
            <Label htmlFor="quiz-first-meaning-text-only" className="font-normal">
              選択肢に最初の訳語だけを表示する
            </Label>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="quiz-order-by-occurrence-number"
            className="size-6"
            checked={orderByOccurrenceNumber}
            onCheckedChange={(checked) => setOrderByOccurrenceNumber(checked === true)}
            disabled={occurrenceId === null}
          />
          <Label
            htmlFor="quiz-order-by-occurrence-number"
            className={cn("font-normal", occurrenceId === null && "opacity-50")}
          >
            掲載番号順に出題する
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">
          {occurrenceId === null
            ? "掲載箇所を選ぶと、掲載番号の小さい順に出題できます。「指定なし」では掲載番号が無いため、順番はランダムです。"
            : "オフのときは順番がランダムになります。選択肢の並びは掲載番号順でもランダムです。"}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <Label>制限時間</Label>
        <div className="flex items-center gap-2">
          <Checkbox
            id="quiz-timeout-enabled"
            className="size-6"
            checked={timeoutEnabled}
            onCheckedChange={(checked) => {
              setTimeoutEnabled(checked === true);
              if (checked === true && timeoutText.trim().length === 0) {
                setTimeoutText(String(DEFAULT_TIMEOUT_SECONDS));
              }
            }}
          />
          <Label htmlFor="quiz-timeout-enabled" className="font-normal">
            1 問ごとに制限時間を設定する
          </Label>
        </div>
        {timeoutEnabled ? (
          <>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={TIMEOUT_MIN_SECONDS}
                max={TIMEOUT_MAX_SECONDS}
                inputMode="numeric"
                value={timeoutText}
                onChange={(e) => setTimeoutText(e.target.value)}
                aria-label="制限時間（秒）"
                className="h-14 w-24"
              />
              <span className="text-muted-foreground shrink-0 text-sm">秒</span>
            </div>
            <p className="text-muted-foreground text-xs">
              {TIMEOUT_MIN_SECONDS}〜{TIMEOUT_MAX_SECONDS}{" "}
              秒。時間切れの解答は不正解として記録されます。
            </p>
          </>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="quiz-save-as-default"
            className="size-6"
            checked={saveAsDefault}
            onCheckedChange={(checked) => setSaveAsDefault(checked === true)}
          />
          <Label htmlFor="quiz-save-as-default" className="font-normal">
            この設定をデフォルト設定とする
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">
          オンで開始すると、上の掲載箇所・掲載番号範囲・ブックマークのみ・出題数・出題形式・掲載番号順・制限時間をデフォルト設定として保存します。
        </p>
      </section>

      <Button size="lg" className="h-auto min-h-14 py-4" disabled={!canStart} onClick={handleStart}>
        開始
      </Button>

      {/* 進行中 drill がなければセクションごと非表示 */}
      {activeDrills.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">進行中の定着モード</h2>
          <ul className="flex flex-col gap-2">
            {activeDrills.map((drill) => (
              <li key={drill.id}>
                <ActiveDrillRow drill={drill} onResume={() => onResumeDrill(drill.id)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * 進行中の定着モード 1 行（実効範囲・残単語数・最終実施日＋再開・削除）。
 * 表示する範囲は実効範囲（`Drill.rangeFrom/rangeTo` = 定着対象の単語が収まる範囲）。
 * 元テストの範囲（`sourceRangeFrom/To`）とは別物で、こちらは実際に出題される範囲を示す。
 */
function ActiveDrillRow({ drill, onResume }: { drill: ActiveDrill; onResume: () => void }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 決定 8: 全件モード drill（掲載箇所なし）は範囲数値を持たないため「ブックマークのみ」。
  // 掲載箇所あり＋元テストがブックマークのみのときは実効範囲に「（ブックマークのみ）」を併記する
  // （drill 一覧の行は掲載箇所ありなら常に実効範囲の数値を持つため、範囲指定なし分岐は完了画面側のみ）。
  const rangeLabel =
    drill.occurrenceName === null
      ? "ブックマークのみ"
      : `${drill.occurrenceName} No.${drill.rangeFrom}〜${drill.rangeTo}${
          drill.sourceBookmarkedOnly ? "（ブックマークのみ）" : ""
        }`;

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteDrill({ drillId: drill.id });
      if (result.ok) {
        toast.success("削除しました");
        setConfirmOpen(false);
        // 一覧は server 取得（page.tsx）のため再取得で反映する
        router.refresh();
        return;
      }
      toast.error(result.message);
    });
  }

  return (
    <div className="border-border bg-card/50 flex items-center gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold break-words">{rangeLabel}</span>
        <span className="text-muted-foreground text-xs">
          {formatLabelOf(drill.format)}・{formatTimeoutLabel(drill.timeoutSeconds)}
        </span>
        <span className="text-muted-foreground text-xs">
          残り {drill.remainingWordCount} 語・最終実施{" "}
          {/* SSR とクライアントのタイムゾーン差による表記ゆれは許容する */}
          <span suppressHydrationWarning>{drill.lastPlayedAt.toLocaleDateString("ja-JP")}</span>
        </span>
      </div>
      <Button variant="outline" size="sm" onClick={onResume}>
        再開
      </Button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger
          aria-label="削除"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <Trash2Icon />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>この定着モードを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{rangeLabel}」（残り {drill.remainingWordCount} 語）の進行状況が削除されます。
              これまでの解答履歴は残ります。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>キャンセル</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isPending} onClick={handleDelete}>
              {isPending ? "削除中…" : "削除する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ExcludedNote({ excluded }: { excluded: QuizPreview["excluded"] }) {
  // 各件数は独立カウントのため合算・恒等式の表示はしない（重複があり得る）
  const parts: string[] = [];
  // noNumber は全件モード（掲載箇所なし）では null（掲載箇所の概念がない）。既存の
  // noMeaning / noTgExample の null 省略と同型で、null のときは項目を出さない。
  if (excluded.noNumber !== null && excluded.noNumber > 0) {
    parts.push(`掲載番号なしの単語 ${excluded.noNumber}語`);
  }
  // noMeaning は非 TG 形式のときのみ非 null（TG 形式では意味を問わないため表示しない）
  if (excluded.noMeaning !== null && excluded.noMeaning > 0) {
    parts.push(`意味未登録の単語 ${excluded.noMeaning}語`);
  }
  // TG 例文形式のときのみ非 null（形式非依存のプレビューでは表示しない）
  if (excluded.noTgExample !== null && excluded.noTgExample > 0) {
    parts.push(`TG例文なしの単語 ${excluded.noTgExample}語`);
  }
  if (parts.length === 0) return null;
  return <p className="text-muted-foreground text-xs">{parts.join("・")}は対象外</p>;
}
