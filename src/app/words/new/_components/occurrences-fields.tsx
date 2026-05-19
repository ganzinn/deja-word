"use client";

import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const isCurrentUserSystem = useIsCurrentUserSystem();
  const location = useWatch({ control: form.control, name: `occurrences.${index}.location` });
  const ownerId = useWatch({ control: form.control, name: `occurrences.${index}.ownerId` });
  const occurrenceOwnerId = useWatch({
    control: form.control,
    name: `occurrences.${index}.occurrenceOwnerId`,
  });
  const isRowSystemOwned = ownerId === SYSTEM_USER_ID && !isCurrentUserSystem;
  const isPresetSystemOwned = occurrenceOwnerId === SYSTEM_USER_ID;

  return (
    <div className="border-border bg-card/50 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">
            {location || "(未入力)"}
          </span>
          {isRowSystemOwned ? (
            <Badge variant="outline" className="text-[10px]">
              共通
            </Badge>
          ) : null}
        </div>
        {isRowSystemOwned ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="この掲載箇所を削除"
            onClick={onRemove}
          >
            <Trash2Icon />
          </Button>
        )}
      </div>

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
    </div>
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
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => append(parentSystemOwned ? { ownerId: "", detail: "" } : { detail: "" })}
      >
        <PlusIcon />
        詳細を追加
      </Button>
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
  const isCurrentUserSystem = useIsCurrentUserSystem();
  const detailOwnerId = useWatch({
    control: form.control,
    name: `occurrences.${occurrenceIndex}.details.${detailIndex}.ownerId`,
  });
  const isSystemDetail = detailOwnerId === SYSTEM_USER_ID && !isCurrentUserSystem;

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
                disabled={isSystemDetail}
                value={f.value ?? ""}
                onChange={(e) => f.onChange(e.target.value)}
              />
            </FormControl>
            {isSystemDetail ? null : (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="この詳細を削除"
                onClick={onRemove}
              >
                <XIcon />
              </Button>
            )}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
