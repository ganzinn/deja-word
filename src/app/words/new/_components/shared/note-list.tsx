"use client";

import { useFieldArray, useFormContext } from "react-hook-form";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";

import type { WordFormValues } from "@/lib/schema/word-form";

import { ArrayAddButton } from "./array-add-button";
import { ArrayRemoveButton } from "./array-remove-button";
import { useRowOwnership } from "./use-row-ownership";

// 補足説明（notes）は意味・例文・関連語の各カードに共通の子配列。親パスだけ差し替えて使い回す。
type NotePrefix = `meanings.${number}` | `examples.${number}` | `relatedWords.${number}`;

export function NoteList({
  prefix,
  parentSystemOwned,
}: {
  prefix: NotePrefix;
  parentSystemOwned: boolean;
}) {
  const form = useFormContext<WordFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: `${prefix}.notes`,
  });

  return (
    <div className="flex flex-col gap-2">
      <FormLabel>補足説明</FormLabel>
      {fields.map((field, noteIndex) => (
        <NoteRow
          key={field.id}
          prefix={prefix}
          noteIndex={noteIndex}
          onRemove={() => remove(noteIndex)}
        />
      ))}
      <ArrayAddButton
        label="補足説明を追加"
        variant="ghost"
        className="self-start"
        onClick={() => append(parentSystemOwned ? { ownerId: "", text: "" } : { text: "" })}
      />
    </div>
  );
}

function NoteRow({
  prefix,
  noteIndex,
  onRemove,
}: {
  prefix: NotePrefix;
  noteIndex: number;
  onRemove: () => void;
}) {
  const form = useFormContext<WordFormValues>();
  const { isSystemOwned } = useRowOwnership(`${prefix}.notes.${noteIndex}.ownerId`);

  return (
    <FormField
      control={form.control}
      name={`${prefix}.notes.${noteIndex}.text`}
      render={({ field: f }) => (
        <FormItem>
          <div className="flex items-start gap-2">
            <FormControl>
              <Textarea
                rows={2}
                placeholder="文語、フォーマルな場面で使う 等"
                disabled={isSystemOwned}
                {...f}
              />
            </FormControl>
            {!isSystemOwned ? (
              <ArrayRemoveButton icon="x" ariaLabel="この補足説明を削除" onClick={onRemove} />
            ) : null}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
