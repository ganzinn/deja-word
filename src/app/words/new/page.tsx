import { redirect } from "next/navigation";

import { getOccurrencePresetsForUser } from "@/lib/occurrences";
import { defaultWordFormValues } from "@/lib/schema/word-form";
import { getCurrentSession } from "@/lib/session";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { WordForm } from "./word-form";

export default async function NewWordPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in?redirect=/words/new");

  const occurrencePresets = await getOccurrencePresetsForUser(session.user.id);

  return (
    <WordForm
      mode="create"
      defaultValues={defaultWordFormValues}
      occurrencePresets={occurrencePresets}
      isCurrentUserSystem={session.user.id === SYSTEM_USER_ID}
    />
  );
}
