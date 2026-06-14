import { redirect } from "next/navigation";

import { getAutoNumberOccurrencesForUser } from "@/lib/occurrences-auto-number";
import { getOccurrencePresetsForUser } from "@/lib/occurrences";
import { createPresetOccurrence, defaultWordFormValues } from "@/lib/schema/word-form";
import { getCurrentSession } from "@/lib/session";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { WordForm } from "./word-form";

export default async function NewWordPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in?redirect=/words/new");

  const [occurrencePresets, autoNumberOccurrences] = await Promise.all([
    getOccurrencePresetsForUser(session.user.id),
    getAutoNumberOccurrencesForUser(session.user.id),
  ]);

  // 自動採番 ON の掲載箇所は、新規登録フォームを開いた時点で展開＆次番号を入力済みにする。
  const defaultValues = {
    ...defaultWordFormValues,
    occurrences: autoNumberOccurrences.map((o) =>
      createPresetOccurrence({ id: o.id, ownerId: o.ownerId, location: o.location }, o.nextNumber),
    ),
  };
  const autoNumberByOccurrenceId = Object.fromEntries(
    autoNumberOccurrences.map((o) => [o.id, o.nextNumber]),
  );

  return (
    <WordForm
      mode="create"
      defaultValues={defaultValues}
      occurrencePresets={occurrencePresets}
      autoNumberByOccurrenceId={autoNumberByOccurrenceId}
      isCurrentUserSystem={session.user.id === SYSTEM_USER_ID}
    />
  );
}
