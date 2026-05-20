"use client";

import { useFieldArray, useFormContext } from "react-hook-form";

import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";

import { emptyMemo, type WordFormValues } from "@/lib/schema/word-form";

import { ArrayAddButton } from "./shared/array-add-button";
import { ArrayRemoveButton } from "./shared/array-remove-button";
import { SystemBadge } from "./shared/system-badge";
import { useRowOwnership } from "./shared/use-row-ownership";

export function MemosFields() {
  const form = useFormContext<WordFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "memos",
  });

  return (
    <div className="flex flex-col gap-3">
      {fields.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          覚え方や個人的な気づきをメモとして残せます。
        </p>
      ) : null}

      {fields.map((field, index) => (
        <MemoRow key={field.id} index={index} onRemove={() => remove(index)} />
      ))}

      <ArrayAddButton label="メモを追加" onClick={() => append(emptyMemo)} />
    </div>
  );
}

function MemoRow({ index, onRemove }: { index: number; onRemove: () => void }) {
  const form = useFormContext<WordFormValues>();
  const { isSystemOwned } = useRowOwnership(`memos.${index}.ownerId`);

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">
        <FormField
          control={form.control}
          name={`memos.${index}.text`}
          render={({ field: f }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  rows={2}
                  placeholder={`メモ ${index + 1}`}
                  disabled={isSystemOwned}
                  {...f}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      {isSystemOwned ? (
        <SystemBadge className="mt-2" />
      ) : (
        <ArrayRemoveButton
          ariaLabel="このメモを削除"
          className="mt-1"
          onClick={onRemove}
        />
      )}
    </div>
  );
}
