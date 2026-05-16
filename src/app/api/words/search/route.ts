import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { searchWordsForLink } from "@/lib/words-search";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 10;

  const results = await searchWordsForLink(session.user.id, q, Number.isFinite(limit) ? limit : 10);

  return Response.json({ results });
}
