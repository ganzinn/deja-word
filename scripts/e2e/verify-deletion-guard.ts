// PR #110 / ADR-0066 の「削除ガード」を E2E で検証する。
//   本命 : admin(system) が、一般ユーザー(test@example.com)が pass-through 追記した system 単語を
//          削除しようとすると、ガードで拒否される（赤トースト・詳細ページに留まる）。
//   対照+: admin が自分の子行だけの system 単語を削除 → 成功（ガードは無反応）。
//   対照0: 使い捨ての一般ユーザーが自分の私有単語を削除 → 成功（ガードは無反応）。
//
// 前提: dev サーバ稼働・DB seed 済み・system パスワード設定済み（未整備なら分かりやすく中断する）。
// 実行: pnpm e2e:guard   （GUI で見るなら E2E_HEADED=1 pnpm e2e:guard）
import "dotenv/config";
import type { BrowserContext, Page } from "playwright-core";

import { baseUrl, launchBrowser, newContext, waitForToast, waitForWordDetail } from "./harness";
import { SYSTEM_EMAIL, systemPassword, TEST_USER_EMAIL, TEST_USER_PASSWORD, login } from "./auth";
import {
  assertSystemUserReady,
  cleanupWordsByPrefix,
  deleteUserByEmail,
  ensureUser,
  makePrisma,
} from "./db";

const MEANING_PLACEHOLDER = "例: 短命の、つかの間の";
const HEADWORD_PLACEHOLDER = "例: ephemeral";
const GUARD_MESSAGE = "他のユーザーが追記した項目があるため";

function log(msg: string): void {
  console.log(`  ${msg}`);
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

/** /words/new で単語を作成し、着地した詳細ページの id を返す。 */
async function createWord(page: Page, headword: string, meaning: string): Promise<string> {
  await page.goto("/words/new");
  await page.getByPlaceholder(HEADWORD_PLACEHOLDER).fill(headword);
  await page.getByPlaceholder(MEANING_PLACEHOLDER).first().fill(meaning);
  await page.getByRole("button", { name: "登録する", exact: true }).click();
  return waitForWordDetail(page);
}

/** 単語詳細ページで削除ボタン（aria-label=削除）→ 確認（削除する）を押す。 */
async function clickDelete(page: Page, wordId: string): Promise<void> {
  await page.goto(`/words/${wordId}`);
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await page.getByRole("button", { name: "削除する", exact: true }).click();
}

async function main(): Promise<void> {
  const prisma = makePrisma();
  const prefix = `e2e-guard-${Date.now()}`;
  const throwawayEmail = `e2e-throwaway-${Date.now()}@example.com`;

  console.log(`\n[e2e:guard] base=${baseUrl()} prefix=${prefix}\n`);

  // --- preflight ---
  await assertSystemUserReady(prisma);
  await ensureUser(prisma, TEST_USER_EMAIL, TEST_USER_PASSWORD, "E2E テスト（使い回し）");
  log("preflight OK: system ready / test@example.com ready");

  const browser = await launchBrowser();
  let adminCtx: BrowserContext | undefined;
  try {
    // ===== 本命: 削除ガード =====
    adminCtx = await newContext(browser);
    const adminPage = await login(adminCtx, SYSTEM_EMAIL, systemPassword());
    const wordId = await createWord(adminPage, prefix, "ガード検証用のダミー意味");
    log(`admin(system) created word ${prefix} id=${wordId}`);

    const userCtx = await newContext(browser);
    const userPage = await login(userCtx, TEST_USER_EMAIL, TEST_USER_PASSWORD);
    await userPage.goto(`/words/${wordId}/edit`);
    await userPage.getByRole("button", { name: "メモを追加", exact: true }).click();
    await userPage.getByPlaceholder("メモ 1").fill("test@example.com の追記メモ（pass-through）");
    await userPage.getByRole("button", { name: "更新する", exact: true }).click();
    await userPage.waitForURL(new RegExp(`/words/${wordId}$`), { timeout: 15_000 });
    log("test@example.com added a pass-through memo (cross-owner descendant)");

    await clickDelete(adminPage, wordId);
    const toast = await waitForToast(adminPage, { contains: GUARD_MESSAGE });
    assert(toast.includes(GUARD_MESSAGE), `expected guard toast, got: ${toast}`);
    assert(
      new URL(adminPage.url()).pathname === `/words/${wordId}`,
      "should stay on the word detail page (not navigate to /words)",
    );
    const stillThere = await prisma.word.findUnique({
      where: { id: wordId },
      select: { id: true },
    });
    assert(!!stillThere, "guarded word must still exist in DB");
    console.log("PASS ✅ 本命: 削除ガードが admin の system 単語削除をブロックした");

    // ===== 対照+: 自分の子行だけの system 単語は削除できる =====
    const ctrlId = await createWord(adminPage, `${prefix}-ctrl`, "対照（自分の子行のみ）");
    await clickDelete(adminPage, ctrlId);
    const ok1 = await waitForToast(adminPage, { contains: "削除しました" });
    assert(ok1.includes("削除しました"), `expected success toast, got: ${ok1}`);
    await adminPage.waitForURL(/\/words$/, { timeout: 15_000 });
    console.log("PASS ✅ 対照+: admin は自分の子行だけの system 単語を削除できた");

    // ===== 対照0: 使い捨て一般ユーザーは自分の私有単語を削除できる（ガード無反応） =====
    const throwaway = await ensureUser(prisma, throwawayEmail, TEST_USER_PASSWORD, "E2E 使い捨て");
    const tCtx = await newContext(browser);
    const tPage = await login(tCtx, throwaway.email, throwaway.password);
    const privId = await createWord(tPage, `${prefix}-priv`, "使い捨てユーザーの私有単語");
    await clickDelete(tPage, privId);
    const ok2 = await waitForToast(tPage, { contains: "削除しました" });
    assert(ok2.includes("削除しました"), `expected success toast, got: ${ok2}`);
    await tPage.waitForURL(/\/words$/, { timeout: 15_000 });
    console.log("PASS ✅ 対照0: 一般ユーザーは自分の私有単語を削除できた（ガード無反応）");
  } finally {
    await browser.close();
    // --- 後始末: テスト単語は prefix で掃除（cascade で追記メモも消える）。test@example.com は残す。 ---
    const removed = await cleanupWordsByPrefix(prisma, "e2e-guard-");
    log(`cleanup: removed ${removed} test word(s) by prefix "e2e-guard-"`);
    await deleteUserByEmail(prisma, throwawayEmail); // 使い捨てユーザーを削除
    await prisma.$disconnect();
  }

  console.log("\n[e2e:guard] ALL PASS ✅\n");
}

main().catch((err: unknown) => {
  console.error("\n[e2e:guard] FAILED ❌");
  console.error(err);
  process.exit(1);
});
