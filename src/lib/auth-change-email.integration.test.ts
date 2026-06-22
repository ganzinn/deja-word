import { createEmailVerificationToken } from "better-auth/api";
import { describe, expect, test } from "vitest";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { createTestUser } from "../../tests/setup/fixtures";

// admin によるメール変更フローの核（src/app/admin/users/actions.ts changeUserEmail）を検証する。
// メール基盤を持たないため検証 URL を画面表示し、本人が踏んで初めて新アドレスへ切り替わる（ステージング型）。
describe("change-email-verification flow (admin メール変更の核)", () => {
  test("トークン発行時点では email は変わらず、verifyEmail で初めて新アドレス＋emailVerified=true に切り替わる", async () => {
    const user = await createTestUser({ email: "before@test.local" });
    const newEmail = "after@test.local";

    const { secret } = await auth.$context;
    const token = await createEmailVerificationToken(
      secret,
      user.email, // 現アドレス
      newEmail, // updateTo
      60 * 60 * 24,
      { requestType: "change-email-verification" },
    );
    expect(token).toBeTruthy();

    // ★ 発行直後は即時変更されていないこと（ステージング）。
    const before = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true },
    });
    expect(before?.email).toBe("before@test.local");

    // 本人が検証リンクを踏む相当。callbackURL 無しで呼ぶと JSON を返す。
    await auth.api.verifyEmail({ query: { token } });

    const after = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, emailVerified: true },
    });
    expect(after?.email).toBe(newEmail);
    expect(after?.emailVerified).toBe(true);
  });

  test("改ざん / 不正なトークンでは切り替わらない", async () => {
    const user = await createTestUser({ email: "keep@test.local" });

    await expect(
      auth.api.verifyEmail({ query: { token: "invalid.token.value" } }),
    ).rejects.toThrow();

    const after = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true },
    });
    expect(after?.email).toBe("keep@test.local");
  });
});
