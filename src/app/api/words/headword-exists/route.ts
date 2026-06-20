import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { findOwnHeadwordDuplicate } from "@/lib/words-duplicate";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const headword = url.searchParams.get("headword") ?? "";
  const excludeId = url.searchParams.get("excludeId") ?? undefined;

  const duplicate = await findOwnHeadwordDuplicate(session.user.id, headword, excludeId);

  return Response.json({ duplicate });
}
