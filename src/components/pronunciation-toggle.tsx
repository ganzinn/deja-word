"use client";

import { MicIcon, PauseIcon, PlayIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PronunciationPlayback } from "@/components/use-pronunciation-playback";
import { cn } from "@/lib/utils";

type PronunciationToggleProps = {
  playback: PronunciationPlayback;
  /** 再生対象の呼び名（`発音` / `試聴`）。aria-label に使い、`iconOnly` でなければ文字としても出す。 */
  label: string;
  /**
   * ラベル文字を出さず、アイコンだけの正方形バッジにする（既定 false）。
   * 単語詳細のカードはカード全体がタップで鳴るため、右上のバッジは「音源の有無を示す印」に徹する。
   */
  iconOnly?: boolean;
  className?: string;
};

/**
 * 発音の再生トグルの見た目（ADR-0076）。再生制御そのものは持たず、
 * `usePronunciationPlayback` の結果を受け取って描くだけ。
 *
 * 音源と自動音声は「信頼できる発音か」が違うため見た目でも区別する。区別は形（アイコン）と
 * 濃淡の両方で付ける（テーマが完全モノクロで色相を使えず、濃淡だけだと弱いため）。
 * - 音源あり: マイクアイコン＋通常コントラストの枠線（＝登録済みの正しい発音）
 * - 自動音声: 再生アイコン＋muted な文字色（＝端末合成の代用）
 * aria-label / title でも同じ区別を伝える（アイコンと濃淡だけに頼らない）。
 *
 * 再生手段が無ければ何も描画しない。「鳴らないのにボタンだけある」状態を作らないため、
 * 描画可否の判定は呼び出し側ではなくここに委ねる。
 */
export function PronunciationToggle({
  playback,
  label,
  iconOnly = false,
  className,
}: PronunciationToggleProps) {
  if (!playback.available) return null;
  const { hasAudio, playing, toggle, audioProps } = playback;
  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? "icon-xs" : "xs"}
      onClick={toggle}
      aria-label={hasAudio ? `${label}を再生` : `${label}を自動音声で再生`}
      aria-pressed={playing}
      title={
        hasAudio
          ? "登録済みの発音音源を再生します"
          : "発音音源が未登録のため、端末内蔵の自動音声で読み上げます"
      }
      // outline の hover:text-foreground / dark:border-input を上書きするため、
      // 同じ variant の指定を className 側に置いて tailwind-merge に勝たせる。
      className={cn(
        hasAudio
          ? "border-foreground/30 dark:border-foreground/30"
          : "text-muted-foreground hover:text-muted-foreground",
        className,
      )}
    >
      {playing ? <PauseIcon /> : hasAudio ? <MicIcon /> : <PlayIcon />}
      {iconOnly ? null : <span>{label}</span>}
      {audioProps ? <audio {...audioProps} /> : null}
    </Button>
  );
}
