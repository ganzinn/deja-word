import { PencilIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ScreenHeader } from "@/components/screen-header";
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
      <ScreenHeader
        backHref="/words"
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

      <WordDetailView word={word} />
    </main>
  );
}
