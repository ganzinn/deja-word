"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";

import { togglePresetSetting } from "../actions";

type Props = {
  occurrenceId: string;
  initialIsPreset: boolean;
};

export function PresetToggle({ occurrenceId, initialIsPreset }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleChange(checked: boolean) {
    startTransition(async () => {
      const result = await togglePresetSetting(occurrenceId, checked);
      if (!result.ok) {
        toast.error(result.message);
      }
    });
  }

  return (
    <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs select-none">
      <Checkbox
        checked={initialIsPreset}
        disabled={isPending}
        onCheckedChange={(v) => handleChange(v === true)}
      />
      プリセット
    </label>
  );
}
