import { readFile } from "node:fs/promises";

import { resolveDevBlobPath } from "@/lib/blob-client";

/**
 * ローカルディスク driver（`localDiskBlobClient`）が `.dev-blob/` に保存した音源を
 * 配信する dev 限定エンドポイント。本番では `localDiskBlobClient` を使わないため 404。
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const { key } = await params;
  const full = resolveDevBlobPath(key.map((seg) => decodeURIComponent(seg)).join("/"));
  if (!full) return new Response("Not found", { status: 404 });

  try {
    const data = await readFile(full);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": full.endsWith(".mp3") ? "audio/mpeg" : "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
