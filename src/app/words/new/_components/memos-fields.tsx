"use client";

import { Trash2Icon, PlusIcon } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";

import { emptyMemo, type WordFormValues } from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { useIsCurrentUserSystem } from "./word-form-permissions-context";

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

      <Button type="button" variant="outline" size="sm" onClick={() => append(emptyMemo)}>
        <PlusIcon />
        メモを追加
      </Button>
    </div>
  );
}

function MemoRow({ index, onRemove }: { index: number; onRemove: () => void }) {
  const form = useFormContext<WordFormValues>();
  const ownerId = useWatch({ control: form.control, name: `memos.${index}.ownerId` });
  const isCurrentUserSystem = useIsCurrentUserSystem();
  const isSystemOwned = ownerId === SYSTEM_USER_ID && !isCurrentUserSystem;

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
        <Badge variant="outline" className="mt-2 text-[10px]">
          共通
        </Badge>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="このメモを削除"
          className="mt-1"
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
      )}
    </div>
  );
}
