"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVerticalIcon } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function AuthNav({ userName }: { userName: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    setIsPending(true);
    try {
      await authClient.signOut();
      setMenuOpen(false);
      router.push("/");
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      {/* デスクトップ: 横並び表示 */}
      <div className="hidden items-center gap-3 sm:flex">
        <Link
          href="/menu"
          className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
        >
          メニュー
        </Link>
        <Link
          href="/account"
          className="text-zinc-500 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          {userName}
        </Link>
        <button
          type="button"
          disabled={isPending}
          onClick={handleSignOut}
          className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {isPending ? "ログアウト中..." : "ログアウト"}
        </button>
      </div>

      {/* モバイル: 3 点リーダーに集約 */}
      <div className="flex items-center gap-2 sm:hidden">
        <Link
          href="/account"
          className="max-w-32 truncate text-zinc-500 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          {userName}
        </Link>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger
            aria-label="メニュー"
            className="inline-flex items-center rounded-md border border-zinc-300 bg-white p-1.5 text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <MoreVerticalIcon className="size-5" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-40 gap-1 p-1.5">
            <Link
              href="/words/new"
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-3 py-2 text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              単語登録
            </Link>
            <Link
              href="/words"
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-3 py-2 text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              単語一覧
            </Link>
            <Link
              href="/quiz"
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-3 py-2 text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              単語テスト
            </Link>
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-3 py-2 text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              設定
            </Link>
            <hr className="my-1 border-zinc-200 dark:border-zinc-700" />
            <button
              type="button"
              disabled={isPending}
              onClick={handleSignOut}
              className="rounded-md px-3 py-2 text-left text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {isPending ? "ログアウト中..." : "ログアウト"}
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
