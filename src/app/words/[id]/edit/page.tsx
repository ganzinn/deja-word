import { notFound, redirect } from "next/navigation";

import { getAutoNumberMapForUser } from "@/lib/occurrences-auto-number";
import { getOccurrencePresetsForUser } from "@/lib/occurrences";
import { wordDetailToFormValues } from "@/lib/schema/word-form";
import { getCurrentSession } from "@/lib/session";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { isWordAiEnabled } from "@/lib/word-ai-draft";
import { getWordDetailForUser } from "@/lib/words-detail";

import { WordForm } from "../../new/word-form";
import {
  buildWordDetailHref,
  parseWordDetailNavContext,
  type RawWordDetailNavParams,
} from "../../_lib/search-params";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawWordDetailNavParams>;
};

export default async function EditWordPage({ params, searchParams }: PageProps) {
  const { id } = await params;

  const session = await getCurrentSession();
  if (!session) redirect(`/sign-in?redirect=/words/${id}/edit`);

  const word = await getWordDetailForUser(session.user.id, id);
  if (!word) notFound();
  if (word.ownerId !== session.user.id && word.ownerId !== SYSTEM_USER_ID) notFound();

  // 一覧由来の絞り込みコンテキストを詳細画面へ返す（前後ナビを編集後も維持するため）。
  const ctx = parseWordDetailNavContext(await searchParams);
  const returnHref = ctx !== null ? buildWordDetailHref(id, ctx) : `/words/${id}`;

  const [occurrencePresets, autoNumberByOccurrenceId] = await Promise.all([
    getOccurrencePresetsForUser(session.user.id),
    getAutoNumberMapForUser(session.user.id),
  ]);
  // 編集では初期自動展開はしない（既存データのまま）。プリセット再選択時の自動入力のみ map を渡す。
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
      returnHref={returnHref}
      wordOwnerId={word.ownerId}
      isCurrentUserSystem={session.user.id === SYSTEM_USER_ID}
      defaultValues={defaultValues}
      linkedHeadwords={linkedHeadwords}
      occurrencePresets={occurrencePresets}
      autoNumberByOccurrenceId={autoNumberByOccurrenceId}
      aiEnabled={isWordAiEnabled()}
    />
  );
}
