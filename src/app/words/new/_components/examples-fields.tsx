"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";

import { exampleKindLabels, exampleKinds } from "@/lib/mock/example-kinds";
import { emptyExample, type WordFormValues } from "@/lib/schema/word-form";

type ExampleCardProps = {
  index: number;
  onRemove: () => void;
};

function ExampleCard({ index, onRemove }: ExampleCardProps) {
  const form = useFormContext<WordFormValues>();

  return (
    <div className="border-border bg-card/50 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-medium">例文 {index + 1}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="この例文を削除"
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
      </div>

      <FormField
        control={form.control}
        name={`examples.${index}.kind`}
        render={({ field: f }) => (
          <FormItem>
            <FormLabel>種別</FormLabel>
            <FormControl>
              <div className="flex flex-wrap gap-1">
                {exampleKinds.map((k) => (
                  <Toggle
                    key={k}
                    variant="outline"
                    size="sm"
                    pressed={f.value === k}
                    onPressedChange={(pressed) => {
                      if (pressed) f.onChange(k);
                    }}
                  >
                    {exampleKindLabels[k]}
                  </Toggle>
                ))}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`examples.${index}.text`}
        render={({ field: f }) => (
          <FormItem>
            <FormLabel>
              例文<span className="text-destructive ml-1">*</span>
            </FormLabel>
            <FormControl>
              <Textarea rows={2} placeholder="例: The fleeting beauty of cherry blossoms." {...f} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`examples.${index}.meaning`}
        render={({ field: f }) => (
          <FormItem>
            <FormLabel>意味</FormLabel>
            <FormControl>
              <Textarea rows={2} placeholder="例文の和訳" {...f} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`examples.${index}.note`}
        render={({ field: f }) => (
          <FormItem>
            <FormLabel>補足説明</FormLabel>
            <FormControl>
              <Textarea rows={2} {...f} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

export function ExamplesFields() {
  const form = useFormContext<WordFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "examples",
  });

  return (
    <div className="flex flex-col gap-4">
      {fields.length === 0 ? (
        <p className="text-muted-foreground text-xs">例文、成句・熟語などを追加できます。</p>
      ) : null}

      {fields.map((field, index) => (
        <ExampleCard key={field.id} index={index} onRemove={() => remove(index)} />
      ))}

      <Button type="button" variant="outline" size="sm" onClick={() => append(emptyExample)}>
        <PlusIcon />
        例文を追加
      </Button>
    </div>
  );
}
