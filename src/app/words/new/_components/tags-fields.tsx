"use client";

import { useFieldArray, useFormContext } from "react-hook-form";

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
import type { WordFormValues } from "@/lib/schema/word-form";

export function TagsFields() {
  const form = useFormContext<WordFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "tags",
  });
  const selectedIds = fields.map((f) => f.tagId);

  function toggleTag(tagId: string) {
    const idx = selectedIds.indexOf(tagId);
    if (idx >= 0) {
      remove(idx);
    } else {
      append({ tagId, pageNumber: undefined });
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
            pressed={selectedIds.includes(tag.id)}
            onPressedChange={() => toggleTag(tag.id)}
          >
            {tag.name}
          </Toggle>
        ))}
      </div>

      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          出題対象の場所を選択してください。
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {fields.map((field, index) => {
          const tag = findTag(field.tagId);
          if (!tag?.hasPage) return null;
          return (
            <FormField
              key={field.id}
              control={form.control}
              name={`tags.${index}.pageNumber`}
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">
                    {tag.name} のページ数
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      placeholder="例: 128"
                      value={f.value ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        f.onChange(v === "" ? undefined : Number(v));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
