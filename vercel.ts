import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  fluid: true, // Fluid Compute を明示（新規プロジェクトはデフォルト有効だが、将来のデフォルト変更に強くなる）
  regions: ["sin1"], // Function を Singapore に固定。Hobby は 1 region のみ
};
