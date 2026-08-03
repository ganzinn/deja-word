"use client";

import { AudioPlayButton } from "@/components/audio-play-button";

import { WordDetailButton } from "./word-detail-button";

type Props = {
  /** 解答の英単語（headword）。display 未指定時の表示に使う。 */
  headword: string;
  /** この問題の発音ボタンが鳴らす音源の URL。null のとき AudioPlayButton 側で自動音声にフォールバックする。 */
  pronunciationAudioUrl: string | null;
  /** 上記の音源が無いとき自動音声で読み上げる英語（`QuestionBase.ttsText`）。 */
  ttsText: string;
  /** 「詳細」ボタンのタップ。指定時のみ英単語の隣に詳細ボタンを出す。 */
  onShowDetail?: () => void;
  /** 解答の表示ノード。TG自己判定（日→英）が TG 例文ハイライトを渡す。既定は headword。 */
  display?: React.ReactNode;
};

/**
 * 確定後に解答（英単語／TG 例文の英文）を発音・詳細ボタンつきで大きく見せるカード。
 * 自己判定（日本語→英語）・スペル確認（日本語→英語）・TG自己判定（日本語→英語）で
 * 見せ方を揃えるための共通表示。
 */
export function RevealedHeadwordCard({
  headword,
  pronunciationAudioUrl,
  ttsText,
  onShowDetail,
  display,
}: Props) {
  return (
    <div className="border-border bg-card/50 flex flex-col items-center gap-2 rounded-lg border p-4">
      <span className="text-center text-2xl font-bold tracking-tight break-words">
        {display ?? headword}
      </span>
      {/* 英単語と分けて、発音・詳細は1段下にまとめて横並びにする。 */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <AudioPlayButton src={pronunciationAudioUrl} label="発音" ttsText={ttsText} />
        {onShowDetail ? <WordDetailButton onClick={onShowDetail} /> : null}
      </div>
    </div>
  );
}
