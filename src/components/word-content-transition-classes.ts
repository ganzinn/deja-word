/** 単語の前後ナビの方向。`prev` = 前の単語へ、`next` = 次の単語へ。 */
export type WordNavDirection = "prev" | "next";

/**
 * 到着した単語コンテンツの進入アニメーション用クラス。
 *
 * 「次へ」は右から、「前へ」は左から進入させ、指の動き（左フリック＝次へ）と向きを揃える。
 * `null`（方向不明・初回表示）は演出なし。
 *
 * アニメ系クラスにはすべて `motion-safe:` を付ける。`prefers-reduced-motion: reduce` では
 * スライドもフェードも再生されず即時差し替えになり、淡色化（opacity）だけが残る。
 * クラス名は Tailwind に検出させるため、断片を組み立てず完全な文字列リテラルで持つ。
 */
export function slideInClass(direction: WordNavDirection | null): string {
  switch (direction) {
    case "next":
      return "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-8 motion-safe:duration-200";
    case "prev":
      return "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-8 motion-safe:duration-200";
    case null:
      return "";
  }
}
