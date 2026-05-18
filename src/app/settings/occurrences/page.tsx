import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { listOccurrencesForUser, type OccurrenceListItem } from "@/lib/occurrences-list";
import { getCurrentSession } from "@/lib/session";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { cn } from "@/lib/utils";

import { PresetToggle } from "./_components/preset-toggle";

export default async function OccurrencesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in?redirect=/settings/occurrences");

  const items = await listOccurrencesForUser(session.user.id);
  const isCurrentUserSystem = session.user.id === SYSTEM_USER_ID;

  const own = items.filter((i) => i.ownerId === session.user.id);
  const systemOwned = items.filter((i) => i.isSystem && i.ownerId !== session.user.id);

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
        <h1 className="text-base font-semibold">掲載箇所</h1>
        <Link
          href="/settings/occurrences/new"
          aria-label="掲載箇所を追加"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "ml-auto")}
        >
          <PlusIcon />
        </Link>
      </header>

      <div className="flex flex-col gap-6 px-4 pt-4">
        <section>
          <h2 className="text-muted-foreground mb-2 text-xs font-medium">
            {isCurrentUserSystem ? "共通の掲載箇所" : "自分の掲載箇所"}
          </h2>
          {own.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="flex flex-col gap-2">
              {own.map((item) => (
                <li key={item.id}>
                  <OwnRow item={item} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {isCurrentUserSystem ? null : (
          <section>
            <h2 className="text-muted-foreground mb-2 text-xs font-medium">共通の掲載箇所</h2>
            {systemOwned.length === 0 ? (
              <p className="text-muted-foreground text-sm">共通の掲載箇所はまだありません。</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {systemOwned.map((item) => (
                  <li key={item.id}>
                    <SystemRow item={item} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function OwnRow({ item }: { item: OccurrenceListItem }) {
  return (
    <div className="border-border bg-card/50 flex items-center gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium break-words">{item.location}</span>
          {item.isSystem ? (
            <Badge variant="secondary" className="text-[10px]">
              共通
            </Badge>
          ) : null}
        </div>
        {item.wordLinkCount > 0 ? (
          <span className="text-muted-foreground text-xs">{item.wordLinkCount} 件の単語</span>
        ) : null}
      </div>
      <PresetToggle occurrenceId={item.id} initialIsPreset={item.isPreset} />
      <Link
        href={`/settings/occurrences/${item.id}/edit`}
        aria-label="編集"
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
      >
        <PencilIcon />
      </Link>
    </div>
  );
}

function SystemRow({ item }: { item: OccurrenceListItem }) {
  return (
    <div className="border-border bg-card/50 flex items-center gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium break-words">{item.location}</span>
          <Badge variant="secondary" className="text-[10px]">
            共通
          </Badge>
        </div>
        {item.wordLinkCount > 0 ? (
          <span className="text-muted-foreground text-xs">{item.wordLinkCount} 件の単語</span>
        ) : null}
      </div>
      <PresetToggle occurrenceId={item.id} initialIsPreset={item.isPreset} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border-border text-muted-foreground flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center text-sm">
      <p>まだ自分の掲載箇所はありません</p>
      <Link
        href="/settings/occurrences/new"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        <PlusIcon />
        掲載箇所を追加
        <ChevronRightIcon />
      </Link>
    </div>
  );
}
