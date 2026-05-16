"use client";

import { Trash2Icon, PlusIcon } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";

import { relatedWordKindLabels, relatedWordKinds } from "@/lib/mock/related-word-kinds";
import { emptyRelatedWord, type WordFormValues } from "@/lib/schema/word-form";

import { CollapsibleField } from "./collapsible-field";
import { LinkedWordPicker } from "./linked-word-picker";
import { PartOfSpeechPicker } from "./part-of-speech-picker";

type RelatedWordCardProps = {
  index: number;
  onRemove: () => void;
};

function RelatedWordCard({ index, onRemove }: RelatedWordCardProps) {
  const form = useFormContext<WordFormValues>();

  return (
    <div className="border-border bg-card/50 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-medium">関連語 {index + 1}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="この関連語を削除"
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
      </div>

      <FormField
        control={form.control}
        name={`relatedWords.${index}.kind`}
        render={({ field: f }) => (
          <FormItem>
            <FormLabel>種別</FormLabel>
            <FormControl>
              <div className="flex flex-wrap gap-1">
                {relatedWordKinds.map((k) => (
                  <Toggle
                    key={k}
                    variant="outline"
                    size="sm"
                    pressed={f.value === k}
                    onPressedChange={(pressed) => {
                      f.onChange(pressed ? k : undefined);
                    }}
                  >
                    {relatedWordKindLabels[k]}
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
        name={`relatedWords.${index}.partOfSpeech`}
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
          name={`relatedWords.${index}.pronunciation`}
          render={({ field: f }) => (
            <FormItem>
              <FormLabel>発音記号</FormLabel>
              <FormControl>
                <Input inputMode="text" autoCapitalize="none" autoCorrect="off" {...f} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </CollapsibleField>

      <FormField
        control={form.control}
        name={`relatedWords.${index}.term`}
        render={({ field: f }) => (
          <FormItem>
            <FormLabel>
              語句<span className="text-destructive ml-1">*</span>
            </FormLabel>
            <FormControl>
              <Textarea rows={2} placeholder="例: fleeting / transient" {...f} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`relatedWords.${index}.linkedWordId`}
        render={({ field: f }) => {
          const term = form.watch(`relatedWords.${index}.term`);
          return (
            <FormItem>
              <FormLabel>既存単語へのリンク</FormLabel>
              <FormControl>
                <LinkedWordPicker
                  term={term ?? ""}
                  linkedWordId={f.value}
                  onLink={(id) => f.onChange(id)}
                  onUnlink={() => f.onChange(undefined)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          );
        }}
      />

      <FormField
        control={form.control}
        name={`relatedWords.${index}.meaning`}
        render={({ field: f }) => (
          <FormItem>
            <FormLabel>意味</FormLabel>
            <FormControl>
              <Textarea rows={2} placeholder="関連語の意味" {...f} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`relatedWords.${index}.note`}
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

export function RelatedWordsFields() {
  const form = useFormContext<WordFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "relatedWords",
  });

  return (
    <div className="flex flex-col gap-4">
      {fields.length === 0 ? (
        <p className="text-muted-foreground text-xs">同意語・反意語・派生語などを追加できます。</p>
      ) : null}

      {fields.map((field, index) => (
        <RelatedWordCard key={field.id} index={index} onRemove={() => remove(index)} />
      ))}

      <Button type="button" variant="outline" size="sm" onClick={() => append(emptyRelatedWord)}>
        <PlusIcon />
        関連語を追加
      </Button>
    </div>
  );
}
