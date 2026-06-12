"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { QuizFormat } from "@/generated/prisma/enums";
import type { QuizPreview } from "@/lib/quiz-preview";
import type { StartQuizInput } from "@/lib/schema/quiz";

import { getQuizPreview } from "../actions";

/** 開始画面の Occurrence 選択肢（page.tsx が単語数つきで取得して渡す）。 */
export type OccurrenceOption = {
  id: string;
  location: string;
  wordCount: number;
};

type Props = {
  occurrences: OccurrenceOption[];
  onStart: (input: StartQuizInput) => void;
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

const FORMAT_OPTIONS: { value: QuizFormat; label: string; description: string }[] = [
  { value: "CHOICE", label: "四択", description: "4 つの選択肢から正しい意味を選ぶ" },
  { value: "SELF_JUDGE", label: "自己判定", description: "解答を見て自分で正誤を判定する" },
  { value: "MULTI_MEANING", label: "多義語選択", description: "正しい意味をすべて選ぶ" },
];

/** 空欄は undefined（制限なし）。0 以下・非整数はサーバー側 zod が invalid として弾く。 */
function parseRangeValue(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) return undefined;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? undefined : n;
}

export function StartForm({ occurrences, onStart }: Props) {
  const [occurrenceId, setOccurrenceId] = useState<string | null>(null);
  const [rangeFromText, setRangeFromText] = useState("");
  const [rangeToText, setRangeToText] = useState("");
  const [format, setFormat] = useState<QuizFormat | null>(null);
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
