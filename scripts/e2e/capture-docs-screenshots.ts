// docs/features/ 用スクリーンショットの一括撮影スクリプト（pnpm e2e:capture-docs）。
// セクション単位で追記していく（--only <section>[,<section>] で部分実行できる）。
// 撮影内容はローカル DB の登録データに依存する。全体像・チケットは docs/plan/feature-docs.md、
// 実行前提（dev サーバ・test1 ユーザー等）は docs/features/README.md の再生成レシピを参照。
import "dotenv/config";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

import { login, TEST_USER1_EMAIL, TEST_USER1_PASSWORD } from "./auth";
import { ensureUser, makePrisma } from "./db";
import { launchBrowser, newContext } from "./harness";

const OUT_DIR = path.join(process.cwd(), "docs", "features", "images");

/** 公開ドキュメントに載る表示名。ensureUser が冪等に上書きする（他 E2E は毎回自分の名前に戻すため競合しない）。 */
const DOCS_USER_NAME = "デモユーザー";

/** 撮影済みファイル名（拡張子なし）。最後に欠落チェックとサマリ表示に使う。 */
const captured: string[] = [];

/** ダークモード・アニメーション・端末差をなくした撮影専用コンテキスト。 */
async function docsContext(browser: Browser): Promise<BrowserContext> {
  return newContext(browser, {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
}

/**
 * `ready` の可視を待ち、トーストの消滅と dev インジケータ（nextjs-portal）の非表示化を挟んで
 * `docs/features/images/<name>.png` に保存する。
 */
async function shot(page: Page, name: string, ready: Locator): Promise<void> {
  await ready.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(
    () => document.querySelectorAll("[data-sonner-toast]").length === 0,
    undefined,
    { timeout: 10_000 },
  );
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  captured.push(name);
  console.log(`  shot: ${name}.png`);
}

/** 未ログインの共通画面（landing / sign-in / sign-up）とログイン直後のメニュー。 */
async function sectionCommon(browser: Browser): Promise<void> {
  const anon = await docsContext(browser);
  try {
    const page = await anon.newPage();
    await page.goto("/");
    await shot(page, "landing", page.getByRole("heading", { name: "DejaWord" }));
    await page.goto("/sign-in");
    await shot(page, "sign-in", page.locator("#password"));
    await page.goto("/sign-up");
    const signUpField = page.locator("#name");
    try {
      await shot(page, "sign-up", signUpField);
    } catch (e) {
      throw new Error(
        `sign-up の撮影に失敗しました。DISABLE_SIGNUP="true" の環境では /sign-up は 404 になります: ${String(e)}`,
      );
    }
  } finally {
    await anon.close();
  }

  const user = await docsContext(browser);
  try {
    const page = await login(user, TEST_USER1_EMAIL, TEST_USER1_PASSWORD);
    await page.goto("/menu");
    await shot(page, "menu", page.getByRole("heading", { name: "メニュー" }));
  } finally {
    await user.close();
  }
}

/** アカウント画面。 */
async function sectionAccount(browser: Browser): Promise<void> {
  const user = await docsContext(browser);
  try {
    const page = await login(user, TEST_USER1_EMAIL, TEST_USER1_PASSWORD);
    await page.goto("/account");
    await shot(page, "account", page.getByText("メールアドレス"));
  } finally {
    await user.close();
  }
}

/** セクション定義（宣言順に実行）。チケット②〜④で words / quiz / settings / admin を追加していく。 */
const SECTIONS: Record<string, (browser: Browser) => Promise<void>> = {
  common: sectionCommon,
  account: sectionAccount,
};

function parseOnly(argv: string[]): string[] {
  const names: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--only") continue;
    const value = argv[i + 1];
    if (!value) throw new Error("--only にはセクション名を指定してください");
    names.push(...value.split(",").filter(Boolean));
    i++;
  }
  const unknown = names.filter((n) => !(n in SECTIONS));
  if (unknown.length > 0) {
    throw new Error(
      `不明なセクション: ${unknown.join(", ")}（利用可能: ${Object.keys(SECTIONS).join(", ")}）`,
    );
  }
  return names;
}

async function main(): Promise<void> {
  const only = parseOnly(process.argv.slice(2));
  const targets = Object.entries(SECTIONS).filter(
    ([name]) => only.length === 0 || only.includes(name),
  );

  const prisma = makePrisma();
  try {
    await ensureUser(prisma, TEST_USER1_EMAIL, TEST_USER1_PASSWORD, DOCS_USER_NAME);
  } finally {
    await prisma.$disconnect();
  }

  await mkdir(OUT_DIR, { recursive: true });

  const browser = await launchBrowser();
  try {
    for (const [name, run] of targets) {
      console.log(`section: ${name}`);
      await run(browser);
    }
  } finally {
    await browser.close();
  }

  console.log(`done: ${captured.length} 枚を ${path.relative(process.cwd(), OUT_DIR)}/ に保存`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
