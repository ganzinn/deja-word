import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { commonPartOfSpeechFullLabel } from "@/lib/mock/parts-of-speech";
import { getCurrentSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listWordsForUser, type WordListItem, type WordListSort } from "@/lib/words-list";

import { WordListToolbar } from "./_components/word-list-toolbar";

const PAGE_SIZE = 20;

type PageProps = {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
};

export default async function WordsPage({ searchParams }: PageProps) {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in?redirect=/words");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const sort: WordListSort = params.sort === "headword" ? "headword" : "recent";
  const page = parsePage(params.page);

  const { items, total } = await listWordsForUser(session.user.id, {
    q: q.length > 0 ? q : undefined,
    sort,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const totalPages = total === 0 ? 1 : Math.ceil(total / PAGE_SIZE);

  if (page > totalPages && total > 0) {
    redirect(buildPageHref(totalPages, q, sort));
  }

  const currentPage = Math.min(page, totalPages);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-0 pb-16 md:max-w-2xl">
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-3 backdrop-blur">
        <Link
          href="/menu"
          aria-label="戻る"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ChevronLeftIcon />
        </Link>
        <h1 className="text-base font-semibold">単語一覧</h1>
        <Link
          href="/words/new"
          aria-label="単語を登録"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "ml-auto")}
        >
          <PlusIcon />
        </Link>
      </header>

      <div className="flex flex-col gap-4 px-4 pt-4">
        <WordListToolbar initialQuery={q} sort={sort} />

        <p className="text-muted-foreground text-sm">
          {q.length > 0 ? (
            <>
              「{q}」の検索結果: <span className="text-foreground font-medium">{total}</span> 件
            </>
          ) : (
            <>
              全 <span className="text-foreground font-medium">{total}</span> 件
            </>
          )}
        </p>

        {items.length === 0 ? (
          <EmptyState hasQuery={q.length > 0} />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id}>
                <WordRow item={item} />
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 ? (
          <Pagination currentPage={currentPage} totalPages={totalPages} q={q} sort={sort} />
        ) : null}
      </div>
    </main>
  );
}

function parsePage(value: string | undefined): number {
  if (!value) return 1;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

function WordRow({ item }: { item: WordListItem }) {
  return (
    <Link
      href={`/words/${item.id}`}
      className="border-border bg-card/50 hover:bg-muted/60 flex flex-col gap-1.5 rounded-lg border p-3 transition-colors"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold break-words">{item.headword}</span>
        {item.isSystem ? null : (
          <Badge variant="secondary" className="ml-auto">
            MY
          </Badge>
        )}
      </div>
      {item.partOfSpeech || item.meaningTexts.length > 0 ? (
        <div className="flex items-start gap-2">
          {item.partOfSpeech ? (
            <Badge variant="outline" className="shrink-0">
              {commonPartOfSpeechFullLabel(item.partOfSpeech)}
            </Badge>
          ) : null}
          {item.meaningTexts.length > 0 ? (
            <p className="text-muted-foreground line-clamp-2 text-sm whitespace-pre-wrap">
              <span className="text-red-600">{item.meaningTexts[0]}</span>
              {item.meaningTexts.length > 1 ? `; ${item.meaningTexts.slice(1).join("; ")}` : null}
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
  q,
  sort,
}: {
  currentPage: number;
  totalPages: number;
  q: string;
  sort: WordListSort;
}) {
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;
  const prevHref = buildPageHref(currentPage - 1, q, sort);
  const nextHref = buildPageHref(currentPage + 1, q, sort);

  return (
    <nav aria-label="ページ送り" className="flex items-center justify-between gap-2 pt-2">
      {hasPrev ? (
        <Link href={prevHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
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
        <Link href={nextHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
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

function buildPageHref(page: number, q: string, sort: WordListSort): string {
  const params = new URLSearchParams();
  if (q.length > 0) params.set("q", q);
  if (sort !== "recent") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs.length > 0 ? `/words?${qs}` : "/words";
}
