// 発音音源の一括プリフェッチ（docs/adr/0075-audio-local-cache-and-prefetch.md）を E2E で検証する。
// manifest は「見出し語・関連語（word）」「例文（example）」のグループ別で、設定画面も 2 行に分かれる。
//   1) test1@example.com が mp3 付きの単語を 3 件作り、うち 2 件に mp3 付きの例文を足す
//   2) 設定 → 単語全般 の 2 行に、グループ別の対象件数が出る
//   3) 本命 A: 「例文」だけダウンロード → 例文グループだけがキャッシュに入る
//   4) 本命 B: 続けて「見出し語・関連語」をダウンロード → 例文のキャッシュは掃除されず残る
//      （prune の判定が両グループの和集合であることの直接の証跡）
//   5) origin の実体を全部消しても、キャッシュから 200 で応答できる（＝オフライン成立）
//   6) 単語を 1 件削除して再実行 → 本命 C: 消えた単語の意味音源・例文音源の両方が掃除され、
//      残りは「すべて保存済み」＝再ダウンロードされない（origin の実体は無いので、
//      もし取りに行っていれば失敗して別のトーストになる）
//   7) 「端末から削除」は 1 つのまま、両グループまとめて消える
//
// 例文の音源は prisma ＋ dev blob への直接書き込みで用意する（音源登録 UI を経由しない）。
// 本 E2E の検証対象は manifest のグループ分けとキャッシュ挙動であって登録 UI ではないため。
//
// 前提: dev サーバ稼働・DB seed 済み。実行: pnpm e2e:audio-prefetch
//       （GUI で見るなら E2E_HEADED=1 pnpm e2e:audio-prefetch）
import "dotenv/config";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  DEV_BLOB_ROOT,
  DEV_BLOB_URL_PREFIX,
  resolveDevBlobPath,
} from "../../src/lib/blob-client-impl";
import { TEST_USER1_EMAIL, TEST_USER1_PASSWORD, login } from "./auth";
import { cleanupWordsByPrefix, ensureUser, makePrisma, type PrismaClientType } from "./db";
import { baseUrl, launchBrowser, newContext, waitForToast, waitForWordDetail } from "./harness";

import type { Page } from "playwright-core";

const MEANING_PLACEHOLDER = "例: 短命の、つかの間の";
const HEADWORD_PLACEHOLDER = "例: ephemeral";
const PREFIX = "e2e-audioprefetch-";

/** 設定画面のグループ行（`AudioGroup` と表示ラベルの対応）。 */
const WORD_GROUP_LABEL = "見出し語・関連語";
const EXAMPLE_GROUP_LABEL = "例文";

// verify-audio-cache.ts と同じ、デコード可能な無音 mp3（約 1.6KB）
const FIXTURE_MP3 = join(__dirname, "fixtures", "silent.mp3");

type ManifestGroups = { word: string[]; example: string[] };

function log(msg: string): void {
  console.log(`  ${msg}`);
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

/** 画面表示と同じ桁区切り（`formatCount` = `toLocaleString("ja-JP")`）。 */
function jp(count: number): string {
  return count.toLocaleString("ja-JP");
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

/**
 * 音源付きの例文を prisma ＋ dev blob 直書きで足し、blob 実体のパスを返す。
 * `scripts/e2e/db.ts` の `ensureDemoAudio` と同じ方式（ローカルディスク driver 前提）。
 */
async function addExampleWithAudio(
  prisma: PrismaClientType,
  wordId: string,
  mp3: Buffer,
  slug: string,
): Promise<string> {
  const word = await prisma.word.findUniqueOrThrow({
    where: { id: wordId },
    select: { ownerId: true },
  });
  const example = await prisma.example.create({
    data: {
      wordId,
      ownerId: word.ownerId,
      kind: "SENTENCE",
      text: `This is an e2e example (${slug}).`,
      meaning: "これは E2E 用の例文です。",
      sortOrder: 0,
    },
    select: { id: true },
  });

  const key = `audio/example/${example.id}/pronunciation-${slug}.mp3`;
  const full = join(DEV_BLOB_ROOT, key);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, mp3);
  await prisma.example.update({
    where: { id: example.id },
    data: { pronunciationAudioUrl: `${DEV_BLOB_URL_PREFIX}${key}` },
  });
  return full;
}

/** アプリの manifest エンドポイントからグループ別の音源 URL を取り、絶対 URL に揃えて返す。 */
async function fetchManifest(page: Page): Promise<ManifestGroups> {
  return page.evaluate(async () => {
    const res = await fetch("/api/audio/manifest");
    if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
    const body = (await res.json()) as { urls: { word: string[]; example: string[] } };
    // 名前付きの関数を置くと tsx（esbuild）の keepNames が `__name` を注入して評価に失敗するため、
    // 正規化は無名のインライン関数のまま書く
    return {
      word: body.urls.word.map((url) => new URL(url, location.href).href),
      example: body.urls.example.map((url) => new URL(url, location.href).href),
    };
  });
}

/** Cache Storage（audio-v1）に入っている URL 一覧。 */
async function cachedUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const cache = await caches.open("audio-v1");
    return (await cache.keys()).map((request) => request.url);
  });
}

/** グループ行の「対象 n 件 ／ 端末に保存済み n' 件」が出るまで待つ。 */
async function waitForGroupCounts(
  page: Page,
  label: string,
  total: number,
  saved: number,
): Promise<void> {
  await page
    .getByRole("group", { name: label, exact: true })
    .getByText(`対象 ${jp(total)} 件 ／ 端末に保存済み ${jp(saved)} 件`)
    .waitFor({ timeout: 15_000 });
}

/** 指定グループの「ダウンロード」を押して、指定文言のトーストが出るまで待つ。 */
async function clickDownload(page: Page, label: string, expectToast: string): Promise<string> {
  await page.getByRole("button", { name: `${label}をダウンロード`, exact: true }).click();
  return waitForToast(page, { contains: expectToast, timeout: 30_000 });
}

/** dev blob の URL からローカル実体のパスを解決する（見つからなければ throw）。 */
function devBlobPathOf(url: string): string {
  const path = new URL(url).pathname;
  assert(path.startsWith(DEV_BLOB_URL_PREFIX), `expected dev-blob url, got ${url}`);
  const file = resolveDevBlobPath(decodeURIComponent(path.slice(DEV_BLOB_URL_PREFIX.length)));
  assert(!!file, `dev-blob key must resolve to a local path: ${url}`);
  return file!;
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

    // ===== 準備: mp3 付きの単語 3 件 ＋ mp3 付きの例文 2 件 =====
    // dev DB には撮影用デモ音源など他の音源も居るので、実行前後の manifest 差分で
    // 「このテストが作った音源」を特定する（実体を消してよいのはその分だけ）
    const baseline = await fetchManifest(page);
    const wordIds: string[] = [];
    for (let i = 1; i <= 3; i++) {
      wordIds.push(await createWordWithAudio(page, `${PREFIX}${stamp}-${i}`, mp3));
    }
    log(`created 3 words with mp3 (${mp3.byteLength} bytes each)`);

    for (const [i, wordId] of wordIds.slice(0, 2).entries()) {
      blobFilePaths.push(await addExampleWithAudio(prisma, wordId, mp3, `${stamp}-${i + 1}`));
    }
    log("added 2 examples with mp3 (prisma + dev blob direct write)");

    const manifest = await fetchManifest(page);
    const newWordUrls = manifest.word.filter((url) => !baseline.word.includes(url));
    const newExampleUrls = manifest.example.filter((url) => !baseline.example.includes(url));
    assert(newWordUrls.length === 3, `word group should grow by 3, got ${newWordUrls.length}`);
    assert(
      newExampleUrls.length === 2,
      `example group should grow by 2, got ${newExampleUrls.length}`,
    );
    for (const url of newWordUrls) blobFilePaths.push(devBlobPathOf(url));
    for (const url of newExampleUrls) {
      // 例文側は直書き時にパスを控えてある。manifest の URL がその実体を指していることを確かめる
      assert(
        blobFilePaths.includes(devBlobPathOf(url)),
        `example audio url should point at the file we wrote: ${url}`,
      );
    }
    console.log("PASS ✅ /api/audio/manifest が word / example のグループ別に新規音源を返した");

    // ===== SW が制御下に入るのを待ってから設定画面へ =====
    await page.goto("/settings/general");
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, {
      timeout: 15_000,
    });
    await waitForGroupCounts(page, WORD_GROUP_LABEL, manifest.word.length, 0);
    await waitForGroupCounts(page, EXAMPLE_GROUP_LABEL, manifest.example.length, 0);
    console.log(
      "PASS ✅ 設定画面がグループ別 2 行の件数を表示した（新規 context なので保存済み 0）",
    );

    // ===== 本命 A: 「例文」だけダウンロード → 例文グループだけがキャッシュに入る =====
    const exampleToast = await clickDownload(
      page,
      EXAMPLE_GROUP_LABEL,
      `${jp(manifest.example.length)} 件をダウンロードしました`,
    );
    log(`toast: ${exampleToast}`);

    const afterExample = await cachedUrls(page);
    for (const url of manifest.example) {
      assert(afterExample.includes(url), `example cache should contain ${url}`);
    }
    for (const url of manifest.word) {
      assert(!afterExample.includes(url), `word audio must not be downloaded yet: ${url}`);
    }
    await waitForGroupCounts(
      page,
      EXAMPLE_GROUP_LABEL,
      manifest.example.length,
      manifest.example.length,
    );
    await waitForGroupCounts(page, WORD_GROUP_LABEL, manifest.word.length, 0);
    console.log("PASS ✅ 「例文」だけをダウンロードでき、保存済み件数もグループ別に出た");

    // ===== 本命 B: 続けて「見出し語・関連語」→ 例文のキャッシュは消えない（和集合 prune） =====
    const wordToast = await clickDownload(
      page,
      WORD_GROUP_LABEL,
      `${jp(manifest.word.length)} 件をダウンロードしました`,
    );
    log(`toast: ${wordToast}`);

    const afterWord = await cachedUrls(page);
    for (const url of [...manifest.word, ...manifest.example]) {
      assert(afterWord.includes(url), `cache should contain ${url}`);
    }
    console.log(
      "PASS ✅ 片方をダウンロードしても、もう一方のキャッシュが掃除されない（和集合 prune）",
    );

    // ===== オフライン成立: origin の実体を消してもキャッシュから応答できる =====
    // 実体を消すのはこのテストが作った 5 件だけ（デモ音源は残す）
    const testUrls = [...newWordUrls, ...newExampleUrls];
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

    // ===== 本命 C: 単語を 1 件消して再実行 → 意味音源も例文音源も掃除される =====
    // 消す単語（wordIds[0]）は意味音源と例文音源の両方を持つ
    await page.goto(`/words/${wordIds[0]}`);
    await page.getByLabel("削除", { exact: true }).click();
    await page.getByRole("button", { name: "削除する", exact: true }).click();
    await waitForToast(page, { contains: "削除しました" });

    await page.goto("/settings/general");
    const remaining = await fetchManifest(page);
    assert(
      remaining.word.length === manifest.word.length - 1,
      `word group should shrink by 1, got ${remaining.word.length} (was ${manifest.word.length})`,
    );
    assert(
      remaining.example.length === manifest.example.length - 1,
      `example group should shrink by 1, got ${remaining.example.length} (was ${manifest.example.length})`,
    );

    // 「すべて保存済み」= 未取得 0 件。取得済みを取りに行っていないことの直接の証跡
    const secondToast = await clickDownload(
      page,
      WORD_GROUP_LABEL,
      `${WORD_GROUP_LABEL}の音源はすべてこの端末に保存されています`,
    );
    log(`toast: ${secondToast}`);

    const afterPrune = await cachedUrls(page);
    const removedWordUrl = manifest.word.find((url) => !remaining.word.includes(url));
    const removedExampleUrl = manifest.example.find((url) => !remaining.example.includes(url));
    assert(!!removedWordUrl, "deleted word's meaning audio url must be identified");
    assert(!!removedExampleUrl, "deleted word's example audio url must be identified");
    assert(
      !afterPrune.includes(removedWordUrl!),
      `stale entry should be pruned: ${removedWordUrl}`,
    );
    assert(
      !afterPrune.includes(removedExampleUrl!),
      `stale example entry should be pruned even when downloading the word group: ${removedExampleUrl}`,
    );
    for (const url of [...remaining.word, ...remaining.example]) {
      assert(afterPrune.includes(url), `entry in manifest should stay cached: ${url}`);
    }
    console.log(
      "PASS ✅ 消えた単語の意味音源・例文音源が掃除され、取得済みは再ダウンロードされない",
    );

    // ===== 端末から削除（容量を戻す操作。グループ共通の 1 つのまま） =====
    await page.getByRole("button", { name: "端末から削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する", exact: true }).click();
    await waitForToast(page, { contains: "この端末に保存した発音音源を削除しました" });
    assert((await cachedUrls(page)).length === 0, "audio-v1 should be empty after clearing");
    console.log("PASS ✅ 「端末から削除」で audio-v1 が両グループまとめて空になった");
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
