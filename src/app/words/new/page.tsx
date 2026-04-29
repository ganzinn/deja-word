import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/session";

import { WordForm } from "./word-form";

export default async function NewWordPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in?redirect=/words/new");

  return <WordForm />;
}
