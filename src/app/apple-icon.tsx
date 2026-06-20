import { ImageResponse } from "next/og";

// Image metadata
export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

// 「重なる D」マーク。Apple アイコンはダークモードに追従しないため、
// zinc-900 のベタ背景 + zinc-50 のマークで固定する。
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="112" height="112">
  <path fill="#fafafa" fill-opacity="0.26" fill-rule="evenodd" d="M22 14 H46 C64 14 74 27 74 44 C74 61 64 74 46 74 H22 Z M34 26 H46 C56 26 60 34 60 44 C60 54 56 62 46 62 H34 Z"/>
  <path fill="#fafafa" fill-rule="evenodd" d="M30 26 H54 C72 26 82 39 82 56 C82 73 72 86 54 86 H30 Z M42 38 H54 C64 38 68 46 68 56 C68 66 64 74 54 74 H42 Z"/>
</svg>`;

// Image generation
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#18181b",
        }}
      >
        <img
          width={112}
          height={112}
          src={`data:image/svg+xml,${encodeURIComponent(mark)}`}
          alt=""
        />
      </div>
    ),
    {
      ...size,
    },
  );
}
