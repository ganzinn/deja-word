import type { NextConfig } from "next";

// スマホ実機など localhost 以外のホスト（LAN IP 等）から dev サーバへ接続する際の
// クロスオリジン許可リスト。カンマ区切りのホストパターン（ワイルドカード可・
// プロトコル/ポートは含めない）。`*` は1ラベル照合なので例: DEV_ALLOWED_ORIGINS="192.168.*.*"
// 未設定なら空配列で従来どおり同一オリジンのみ。
const devAllowedOrigins =
  process.env.DEV_ALLOWED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  // dev 専用アセット/エンドポイント (/_next/* 等) へのクロスオリジン要求を許可（dev でのみ参照）。
  allowedDevOrigins: devAllowedOrigins,
  experimental: {
    serverActions: {
      // 音源アップロード（Server Action / FormData）のため上限を引き上げる。
      // Vercel Function のハード上限 4.5MB 内。アプリ側のサイズ検証は 4MB。
      bodySizeLimit: "4.5mb",
      // Server Action の CSRF オリジン検証。本番では追加しない（同一オリジンのみ）。
      ...(process.env.NODE_ENV !== "production" && devAllowedOrigins.length > 0
        ? { allowedOrigins: devAllowedOrigins }
        : {}),
    },
  },
};

export default nextConfig;
