import Link from "next/link";

import { getCurrentSession } from "@/lib/session";
import { signUpDisabled } from "@/lib/signup-policy";

import { SignOutButton } from "./sign-out-button";

export async function SiteHeader() {
  const session = await getCurrentSession();

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          DejaWord
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {session ? (
            <>
              <Link
                href="/dashboard"
                className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
              >
                Dashboard
              </Link>
              <span className="text-zinc-500 dark:text-zinc-400">{session.user.name}</span>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
              >
                ログイン
              </Link>
              {signUpDisabled ? null : (
                <Link
                  href="/sign-up"
                  className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  新規登録
                </Link>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
