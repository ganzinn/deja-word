"use client";

import { useFieldArray, useFormContext } from "react-hook-form";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { emptyMeaning, type WordFormValues } from "@/lib/schema/word-form";

import { CollapsibleField } from "./collapsible-field";
import { PartOfSpeechPicker } from "./part-of-speech-picker";
import { ArrayAddButton } from "./shared/array-add-button";
import { ArrayRemoveButton } from "./shared/array-remove-button";
import { FieldCard } from "./shared/field-card";
import { useRowOwnership } from "./shared/use-row-ownership";

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
        <MeaningCard key={field.id} index={index} onRemove={() => remove(index)} />
      ))}

      <ArrayAddButton label="意味を追加" onClick={() => append(emptyMeaning)} />
    </div>
  );
}

type MeaningCardProps = {
  index: number;
  onRemove: () => void;
};

function MeaningCard({ index, onRemove }: MeaningCardProps) {
  const form = useFormContext<WordFormValues>();
  const { isSystemOwned } = useRowOwnership(`meanings.${index}.ownerId`);

  return (
    <FieldCard
      title={`意味 ${index + 1}`}
      isSystemOwned={isSystemOwned}
      onRemove={onRemove}
      removeAriaLabel="この意味を削除"
    >
      <FormField
        control={form.control}
        name={`meanings.${index}.partOfSpeech`}
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
                  disabled={isSystemOwned}
                  {...f}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </CollapsibleField>

      <MeaningTextList meaningIndex={index} parentSystemOwned={isSystemOwned} />

      <FormField
        control={form.control}
        name={`meanings.${index}.note`}
        render={({ field: f }) => (
          <FormItem>
            <FormLabel>補足説明</FormLabel>
            <FormControl>
              <Textarea
                rows={2}
                placeholder="文語、フォーマルな場面で使う 等"
                disabled={isSystemOwned}
                {...f}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </FieldCard>
  );
}

function MeaningTextList({
  meaningIndex,
  parentSystemOwned,
}: {
  meaningIndex: number;
  parentSystemOwned: boolean;
}) {
  const form = useFormContext<WordFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: `meanings.${meaningIndex}.texts`,
  });

  return (
    <div className="flex flex-col gap-2">
      <FormLabel>
        意味<span className="text-destructive ml-1">*</span>
      </FormLabel>
      {fields.map((field, textIndex) => (
        <MeaningTextRow
          key={field.id}
          meaningIndex={meaningIndex}
          textIndex={textIndex}
          canRemove={fields.length > 1}
          onRemove={() => remove(textIndex)}
        />
      ))}
      <ArrayAddButton
        label="意味を追加"
        variant="ghost"
        className="self-start"
        onClick={() => append(parentSystemOwned ? { ownerId: "", text: "" } : { text: "" })}
      />
    </div>
  );
}

function MeaningTextRow({
  meaningIndex,
  textIndex,
  canRemove,
  onRemove,
}: {
  meaningIndex: number;
  textIndex: number;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const form = useFormContext<WordFormValues>();
  const { isSystemOwned } = useRowOwnership(`meanings.${meaningIndex}.texts.${textIndex}.ownerId`);

  return (
    <FormField
      control={form.control}
      name={`meanings.${meaningIndex}.texts.${textIndex}.text`}
      render={({ field: f }) => (
        <FormItem>
          <div className="flex items-start gap-2">
            <FormControl>
              <Textarea
                rows={2}
                placeholder="例: 短命の、つかの間の"
                disabled={isSystemOwned}
                {...f}
              />
            </FormControl>
            {canRemove && !isSystemOwned ? (
              <ArrayRemoveButton
                icon="x"
                ariaLabel="この意味テキストを削除"
                onClick={onRemove}
              />
            ) : null}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
