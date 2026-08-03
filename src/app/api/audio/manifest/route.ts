import { listAudioUrlsForUser } from "@/lib/audio-manifest";
import { getCurrentSession } from "@/lib/session";

/**
 * 一括プリフェッチ（docs/adr/0075-audio-local-cache-and-prefetch.md）が取得する音源 URL の一覧。
 * 設定画面の「ダウンロード」押下時にだけクライアントから読むため、Server Action ではなく
 * Route Handler にしている（ページの RSC ペイロードに ~1,900 件の URL を常時載せない）。
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const urls = await listAudioUrlsForUser(session.user.id);

  return Response.json({ urls }, { headers: { "Cache-Control": "no-store" } });
}
