import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 音源アップロード（Server Action / FormData）のため上限を引き上げる。
    // Vercel Function のハード上限 4.5MB 内。アプリ側のサイズ検証は 4MB。
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default nextConfig;
