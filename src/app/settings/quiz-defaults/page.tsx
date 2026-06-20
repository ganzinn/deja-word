import { redirect } from "next/navigation";

import { ScreenHeader } from "@/components/screen-header";
import { listOccurrencesForUser } from "@/lib/occurrences-list";
import { getQuizDefaultsForUser } from "@/lib/quiz-default-settings";
import { getCurrentSession } from "@/lib/session";

import { QuizDefaultsForm } from "./_components/quiz-defaults-form";

/**
 * 単語テストのデフォルト設定画面。
 * 開始画面（/quiz）の初期値（掲載箇所・掲載番号範囲・出題形式）を保存する。
 * 成立可否の検証は開始画面のプレビューが行うため、ここでは保存のみを担う。
 */
export default async function QuizDefaultsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in?redirect=/settings/quiz-defaults");

  const [occurrences, defaults] = await Promise.all([
    listOccurrencesForUser(session.user.id),
    getQuizDefaultsForUser(session.user.id),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-0 pb-16 md:max-w-2xl">
      <ScreenHeader backHref="/settings" title="単語テスト" />

      <div className="px-4 pt-4">
        <QuizDefaultsForm
          occurrences={occurrences.map((o) => ({
            id: o.id,
            location: o.location,
            wordCount: o.wordLinkCount,
          }))}
          defaults={defaults}
        />
      </div>
    </main>
  );
}
