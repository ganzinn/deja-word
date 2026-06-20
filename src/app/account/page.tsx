import { PencilIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ScreenHeader } from "@/components/screen-header";
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
      <ScreenHeader
        backHref="/menu"
        title="アカウント"
        actions={
          <Link
            href="/account/edit"
            aria-label="編集"
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
          >
            <PencilIcon />
          </Link>
        }
      />

      <dl className="flex flex-col px-4 pt-6">
        <Field label="名前" value={name} />
        <Field label="メールアドレス" value={email} />
        <Field label="登録日" value={dateFormatter.format(new Date(createdAt))} />
      </dl>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border flex flex-col gap-1 border-b py-3 last:border-b-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words">{value}</dd>
    </div>
  );
}
