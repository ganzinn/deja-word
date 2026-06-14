import { ChevronLeftIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { WordDetailView } from "@/components/word-detail-view";
import { getCurrentSession } from "@/lib/session";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { cn } from "@/lib/utils";
import { countIncomingLinksForUser } from "@/lib/words-delete";
import { getWordDetailForUser } from "@/lib/words-detail";

import { DeleteWordButton } from "./_components/delete-word-button";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function WordDetailPage({ params }: PageProps) {
  const { id } = await params;

  const session = await getCurrentSession();
  if (!session) redirect(`/sign-in?redirect=/words/${id}`);

  const word = await getWordDetailForUser(session.user.id, id);
  if (!word) notFound();

  const canEdit = word.ownerId === session.user.id || word.ownerId === SYSTEM_USER_ID;
  const canDelete = word.ownerId === session.user.id;
  const incomingLinkCount = canDelete ? await countIncomingLinksForUser(session.user.id, id) : 0;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-0 pb-16 md:max-w-2xl">
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-3 backdrop-blur">
        <Link
          href="/words"
          aria-label="戻る"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ChevronLeftIcon />
        </Link>
        <h1 className="truncate text-base font-semibold">{word.headword}</h1>
        {word.ownerId === SYSTEM_USER_ID ? null : (
          <Badge variant="secondary" className="shrink-0">
            MY
          </Badge>
        )}
        {canEdit || canDelete ? (
          <div className="ml-auto flex items-center gap-1">
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
          </div>
        ) : null}
      </header>

      <WordDetailView word={word} />
    </main>
  );
}
