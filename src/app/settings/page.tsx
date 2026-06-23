import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ScreenHeader } from "@/components/screen-header";
import { getCurrentSession } from "@/lib/session";

export default async function SettingsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in?redirect=/settings");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-0 pb-16 md:max-w-2xl">
      <ScreenHeader backHref="/menu" title="設定" />

      <ul className="flex flex-col gap-2 px-4 pt-4">
        <li>
          <Link
            href="/settings/general"
            className="border-border bg-card/50 hover:bg-muted/60 flex items-center justify-between gap-2 rounded-lg border p-4 transition-colors"
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium">単語全般</span>
              <span className="text-muted-foreground text-xs">
                一覧の表示設定や音声などの全般設定を行います
              </span>
            </div>
            <ChevronRightIcon className="text-muted-foreground size-4" />
          </Link>
        </li>
        <li>
          <Link
            href="/settings/occurrences"
            className="border-border bg-card/50 hover:bg-muted/60 flex items-center justify-between gap-2 rounded-lg border p-4 transition-colors"
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium">掲載箇所</span>
              <span className="text-muted-foreground text-xs">
                単語登録画面のプリセット候補を管理します
              </span>
            </div>
            <ChevronRightIcon className="text-muted-foreground size-4" />
          </Link>
        </li>
        <li>
          <Link
            href="/settings/quiz-defaults"
            className="border-border bg-card/50 hover:bg-muted/60 flex items-center justify-between gap-2 rounded-lg border p-4 transition-colors"
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium">単語テスト</span>
              <span className="text-muted-foreground text-xs">
                テスト開始画面の初期値（掲載箇所・範囲・出題形式）を設定します
              </span>
            </div>
            <ChevronRightIcon className="text-muted-foreground size-4" />
          </Link>
        </li>
      </ul>
    </main>
  );
}
