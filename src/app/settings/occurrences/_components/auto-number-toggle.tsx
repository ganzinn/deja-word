"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";

import { toggleAutoNumbering } from "../actions";

type Props = {
  occurrenceId: string;
  initialAutoNumbering: boolean;
  /** プリセット OFF のときは操作不可（自動採番はプリセットのサブ設定） */
  disabled?: boolean;
};

export function AutoNumberToggle({ occurrenceId, initialAutoNumbering, disabled }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleChange(checked: boolean) {
    startTransition(async () => {
      const result = await toggleAutoNumbering(occurrenceId, checked);
      if (!result.ok) {
        toast.error(result.message);
      }
    });
  }

  return (
    <label
      className="text-muted-foreground flex items-center gap-2 text-xs select-none data-[disabled=true]:opacity-40 [&:not([data-disabled=true])]:cursor-pointer"
      data-disabled={disabled ? "true" : undefined}
    >
      <Checkbox
        checked={initialAutoNumbering}
        disabled={disabled || isPending}
        onCheckedChange={(v) => handleChange(v === true)}
      />
      自動採番
    </label>
  );
}
