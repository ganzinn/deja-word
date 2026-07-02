import { PencilIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ScreenHeader } from "@/components/screen-header";
import { TtsFallbackProvider } from "@/components/tts-fallback-context";
import { buttonVariants } from "@/components/ui/button";
import { WordDetailView } from "@/components/word-detail-view";
import { getCurrentSession } from "@/lib/session";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { getTtsFallbackEnabled } from "@/lib/user-preferences";
import { cn } from "@/lib/utils";
import { countIncomingLinksForUser } from "@/lib/words-delete";
import { getWordDetailForUser } from "@/lib/words-detail";
import { findAdjacentWordsByOccurrence, type AdjacentWordsResult } from "@/lib/words-list";

import { DeleteWordButton } from "./_components/delete-word-button";
import { AdjacentWordNav } from "./_components/adjacent-word-nav";
import {
  buildWordDetailHref,
  buildWordsHref,
  parseMatch,
  parseOrder,
  parseRangeNumber,
  type WordDetailOccurrenceContext,
} from "../_lib/search-params";

type RawSearchParams = {
  occ?: string;
  q?: string;
  match?: string;
  from?: string;
  to?: string;
  order?: string;
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
};

export default async function WordDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;

  const session = await getCurrentSession();
  if (!session) redirect(`/sign-in?redirect=/words/${id}`);

  const word = await getWordDetailForUser(session.user.id, id);
  if (!word) notFound();

  // 掲載箇所ビューから遷移した場合（occ 付き URL）は、同じ絞り込み内の前後ナビと
  // 絞り込み状態を保った「戻る」を出す。パーサが不正値をデフォルトへ正規化する。
  const sp = await searchParams;
  let backHref = "/words";
  let nav: AdjacentWordsResult = null;
  let ctx: WordDetailOccurrenceContext | null = null;
  if (sp.occ) {
    const q = (sp.q ?? "").trim();
    const match = parseMatch(sp.match);
    const order = parseOrder(sp.order);
    ctx = { occ: sp.occ, q, match, from: sp.from, to: sp.to, order };
    nav = await findAdjacentWordsByOccurrence(session.user.id, {
      occurrenceId: sp.occ,
      wordId: id,
      q: q.length > 0 ? q : undefined,
      match,
      from: parseRangeNumber(sp.from),
      to: parseRangeNumber(sp.to),
      order,
    });
    backHref = buildWordsHref("occurrence", {
      occ: sp.occ,
      q,
      match,
      from: sp.from,
      to: sp.to,
      order,
      page: 1,
    });
  }

  const canEdit = word.ownerId === session.user.id || word.ownerId === SYSTEM_USER_ID;
  const canDelete = word.ownerId === session.user.id;
  const incomingLinkCount = canDelete ? await countIncomingLinksForUser(session.user.id, id) : 0;
  const ttsFallbackEnabled = await getTtsFallbackEnabled(session.user.id);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-0 pb-16 md:max-w-2xl">
      <ScreenHeader
        backHref={backHref}
        title={word.headword}
        titleClassName="truncate"
        actions={
          canEdit || canDelete ? (
            <>
              {canEdit ? (
                <Link
                  href={`/words/${id}/edit`}
                  aria-label="編集"
                  className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
                >
                  <PencilIcon />
                </Link>
              ) : null}
              {canDelete ? (
                <DeleteWordButton
                  wordId={id}
                  headword={word.headword}
                  incomingLinkCount={incomingLinkCount}
                />
              ) : null}
            </>
          ) : undefined
        }
      />

      {nav !== null && ctx !== null ? (
        <AdjacentWordNav
          prevHref={nav.prev !== null ? buildWordDetailHref(nav.prev.id, ctx) : null}
          nextHref={nav.next !== null ? buildWordDetailHref(nav.next.id, ctx) : null}
          centerLabel={
            nav.current.occurrenceNumber !== null ? `No.${nav.current.occurrenceNumber}` : "—"
          }
        />
      ) : null}

      <TtsFallbackProvider enabled={ttsFallbackEnabled}>
        <WordDetailView word={word} />
      </TtsFallbackProvider>
    </main>
  );
}
