import { redirect } from "next/navigation";

import { defaultOccurrenceFormValues } from "@/lib/schema/occurrence-form";
import { getCurrentSession } from "@/lib/session";

import { OccurrenceForm } from "../_components/occurrence-form";

export default async function NewOccurrencePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in?redirect=/settings/occurrences/new");

  return <OccurrenceForm mode="create" defaultValues={defaultOccurrenceFormValues} />;
}
