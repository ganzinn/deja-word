"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import { FORMAT_OPTIONS } from "@/lib/quiz/format-options";
import { cn } from "@/lib/utils";
import type { QuizFormat } from "@/generated/prisma/enums";
import type { QuizDefaults } from "@/lib/quiz-default-settings";

import { clearQuizDefaults, saveQuizDefaults } from "../actions";

/** デフォルト設定画面の Occurrence 選択肢（page.tsx が単語数つきで取得して渡す）。 */
export type OccurrenceOption = {
  id: string;
  location: string;
  wordCount: number;
};

type Props = {
  occurrences: OccurrenceOption[];
  /** 保存済みデフォルト（未保存なら null）。 */
  defaults: QuizDefaults | null;
};

/** 空欄は null（制限なし）。0 以下・非整数はサーバー側 zod が invalid として弾く。 */
function parseRangeValue(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * 開始画面（start-form）と同構成の入力 UI を持つ保存フォーム。
 * 関心が違う（保存 vs 開始ゲート）ため UI は共通化せず複製し、
 * 文言データ（FORMAT_OPTIONS）のみ共有する。プレビュー（対象件数・
 * 形式成立可否）は出さない: 成立可否はデータ変化で保存後いつでも
 * 変わるため、開始画面のプレビューが毎回再検証して開始をゲートする。
 */
export function QuizDefaultsForm({ occurrences, defaults }: Props) {
  const [occurrenceId, setOccurrenceId] = useState<string | null>(
    defaults?.occurrenceId ?? null,
  );
  const [rangeFromText, setRangeFromText] = useState(defaults?.rangeFrom?.toString() ?? "");
  const [rangeToText, setRangeToText] = useState(defaults?.rangeTo?.toString() ?? "");
  const [format, setFormat] = useState<QuizFormat | null>(defaults?.format ?? null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await saveQuizDefaults({
        occurrenceId,
        rangeFrom: parseRangeValue(rangeFromText),
        rangeTo: parseRangeValue(rangeToText),
        format,
      });
      if (result.ok) {
        toast.success("保存しました");
        return;
      }
      toast.error(result.message);
    });
  }

  function handleClear() {
    startTransition(async () => {
      const result = await clearQuizDefaults();
      if (result.ok) {
        setOccurrenceId(null);
        setRangeFromText("");
        setRangeToText("");
        setFormat(null);
        toast.success("クリアしました");
        return;
      }
      toast.error(result.message);
    });
  }

  const selectItems = occurrences.map((o) => ({
    value: o.id,
    label: `${o.location}（${o.wordCount}語）`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        テスト開始画面の初期値を設定します。すべて任意です。
      </p>

      <section className="flex flex-col gap-2">
        <Label htmlFor="quiz-defaults-occurrence">掲載箇所</Label>
        <Select items={selectItems} value={occurrenceId} onValueChange={setOccurrenceId}>
          <SelectTrigger id="quiz-defaults-occurrence" className="w-full">
            <SelectValue placeholder="未設定" />
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
        <Label htmlFor="quiz-defaults-range-from">掲載番号範囲</Label>
        <div className="flex items-center gap-2">
          <Input
            id="quiz-defaults-range-from"
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
            const selected = format === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  // 再クリックで選択解除（デフォルトは任意項目のため未設定へ戻せる）
                  setFormat(selected ? null : option.value);
                }}
                className={cn(
                  "border-border bg-card/50 hover:bg-muted/60 flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                  selected && "border-primary bg-primary/10",
                )}
              >
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-muted-foreground text-xs">{option.description}</span>
              </button>
            );
          })}
        </div>
        <p className="text-muted-foreground text-xs">
          選択中の形式をもう一度押すと未設定に戻ります。
        </p>
      </section>

      <div className="flex flex-col gap-2">
        <Button size="lg" disabled={isPending} onClick={handleSave}>
          {isPending ? "保存中…" : "保存"}
        </Button>
        <Button variant="outline" disabled={isPending} onClick={handleClear}>
          クリア（すべて未設定に戻す）
        </Button>
      </div>
    </div>
  );
}
