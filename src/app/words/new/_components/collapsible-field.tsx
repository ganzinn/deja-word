"use client";

import { PlusIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function CollapsibleField({ label, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start text-xs text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <PlusIcon />
        {label}を追加
      </Button>
    );
  }
  return <>{children}</>;
}
