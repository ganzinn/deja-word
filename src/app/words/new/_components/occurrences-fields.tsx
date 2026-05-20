"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";

import type { OccurrencePreset } from "@/lib/occurrences";
import {
  createPresetOccurrence,
  emptyOccurrence,
  type WordFormValues,
} from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { ArrayAddButton } from "./shared/array-add-button";
import { ArrayRemoveButton } from "./shared/array-remove-button";
import { FieldCard } from "./shared/field-card";
import { useRowOwnership } from "./shared/use-row-ownership";
import { useIsCurrentUserSystem } from "./word-form-permissions-context";

type OccurrencesFieldsProps = {
  presets: OccurrencePreset[];
};

export function OccurrencesFields({ presets }: OccurrencesFieldsProps) {
  const form = useFormContext<WordFormValues>();
  const isCurrentUserSystem = useIsCurrentUserSystem();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "occurrences",
  });

  function togglePreset(preset: OccurrencePreset) {
    const idx = fields.findIndex((f) => f.occurrenceId === preset.id);
    if (idx >= 0) {
      const target = fields[idx];
      if (target.ownerId === SYSTEM_USER_ID && !isCurrentUserSystem) return;
      remove(idx);
    } else {
      append(createPresetOccurrence(preset));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {presets.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const linkedField = fields.find((f) => f.occurrenceId === preset.id);
            const pressed = !!linkedField;
            const systemLocked = linkedField?.ownerId === SYSTEM_USER_ID && !isCurrentUserSystem;
            return (
              <Toggle
                key={preset.id}
                variant="outline"
                size="sm"
                pressed={pressed}
                disabled={systemLocked}
                onPressedChange={() => togglePreset(preset)}
              >
                {preset.location}
              </Toggle>
            );
          })}
        </div>
      ) : null}

      {fields.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          既存掲載箇所から選ぶか、掲載箇所を追加してください。
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <OccurrenceCard key={field.id} index={index} onRemove={() => remove(index)} />
        ))}
      </div>

      <ArrayAddButton
        label="掲載箇所を追加"
        className="self-start"
        onClick={() => append(emptyOccurrence)}
      />
    </div>
  );
}

type OccurrenceCardProps = {
  index: number;
  onRemove: () => void;
};

function OccurrenceCard({ index, onRemove }: OccurrenceCardProps) {
  const form = useFormContext<WordFormValues>();
  const location = useWatch({ control: form.control, name: `occurrences.${index}.location` });
  const occurrenceOwnerId = useWatch({
    control: form.control,
    name: `occurrences.${index}.occurrenceOwnerId`,
  });
  const { isSystemOwned: isRowSystemOwned, isCurrentUserSystem } = useRowOwnership(
    `occurrences.${index}.ownerId`,
  );
  const isPresetSystemOwned = occurrenceOwnerId === SYSTEM_USER_ID;

  return (
    <FieldCard
      title={location || "(未入力)"}
      isSystemOwned={isRowSystemOwned}
      onRemove={onRemove}
      removeAriaLabel="この掲載箇所を削除"
    >
      {isPresetSystemOwned ? null : (
        <FormField
          control={form.control}
          name={`occurrences.${index}.location`}
          render={({ field: f }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground text-xs">
                掲載箇所名<span className="text-destructive ml-1">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="例: 面接で出た / 試験頻出"
                  disabled={isRowSystemOwned}
                  value={f.value ?? ""}
                  onChange={(e) => f.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {isPresetSystemOwned && !isCurrentUserSystem ? null : (
        <FormField
          control={form.control}
          name={`occurrences.${index}.occurrenceNumber`}
          render={({ field: f }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground text-xs">掲載番号</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  placeholder="例: 42"
                  disabled={isRowSystemOwned}
                  value={f.value ?? ""}
                  onChange={(e) =>
                    f.onChange(e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <DetailList occurrenceIndex={index} parentSystemOwned={isRowSystemOwned} />
    </FieldCard>
  );
}

function DetailList({
  occurrenceIndex,
  parentSystemOwned,
}: {
  occurrenceIndex: number;
  parentSystemOwned: boolean;
}) {
  const form = useFormContext<WordFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: `occurrences.${occurrenceIndex}.details`,
  });

  return (
    <div className="flex flex-col gap-2">
      <FormLabel className="text-muted-foreground text-xs">詳細</FormLabel>
      {fields.map((field, detailIndex) => (
        <DetailRow
          key={field.id}
          occurrenceIndex={occurrenceIndex}
          detailIndex={detailIndex}
          onRemove={() => remove(detailIndex)}
        />
      ))}
      <ArrayAddButton
        label="詳細を追加"
        variant="ghost"
        className="self-start"
        onClick={() => append(parentSystemOwned ? { ownerId: "", detail: "" } : { detail: "" })}
      />
    </div>
  );
}

function DetailRow({
  occurrenceIndex,
  detailIndex,
  onRemove,
}: {
  occurrenceIndex: number;
  detailIndex: number;
  onRemove: () => void;
}) {
  const form = useFormContext<WordFormValues>();
  const { isSystemOwned } = useRowOwnership(
    `occurrences.${occurrenceIndex}.details.${detailIndex}.ownerId`,
  );

  return (
    <FormField
      control={form.control}
      name={`occurrences.${occurrenceIndex}.details.${detailIndex}.detail`}
      render={({ field: f }) => (
        <FormItem>
          <div className="flex items-center gap-2">
            <FormControl>
              <Input
                type="text"
                placeholder="例: 128 / lesson_12 / 00:32:15"
                disabled={isSystemOwned}
                value={f.value ?? ""}
                onChange={(e) => f.onChange(e.target.value)}
              />
            </FormControl>
            {isSystemOwned ? null : (
              <ArrayRemoveButton icon="x" ariaLabel="この詳細を削除" onClick={onRemove} />
            )}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
