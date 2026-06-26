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
import { DEFAULT_QUIZ_SETTINGS } from "@/lib/quiz/default-settings";
import { ALL_QUIZ_FORMATS, FORMAT_GROUPS } from "@/lib/quiz/format-options";
import {
  DEFAULT_INITIAL_CORRECT_REMAINING,
  DEFAULT_RESET_REMAINING,
  DEFAULT_VAGUE_REMAINING,
  REMAINING_MAX_COUNT,
  REMAINING_MIN_COUNT,
} from "@/lib/quiz/remaining-options";
import {
  DEFAULT_TIMEOUT_SECONDS,
  TIMEOUT_MAX_SECONDS,
  TIMEOUT_MIN_SECONDS,
} from "@/lib/quiz/timeout-options";
import { cn } from "@/lib/utils";
import type { QuizFormat } from "@/generated/prisma/enums";
import type { QuizDefaults } from "@/lib/quiz-default-settings";

import { saveQuizDefaults } from "../actions";

/** デフォルト設定画面の Occurrence 選択肢（page.tsx が単語数つきで取得して渡す）。 */
export type OccurrenceOption = {
  id: string;
  location: string;
  wordCount: number;
};

type Props = {
  occurrences: OccurrenceOption[];
  /**
   * フォームの初期値。未保存ユーザーには page.tsx が推奨デフォルト（DEFAULT_QUIZ_SETTINGS）を
   * 解決して渡すため常に非 null（各フィールドは未設定として null を取り得る）。
   */
  defaults: QuizDefaults;
};

/** 空欄は null（制限なし）。0 以下・非整数はサーバー側 zod が invalid として弾く。 */
function parseRangeValue(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

/** 形式 1 つ分の制限時間入力状態（チェック ON/OFF と秒数テキスト）。 */
type TimeoutFieldState = { enabled: boolean; text: string };

/** timeoutByFormat（全形式キー）からフォーム状態を組み立てる。 */
function initTimeoutState(
  timeoutByFormat: Record<QuizFormat, number | null>,
): Record<QuizFormat, TimeoutFieldState> {
  return Object.fromEntries(
    ALL_QUIZ_FORMATS.map((f) => {
      const seconds = timeoutByFormat[f] ?? null;
      return [f, { enabled: seconds !== null, text: seconds?.toString() ?? "" }];
    }),
  ) as Record<QuizFormat, TimeoutFieldState>;
}

/**
 * 開始画面（start-form）と同構成の入力 UI を持つ保存フォーム。
 * 関心が違う（保存 vs 開始ゲート）ため UI は共通化せず複製し、
 * 文言データ（FORMAT_GROUPS）のみ共有する。プレビュー（対象件数・
 * 形式成立可否）は出さない: 成立可否はデータ変化で保存後いつでも
 * 変わるため、開始画面のプレビューが毎回再検証して開始をゲートする。
 */
export function QuizDefaultsForm({ occurrences, defaults }: Props) {
  const [occurrenceId, setOccurrenceId] = useState<string | null>(defaults.occurrenceId);
  const [rangeFromText, setRangeFromText] = useState(defaults.rangeFrom?.toString() ?? "");
  const [rangeToText, setRangeToText] = useState(defaults.rangeTo?.toString() ?? "");
  const [format, setFormat] = useState<QuizFormat | null>(defaults.format);
  const [timeoutByFormat, setTimeoutByFormat] = useState<Record<QuizFormat, TimeoutFieldState>>(
    () => initTimeoutState(defaults.timeoutByFormat),
  );
  const [showCountdown, setShowCountdown] = useState(defaults.showCountdown ?? false);
  // 未設定（null）は有効が既定。明示的に false を保存したときだけ OFF にする
  const [autoplayPronunciation, setAutoplayPronunciation] = useState(
    defaults.autoplayPronunciation ?? true,
  );
  const [enableAnswerSound, setEnableAnswerSound] = useState(defaults.enableAnswerSound ?? true);
  const [autoplayAnswerAudioJaEn, setAutoplayAnswerAudioJaEn] = useState(
    defaults.autoplayAnswerAudioJaEn ?? true,
  );
  // 四択（英→日）の選択肢で先頭の訳語のみ表示する。未設定（null）は ON（先頭の訳語のみ）。
  const [choiceFirstMeaningTextOnly, setChoiceFirstMeaningTextOnly] = useState(
    defaults.choiceFirstMeaningTextOnly ?? true,
  );
  // 定着モードに正答単語も含めるか（テスト結果画面トグルの初期値）。未設定（null）は OFF（誤答のみ）。
  const [drillIncludeCorrect, setDrillIncludeCorrect] = useState(
    defaults.drillIncludeCorrect ?? false,
  );
  // 定着までの回数（残数設定）。未設定（null）はアプリ既定（誤答3 / うろ覚え2 / 正答1）。空欄保存で null（既定）。
  const [resetRemainingText, setResetRemainingText] = useState(
    (defaults.resetRemaining ?? DEFAULT_RESET_REMAINING).toString(),
  );
  const [vagueRemainingText, setVagueRemainingText] = useState(
    (defaults.vagueRemaining ?? DEFAULT_VAGUE_REMAINING).toString(),
  );
  const [initialCorrectRemainingText, setInitialCorrectRemainingText] = useState(
    (defaults.initialCorrectRemaining ?? DEFAULT_INITIAL_CORRECT_REMAINING).toString(),
  );
  // 開始画面トグルの初期 ON/OFF を決めるメタ設定。未設定（null）は OFF。
  const [saveOnStart, setSaveOnStart] = useState(defaults.saveOnStart ?? false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const timeoutByFormatInput = Object.fromEntries(
      ALL_QUIZ_FORMATS.map((f) => {
        const field = timeoutByFormat[f];
        return [f, field.enabled ? parseRangeValue(field.text) : null];
      }),
    ) as Record<QuizFormat, number | null>;
    startTransition(async () => {
      const result = await saveQuizDefaults({
        occurrenceId,
        rangeFrom: parseRangeValue(rangeFromText),
        rangeTo: parseRangeValue(rangeToText),
        format,
        timeoutByFormat: timeoutByFormatInput,
        showCountdown,
        autoplayPronunciation,
        enableAnswerSound,
        autoplayAnswerAudioJaEn,
        choiceFirstMeaningTextOnly,
        drillIncludeCorrect,
        resetRemaining: parseRangeValue(resetRemainingText),
        vagueRemaining: parseRangeValue(vagueRemainingText),
        initialCorrectRemaining: parseRangeValue(initialCorrectRemainingText),
        saveOnStart,
      });
      if (result.ok) {
        toast.success("保存しました");
        return;
      }
      toast.error(result.message);
    });
  }

  function handleResetToDefault() {
    // 推奨デフォルト値をフォームに復元するだけ（保存はしない）。
    // ユーザーが内容を確認して「保存」を押すと永続化される。
    setOccurrenceId(DEFAULT_QUIZ_SETTINGS.occurrenceId);
    setRangeFromText(DEFAULT_QUIZ_SETTINGS.rangeFrom?.toString() ?? "");
    setRangeToText(DEFAULT_QUIZ_SETTINGS.rangeTo?.toString() ?? "");
    setFormat(DEFAULT_QUIZ_SETTINGS.format);
    setTimeoutByFormat(initTimeoutState(DEFAULT_QUIZ_SETTINGS.timeoutByFormat));
    setShowCountdown(DEFAULT_QUIZ_SETTINGS.showCountdown ?? false);
    setAutoplayPronunciation(DEFAULT_QUIZ_SETTINGS.autoplayPronunciation ?? true);
    setEnableAnswerSound(DEFAULT_QUIZ_SETTINGS.enableAnswerSound ?? true);
    setAutoplayAnswerAudioJaEn(DEFAULT_QUIZ_SETTINGS.autoplayAnswerAudioJaEn ?? true);
    setChoiceFirstMeaningTextOnly(DEFAULT_QUIZ_SETTINGS.choiceFirstMeaningTextOnly ?? true);
    setDrillIncludeCorrect(DEFAULT_QUIZ_SETTINGS.drillIncludeCorrect ?? false);
    setResetRemainingText(
      (DEFAULT_QUIZ_SETTINGS.resetRemaining ?? DEFAULT_RESET_REMAINING).toString(),
    );
    setVagueRemainingText(
      (DEFAULT_QUIZ_SETTINGS.vagueRemaining ?? DEFAULT_VAGUE_REMAINING).toString(),
    );
    setInitialCorrectRemainingText(
      (
        DEFAULT_QUIZ_SETTINGS.initialCorrectRemaining ?? DEFAULT_INITIAL_CORRECT_REMAINING
      ).toString(),
    );
    setSaveOnStart(DEFAULT_QUIZ_SETTINGS.saveOnStart ?? false);
    toast.success("デフォルト設定に戻しました（「保存」で確定します）");
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
        <p className="text-muted-foreground text-xs">
          カードを選ぶと開始画面の初期形式になります（もう一度押すと未設定）。各形式に 1 問あたりの
          制限時間（{TIMEOUT_MIN_SECONDS}〜{TIMEOUT_MAX_SECONDS}{" "}
          秒）を設定できます。時間切れの解答は不正解として記録されます。
        </p>
        <div role="radiogroup" aria-label="出題形式" className="flex flex-col gap-2">
          {FORMAT_GROUPS.map((group) => (
            <div key={group.category} className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs font-medium">{group.category}</p>
              {group.options.map((option) => {
                const selected = format === option.value;
                const field = timeoutByFormat[option.value];
                const checkboxId = `quiz-defaults-timeout-${option.value}`;
                return (
                  <div
                    key={option.value}
                    className={cn(
                      "border-border bg-card/50 flex flex-col gap-2 rounded-lg border p-3 transition-colors",
                      selected && "border-primary bg-primary/10",
                    )}
                  >
                    {/* 上段: タップでデフォルト出題形式を選択/解除 */}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        // 再クリックで選択解除（デフォルトは任意項目のため未設定へ戻せる）
                        setFormat(selected ? null : option.value);
                      }}
                      className="hover:bg-muted/40 -m-1 flex flex-col gap-1 rounded-md p-1 text-left transition-colors"
                    >
                      <span className="text-sm font-semibold">{option.label}</span>
                      <span className="text-muted-foreground text-xs">{option.description}</span>
                    </button>

                    {/* 下段: この形式の制限時間（選択状態とは独立） */}
                    <div className="flex flex-col gap-2 border-t pt-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={checkboxId}
                          checked={field.enabled}
                          onCheckedChange={(checked) => {
                            const enabled = checked === true;
                            setTimeoutByFormat((prev) => ({
                              ...prev,
                              [option.value]: {
                                enabled,
                                // ON で空欄なら初期値を補完
                                text:
                                  enabled && prev[option.value].text.trim().length === 0
                                    ? String(DEFAULT_TIMEOUT_SECONDS)
                                    : prev[option.value].text,
                              },
                            }));
                          }}
                        />
                        <Label htmlFor={checkboxId} className="font-normal">
                          制限時間を設定する
                        </Label>
                      </div>
                      {field.enabled ? (
                        <div className="flex items-center gap-2 pl-6">
                          <Input
                            type="number"
                            min={TIMEOUT_MIN_SECONDS}
                            max={TIMEOUT_MAX_SECONDS}
                            inputMode="numeric"
                            value={field.text}
                            onChange={(e) =>
                              setTimeoutByFormat((prev) => ({
                                ...prev,
                                [option.value]: { ...prev[option.value], text: e.target.value },
                              }))
                            }
                            aria-label={`制限時間（秒）: ${option.label}`}
                            className="w-24"
                          />
                          <span className="text-muted-foreground shrink-0 text-sm">秒</span>
                        </div>
                      ) : null}

                      {/* 四択（英→日）固有: 選択肢に先頭の訳語だけを表示するか */}
                      {option.value === "CHOICE" ? (
                        <>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="quiz-defaults-choice-first-meaning-text-only"
                              checked={choiceFirstMeaningTextOnly}
                              onCheckedChange={(checked) =>
                                setChoiceFirstMeaningTextOnly(checked === true)
                              }
                            />
                            <Label
                              htmlFor="quiz-defaults-choice-first-meaning-text-only"
                              className="font-normal"
                            >
                              選択肢に最初の訳語だけを表示する
                            </Label>
                          </div>
                          <p className="text-muted-foreground pl-6 text-xs">
                            オフにすると、複数の訳語を「; 」で連結して選択肢に表示します。
                          </p>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <Label>発音の自動再生</Label>
        <div className="flex items-center gap-2">
          <Checkbox
            id="quiz-defaults-autoplay-pronunciation"
            checked={autoplayPronunciation}
            onCheckedChange={(checked) => setAutoplayPronunciation(checked === true)}
          />
          <Label htmlFor="quiz-defaults-autoplay-pronunciation" className="font-normal">
            英語→日本語（出題時）
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">
          出題時に問題（英単語）の発音を再生します。オフでも手動の再生ボタンは使えます。
        </p>
        <div className="flex items-center gap-2">
          <Checkbox
            id="quiz-defaults-autoplay-answer-audio-ja-en"
            checked={autoplayAnswerAudioJaEn}
            onCheckedChange={(checked) => setAutoplayAnswerAudioJaEn(checked === true)}
          />
          <Label htmlFor="quiz-defaults-autoplay-answer-audio-ja-en" className="font-normal">
            日本語→英語（解答表示時）
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">
          解答（英単語）が表示されたときに発音を再生します。
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <Label>効果音</Label>
        <div className="flex items-center gap-2">
          <Checkbox
            id="quiz-defaults-enable-answer-sound"
            checked={enableAnswerSound}
            onCheckedChange={(checked) => setEnableAnswerSound(checked === true)}
          />
          <Label htmlFor="quiz-defaults-enable-answer-sound" className="font-normal">
            正誤の効果音
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">正解・不正解のときに効果音を鳴らします。</p>
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

      <section className="flex flex-col gap-2">
        <Label>開始画面の設定の保存</Label>
        <div className="flex items-center gap-2">
          <Checkbox
            id="quiz-defaults-save-on-start"
            checked={saveOnStart}
            onCheckedChange={(checked) => setSaveOnStart(checked === true)}
          />
          <Label htmlFor="quiz-defaults-save-on-start" className="font-normal">
            テスト開始画面で設定した内容をデフォルト設定とする
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">
          オンにすると、開始画面の「この設定をデフォルト設定とする」が初期オンになります。開始画面で
          オフに切り替えることもでき、その場合この設定は変わりません。
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <Label>定着モードの出題対象</Label>
        <div className="flex items-center gap-2">
          <Checkbox
            id="quiz-defaults-drill-include-correct"
            checked={drillIncludeCorrect}
            onCheckedChange={(checked) => setDrillIncludeCorrect(checked === true)}
          />
          <Label htmlFor="quiz-defaults-drill-include-correct" className="font-normal">
            正解した問題も定着モードで出題する
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">テスト結果画面のトグルの初期値です。</p>
      </section>

      <section className="flex flex-col gap-2">
        <Label>定着までの回数</Label>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-1">
            <Label
              htmlFor="quiz-defaults-remaining-reset"
              className="text-muted-foreground text-xs font-normal"
            >
              間違えた問題
            </Label>
            <Input
              id="quiz-defaults-remaining-reset"
              type="number"
              min={REMAINING_MIN_COUNT}
              max={REMAINING_MAX_COUNT}
              inputMode="numeric"
              value={resetRemainingText}
              onChange={(e) => setResetRemainingText(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label
              htmlFor="quiz-defaults-remaining-vague"
              className="text-muted-foreground text-xs font-normal"
            >
              うろ覚えの問題
            </Label>
            <Input
              id="quiz-defaults-remaining-vague"
              type="number"
              min={REMAINING_MIN_COUNT}
              max={REMAINING_MAX_COUNT}
              inputMode="numeric"
              value={vagueRemainingText}
              onChange={(e) => setVagueRemainingText(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label
              htmlFor="quiz-defaults-remaining-correct"
              className="text-muted-foreground text-xs font-normal"
            >
              正解した問題
            </Label>
            <Input
              id="quiz-defaults-remaining-correct"
              type="number"
              min={REMAINING_MIN_COUNT}
              max={REMAINING_MAX_COUNT}
              inputMode="numeric"
              value={initialCorrectRemainingText}
              onChange={(e) => setInitialCorrectRemainingText(e.target.value)}
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          定着モードで各単語を何回連続正解すれば定着とするか（{REMAINING_MIN_COUNT}〜
          {REMAINING_MAX_COUNT}
          ）。元テストの結果（間違い／うろ覚え／正解）ごとに開始回数を設定でき、
          定着モードで間違えるたびにこの回数に戻ります。
        </p>
      </section>

      <div className="flex flex-col gap-2">
        <Button size="lg" disabled={isPending} onClick={handleSave}>
          {isPending ? "保存中…" : "保存"}
        </Button>
        <Button variant="outline" disabled={isPending} onClick={handleResetToDefault}>
          デフォルト設定に戻す
        </Button>
      </div>
    </div>
  );
}
