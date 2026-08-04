import { PencilIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BookmarkButton } from "@/components/bookmark-button";
import { ScreenHeader } from "@/components/screen-header";
import { TtsFallbackProvider } from "@/components/tts-fallback-context";
import { buttonVariants } from "@/components/ui/button";
import { WordDetailView } from "@/components/word-detail-view";
import { getBookmarkedWordIdsForUser } from "@/lib/bookmark-settings";
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
  buildWordEditHref,
  buildWordsHref,
  parseOccurrenceContext,
  parseRangeNumber,
  type RawOccurrenceContextParams,
  type WordDetailOccurrenceContext,
} from "../_lib/search-params";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawOccurrenceContextParams>;
};

export default async function WordDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;

  const session = await getCurrentSession();
  if (!session) redirect(`/sign-in?redirect=/words/${id}`);

  const word = await getWordDetailForUser(session.user.id, id);
  if (!word) notFound();

  // 掲載箇所ビューから遷移した場合（occ 付き URL）は、同じ絞り込み内の前後ナビと
  // 絞り込み状態を保った「戻る」を出す。パーサが不正値をデフォルトへ正規化する。
  const ctx: WordDetailOccurrenceContext | null = parseOccurrenceContext(await searchParams);
  let backHref = "/words";
  let nav: AdjacentWordsResult = null;
  if (ctx !== null) {
    nav = await findAdjacentWordsByOccurrence(session.user.id, {
      occurrenceId: ctx.occ,
      wordId: id,
      q: ctx.q && ctx.q.length > 0 ? ctx.q : undefined,
      match: ctx.match,
      from: parseRangeNumber(ctx.from),
      to: parseRangeNumber(ctx.to),
      order: ctx.order,
    });
    backHref = buildWordsHref("occurrence", { ...ctx, page: 1 });
  }

  const canEdit = word.ownerId === session.user.id || word.ownerId === SYSTEM_USER_ID;
  const canDelete = word.ownerId === session.user.id;
  const incomingLinkCount = canDelete ? await countIncomingLinksForUser(session.user.id, id) : 0;
  const ttsFallbackEnabled = await getTtsFallbackEnabled(session.user.id);
  // read 専用関数は増やさず、1 件配列で本人のブックマーク状態を取得する。
  const bookmarked = (await getBookmarkedWordIdsForUser(session.user.id, [id])).length > 0;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-0 pb-16 md:max-w-2xl">
      <ScreenHeader
        backHref={backHref}
        title={word.headword}
        titleClassName="font-content truncate"
        actions={
          <>
            <BookmarkButton wordId={id} bookmarked={bookmarked} />
            {canEdit ? (
              <Link
                href={ctx !== null ? buildWordEditHref(id, ctx) : `/words/${id}/edit`}
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
