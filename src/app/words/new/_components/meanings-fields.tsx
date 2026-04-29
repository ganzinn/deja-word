"use client";

import { Trash2Icon, PlusIcon } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";

import { emptyMeaning, type WordFormValues } from "@/lib/schema/word-form";

import { PartOfSpeechPicker } from "./part-of-speech-picker";

export function MeaningsFields() {
  const form = useFormContext<WordFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "meanings",
  });
  const rootError = form.formState.errors.meanings?.root?.message;

  return (
    <div className="flex flex-col gap-4">
      {fields.map((field, index) => (
        <div
          key={field.id}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card/50 p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              意味 {index + 1}
              {index === 0 ? <span className="ml-1 text-destructive">*</span> : null}
            </span>
            {fields.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="この意味を削除"
                onClick={() => remove(index)}
              >
                <Trash2Icon />
              </Button>
            ) : null}
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

          <FormField
            control={form.control}
            name={`meanings.${index}.text`}
            render={({ field: f }) => (
              <FormItem>
                <FormLabel>
                  意味<span className="ml-1 text-destructive">*</span>
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

      {rootError ? (
        <p className="text-sm text-destructive" role="alert">
          {rootError}
        </p>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append(emptyMeaning)}
      >
        <PlusIcon />
        意味を追加
      </Button>
    </div>
  );
}
