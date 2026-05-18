import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { seedOccurrencePresetSettingsForUser } from "@/lib/occurrence-preset-settings";
import { prisma } from "@/lib/prisma";
import { signUpDisabled } from "@/lib/signup-policy";

export const auth = betterAuth({
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, disableSignUp: signUpDisabled },
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
