// 発音音源の一括プリフェッチ（docs/adr/0075-audio-local-cache-and-prefetch.md）を E2E で検証する。
//   1) test1@example.com が mp3 付きの単語を 3 件作る
//   2) 設定 → 単語全般 の「ダウンロード」で 3 件が Cache Storage（audio-v1）に入る
//   3) 本命 A: origin の実体ファイルを全部消しても、キャッシュから 200 で応答できる（＝オフライン成立）
//   4) 単語を 1 件削除して再実行 → 本命 B: 掃除で該当エントリが消え、
//      残り 2 件は「すべて保存済み」＝再ダウンロードされない（origin の実体は無いので、
//      もし取りに行っていれば失敗して別のトーストになる）
//
// 前提: dev サーバ稼働・DB seed 済み。実行: pnpm e2e:audio-prefetch
//       （GUI で見るなら E2E_HEADED=1 pnpm e2e:audio-prefetch）
import "dotenv/config";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { DEV_BLOB_URL_PREFIX, resolveDevBlobPath } from "../../src/lib/blob-client-impl";
import { TEST_USER1_EMAIL, TEST_USER1_PASSWORD, login } from "./auth";
import { cleanupWordsByPrefix, ensureUser, makePrisma } from "./db";
import { baseUrl, launchBrowser, newContext, waitForToast, waitForWordDetail } from "./harness";

import type { Page } from "playwright-core";

const MEANING_PLACEHOLDER = "例: 短命の、つかの間の";
const HEADWORD_PLACEHOLDER = "例: ephemeral";
const PREFIX = "e2e-audioprefetch-";

// verify-audio-cache.ts と同じ、デコード可能な無音 mp3（約 1.6KB）
const FIXTURE_MP3 = join(__dirname, "fixtures", "silent.mp3");

function log(msg: string): void {
  console.log(`  ${msg}`);
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

/** 単語を作り、その詳細ページで mp3 を登録して word id を返す。 */
async function createWordWithAudio(page: Page, headword: string, mp3: Buffer): Promise<string> {
  await page.goto("/words/new");
  await page.getByPlaceholder(HEADWORD_PLACEHOLDER).fill(headword);
  await page.getByPlaceholder(MEANING_PLACEHOLDER).first().fill(`${headword} の意味`);
  await page.getByRole("button", { name: "登録する", exact: true }).click();
  const wordId = await waitForWordDetail(page);

  await page.goto(`/words/${wordId}/edit`);
  // 「発音」グループは音源未登録だと閉じている（子の file input がアンマウント）ので開く
  await page.getByRole("button", { name: "発音を追加", exact: true }).first().click();
  await page
    .locator('input[type="file"][accept="audio/mpeg,.mp3"]')
    .first()
    .setInputFiles({ name: "e2e-audio.mp3", mimeType: "audio/mpeg", buffer: mp3 });
  await waitForToast(page, { contains: "音源を登録しました" });
  return wordId;
}

/** アプリの manifest エンドポイントから音源 URL 一覧を取り、絶対 URL に揃えて返す。 */
async function fetchManifest(page: Page): Promise<string[]> {
  const urls = await page.evaluate(async () => {
    const res = await fetch("/api/audio/manifest");
    if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
    const body = (await res.json()) as { urls: string[] };
    return body.urls.map((url) => new URL(url, location.href).href);
  });
  return urls;
}

/** Cache Storage（audio-v1）に入っている URL 一覧。 */
async function cachedUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const cache = await caches.open("audio-v1");
    return (await cache.keys()).map((request) => request.url);
  });
}

/** ダウンロードボタンを押して、指定文言のトーストが出るまで待つ。 */
async function clickDownload(page: Page, expectToast: string): Promise<string> {
  await page.getByRole("button", { name: "ダウンロード", exact: true }).click();
  return waitForToast(page, { contains: expectToast, timeout: 30_000 });
}

async function main(): Promise<void> {
  const prisma = makePrisma();
  const stamp = Date.now();
  const mp3 = await readFile(FIXTURE_MP3);
  const blobFilePaths: string[] = [];

  console.log(`\n[e2e:audio-prefetch] base=${baseUrl()} prefix=${PREFIX}${stamp}\n`);

  await ensureUser(prisma, TEST_USER1_EMAIL, TEST_USER1_PASSWORD, "E2E テスト（使い回し）");
  log("preflight OK: test1@example.com ready");

  const browser = await launchBrowser();
  try {
    const ctx = await newContext(browser);
    const page = await login(ctx, TEST_USER1_EMAIL, TEST_USER1_PASSWORD);

    // ===== 準備: mp3 付きの単語を 3 件 =====
    // dev DB には撮影用デモ音源など他の音源も居るので、実行前後の manifest 差分で
    // 「このテストが作った 3 件」を特定する（実体を消してよいのはこの 3 件だけ）
    const baseline = await fetchManifest(page);
    const wordIds: string[] = [];
    for (let i = 1; i <= 3; i++) {
      wordIds.push(await createWordWithAudio(page, `${PREFIX}${stamp}-${i}`, mp3));
    }
    log(`created 3 words with mp3 (${mp3.byteLength} bytes each)`);

    const manifest = await fetchManifest(page);
    const testUrls = manifest.filter((url) => !baseline.includes(url));
    assert(testUrls.length === 3, `manifest should grow by exactly 3, got ${testUrls.length}`);
    for (const url of testUrls) {
      const path = new URL(url).pathname;
      assert(path.startsWith(DEV_BLOB_URL_PREFIX), `expected dev-blob url, got ${url}`);
      const file = resolveDevBlobPath(decodeURIComponent(path.slice(DEV_BLOB_URL_PREFIX.length)));
      assert(!!file, `dev-blob key must resolve to a local path: ${url}`);
      blobFilePaths.push(file!);
    }
    console.log("PASS ✅ /api/audio/manifest が新規登録した 3 件を含めて返した");

    // ===== SW が制御下に入るのを待ってから設定画面へ =====
    await page.goto("/settings/general");
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, {
      timeout: 15_000,
    });
    await page
      .getByText(`対象 ${manifest.length} 件`, { exact: false })
      .waitFor({ timeout: 10_000 });

    // ===== 一括ダウンロード（新規 context なのでキャッシュは空 = manifest 全件が対象） =====
    const downloadToast = await clickDownload(page, `${manifest.length} 件をダウンロードしました`);
    log(`toast: ${downloadToast}`);

    const afterDownload = await cachedUrls(page);
    for (const url of manifest) {
      assert(afterDownload.includes(url), `cache should contain ${url}`);
    }
    console.log(`PASS ✅ 一括ダウンロードで ${manifest.length} 件すべてが audio-v1 に入った`);

    // ===== 本命 A: origin の実体を消してもキャッシュから応答できる =====
    // 実体を消すのはこのテストが作った 3 件だけ（デモ音源は残す）
    await Promise.all(blobFilePaths.map((path) => rm(path, { force: true })));
    const statuses = await page.evaluate(async (urls) => {
      const results: { status: number; bytes: number }[] = [];
      for (const url of urls) {
        const res = await fetch(url);
        results.push({ status: res.status, bytes: (await res.arrayBuffer()).byteLength });
      }
      return results;
    }, testUrls);
    for (const [i, result] of statuses.entries()) {
      assert(result.status === 200, `cached fetch #${i} should be 200, got ${result.status}`);
      assert(result.bytes === mp3.byteLength, `cached bytes #${i} = ${result.bytes}`);
    }
    console.log("PASS ✅ origin の実体を消してもキャッシュから 200（オフライン成立）");

    // ===== 本命 B: 単語を 1 件消して再実行 → 掃除される / 残りは再取得しない =====
    await page.goto(`/words/${wordIds[0]}`);
    await page.getByLabel("削除", { exact: true }).click();
    await page.getByRole("button", { name: "削除する", exact: true }).click();
    await waitForToast(page, { contains: "削除しました" });

    const remaining = await (async () => {
      await page.goto("/settings/general");
      return fetchManifest(page);
    })();
    assert(
      remaining.length === manifest.length - 1,
      `manifest should shrink by 1, got ${remaining.length} (was ${manifest.length})`,
    );

    // 「すべて保存済み」= 未取得 0 件。取得済みを取りに行っていないことの直接の証跡
    const secondToast = await clickDownload(page, "すべての発音音源がこの端末に保存されています");
    log(`toast: ${secondToast}`);

    const afterPrune = await cachedUrls(page);
    const removedUrl = manifest.find((url) => !remaining.includes(url));
    assert(!!removedUrl, "deleted word's audio url must be identified");
    assert(!afterPrune.includes(removedUrl!), `stale entry should be pruned: ${removedUrl}`);
    for (const url of remaining) {
      assert(afterPrune.includes(url), `entry in manifest should stay cached: ${url}`);
    }
    console.log("PASS ✅ 削除済み音源のエントリが掃除され、取得済みは再ダウンロードされない");

    // ===== 端末から削除（容量を戻す操作） =====
    await page.getByRole("button", { name: "端末から削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する", exact: true }).click();
    await waitForToast(page, { contains: "この端末に保存した発音音源を削除しました" });
    assert((await cachedUrls(page)).length === 0, "audio-v1 should be empty after clearing");
    console.log("PASS ✅ 「端末から削除」で audio-v1 が空になった");
  } finally {
    await browser.close();
    await Promise.all(blobFilePaths.map((path) => rm(path, { force: true })));
    const removed = await cleanupWordsByPrefix(prisma, PREFIX);
    log(`cleanup: removed ${removed} test word(s) by prefix "${PREFIX}"`);
    await prisma.$disconnect();
  }

  console.log("\n[e2e:audio-prefetch] ALL PASS ✅\n");
}

main().catch((err: unknown) => {
  console.error("\n[e2e:audio-prefetch] FAILED ❌");
  console.error(err);
  process.exit(1);
});
