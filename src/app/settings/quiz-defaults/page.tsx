import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { listOccurrencesForUser } from "@/lib/occurrences-list";
import { getQuizDefaultsForUser } from "@/lib/quiz-default-settings";
import { getCurrentSession } from "@/lib/session";
import { cn } from "@/lib/utils";

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
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-3 backdrop-blur">
        <Link
          href="/settings"
          aria-label="戻る"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ChevronLeftIcon />
        </Link>
        <h1 className="text-base font-semibold">単語テスト</h1>
      </header>

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
