import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  fluid: true, // Fluid Compute を明示（新規プロジェクトはデフォルト有効だが、将来のデフォルト変更に強くなる）
  regions: ["sin1"], // Function を Singapore に固定。Hobby は 1 region のみ
  git: {
    // main 以外のブランチ / PR への push で自動デプロイを発生させない。
    // Neon Integration の Preview branching が無効な運用のため、Preview が立つと本番 DB を指してしまう事故を予防する。
    // minimatch: '**' は階層を含む全ブランチにマッチ。複数ルールで true が 1 つでもあれば deploy されるので main だけ明示 true にする。
    deploymentEnabled: {
      "**": false,
      main: true,
    },
  },
};
