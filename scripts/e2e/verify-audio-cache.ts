// 発音音源のローカルキャッシュ（docs/design/audio-local-cache.md、public/sw.js）を E2E で検証する。
//   1) test1@example.com が単語を作成し、編集ページで mp3 を登録する
//   2) SW が制御下に入るのを待ち、試聴ボタンで再生 → media リクエストが SW を通り
//      Cache Storage（audio-v1）にエントリが入ることを確認
//   3) 本命: .dev-blob の実体ファイルを削除してから同 URL を fetch → 200（キャッシュから応答。
//      サーバーに実体は無い）。negative control: 未キャッシュ URL は 404（origin は本当に消えている）
//   4) Range 付き fetch → SW が 206 + Content-Range を組み立てる
//
// 前提: dev サーバ稼働・DB seed 済み（未整備なら分かりやすく中断する）。
// 実行: pnpm e2e:audio-cache   （GUI で見るなら E2E_HEADED=1 pnpm e2e:audio-cache）
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

function log(msg: string): void {
  console.log(`  ${msg}`);
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

// デコード可能な本物の無音 mp3（ffmpeg 生成、約 1.6KB）。疑似バイト列だと media 要素が
// デコード失敗でリソースロードを中断し、それに巻き込まれて SW の cache.put 直後の
// エントリが破棄されることがある（本検証の実装時に確認したフレーク）ため、実在の音源と
// 同じ「デコード成功」経路で検証する。
// tsx は CJS 変換で実行するため import.meta.dirname でなく __dirname を使う
const FIXTURE_MP3 = join(__dirname, "fixtures", "silent.mp3");

/** /words/new で単語を作成し、着地した詳細ページの id を返す。 */
async function createWord(page: Page, headword: string, meaning: string): Promise<string> {
  await page.goto("/words/new");
  await page.getByPlaceholder(HEADWORD_PLACEHOLDER).fill(headword);
  await page.getByPlaceholder(MEANING_PLACEHOLDER).first().fill(meaning);
  await page.getByRole("button", { name: "登録する", exact: true }).click();
  return waitForWordDetail(page);
}

async function main(): Promise<void> {
  const prisma = makePrisma();
  const prefix = `e2e-audiocache-${Date.now()}`;
  const mp3 = await readFile(FIXTURE_MP3);
  let blobFilePath: string | null = null;

  console.log(`\n[e2e:audio-cache] base=${baseUrl()} prefix=${prefix}\n`);

  await ensureUser(prisma, TEST_USER1_EMAIL, TEST_USER1_PASSWORD, "E2E テスト（使い回し）");
  log("preflight OK: test1@example.com ready");

  const browser = await launchBrowser();
  try {
    const ctx = await newContext(browser);
    const page = await login(ctx, TEST_USER1_EMAIL, TEST_USER1_PASSWORD);

    // ===== 準備: 単語作成 + mp3 登録 =====
    const wordId = await createWord(page, prefix, "音源キャッシュ検証用");
    await page.goto(`/words/${wordId}/edit`);
    // 「発音」グループは CollapsibleField で、閉じている間は子（file input）がアンマウント。
    // 音源未登録の単語では閉じているので、展開してから操作する
    await page.getByRole("button", { name: "発音を追加", exact: true }).first().click();
    await page
      .locator('input[type="file"][accept="audio/mpeg,.mp3"]')
      .first()
      .setInputFiles({ name: "e2e-audio.mp3", mimeType: "audio/mpeg", buffer: mp3 });
    await waitForToast(page, { contains: "音源を登録しました" });

    const meaning = await prisma.meaning.findFirstOrThrow({
      where: { word: { headword: prefix } },
      select: { pronunciationAudioUrl: true },
    });
    const audioPath = meaning.pronunciationAudioUrl;
    assert(!!audioPath, "meaning.pronunciationAudioUrl must be set after upload");
    assert(
      audioPath!.startsWith(DEV_BLOB_URL_PREFIX),
      `expected dev-blob URL, got: ${audioPath}(dev サーバがローカルディスク driver で動いていること)`,
    );
    const audioUrl = new URL(audioPath!, baseUrl()).href;
    blobFilePath = resolveDevBlobPath(
      decodeURIComponent(audioPath!.slice(DEV_BLOB_URL_PREFIX.length)),
    );
    assert(!!blobFilePath, "dev-blob key must resolve to a local path");
    log(`uploaded mp3 (${mp3.byteLength} bytes) -> ${audioPath}`);

    // ===== SW が制御下に入るのを待つ（register → activate → clients.claim()） =====
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, {
      timeout: 15_000,
    });
    log("service worker is controlling the page");

    // ===== 試聴クリック → media リクエストが SW を通り audio-v1 に入る =====
    // 「match が返る」だけでなく「本文まで全量読める」ことを待つ。put 直後のエントリは
    // 書き込みが完全に確定する前から match に見え始め、その瞬間に次の操作（origin 削除→
    // 取得）を行うと SW 側の match が miss することがある（実装時に確認したフレーク。
    // 実利用にはこの人工的な直後競合は無く、外れても次回再生で再取得され自己修復する）。
    await page.getByRole("button", { name: "試聴を再生", exact: true }).click();
    await page.waitForFunction(
      async ({ url, expected }) => {
        const cache = await caches.open("audio-v1");
        const res = await cache.match(url);
        if (!res) return false;
        return res.status === 200 && (await res.arrayBuffer()).byteLength === expected;
      },
      { url: audioUrl, expected: mp3.byteLength },
      { timeout: 15_000 },
    );
    console.log("PASS ✅ 試聴の media リクエストが SW 経由で audio-v1 にキャッシュされた");

    const fetchAudio = (): Promise<{ status: number; bytes: number }> =>
      page.evaluate(async (url) => {
        const res = await fetch(url);
        return { status: res.status, bytes: (await res.arrayBuffer()).byteLength };
      }, audioUrl);

    // ===== 本命: origin の実体を消してもキャッシュから応答できる =====
    await rm(blobFilePath!, { force: true });
    const hit = await fetchAudio();
    assert(hit.status === 200, `cached fetch should be 200, got ${hit.status}`);
    assert(hit.bytes === mp3.byteLength, `cached bytes ${hit.bytes} != uploaded ${mp3.byteLength}`);

    // リロード（ページ・SW の作り直し）を跨いでもキャッシュから応答できる
    await page.reload();
    const hitAfterReload = await fetchAudio();
    assert(
      hitAfterReload.status === 200,
      `cached fetch after reload should be 200, got ${hitAfterReload.status}`,
    );

    // negative control: 未キャッシュの dev-blob URL は 404（origin に実体が無いことの裏取り）
    const miss = await page.evaluate(async (url) => (await fetch(url)).status, `${audioUrl}.miss`);
    assert(miss === 404, `uncached fetch should be 404 from origin, got ${miss}`);
    console.log("PASS ✅ origin の実体削除後もキャッシュから 200（未キャッシュ URL は 404）");

    // ===== Range 付き fetch → SW が 206 を組み立てる =====
    const ranged = await page.evaluate(async (url) => {
      const res = await fetch(url, { headers: { range: "bytes=0-3" } });
      return {
        status: res.status,
        contentRange: res.headers.get("content-range"),
        bytes: (await res.arrayBuffer()).byteLength,
      };
    }, audioUrl);
    assert(ranged.status === 206, `range fetch should be 206, got ${ranged.status}`);
    assert(
      ranged.contentRange === `bytes 0-3/${mp3.byteLength}`,
      `unexpected Content-Range: ${ranged.contentRange}`,
    );
    assert(ranged.bytes === 4, `range body should be 4 bytes, got ${ranged.bytes}`);
    console.log("PASS ✅ Range リクエストに SW が 206 + Content-Range で応答した");
  } finally {
    await browser.close();
    // 後始末: テスト単語を prefix で掃除（正常時は blob 実体も検証中に削除済み。
    // 途中失敗に備えて blob 実体も force 削除する）。test1@example.com は残す。
    if (blobFilePath) await rm(blobFilePath, { force: true });
    const removed = await cleanupWordsByPrefix(prisma, "e2e-audiocache-");
    log(`cleanup: removed ${removed} test word(s) by prefix "e2e-audiocache-"`);
    await prisma.$disconnect();
  }

  console.log("\n[e2e:audio-cache] ALL PASS ✅\n");
}

main().catch((err: unknown) => {
  console.error("\n[e2e:audio-cache] FAILED ❌");
  console.error(err);
  process.exit(1);
});
