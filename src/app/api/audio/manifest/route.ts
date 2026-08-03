import { listAudioUrlsForUser } from "@/lib/audio-manifest";
import { getCurrentSession } from "@/lib/session";

/**
 * 一括プリフェッチ（docs/adr/0075-audio-local-cache-and-prefetch.md）が取得する音源 URL の一覧を
 * グループ別（`{ urls: { word: [...], example: [...] } }`）で返す。Server Action ではなく
 * Route Handler にしているのは、ページの RSC ペイロードに ~1,900 件の URL を載せないため
 * （設定画面はマウント時とダウンロード押下時にクライアントから読む）。
 *
 * ダウンロードはグループ単位でも、**常に両グループを返す**。掃除（prune）の判定は両グループの
 * 和集合で行う必要があり、片方だけ取得するともう一方のキャッシュが消えるため。
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const urls = await listAudioUrlsForUser(session.user.id);

  return Response.json({ urls }, { headers: { "Cache-Control": "no-store" } });
}
