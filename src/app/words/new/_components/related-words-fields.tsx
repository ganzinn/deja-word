"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { PronunciationAudioManager } from "@/components/pronunciation-audio-manager";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";

import { deleteRelatedWordAudio, uploadRelatedWordAudio } from "@/app/words/[id]/edit/actions";

import { relatedWordKindLabels, relatedWordKinds } from "@/lib/mock/related-word-kinds";
import { emptyRelatedWord, type WordFormValues } from "@/lib/schema/word-form";

import { CollapsibleField } from "./collapsible-field";
import { useLinkedHeadword } from "./linked-headwords-context";
import { LinkedWordPicker } from "./linked-word-picker";
import { PartOfSpeechPicker } from "./part-of-speech-picker";
import { ArrayAddButton } from "./shared/array-add-button";
import { FieldCard } from "./shared/field-card";
import { NoteList } from "./shared/note-list";
import { useRowOwnership } from "./shared/use-row-ownership";

type RelatedWordCardProps = {
  index: number;
  onRemove: () => void;
};

function RelatedWordCard({ index, onRemove }: RelatedWordCardProps) {
  const form = useFormContext<WordFormValues>();
  const { isSystemOwned } = useRowOwnership(`relatedWords.${index}.ownerId`);
  const relatedWordId = useWatch({ control: form.control, name: `relatedWords.${index}.id` });
  const pronunciation = useWatch({
    control: form.control,
    name: `relatedWords.${index}.pronunciation`,
  });
  const pronunciationAudioUrl = useWatch({
    control: form.control,
    name: `relatedWords.${index}.pronunciationAudioUrl`,
  });

  return (
    <FieldCard
      title={`関連語 ${index + 1}`}
      isSystemOwned={isSystemOwned}
      onRemove={onRemove}
      removeAriaLabel="この関連語を削除"
    >
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
                      f.onChange(pressed ? k : null);
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

      <CollapsibleField label="発音" defaultOpen={!!pronunciation || !!pronunciationAudioUrl}>
        <div className="border-border/60 flex flex-col gap-3 rounded-md border border-dashed p-3">
          <span className="text-muted-foreground text-xs font-medium">発音</span>
          <FormField
            control={form.control}
            name={`relatedWords.${index}.pronunciation`}
            render={({ field: f }) => (
              <FormItem>
                <FormLabel>記号</FormLabel>
                <FormControl>
                  <Input
                    inputMode="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    // 入力中も表示側 (word-detail-view) と同じ IPA フォントで見えるようにする
                    className="font-pronunciation"
                    placeholder="例: ˈfliːtɪŋ"
                    disabled={isSystemOwned}
                    {...f}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {!isSystemOwned ? (
            <FormItem>
              <FormLabel>音源</FormLabel>
              {relatedWordId ? (
                <PronunciationAudioManager
                  value={pronunciationAudioUrl}
                  onUpload={(fd) => uploadRelatedWordAudio(relatedWordId, fd)}
                  onDelete={() => deleteRelatedWordAudio(relatedWordId)}
                />
              ) : (
                <p className="text-muted-foreground text-xs">音源は保存してから追加できます。</p>
              )}
            </FormItem>
          ) : null}
        </div>
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
                  linkedWordId={f.value ?? undefined}
                  onLink={(id) => f.onChange(id)}
                  onUnlink={() => f.onChange(null)}
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

      <NoteList prefix={`relatedWords.${index}`} parentSystemOwned={isSystemOwned} />
    </FieldCard>
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

      <ArrayAddButton label="関連語を追加" onClick={() => append(emptyRelatedWord)} />
    </div>
  );
}
