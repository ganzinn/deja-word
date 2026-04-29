"use client";

import { Trash2Icon, PlusIcon } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";

import {
  relatedWordKindLabels,
  relatedWordKinds,
} from "@/lib/mock/related-word-kinds";
import { emptyRelatedWord, type WordFormValues } from "@/lib/schema/word-form";

import { CollapsibleField } from "./collapsible-field";
import { PartOfSpeechPicker } from "./part-of-speech-picker";

type RelatedWordCardProps = {
  index: number;
  onRemove: () => void;
};

function RelatedWordCard({ index, onRemove }: RelatedWordCardProps) {
  const form = useFormContext<WordFormValues>();

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          関連語 {index + 1}
        </span>
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

      <div className="flex flex-wrap gap-4">
        <FormField
          control={form.control}
          name={`relatedWords.${index}.isMP`}
          render={({ field: f }) => (
            <FormItem className="flex flex-row items-center gap-2">
              <FormControl>
                <Checkbox
                  checked={f.value}
                  onCheckedChange={(v) => f.onChange(Boolean(v))}
                />
              </FormControl>
              <FormLabel className="cursor-pointer">
                MP <span className="text-xs text-muted-foreground">(MINIMAL PHRASES)</span>
              </FormLabel>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`relatedWords.${index}.isBM`}
          render={({ field: f }) => (
            <FormItem className="flex flex-row items-center gap-2">
              <FormControl>
                <Checkbox
                  checked={f.value}
                  onCheckedChange={(v) => f.onChange(Boolean(v))}
                />
              </FormControl>
              <FormLabel className="cursor-pointer">
                BM <span className="text-xs text-muted-foreground">(お気に入り)</span>
              </FormLabel>
            </FormItem>
          )}
        />
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
                      if (pressed) f.onChange(k);
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

      <FormField
        control={form.control}
        name={`relatedWords.${index}.text`}
        render={({ field: f }) => (
          <FormItem>
            <FormLabel>
              語句<span className="ml-1 text-destructive">*</span>
            </FormLabel>
            <FormControl>
              <Textarea
                rows={2}
                placeholder="例: a fleeting moment / fleeting"
                {...f}
              />
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
                <Input
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
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
        <p className="text-xs text-muted-foreground">
          例文・熟語・同意語・反意語などを追加できます。
        </p>
      ) : null}

      {fields.map((field, index) => (
        <RelatedWordCard
          key={field.id}
          index={index}
          onRemove={() => remove(index)}
        />
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append(emptyRelatedWord)}
      >
        <PlusIcon />
        関連語を追加
      </Button>
    </div>
  );
}
