import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  fluid: true, // Fluid Compute を明示（新規プロジェクトはデフォルト有効だが、将来のデフォルト変更に強くなる）
  regions: ["sin1"], // Function を Singapore に固定。Hobby は 1 region のみ
  git: {
    // Git push 起点の自動デプロイは全ブランチで停止する。
    // production デプロイは GitHub Release(Publish) → .github/workflows/release-deploy.yml が
    // Vercel CLI(`vercel deploy --prod`) で実行する。CLI デプロイはこの設定の影響を受けない。
    // また Neon Integration の Preview branching が無効な運用のため、Preview が立つと本番 DB を
    // 指してしまう事故を予防する意味でも全 false を維持する。
    // minimatch: '**' は階層を含む全ブランチにマッチ。
    deploymentEnabled: {
      "**": false,
    },
  },
};
