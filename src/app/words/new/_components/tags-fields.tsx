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

import { findTag, mockTags } from "@/lib/mock/tags";
import {
  createMockTag,
  emptyCustomTag,
  type WordFormValues,
} from "@/lib/schema/word-form";

export function TagsFields() {
  const form = useFormContext<WordFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "tags",
  });

  const selectedMockIds = fields
    .filter((f) => f.source === "mock")
    .map((f) => f.tagId)
    .filter((id): id is string => Boolean(id));

  function toggleMockTag(tagId: string) {
    const idx = fields.findIndex(
      (f) => f.source === "mock" && f.tagId === tagId,
    );
    if (idx >= 0) {
      remove(idx);
    } else {
      append(createMockTag(tagId));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {mockTags.map((tag) => (
          <Toggle
            key={tag.id}
            variant="outline"
            size="sm"
            pressed={selectedMockIds.includes(tag.id)}
            onPressedChange={() => toggleMockTag(tag.id)}
          >
            {tag.name}
          </Toggle>
        ))}
      </div>

      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          既存掲載箇所から選ぶか、カスタム掲載箇所を追加してください。
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <TagEntryCard
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
        onClick={() => append(emptyCustomTag)}
      >
        <PlusIcon />
        カスタム掲載箇所を追加
      </Button>
    </div>
  );
}

type TagEntryCardProps = {
  index: number;
  onRemove: () => void;
};

function TagEntryCard({ index, onRemove }: TagEntryCardProps) {
  const form = useFormContext<WordFormValues>();
  const entry = form.watch(`tags.${index}`);
  const isMock = entry?.source === "mock";
  const mockTag = isMock ? findTag(entry?.tagId ?? "") : undefined;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {isMock ? mockTag?.name ?? "(不明な掲載箇所)" : "カスタム"}
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

      {!isMock ? (
        <FormField
          control={form.control}
          name={`tags.${index}.name`}
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
      ) : null}

      <LocationList tagIndex={index} />
    </div>
  );
}

function LocationList({ tagIndex }: { tagIndex: number }) {
  const form = useFormContext<WordFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: `tags.${tagIndex}.locations`,
  });

  return (
    <div className="flex flex-col gap-2">
      <FormLabel className="text-xs text-muted-foreground">掲載詳細</FormLabel>
      {fields.map((field, locIndex) => (
        <FormField
          key={field.id}
          control={form.control}
          name={`tags.${tagIndex}.locations.${locIndex}.value`}
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
                  aria-label="この掲載詳細を削除"
                  onClick={() => remove(locIndex)}
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
        onClick={() => append({ value: "" })}
      >
        <PlusIcon />
        掲載詳細を追加
      </Button>
    </div>
  );
}
