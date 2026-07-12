// docs/features/ 用スクリーンショットの一括撮影スクリプト（pnpm e2e:capture-docs）。
// セクション単位で追記していく（--only <section>[,<section>] で部分実行できる）。
// 撮影内容はローカル DB の登録データに依存する。全体像・チケットは docs/plan/feature-docs.md、
// 実行前提（dev サーバ・test1 ユーザー等）は docs/features/README.md の再生成レシピを参照。
import "dotenv/config";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

import { login, TEST_USER1_EMAIL, TEST_USER1_PASSWORD } from "./auth";
import {
  DEMO_WORD_HEADWORD,
  ensureDemoWord,
  ensureUser,
  getLargestSharedOccurrence,
  makePrisma,
} from "./db";
import { launchBrowser, newContext } from "./harness";

const OUT_DIR = path.join(process.cwd(), "docs", "features", "images");

/** 公開ドキュメントに載る表示名。ensureUser が冪等に上書きする（他 E2E は毎回自分の名前に戻すため競合しない）。 */
const DOCS_USER_NAME = "デモユーザー";

/** 撮影済みファイル名（拡張子なし）。最後に欠落チェックとサマリ表示に使う。 */
const captured: string[] = [];

/** words セクションの被写体。main() の DB 準備で解決してから撮影で使う。 */
let demoWordId = "";
let sharedOccurrenceId = "";

/** ダークモード・アニメーション・端末差をなくした撮影専用コンテキスト。2x で文字を鮮明にする。 */
async function docsContext(browser: Browser): Promise<BrowserContext> {
  return newContext(browser, {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
}

/** コンテンツクリップ時に周囲へ残す余白（CSS px）。 */
const CLIP_PADDING = 24;

/**
 * `ready` の可視を待ち、トーストの消滅と dev インジケータ（nextjs-portal）の非表示化を挟んで
 * `docs/features/images/<name>.png` に保存する。
 * `content` を渡すとその要素の bounding box ＋余白でクリップし、ページ全体の広い余白を省く。
 */
async function shot(page: Page, name: string, ready: Locator, content?: Locator): Promise<void> {
  await ready.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(
    () => document.querySelectorAll("[data-sonner-toast]").length === 0,
    undefined,
    { timeout: 10_000 },
  );
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

  let clip: { x: number; y: number; width: number; height: number } | undefined;
  let grownViewport: { width: number; height: number } | undefined;
  if (content) {
    // 横幅はコンテナ幅、縦は子要素の実範囲を採る（flex-1 でコンテナだけ縦に伸びる画面の余白対策）。
    const box = await content.evaluate((el) => {
      const rects = [...el.children].map((c) => c.getBoundingClientRect());
      const own = el.getBoundingClientRect();
      const top = rects.length > 0 ? Math.min(...rects.map((r) => r.top)) : own.top;
      const bottom = rects.length > 0 ? Math.max(...rects.map((r) => r.bottom)) : own.bottom;
      return { x: own.left, y: top, width: own.width, height: bottom - top };
    });
    const viewport = page.viewportSize();
    if (!viewport) throw new Error(`${name}: viewport が未設定です`);
    const x = Math.max(0, box.x - CLIP_PADDING);
    const y = Math.max(0, box.y - CLIP_PADDING);
    clip = {
      x,
      y,
      width: Math.min(viewport.width, x + box.width + CLIP_PADDING * 2) - x,
      height: box.height + CLIP_PADDING * 2,
    };
    // clip は viewport 内しか撮れない。ビューポートより高いコンテンツ（単語詳細・編集など）は
    // 一時的にビューポートを伸ばして全体を収めてから撮り、撮影後に元へ戻す。
    const needed = Math.ceil(y + clip.height);
    if (needed > viewport.height) {
      grownViewport = viewport;
      await page.setViewportSize({ width: viewport.width, height: needed });
    }
  }
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), clip });
  if (grownViewport) await page.setViewportSize(grownViewport);
  captured.push(name);
  console.log(`  shot: ${name}.png`);
}

/** 未ログインの共通画面（landing / sign-in / sign-up）とログイン直後のメニュー。 */
async function sectionCommon(browser: Browser): Promise<void> {
  const anon = await docsContext(browser);
  try {
    const page = await anon.newPage();
    const content = page.locator("main > div");
    await page.goto("/");
    await shot(page, "landing", page.getByRole("heading", { name: "DejaWord" }), content);
    await page.goto("/sign-in");
    await shot(page, "sign-in", page.locator("#password"), content);
    await page.goto("/sign-up");
    const signUpField = page.locator("#name");
    try {
      await shot(page, "sign-up", signUpField, content);
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
    await shot(
      page,
      "menu",
      page.getByRole("heading", { name: "メニュー" }),
      page.locator("main > div"),
    );
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
    // account は main 自体が中央コンテナ（mx-auto max-w-*）なので main をクリップ対象にする。
    await shot(page, "account", page.getByText("メールアドレス"), page.locator("main"));
  } finally {
    await user.close();
  }
}

/** 単語管理（一覧の 2 ビュー・登録フォーム・重複警告・AI 入力・詳細・編集）。 */
async function sectionWords(browser: Browser): Promise<void> {
  const user = await docsContext(browser);
  try {
    const page = await login(user, TEST_USER1_EMAIL, TEST_USER1_PASSWORD);
    const main = page.getByRole("main");

    // 単語一覧（単語ビュー）。デモ単語が新着順の先頭に並ぶ。
    await page.goto("/words");
    await shot(page, "words-list-word-view", page.getByRole("heading", { name: "単語一覧" }), main);

    // 単語一覧（掲載箇所ビュー）。共有掲載箇所を掲載番号 1〜6 に絞って部分的に映す。
    await page.goto(`/words?view=occurrence&occ=${sharedOccurrenceId}&to=6`);
    await shot(
      page,
      "words-list-occurrence-view",
      page.getByRole("button", { name: "掲載箇所単位" }),
      main,
    );

    // 単語登録（空フォーム）。
    await page.goto("/words/new");
    await shot(page, "word-new", page.getByPlaceholder("例: ephemeral"), main);

    // AI 入力ボタン（optional）。AI Gateway 未設定環境では描画されないので短 timeout で探し WARN スキップ。
    // 全体フォームの word-new と重複しないよう、基本セクション（単語欄＋AI 入力ボタン）に寄せて撮る。
    const aiButton = page.getByRole("button", { name: "AI入力" });
    if (await aiButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const basicSection = aiButton.locator(
        "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' gap-4 ')][1]",
      );
      await shot(page, "word-new-ai-button", aiButton, basicSection);
    } else {
      console.log(
        "  warn: AI入力ボタンが無いため word-new-ai-button をスキップ（AI Gateway 未設定環境）",
      );
    }

    // 重複登録警告（コア体験）。既存の headword を入力して blur すると警告が出る（保存はしない）。
    await page.goto("/words/new");
    const headword = page.getByPlaceholder("例: ephemeral");
    await headword.fill(DEMO_WORD_HEADWORD);
    await headword.blur();
    await shot(
      page,
      "word-new-duplicate-warning",
      page.getByText("この単語は既に登録されています"),
      main,
    );

    // 単語詳細（意味・訳語・例文種別・関連語・メモ・掲載箇所が揃ったデモ単語）。
    await page.goto(`/words/${demoWordId}`);
    await shot(page, "word-detail", page.getByRole("heading", { name: "意味" }), main);

    // 単語編集。
    await page.goto(`/words/${demoWordId}/edit`);
    await shot(page, "word-edit", page.getByRole("heading", { name: "単語を編集" }), main);
  } finally {
    await user.close();
  }
}

/** セクション定義（宣言順に実行）。チケット③〜④で quiz / settings / admin を追加していく。 */
const SECTIONS: Record<string, (browser: Browser) => Promise<void>> = {
  common: sectionCommon,
  account: sectionAccount,
  words: sectionWords,
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

  const needsWords = targets.some(([name]) => name === "words");
  const prisma = makePrisma();
  try {
    await ensureUser(prisma, TEST_USER1_EMAIL, TEST_USER1_PASSWORD, DOCS_USER_NAME);
    if (needsWords) {
      demoWordId = await ensureDemoWord(prisma, TEST_USER1_EMAIL);
      sharedOccurrenceId = (await getLargestSharedOccurrence(prisma)).id;
    }
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
