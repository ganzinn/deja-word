import { describe, expect, test } from "vitest";

import { auth } from "@/lib/auth";
import { captureResetToken } from "@/lib/auth-reset-link";
import { prisma } from "@/lib/prisma";

import { createTestUser } from "../../tests/setup/fixtures";

// 招待 / 設定リンクは入力アドレスへ手動送付される。本人がリンクを踏んでパスワードを設定できた＝
// そのアドレスを受信できる証明なので、設定完了（resetPassword）で emailVerified=true になる
// （src/lib/auth.ts の emailAndPassword.onPasswordReset）。
describe("onPasswordReset で設定完了＝メール確認済みになる", () => {
  test("resetPassword 完了後に emailVerified=true・credential アカウントが作られる", async () => {
    const user = await createTestUser({ email: "invitee@test.local" });
    // 招待直後相当（未確認）にしておく。
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: false } });

    // 設定リンク発行（メール送信せずトークンを捕捉）。
    const token = await captureResetToken(async () => {
      await auth.api.requestPasswordReset({ body: { email: user.email } });
    });
    expect(token).toBeTruthy();

    // 本人がリンクを踏んでパスワードを設定する相当。
    await auth.api.resetPassword({ body: { token: token!, newPassword: "password123" } });

    const after = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        emailVerified: true,
        accounts: { where: { providerId: "credential" }, select: { id: true } },
      },
    });
    expect(after?.emailVerified).toBe(true);
    expect(after?.accounts.length).toBe(1);
  });
});
