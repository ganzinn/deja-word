import { notFound, redirect } from "next/navigation";

import { getOccurrencePresetsForUser } from "@/lib/occurrences";
import { wordDetailToFormValues } from "@/lib/schema/word-form";
import { getCurrentSession } from "@/lib/session";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { getWordDetailForUser } from "@/lib/words-detail";

import { WordForm } from "../../new/word-form";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditWordPage({ params }: PageProps) {
  const { id } = await params;

  const session = await getCurrentSession();
  if (!session) redirect(`/sign-in?redirect=/words/${id}/edit`);

  const word = await getWordDetailForUser(session.user.id, id);
  if (!word) notFound();
  if (word.ownerId !== session.user.id && word.ownerId !== SYSTEM_USER_ID) notFound();

  const occurrencePresets = await getOccurrencePresetsForUser(session.user.id);
  const defaultValues = wordDetailToFormValues(word);
  const linkedHeadwords = Object.fromEntries(
    word.relatedWords
      .filter((r) => r.linkedWord)
      .map((r) => [r.linkedWord!.id, r.linkedWord!.headword]),
  );

  return (
    <WordForm
      mode="edit"
      wordId={id}
      wordOwnerId={word.ownerId}
      isCurrentUserSystem={session.user.id === SYSTEM_USER_ID}
      defaultValues={defaultValues}
      linkedHeadwords={linkedHeadwords}
      occurrencePresets={occurrencePresets}
    />
  );
}
