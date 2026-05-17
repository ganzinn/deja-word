"use client";

import { Trash2Icon, PlusIcon } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";

import { relatedWordKindLabels, relatedWordKinds } from "@/lib/mock/related-word-kinds";
import { emptyRelatedWord, type WordFormValues } from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { CollapsibleField } from "./collapsible-field";
import { useLinkedHeadword } from "./linked-headwords-context";
import { LinkedWordPicker } from "./linked-word-picker";
import { PartOfSpeechPicker } from "./part-of-speech-picker";
import { useIsCurrentUserSystem } from "./word-form-permissions-context";

type RelatedWordCardProps = {
  index: number;
  onRemove: () => void;
};

function RelatedWordCard({ index, onRemove }: RelatedWordCardProps) {
  const form = useFormContext<WordFormValues>();
  const ownerId = useWatch({ control: form.control, name: `relatedWords.${index}.ownerId` });
  const isCurrentUserSystem = useIsCurrentUserSystem();
  const isSystemOwned = ownerId === SYSTEM_USER_ID && !isCurrentUserSystem;

  return (
    <div className="border-border bg-card/50 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">関連語 {index + 1}</span>
          {isSystemOwned ? (
            <Badge variant="outline" className="text-[10px]">
              共通
            </Badge>
          ) : null}
        </div>
        {isSystemOwned ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="この関連語を削除"
            onClick={onRemove}
          >
            <Trash2Icon />
          </Button>
        )}
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
                    disabled={isSystemOwned}
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
              <PartOfSpeechPicker
                value={f.value ?? ""}
                onChange={f.onChange}
                disabled={isSystemOwned}
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
                  disabled={isSystemOwned}
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
        name={`relatedWords.${index}.term`}
        render={({ field: f }) => (
          <FormItem>
            <FormLabel>
              語句<span className="text-destructive ml-1">*</span>
            </FormLabel>
            <FormControl>
              <Textarea
                rows={2}
                placeholder="例: fleeting / transient"
                disabled={isSystemOwned}
                {...f}
              />
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
                <LinkedWordPickerForRow
                  term={term ?? ""}
                  linkedWordId={f.value}
                  onLink={(id) => f.onChange(id)}
                  onUnlink={() => f.onChange(undefined)}
                  disabled={isSystemOwned}
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
              <Textarea rows={2} placeholder="関連語の意味" disabled={isSystemOwned} {...f} />
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
              <Textarea rows={2} disabled={isSystemOwned} {...f} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function LinkedWordPickerForRow(props: {
  term: string;
  linkedWordId: string | undefined;
  onLink: (id: string, headword: string) => void;
  onUnlink: () => void;
  disabled?: boolean;
}) {
  const initialLinkedHeadword = useLinkedHeadword(props.linkedWordId);
  return <LinkedWordPicker {...props} initialLinkedHeadword={initialLinkedHeadword} />;
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
