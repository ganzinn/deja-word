"use client";

import { PronunciationToggle } from "@/components/pronunciation-toggle";
import { usePronunciationPlayback } from "@/components/use-pronunciation-playback";
import { cn } from "@/lib/utils";

/** 単語詳細の各カード（意味・例文・関連語・掲載箇所）に共通の枠。発音の有無で見た目は変えない。 */
export const detailCardClassName =
  "border-border bg-card/50 font-content flex flex-col gap-2 rounded-lg border p-3";

type PronunciationCardProps = {
  src: string | null | undefined;
  /** `src` が無いときに端末内蔵の自動音声で読み上げる語（英単語・英文）。 */
  ttsText?: string | null;
  /** カード右上のバッジのアクセシブル名に使う呼び名。 */
  label: string;
  /**
   * メタ行に並べる要素（品詞バッジ・発音記号・関連語区分など）。バッジは絶対配置でこの行に
   * 載らないため、何も渡さなければ（例文カード）メタ行ごと畳まれ本文がカード上端から始まる。
   */
  meta?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * 単語詳細（詳細ページ・単語テストの詳細ダイアログ）のカード。**カード全体がタップで発音を鳴らす**。
 *
 * 行内に置く小さな再生ボタン（`AudioPlayButton`、高さ 24px）はスマホで押しづらかったため、
 * タップ領域をカード全体へ広げた（ADR-0092）。右上のバッジは押せる本体ではなく、
 * 「このカードは鳴るか・鳴るなら登録済み音源か自動音声か」を示す印と、キーボード／
 * スクリーンリーダー向けの操作点を兼ねる。
 *
 * カード自体を `role="button"` にはしない。関連語カードはリンクを内包しており button の入れ子は
 * 不正になること、カード本文まるごとが読み上げ名になってしまうことによる。カードの `onClick` は
 * ポインタ操作の近道と位置づけ、支援技術からの操作は右上バッジ（本物の `<button>`）が担う。
 *
 * 再生手段がまったく無い（音源なし・自動音声も使えない）カードはバッジを出さず、タップにも
 * 反応しない。**バッジの有無がそのまま「鳴るかどうか」の目印**になる。
 */
export function PronunciationCard({ src, ttsText, label, meta, children }: PronunciationCardProps) {
  const playback = usePronunciationPlayback({ src, ttsText });

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    // カード内の操作要素（右上バッジ・関連語リンク）は各自の動作を優先する。
    // バッジは自身の onClick で鳴るため、ここで弾かないと二重トグルで即停止してしまう。
    if (e.target instanceof Element && e.target.closest("a,button") !== null) return;
    // 本文をなぞって選択している最中の指離しでは鳴らさない（例文・意味のコピーを潰さない）。
    const selection = window.getSelection();
    if (selection !== null && !selection.isCollapsed) return;
    playback.toggle();
  }

  return (
    <div
      className={cn(
        detailCardClassName,
        // バッジは絶対配置なので、本文と重ならないよう右の余白だけ広げる（`p-3` の pr を上書き）。
        "relative pr-10",
        // cursor-pointer は見た目だけでなく、iOS Safari で非対話要素の click を発火させるためにも要る。
        playback.available && "active:bg-muted/50 cursor-pointer transition-colors",
      )}
      onClick={playback.available ? handleClick : undefined}
    >
      {/*
        バッジはカード右上へ絶対配置する。メタ行に流し込むと、meta を持たない例文カードで
        バッジだけの行が縦 1 行分を占めて上部に空白の帯ができるため。DOM 上は先頭に置き、
        支援技術がカードの操作点を本文より先に読み上げるようにする。
      */}
      <PronunciationToggle
        playback={playback}
        label={label}
        iconOnly
        className="absolute top-3 right-3"
      />
      {/*
        メタ行（品詞・発音記号・関連語区分）。meta が空なら `empty:hidden` で行ごと畳む
        （親 flex-col の gap が余るのを防ぐ）。
      */}
      <div className="flex flex-wrap items-center gap-2 empty:hidden">{meta}</div>
      {children}
    </div>
  );
}
