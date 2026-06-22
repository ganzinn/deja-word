import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { recordResetToken } from "@/lib/auth-reset-link";
import { seedOccurrencePresetSettingsForUser } from "@/lib/occurrence-preset-settings";
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
    resetPasswordTokenExpiresIn: RESET_PASSWORD_TOKEN_EXPIRES_IN,
    // メール送信はせず、発行された reset トークンを捕捉して管理画面に設定 URL を表示する。
    sendResetPassword: async ({ token }) => {
      recordResetToken(token);
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await seedOccurrencePresetSettingsForUser(user.id);
        },
      },
    },
  },
  plugins: [nextCookies()],
});
