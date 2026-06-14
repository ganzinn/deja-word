// One-off cleanup before dropping `meaning.translation_audio_url`.
// 「意味（読み上げ）」音源カラム廃止に伴い、参照を失う前に Blob 実体を削除する。
// カラム DROP マイグレーション適用の **前** に各環境で一度だけ実行すること。
// Usage: pnpm dlx tsx scripts/cleanup-translation-audio.ts [--apply]
//   --apply を付けない場合は対象を表示するだけ（dry-run）。
import "dotenv/config";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import { del } from "@vercel/blob";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

// blob-client.ts は "server-only" のため tsx から import できない。ロジックを最小複製する。
const DEV_BLOB_ROOT = resolve(process.cwd(), ".dev-blob");
const DEV_BLOB_URL_PREFIX = "/api/dev-blob/";

function resolveDevBlobPath(key: string): string | null {
  const full = resolve(DEV_BLOB_ROOT, key);
  if (full !== DEV_BLOB_ROOT && !full.startsWith(DEV_BLOB_ROOT + "/")) return null;
  return full;
}

async function deleteOne(url: string): Promise<void> {
  if (url.startsWith(DEV_BLOB_URL_PREFIX)) {
    const key = decodeURIComponent(url.slice(DEV_BLOB_URL_PREFIX.length));
    const full = resolveDevBlobPath(key);
    if (full) await rm(full, { force: true });
    return;
  }
  await del(url); // Vercel Blob（本番）。BLOB_READ_WRITE_TOKEN が必要。
}

async function main() {
  const apply = process.argv.includes("--apply");
  const connectionString =
    process.env["DIRECT_URL"] ??
    process.env["DATABASE_URL_UNPOOLED"] ??
    process.env["DATABASE_URL"];
  if (!connectionString) {
    console.error("DATABASE_URL / DATABASE_URL_UNPOOLED / DIRECT_URL is not set");
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    // 生成クライアントから translationAudioUrl が消えても動くよう raw SQL で読む。
    const rows = await prisma.$queryRaw<{ translation_audio_url: string }[]>`
      SELECT translation_audio_url FROM meaning WHERE translation_audio_url IS NOT NULL
    `;
    console.log(`found ${rows.length} translation audio file(s)`);
    for (const { translation_audio_url: url } of rows) {
      if (!apply) {
        console.log(`[dry-run] would delete: ${url}`);
        continue;
      }
      try {
        await deleteOne(url);
        console.log(`deleted: ${url}`);
      } catch (e) {
        console.error(`failed (skipped): ${url}`, e);
      }
    }
    if (!apply) console.log("\n--apply を付けると実削除します。");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
