"use client";

import { Trash2Icon, PlusIcon } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { emptyMeaning, type WordFormValues } from "@/lib/schema/word-form";

import { CollapsibleField } from "./collapsible-field";
import { PartOfSpeechPicker } from "./part-of-speech-picker";

export function MeaningsFields() {
  const form = useFormContext<WordFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "meanings",
  });

  return (
    <div className="flex flex-col gap-4">
      {fields.length === 0 ? (
        <p className="text-muted-foreground text-xs">意味を追加できます。</p>
      ) : null}

      {fields.map((field, index) => (
        <div
          key={field.id}
          className="border-border bg-card/50 flex flex-col gap-3 rounded-lg border p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">意味 {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="この意味を削除"
              onClick={() => remove(index)}
            >
              <Trash2Icon />
            </Button>
          </div>

          <FormField
            control={form.control}
            name={`meanings.${index}.partOfSpeech`}
            render={({ field: f }) => (
              <FormItem>
                <FormLabel>品詞</FormLabel>
                <FormControl>
                  <PartOfSpeechPicker value={f.value ?? ""} onChange={f.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <CollapsibleField label="発音記号">
            <FormField
              control={form.control}
              name={`meanings.${index}.pronunciation`}
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel>発音記号</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="例: /ɪˈfemərəl/"
                      {...f}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CollapsibleField>

          <FormField
            control={form.control}
            name={`meanings.${index}.text`}
            render={({ field: f }) => (
              <FormItem>
                <FormLabel>
                  意味<span className="text-destructive ml-1">*</span>
                </FormLabel>
                <FormControl>
                  <Textarea rows={2} placeholder="例: 短命の、つかの間の" {...f} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`meanings.${index}.note`}
            render={({ field: f }) => (
              <FormItem>
                <FormLabel>補足説明</FormLabel>
                <FormControl>
                  <Textarea rows={2} placeholder="文語、フォーマルな場面で使う 等" {...f} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={() => append(emptyMeaning)}>
        <PlusIcon />
        意味を追加
      </Button>
    </div>
  );
}
