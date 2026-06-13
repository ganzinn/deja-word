"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FORMAT_GROUPS } from "@/lib/quiz/format-options";
import {
  DEFAULT_TIMEOUT_SECONDS,
  TIMEOUT_MAX_SECONDS,
  TIMEOUT_MIN_SECONDS,
} from "@/lib/quiz/timeout-options";
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
 * 文言データ（FORMAT_GROUPS）のみ共有する。プレビュー（対象件数・
 * 形式成立可否）は出さない: 成立可否はデータ変化で保存後いつでも
 * 変わるため、開始画面のプレビューが毎回再検証して開始をゲートする。
 */
export function QuizDefaultsForm({ occurrences, defaults }: Props) {
  const [occurrenceId, setOccurrenceId] = useState<string | null>(defaults?.occurrenceId ?? null);
  const [rangeFromText, setRangeFromText] = useState(defaults?.rangeFrom?.toString() ?? "");
  const [rangeToText, setRangeToText] = useState(defaults?.rangeTo?.toString() ?? "");
  const [format, setFormat] = useState<QuizFormat | null>(defaults?.format ?? null);
  const [timeoutEnabled, setTimeoutEnabled] = useState((defaults?.timeoutSeconds ?? null) !== null);
  const [timeoutText, setTimeoutText] = useState(defaults?.timeoutSeconds?.toString() ?? "");
  const [showCountdown, setShowCountdown] = useState(defaults?.showCountdown ?? false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await saveQuizDefaults({
        occurrenceId,
        rangeFrom: parseRangeValue(rangeFromText),
        rangeTo: parseRangeValue(rangeToText),
        format,
        timeoutSeconds: timeoutEnabled ? parseRangeValue(timeoutText) : null,
        showCountdown,
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
        setTimeoutEnabled(false);
        setTimeoutText("");
        setShowCountdown(false);
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
        テスト開始画面の初期値と、テストの動作を設定します。すべて任意です。
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
          {FORMAT_GROUPS.map((group) => (
            <div key={group.category} className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs font-medium">{group.category}</p>
              {group.options.map((option) => {
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
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          選択中の形式をもう一度押すと未設定に戻ります。
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <Label>制限時間</Label>
        <div className="flex items-center gap-2">
          <Checkbox
            id="quiz-defaults-timeout-enabled"
            checked={timeoutEnabled}
            onCheckedChange={(checked) => {
              setTimeoutEnabled(checked === true);
              if (checked === true && timeoutText.trim().length === 0) {
                setTimeoutText(String(DEFAULT_TIMEOUT_SECONDS));
              }
            }}
          />
          <Label htmlFor="quiz-defaults-timeout-enabled" className="font-normal">
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
                className="w-24"
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
        <Label>カウントダウン</Label>
        <div className="flex items-center gap-2">
          <Checkbox
            id="quiz-defaults-show-countdown"
            checked={showCountdown}
            onCheckedChange={(checked) => setShowCountdown(checked === true)}
          />
          <Label htmlFor="quiz-defaults-show-countdown" className="font-normal">
            テスト開始時にカウントダウン（3・2・1）を表示する
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">
          オフにすると、問題の準備が完了しだいすぐにテストが始まります。
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
