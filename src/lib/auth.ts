import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { recordResetToken } from "@/lib/auth-reset-link";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/password-policy";
import { prisma } from "@/lib/prisma";
import { signUpDisabled } from "@/lib/signup-policy";

// パスワード設定 URL（管理者招待 / 本人によるリセット）の有効期限。
const RESET_PASSWORD_TOKEN_EXPIRES_IN = 60 * 60 * 24; // 24h

export const auth = betterAuth({
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: signUpDisabled,
    // クライアント検証（set-password 等）とサーバーポリシーを一致させるため明示する
    // （値は Better Auth の既定 8/128 と同じ）。
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
    resetPasswordTokenExpiresIn: RESET_PASSWORD_TOKEN_EXPIRES_IN,
    // メール送信はせず、発行された reset トークンを捕捉して管理画面に設定 URL を表示する。
    // この捕捉（auth-reset-link.ts）は sendResetPassword が同一 async コンテキストで
    // await されることに依存する。`advanced.backgroundTasks.handler` を設定すると
    // コールバックが切り離されてトークン捕捉が静かに失敗するため、設定しないこと。
    sendResetPassword: async ({ token }) => {
      recordResetToken(token);
    },
    // 招待 / 設定リンクは入力アドレスへ手動送付される。本人がリンクを踏んでパスワードを設定できた＝
    // そのアドレスを受信できる証明なので、設定完了時に emailVerified=true にする。
    onPasswordReset: async ({ user }) => {
      if (!user.emailVerified) {
        await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
      }
    },
  },
  plugins: [nextCookies()],
});
