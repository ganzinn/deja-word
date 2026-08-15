import { redirect } from "next/navigation";

import { getAutoNumberOccurrencesForUser } from "@/lib/occurrences-auto-number";
import { getOccurrencePresetsForUser } from "@/lib/occurrences";
import { createPresetOccurrence, defaultWordFormValues } from "@/lib/schema/word-form";
import { getCurrentSession } from "@/lib/session";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { isWordAiEnabled } from "@/lib/word-ai-draft";

import {
  parsePrefillHeadword,
  parseWordListReturnHref,
  type RawWordListContextParams,
} from "../_lib/search-params";
import { WordForm } from "./word-form";

type PageProps = {
  /** 単語ビューの検索から来た場合の一覧コンテキスト（プリフィルと戻り先の再構築に使う）。 */
  searchParams: Promise<RawWordListContextParams>;
};

export default async function NewWordPage({ searchParams }: PageProps) {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in?redirect=/words/new");

  const params = await searchParams;
  const [occurrencePresets, autoNumberOccurrences] = await Promise.all([
    getOccurrencePresetsForUser(session.user.id),
    getAutoNumberOccurrencesForUser(session.user.id),
  ]);

  // 検索で見つからなかった語をそのまま登録できるよう、検索キーワードを headword に入れておく。
  const prefillHeadword = parsePrefillHeadword(params.q);
  // 戻り先は元の検索結果一覧。検索コンテキストが無ければ渡さず、フォーム側の既定 /words に任せる。
  const returnHref = parseWordListReturnHref(params);

  // 自動採番 ON の掲載箇所は、新規登録フォームを開いた時点で展開＆次番号を入力済みにする。
  const defaultValues = {
    ...defaultWordFormValues,
    ...(prefillHeadword === null ? {} : { headword: prefillHeadword }),
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
      returnHref={returnHref ?? undefined}
      isCurrentUserSystem={session.user.id === SYSTEM_USER_ID}
      aiEnabled={isWordAiEnabled()}
    />
  );
}
