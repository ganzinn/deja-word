import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Dashboard
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">ようこそ、{session.user.name} さん</p>
        <div className="mt-8 rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          単語機能は別計画で実装予定です。
        </div>
      </div>
    </main>
  );
}
