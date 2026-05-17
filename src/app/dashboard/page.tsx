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
            単語を登録
          </Link>
          <Link
            href="/words"
            className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            単語一覧
          </Link>
        </div>
      </div>
    </main>
  );
}
