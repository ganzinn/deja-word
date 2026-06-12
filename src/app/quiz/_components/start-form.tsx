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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FORMAT_OPTIONS } from "@/lib/quiz/format-options";
import { cn } from "@/lib/utils";
import type { QuizFormat } from "@/generated/prisma/enums";
import type { ActiveDrill } from "@/lib/drill-list";
import type { QuizDefaults } from "@/lib/quiz-default-settings";
import type { QuizPreview } from "@/lib/quiz-preview";
import type { StartQuizInput } from "@/lib/schema/quiz";

import { deleteDrill, getQuizPreview } from "../actions";

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
   * フォームの初期値（デフォルト設定。未保存なら null）。occurrenceId は
   * page.tsx が occurrences に存在するものだけに絞って渡す。初期 format が
   * プレビューで不成立でも自動解除しない（ユーザー選択と同じ扱い）。
   */
  defaults: QuizDefaults | null;
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

function previewKeyOf(occurrenceId: string, rangeFrom?: number, rangeTo?: number): string {
  return `${occurrenceId}:${rangeFrom ?? ""}:${rangeTo ?? ""}`;
}

const PREVIEW_DEBOUNCE_MS = 300;

/** 空欄は undefined（制限なし）。0 以下・非整数はサーバー側 zod が invalid として弾く。 */
function parseRangeValue(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) return undefined;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? undefined : n;
}

export function StartForm({ occurrences, activeDrills, defaults, onStart, onResumeDrill }: Props) {
  const [occurrenceId, setOccurrenceId] = useState<string | null>(defaults?.occurrenceId ?? null);
  const [rangeFromText, setRangeFromText] = useState(defaults?.rangeFrom?.toString() ?? "");
  const [rangeToText, setRangeToText] = useState(defaults?.rangeTo?.toString() ?? "");
  const [format, setFormat] = useState<QuizFormat | null>(defaults?.format ?? null);
  const [previewResponse, setPreviewResponse] = useState<PreviewResponse | null>(null);
  // 応答順逆転対策の単調増加トークン（クライアント内で完結。Action の入出力には含めない）
  const previewTokenRef = useRef(0);

  const rangeFrom = parseRangeValue(rangeFromText);
  const rangeTo = parseRangeValue(rangeToText);
  const requestKey = occurrenceId === null ? null : previewKeyOf(occurrenceId, rangeFrom, rangeTo);

  useEffect(() => {
    if (occurrenceId === null || requestKey === null) return;
    // debounce: 入力が続く間は cleanup がタイマーを破棄して発火させない
    const timer = setTimeout(() => {
      const token = ++previewTokenRef.current;
      void getQuizPreview({ occurrenceId, rangeFrom, rangeTo }).then((result) => {
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
  }, [occurrenceId, rangeFrom, rangeTo, requestKey]);

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

  function formatInfoOf(value: QuizFormat) {
    return preview?.formats.find((f) => f.format === value) ?? null;
  }

  const selectedFormatInfo = format !== null ? formatInfoOf(format) : null;
  const canStart =
    occurrenceId !== null &&
    format !== null &&
    preview !== null &&
    preview.targetCount > 0 &&
    selectedFormatInfo?.available === true;

  function handleStart() {
    if (!canStart || occurrenceId === null || format === null) return;
    onStart({ occurrenceId, rangeFrom, rangeTo, format });
  }

  const selectItems = occurrences.map((o) => ({
    value: o.id,
    label: `${o.location}（${o.wordCount}語）`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <Label htmlFor="quiz-occurrence">掲載箇所</Label>
        <Select items={selectItems} value={occurrenceId} onValueChange={setOccurrenceId}>
          <SelectTrigger id="quiz-occurrence" className="w-full">
            <SelectValue placeholder="掲載箇所を選択" />
          </SelectTrigger>
          <SelectContent>
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
          />
        </div>
        <p className="text-muted-foreground text-xs">
          空欄は「制限なし」。片側のみも指定できます。
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <Label>出題形式</Label>
        <div role="radiogroup" aria-label="出題形式" className="flex flex-col gap-2">
          {FORMAT_OPTIONS.map((option) => {
            const info = formatInfoOf(option.value);
            // 成立可否はプレビュー応答（サーバー判定）。プレビュー未取得の間は選択自体は許す
            const unavailable = info !== null && !info.available;
            const selected = format === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={unavailable}
                onClick={() => {
                  if (!unavailable) setFormat(option.value);
                }}
                className={cn(
                  "border-border bg-card/50 flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                  !unavailable && "hover:bg-muted/60",
                  selected && "border-primary bg-primary/10",
                  unavailable && !selected && "opacity-50",
                )}
              >
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-muted-foreground text-xs">{option.description}</span>
                {unavailable ? (
                  <span className="text-destructive text-xs">選択できません: {info.reason}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-1" aria-live="polite">
        {previewState.status === "idle" ? (
          <p className="text-muted-foreground text-sm">掲載箇所を選択してください</p>
        ) : previewState.status === "loading" ? (
          <p className="text-muted-foreground text-sm">対象件数を確認中…</p>
        ) : previewState.status === "error" ? (
          <p className="text-destructive text-sm">{previewState.message}</p>
        ) : (
          <>
            <p className="text-sm">
              対象{" "}
              <span className="text-base font-semibold">{previewState.preview.targetCount}</span>語
            </p>
            <ExcludedNote excluded={previewState.preview.excluded} />
          </>
        )}
      </section>

      <Button size="lg" disabled={!canStart} onClick={handleStart}>
        開始
      </Button>

      {/* 進行中 drill がなければセクションごと非表示（04-ui.md「開始画面（/quiz）」） */}
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

/** 進行中の定着モード 1 行（元テストの範囲・残単語数・最終実施日＋再開・削除）。 */
function ActiveDrillRow({ drill, onResume }: { drill: ActiveDrill; onResume: () => void }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const rangeLabel = `${drill.occurrenceName} No.${drill.rangeFrom}〜${drill.rangeTo}`;

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
  // noNumber / noMeaning は独立カウントのため合算・恒等式の表示はしない（重複があり得る）
  const parts: string[] = [];
  if (excluded.noNumber > 0) parts.push(`掲載番号なしの単語 ${excluded.noNumber}語`);
  if (excluded.noMeaning > 0) parts.push(`意味未登録の単語 ${excluded.noMeaning}語`);
  if (parts.length === 0) return null;
  return <p className="text-muted-foreground text-xs">{parts.join("・")}は対象外</p>;
}
