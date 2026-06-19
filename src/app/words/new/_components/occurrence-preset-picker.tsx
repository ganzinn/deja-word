"use client";

import type { FieldArrayWithId, UseFieldArrayAppend, UseFieldArrayRemove } from "react-hook-form";

import { Toggle } from "@/components/ui/toggle";

import type { OccurrencePreset } from "@/lib/occurrences";
import { createPresetOccurrence, type WordFormValues } from "@/lib/schema/word-form";

import { resolvePreset } from "./occurrence-preset";
import { useIsCurrentUserSystem } from "./word-form-permissions-context";

type OccurrencePresetPickerProps = {
  presets: OccurrencePreset[];
  autoNumberByOccurrenceId?: Record<string, number>;
  fields: FieldArrayWithId<WordFormValues, "occurrences", "id">[];
  append: UseFieldArrayAppend<WordFormValues, "occurrences">;
  remove: UseFieldArrayRemove;
};

/**
 * カタログ（presets）からこの単語に付ける掲載箇所を「選ぶ」ツールバー。
 * トグル ON で行を append、OFF で行を remove する（フォームのローカル state 操作のみ）。
 * 掲載箇所そのものを「管理する」設定画面 (settings/occurrences/) とは別の関心。
 */
export function OccurrencePresetPicker({
  presets,
  autoNumberByOccurrenceId,
  fields,
  append,
  remove,
}: OccurrencePresetPickerProps) {
  const isCurrentUserSystem = useIsCurrentUserSystem();

  if (presets.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((preset) => {
        const { pressed, systemLocked, action } = resolvePreset(
          fields,
          preset.id,
          isCurrentUserSystem,
        );
        return (
          <Toggle
            key={preset.id}
            variant="outline"
            size="sm"
            pressed={pressed}
            disabled={systemLocked}
            onPressedChange={() => {
              if (action.kind === "add")
                append(
                  createPresetOccurrence(preset, autoNumberByOccurrenceId?.[preset.id] ?? null),
                );
              else if (action.kind === "remove") remove(action.index);
            }}
          >
            {preset.location}
          </Toggle>
        );
      })}
    </div>
  );
}
