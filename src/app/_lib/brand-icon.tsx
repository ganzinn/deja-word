import { ImageResponse } from "next/og";

// 「重なる D」ブランドマーク。ダークモードに追従しないアイコン
// （Apple アイコン / ホーム画面アイコン）向けに、zinc-900 のベタ背景 +
// zinc-50 のマークで固定する。タブ用のモード追従アイコンは icon.svg 側。
export const BRAND_BG = "#18181b";

const BRAND_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path fill="#fafafa" fill-opacity="0.26" fill-rule="evenodd" d="M22 14 H46 C64 14 74 27 74 44 C74 61 64 74 46 74 H22 Z M34 26 H46 C56 26 60 34 60 44 C60 54 56 62 46 62 H34 Z"/>
  <path fill="#fafafa" fill-rule="evenodd" d="M30 26 H54 C72 26 82 39 82 56 C82 73 72 86 54 86 H30 Z M42 38 H54 C64 38 68 46 68 56 C68 66 64 74 54 74 H42 Z"/>
</svg>`;

// マークはキャンバスの約 62%（apple-icon の 112/180 比を踏襲）。
// maskable のセーフゾーン（中央 80%）に収まるサイズ。
const MARK_RATIO = 112 / 180;

// px × px のベタ背景 PNG アイコンを生成する。apple-icon / manifest 用 PNG で共用。
export function renderBrandIcon(px: number) {
  const markPx = Math.round(px * MARK_RATIO);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_BG,
      }}
    >
      <img
        width={markPx}
        height={markPx}
        src={`data:image/svg+xml,${encodeURIComponent(BRAND_MARK_SVG)}`}
        alt=""
      />
    </div>,
    { width: px, height: px },
  );
}
