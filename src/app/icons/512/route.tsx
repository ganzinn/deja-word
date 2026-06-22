import { renderBrandIcon } from "../../_lib/brand-icon";

// Manifest が参照する Android ホーム画面用 PNG（512x512、maskable 兼用）。
export function GET() {
  return renderBrandIcon(512);
}
