import { renderBrandIcon } from "../../_lib/brand-icon";

// Manifest が参照する Android ホーム画面用 PNG（192x192）。
export function GET() {
  return renderBrandIcon(192);
}
