"use client";

import { AudioPlayButton } from "@/components/audio-play-button";

import { WordDetailButton } from "./word-detail-button";

type Props = {
  /** 解答の英単語（headword）。 */
  headword: string;
  /** 発音音源の URL。null のとき AudioPlayButton 側で自動音声にフォールバックする。 */
  pronunciationAudioUrl: string | null;
  /** 「詳細」ボタンのタップ。指定時のみ英単語の隣に詳細ボタンを出す。 */
  onShowDetail?: () => void;
};

/**
 * 確定後に解答（英単語）を発音・詳細ボタンつきで大きく見せるカード。
 * 自己判定（日本語→英語）とスペル確認（日本語→英語）で見せ方を揃えるための共通表示。
 */
export function RevealedHeadwordCard({ headword, pronunciationAudioUrl, onShowDetail }: Props) {
  return (
    <div className="border-border bg-card/50 flex flex-col items-center gap-2 rounded-lg border p-4">
      <span className="text-center text-2xl font-bold tracking-tight break-words">{headword}</span>
      {/* 英単語と分けて、発音・詳細は1段下にまとめて横並びにする。 */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <AudioPlayButton src={pronunciationAudioUrl} label="発音" ttsText={headword} />
        {onShowDetail ? <WordDetailButton onClick={onShowDetail} /> : null}
      </div>
    </div>
  );
}
