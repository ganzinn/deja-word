import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ScreenHeaderProps = {
  backHref: string;
  backLabel?: string;
  title: ReactNode;
  titleClassName?: string;
  actions?: ReactNode;
};

export function ScreenHeader({
  backHref,
  backLabel = "戻る",
  title,
  titleClassName,
  actions,
}: ScreenHeaderProps) {
  return (
    <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-3 backdrop-blur">
      <Link
        href={backHref}
        aria-label={backLabel}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
      >
        <ChevronLeftIcon />
      </Link>
      <h1 className={cn("text-base font-semibold", titleClassName)}>{title}</h1>
      {actions ? <div className="ml-auto flex items-center gap-1">{actions}</div> : null}
    </header>
  );
}
