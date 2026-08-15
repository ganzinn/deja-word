import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RowBookmarkButton } from "@/components/bookmark-button";
import { MeaningText } from "@/components/meaning-text";
import { RowAudioButton } from "@/components/row-audio-button";
import { ScreenHeader } from "@/components/screen-header";
import { TtsFallbackProvider } from "@/components/tts-fallback-context";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { commonPartOfSpeechShortLabel } from "@/lib/mock/parts-of-speech";
import { listOccurrencesForUser } from "@/lib/occurrences-list";
import { getCurrentSession } from "@/lib/session";
import { getTtsFallbackEnabled } from "@/lib/user-preferences";
import { cn } from "@/lib/utils";
import {
  listWordsByOccurrence,
  listWordsForUser,
  type WordListItem,
  type WordListSort,
} from "@/lib/words-list";

import { OccurrenceFilterToolbar } from "./_components/occurrence-filter-toolbar";
import { ViewModeToggle, type WordsViewMode } from "./_components/view-mode-toggle";
import { WordListToolbar } from "./_components/word-list-toolbar";
import {
  buildWordDetailHref,
  buildWordsHref,
  parseMatch,
  parseOrder,
  parsePage,
  parseRangeNumber,
} from "./_lib/search-params";

const PAGE_SIZE = 20;

type RawParams = {
  view?: string;
  q?: string;
  sort?: string;
  match?: string;
  occ?: string;
  from?: string;
  to?: string;
  order?: string;
  bookmarked?: string;
  page?: string;
};

type PageProps = {
  searchParams: Promise<RawParams>;
};

export default async function WordsPage({ searchParams }: PageProps) {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in?redirect=/words");

  const params = await searchParams;
  const view: WordsViewMode = params.view === "occurrence" ? "occurrence" : "word";

  // 自動音声フォールバック設定を一覧ツリー全体へ配る（発音音源が無い行の発音ボタン表示を制御）。
  const ttsFallbackEnabled = await getTtsFallbackEnabled(session.user.id);
  const content =
    view === "occurrence" ? (
      <OccurrenceView userId={session.user.id} params={params} />
    ) : (
      <WordView userId={session.user.id} params={params} />
    );
  return <TtsFallbackProvider enabled={ttsFallbackEnabled}>{content}</TtsFallbackProvider>;
}

/** 単語単位（従来）の表示。 */
async function WordView({ userId, params }: { userId: string; params: RawParams }) {
  const q = (params.q ?? "").trim();
  const sort: WordListSort = params.sort === "headword" ? "headword" : "recent";
  const match = parseMatch(params.match);
  const bookmarkedOnly = params.bookmarked === "1";
  const page = parsePage(params.page);

  const { items, total } = await listWordsForUser(userId, {
    q: q.length > 0 ? q : undefined,
    sort,
    match,
    bookmarkedOnly,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const totalPages = total === 0 ? 1 : Math.ceil(total / PAGE_SIZE);
  const hrefForPage = (p: number) =>
    buildWordsHref("word", { q, sort, match, bookmarked: bookmarkedOnly, page: p });
  // 詳細画面に絞り込みコンテキストを引き継ぎ、一覧の並び順の前後ナビと「戻る」を成立させる
  const hrefForWord = (wordId: string) =>
    buildWordDetailHref(wordId, { kind: "word", sort, q, match, bookmarked: bookmarkedOnly });

  if (page > totalPages && total > 0) {
    redirect(hrefForPage(totalPages));
  }
  const currentPage = Math.min(page, totalPages);

  return (
    <WordsShell>
      <ViewModeToggle view="word" />
      <WordListToolbar initialQuery={q} sort={sort} match={match} bookmarked={bookmarkedOnly} />

      <ResultCount label={q.length > 0 ? `「${q}」の検索結果` : "全"} total={total} />

      {items.length === 0 ? (
        <EmptyState hasQuery={q.length > 0} />
      ) : (
        <WordRows items={items} hrefForWord={hrefForWord} />
      )}

      {totalPages > 1 ? (
        <Pagination currentPage={currentPage} totalPages={totalPages} hrefForPage={hrefForPage} />
      ) : null}
    </WordsShell>
  );
}

/** 掲載箇所単位の表示。掲載箇所を 1 つ選び、掲載番号順＋範囲指定で単語を一覧する。 */
async function OccurrenceView({ userId, params }: { userId: string; params: RawParams }) {
  const occurrences = await listOccurrencesForUser(userId);
  const occurrenceId =
    params.occ && occurrences.some((o) => o.id === params.occ) ? params.occ : null;

  const q = (params.q ?? "").trim();
  const match = parseMatch(params.match);
  const from = parseRangeNumber(params.from);
  const to = parseRangeNumber(params.to);
  const order = parseOrder(params.order);
  const bookmarkedOnly = params.bookmarked === "1";
  const page = parsePage(params.page);

  const toolbar = (
    <OccurrenceFilterToolbar
      occurrences={occurrences.map((o) => ({
        id: o.id,
        location: o.location,
        isSystem: o.isSystem,
      }))}
      occurrenceId={occurrenceId}
      initialQuery={q}
      match={match}
      initialFrom={params.from ?? ""}
      initialTo={params.to ?? ""}
      order={order}
      bookmarked={bookmarkedOnly}
    />
  );

  if (occurrenceId === null) {
    return (
      <WordsShell>
        <ViewModeToggle view="occurrence" />
        {toolbar}
        <div className="border-border text-muted-foreground rounded-lg border border-dashed px-4 py-12 text-center text-sm">
          掲載箇所を選択してください
        </div>
      </WordsShell>
    );
  }

  const { items, total } = await listWordsByOccurrence(userId, {
    occurrenceId,
    q: q.length > 0 ? q : undefined,
    match,
    from,
    to,
    order,
    bookmarkedOnly,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const totalPages = total === 0 ? 1 : Math.ceil(total / PAGE_SIZE);
  const hrefForPage = (p: number) =>
    buildWordsHref("occurrence", {
      q,
      match,
      occ: occurrenceId,
      from: params.from,
      to: params.to,
      order,
      bookmarked: bookmarkedOnly,
      page: p,
    });
  // 詳細画面に絞り込みコンテキストを引き継ぎ、掲載番号順の前後ナビと「戻る」を成立させる
  const hrefForWord = (wordId: string) =>
    buildWordDetailHref(wordId, {
      kind: "occurrence",
      occ: occurrenceId,
      q,
      match,
      from: params.from,
      to: params.to,
      order,
      bookmarked: bookmarkedOnly,
    });

  if (page > totalPages && total > 0) {
    redirect(hrefForPage(totalPages));
  }
  const currentPage = Math.min(page, totalPages);

  return (
    <WordsShell>
      <ViewModeToggle view="occurrence" />
      {toolbar}

      <ResultCount label="対象" total={total} />

      {items.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-lg border border-dashed px-4 py-12 text-center text-sm">
          該当する単語はありません
        </div>
      ) : (
        <WordRows items={items} showOccurrenceNumber hrefForWord={hrefForWord} />
      )}

      {totalPages > 1 ? (
        <Pagination currentPage={currentPage} totalPages={totalPages} hrefForPage={hrefForPage} />
      ) : null}
    </WordsShell>
  );
}

function WordsShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-0 pb-16 md:max-w-2xl">
      <ScreenHeader
        backHref="/menu"
        title="単語一覧"
        actions={
          <Link
            href="/words/new"
            aria-label="単語を登録"
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
          >
            <PlusIcon />
          </Link>
        }
      />

      <div className="flex flex-col gap-4 px-4 pt-4">{children}</div>
    </main>
  );
}

function ResultCount({ label, total }: { label: string; total: number }) {
  return (
    <p className="text-muted-foreground text-sm">
      {label}: <span className="text-foreground font-medium">{total}</span> 件
    </p>
  );
}

function WordRows({
  items,
  showOccurrenceNumber = false,
  hrefForWord,
}: {
  items: WordListItem[] | (WordListItem & { occurrenceNumber: number | null })[];
  showOccurrenceNumber?: boolean;
  hrefForWord?: (wordId: string) => string;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <WordRow
            item={item}
            occurrenceNumber={
              showOccurrenceNumber && "occurrenceNumber" in item ? item.occurrenceNumber : undefined
            }
            hrefForWord={hrefForWord}
          />
        </li>
      ))}
    </ul>
  );
}

function WordRow({
  item,
  occurrenceNumber,
  hrefForWord,
}: {
  item: WordListItem;
  occurrenceNumber?: number | null;
  hrefForWord?: (wordId: string) => string;
}) {
  return (
    <Link
      href={hrefForWord?.(item.id) ?? `/words/${item.id}`}
      className="border-border bg-card/50 hover:bg-muted/60 flex flex-col gap-1.5 rounded-lg border p-3 transition-colors"
    >
      <div className="flex flex-wrap items-center gap-2">
        {occurrenceNumber !== undefined ? (
          <Badge variant="outline" className="text-muted-foreground shrink-0 tabular-nums">
            {occurrenceNumber === null ? "—" : `No.${occurrenceNumber}`}
          </Badge>
        ) : null}
        <span className="font-content text-sm font-semibold break-words">{item.headword}</span>
        <div className="ml-auto flex items-center gap-2">
          {item.isSystem ? null : <Badge variant="secondary">MY</Badge>}
          <RowAudioButton
            src={item.pronunciationAudioUrl}
            label="発音"
            ttsText={item.headword}
            reserveSpaceWhenEmpty
          />
          <RowBookmarkButton wordId={item.id} bookmarked={item.bookmarked} />
        </div>
      </div>
      {item.partOfSpeech || item.meaningTexts.length > 0 ? (
        <div className="flex items-start gap-2">
          {item.partOfSpeech ? (
            <Badge variant="outline" className="text-muted-foreground shrink-0">
              {commonPartOfSpeechShortLabel(item.partOfSpeech)}
            </Badge>
          ) : null}
          {item.meaningTexts.length > 0 ? (
            <p className="text-foreground font-content line-clamp-2 text-sm whitespace-pre-wrap">
              <span className="text-red-500">
                <MeaningText text={item.meaningTexts[0]} />
              </span>
              {item.meaningTexts.slice(1).map((text, i) => (
                <span key={i}>
                  {"; "}
                  <MeaningText text={text} />
                </span>
              ))}
            </p>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="border-border text-muted-foreground flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-12 text-center text-sm">
      <p>{hasQuery ? "該当する単語はありません" : "まだ単語が登録されていません"}</p>
      {hasQuery ? null : (
        <Link href="/words/new" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <PlusIcon />
          単語を登録
        </Link>
      )}
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  hrefForPage,
}: {
  currentPage: number;
  totalPages: number;
  hrefForPage: (page: number) => string;
}) {
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <nav aria-label="ページ送り" className="flex items-center justify-between gap-2 pt-2">
      {hasPrev ? (
        <Link
          href={hrefForPage(currentPage - 1)}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ChevronLeftIcon />
          前へ
        </Link>
      ) : (
        <span
          aria-disabled
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "pointer-events-none opacity-50",
          )}
        >
          <ChevronLeftIcon />
          前へ
        </span>
      )}
      <span className="text-muted-foreground text-sm">
        {currentPage} / {totalPages}
      </span>
      {hasNext ? (
        <Link
          href={hrefForPage(currentPage + 1)}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          次へ
          <ChevronRightIcon />
        </Link>
      ) : (
        <span
          aria-disabled
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "pointer-events-none opacity-50",
          )}
        >
          次へ
          <ChevronRightIcon />
        </span>
      )}
    </nav>
  );
}
