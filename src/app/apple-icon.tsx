import { renderBrandIcon } from "./_lib/brand-icon";

// Image metadata
export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

// Image generation
export default function AppleIcon() {
  return renderBrandIcon(size.width);
}
