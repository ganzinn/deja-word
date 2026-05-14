"use client";

import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";

import type { OccurrencePreset } from "@/lib/occurrences";
import {
  createPresetOccurrence,
  emptyOccurrence,
  type WordFormValues,
} from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";

type OccurrencesFieldsProps = {
  presets: OccurrencePreset[];
};

export function OccurrencesFields({ presets }: OccurrencesFieldsProps) {
  const form = useFormContext<WordFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "occurrences",
  });

  const currentOccurrenceIds = fields
    .map((f) => f.occurrenceId)
    .filter((id): id is string => !!id);

  function togglePreset(preset: OccurrencePreset) {
    const idx = fields.findIndex((f) => f.occurrenceId === preset.id);
    if (idx >= 0) {
      remove(idx);
    } else {
      append(createPresetOccurrence(preset));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {presets.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Toggle
              key={preset.id}
              variant="outline"
              size="sm"
              pressed={currentOccurrenceIds.includes(preset.id)}
              onPressedChange={() => togglePreset(preset)}
            >
              {preset.location}
            </Toggle>
          ))}
        </div>
      ) : null}

      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          既存掲載箇所から選ぶか、掲載箇所を追加してください。
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <OccurrenceCard
            key={field.id}
            index={index}
            onRemove={() => remove(index)}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => append(emptyOccurrence)}
      >
        <PlusIcon />
        掲載箇所を追加
      </Button>
    </div>
  );
}

type OccurrenceCardProps = {
  index: number;
  onRemove: () => void;
};

function OccurrenceCard({ index, onRemove }: OccurrenceCardProps) {
  const form = useFormContext<WordFormValues>();
  const location = form.watch(`occurrences.${index}.location`);
  const ownerId = form.watch(`occurrences.${index}.ownerId`);
  const isSystemOwned = ownerId === SYSTEM_USER_ID;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {location || "(未入力)"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="この掲載箇所を削除"
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
      </div>

      {isSystemOwned ? null : (
        <FormField
          control={form.control}
          name={`occurrences.${index}.location`}
          render={({ field: f }) => (
            <FormItem>
              <FormLabel className="text-xs text-muted-foreground">
                掲載箇所名<span className="ml-1 text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="例: 面接で出た / 試験頻出"
                  value={f.value ?? ""}
                  onChange={(e) => f.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <DetailList occurrenceIndex={index} />
    </div>
  );
}

function DetailList({ occurrenceIndex }: { occurrenceIndex: number }) {
  const form = useFormContext<WordFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: `occurrences.${occurrenceIndex}.details`,
  });

  return (
    <div className="flex flex-col gap-2">
      <FormLabel className="text-xs text-muted-foreground">詳細</FormLabel>
      {fields.map((field, detailIndex) => (
        <FormField
          key={field.id}
          control={form.control}
          name={`occurrences.${occurrenceIndex}.details.${detailIndex}.detail`}
          render={({ field: f }) => (
            <FormItem>
              <div className="flex items-center gap-2">
                <FormControl>
                  <Input
                    type="text"
                    placeholder="例: 128 / lesson_12 / 00:32:15"
                    value={f.value ?? ""}
                    onChange={(e) => f.onChange(e.target.value)}
                  />
                </FormControl>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="この詳細を削除"
                  onClick={() => remove(detailIndex)}
                >
                  <XIcon />
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => append({ detail: "" })}
      >
        <PlusIcon />
        詳細を追加
      </Button>
    </div>
  );
}
