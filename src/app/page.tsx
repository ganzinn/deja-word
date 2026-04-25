import Link from "next/link";

import { signUpDisabled } from "@/lib/signup-policy";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-zinc-900 dark:text-zinc-50">
      <div className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">deja-word</h1>
        <p className="text-base text-zinc-600 sm:text-lg dark:text-zinc-400">
          一度忘れた単語との再会体験をコンセプトにした英単語学習アプリ
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {signUpDisabled ? null : (
            <Link
              href="/sign-up"
              className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              新規登録
            </Link>
          )}
          <Link
            href="/sign-in"
            className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            ログイン
          </Link>
        </div>
      </div>
    </main>
  );
}
