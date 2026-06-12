import { redirect } from "next/navigation";

import { listActiveDrillsForUser } from "@/lib/drill-list";
import { listOccurrencesForUser } from "@/lib/occurrences-list";
import { getCurrentSession } from "@/lib/session";

import { QuizFlow } from "./_components/quiz-flow";

/**
 * 単語テストの開始画面（テストフロー一式の入口）。
 * カウントダウン → 出題 → 結果はクライアント状態遷移で URL 遷移しない。
 * 進行中の定着モード一覧（再開・削除）もここで取得して開始画面下部に表示する。
 */
export default async function QuizPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in?redirect=/quiz");

  const [occurrences, activeDrills] = await Promise.all([
    listOccurrencesForUser(session.user.id),
    listActiveDrillsForUser(session.user.id),
  ]);

  return (
    <QuizFlow
      occurrences={occurrences.map((o) => ({
        id: o.id,
        location: o.location,
        wordCount: o.wordLinkCount,
      }))}
      activeDrills={activeDrills}
    />
  );
}
