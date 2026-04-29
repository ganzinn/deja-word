"use client";

import { Trash2Icon, PlusIcon } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";

import { emptyMemo, type WordFormValues } from "@/lib/schema/word-form";

export function MemosFields() {
  const form = useFormContext<WordFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "memos",
  });

  return (
    <div className="flex flex-col gap-3">
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          覚え方や個人的な気づきをメモとして残せます。
        </p>
      ) : null}

      {fields.map((field, index) => (
        <div key={field.id} className="flex items-start gap-2">
          <div className="flex-1">
            <FormField
              control={form.control}
              name={`memos.${index}.text`}
              render={({ field: f }) => (
                <FormItem>
                  <FormControl>
                    <Textarea rows={2} placeholder={`メモ ${index + 1}`} {...f} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="このメモを削除"
            className="mt-1"
            onClick={() => remove(index)}
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append(emptyMemo)}
      >
        <PlusIcon />
        メモを追加
      </Button>
    </div>
  );
}
