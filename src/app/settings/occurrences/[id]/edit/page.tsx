import { notFound, redirect } from "next/navigation";

import { getOccurrenceForUser } from "@/lib/occurrences-detail";
import { occurrenceToFormValues } from "@/lib/schema/occurrence-form";
import { getCurrentSession } from "@/lib/session";

import { DeleteOccurrenceButton } from "../../_components/delete-occurrence-button";
import { OccurrenceForm } from "../../_components/occurrence-form";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditOccurrencePage({ params }: PageProps) {
  const { id } = await params;

  const session = await getCurrentSession();
  if (!session) redirect(`/sign-in?redirect=/settings/occurrences/${id}/edit`);

  const occ = await getOccurrenceForUser(session.user.id, id);
  if (!occ) notFound();
  if (occ.ownerId !== session.user.id) notFound();

  const defaultValues = occurrenceToFormValues(occ);

  return (
    <OccurrenceForm
      mode="edit"
      occurrenceId={id}
      defaultValues={defaultValues}
      actions={
        <DeleteOccurrenceButton
          occurrenceId={id}
          location={occ.location}
          wordLinkCount={occ.wordLinkCount}
        />
      }
    />
  );
}
