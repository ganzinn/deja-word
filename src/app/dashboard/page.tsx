import Link from "next/link";
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
        <div className="mt-8 grid gap-3">
          <Link
            href="/words/new"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            単語を登録（モック）
          </Link>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            ※ 永続化は未実装。送信値は DevTools コンソールに出力されます。
          </p>
        </div>
      </div>
    </main>
  );
}
