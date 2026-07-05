// ブラウザ E2E 共通基盤。playwright-core + システムの Google Chrome（channel:"chrome"）を使う。
// リポジトリにブラウザ実体は同梱しない（DL 不要・端末の Chrome を流用する）。
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

/**
 * アプリのベース URL。`E2E_BASE_URL` → `BETTER_AUTH_URL` → `http://localhost:${PORT ?? 3000}` の順。
 * 別ポート dev のときは dev 側で `BETTER_AUTH_URL=http://localhost:<port>` を上げていれば自動で揃う。
 */
export function baseUrl(): string {
  const explicit = process.env["E2E_BASE_URL"] ?? process.env["BETTER_AUTH_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  const port = process.env["PORT"] ?? "3000";
  return `http://localhost:${port}`;
}

/** システム Chrome を起動する。`E2E_HEADED=1` で GUI 表示（既定は headless）。 */
export async function launchBrowser(): Promise<Browser> {
  const headless = process.env["E2E_HEADED"] !== "1";
  return chromium.launch({ channel: "chrome", headless });
}

/** 独立 cookie jar のコンテキストを作る（別ユーザーのログインを混ぜないため 1 ユーザー 1 context）。 */
export async function newContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ baseURL: baseUrl() });
}

/**
 * 指定文言を含む sonner トースト（`[data-sonner-toast]`）が可視になるまで待ち、その文言を返す。
 * トーストは新旧が重なりうるため「文言一致」で待つ（`.last()` 依存の取り違えを避ける）。
 */
export async function waitForToast(
  page: Page,
  opts: { contains: string; timeout?: number },
): Promise<string> {
  const toast = page.locator("[data-sonner-toast]", { hasText: opts.contains }).first();
  await toast.waitFor({ state: "visible", timeout: opts.timeout ?? 10_000 });
  return (await toast.innerText()).trim();
}

/**
 * 登録/更新後に単語詳細 `/words/{id}` へ着地するのを待ち、id を返す。
 * `/words/new` に既に居る状態で待つと即マッチしてしまうため、末尾 new/edit を除外する。
 */
export async function waitForWordDetail(page: Page, timeout = 15_000): Promise<string> {
  await page.waitForURL(
    (url) => {
      const m = url.pathname.match(/^\/words\/([^/]+)$/);
      return !!m && m[1] !== "new";
    },
    { timeout },
  );
  const id = new URL(page.url()).pathname.split("/").pop();
  if (!id) throw new Error(`could not extract word id from ${page.url()}`);
  return id;
}
