"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { PronunciationAudioManager } from "@/components/pronunciation-audio-manager";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";

import { deleteExampleAudio, uploadExampleAudio } from "@/app/words/[id]/edit/actions";

import { exampleKindLabels, exampleKinds } from "@/lib/mock/example-kinds";
import { emptyExample, type WordFormValues } from "@/lib/schema/word-form";

import { ArrayAddButton } from "./shared/array-add-button";
import { FieldCard } from "./shared/field-card";
import { NoteList } from "./shared/note-list";
import { useRowOwnership } from "./shared/use-row-ownership";

type ExampleCardProps = {
  index: number;
  wordId?: string;
  onRemove: () => void;
};

function ExampleCard({ index, wordId, onRemove }: ExampleCardProps) {
  const form = useFormContext<WordFormValues>();
  const { isSystemOwned } = useRowOwnership(`examples.${index}.ownerId`);
  const exampleId = useWatch({ control: form.control, name: `examples.${index}.id` });
  const pronunciationAudioUrl = useWatch({
    control: form.control,
    name: `examples.${index}.pronunciationAudioUrl`,
  });

  return (
    <FieldCard
      title={`例文 ${index + 1}`}
      isSystemOwned={isSystemOwned}
      onRemove={onRemove}
      removeAriaLabel="この例文を削除"
    >
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
                    disabled={isSystemOwned}
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
              <Textarea
                rows={2}
                placeholder="例: The fleeting beauty of cherry blossoms."
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
          {exampleId && wordId ? (
            <PronunciationAudioManager
              value={pronunciationAudioUrl}
              onUpload={(fd) => uploadExampleAudio(wordId, exampleId, fd)}
              onDelete={() => deleteExampleAudio(wordId, exampleId)}
            />
          ) : (
            <p className="text-muted-foreground text-xs">音源は保存してから追加できます。</p>
          )}
        </FormItem>
      ) : null}

      <FormField
        control={form.control}
        name={`examples.${index}.meaning`}
        render={({ field: f }) => (
          <FormItem>
            <FormLabel>意味</FormLabel>
            <FormControl>
              <Textarea rows={2} placeholder="例文の和訳" disabled={isSystemOwned} {...f} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <NoteList prefix={`examples.${index}`} parentSystemOwned={isSystemOwned} />
    </FieldCard>
  );
}

type ExamplesFieldsProps = {
  /** 音源 action の revalidate 対象となる単語 id。新規時は undefined（音源は保存後のみ扱える）。 */
  wordId?: string;
};

export function ExamplesFields({ wordId }: ExamplesFieldsProps) {
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
        <ExampleCard key={field.id} index={index} wordId={wordId} onRemove={() => remove(index)} />
      ))}

      <ArrayAddButton label="例文を追加" onClick={() => append(emptyExample)} />
    </div>
  );
}
