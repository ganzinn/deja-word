import { ChevronLeftIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { getCurrentSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export default async function AccountPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in?redirect=/account");

  const { name, email, createdAt } = session.user;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-0 pb-16 md:max-w-2xl">
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-3 backdrop-blur">
        <Link
          href="/menu"
          aria-label="戻る"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ChevronLeftIcon />
        </Link>
        <h1 className="text-base font-semibold">アカウント</h1>
        <Link
          href="/account/edit"
          aria-label="編集"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "ml-auto")}
        >
          <PencilIcon />
        </Link>
      </header>

      <div className="flex flex-col gap-4 px-4 pt-6">
        <Field label="名前" value={name} />
        <Field label="メールアドレス" value={email} />
        <Field label="登録日" value={dateFormatter.format(new Date(createdAt))} />
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-card/50 flex flex-col gap-1 rounded-lg border p-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm break-words">{value}</span>
    </div>
  );
}
