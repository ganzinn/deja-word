import { redirect } from "next/navigation";

import { getSystemOccurrencePresets } from "@/lib/occurrences";
import { defaultWordFormValues } from "@/lib/schema/word-form";
import { getCurrentSession } from "@/lib/session";

import { WordForm } from "./word-form";

export default async function NewWordPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in?redirect=/words/new");

  const occurrencePresets = await getSystemOccurrencePresets();

  return (
    <WordForm
      mode="create"
      defaultValues={defaultWordFormValues}
      occurrencePresets={occurrencePresets}
    />
  );
}
