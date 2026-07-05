// ブラウザでのログイン・ユーザー種別のヘルパ。
// 3 パターン: system(admin) / 使い回しの一般(test@example.com) / 使い捨ての一般。
// 一般ユーザーは test@example.com を既定にして使い回す（事前データもこれで作る）。
// 使い捨ては「新規ユーザーの観点」が本質的に必要なときのみ（ユーザー削除検証の残骸チェックは副次用途）。
import type { BrowserContext, Page } from "playwright-core";

/** system(admin) ユーザー。id/email は固定（src/lib/system-user.ts）。 */
export const SYSTEM_EMAIL = "system@deja-word.internal";

/** system ログインパスワード。db:set-system-password が使う SYSTEM_USER_PASSWORD（.env 既定 demodemo）。 */
export function systemPassword(): string {
  return process.env["SYSTEM_USER_PASSWORD"] ?? "demodemo";
}

/** 使い回す一般ユーザー。破壊を伴わない検証はこれを再利用する（動作確認コスト最小化）。 */
export const TEST_USER_EMAIL = "test@example.com";
export const TEST_USER_PASSWORD = "testtest"; // MIN_PASSWORD_LENGTH(8) を満たす固定値

/**
 * `/sign-in` を UI 操作してログインする。成功で `/menu`（等）へ遷移するのを待って Page を返す。
 * 失敗時はサインインページの role=alert 文言を添えて throw する。
 */
export async function login(
  context: BrowserContext,
  email: string,
  password: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 15_000 });
  } catch {
    const alert = await page
      .locator("p[role=alert]")
      .first()
      .innerText()
      .catch(() => "");
    throw new Error(`login failed for ${email}: ${alert || "(no error text / timed out)"}`);
  }
  return page;
}
