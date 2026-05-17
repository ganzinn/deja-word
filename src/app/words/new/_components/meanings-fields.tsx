"use client";

import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { emptyMeaning, type WordFormValues } from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { CollapsibleField } from "./collapsible-field";
import { PartOfSpeechPicker } from "./part-of-speech-picker";
import { useIsCurrentUserSystem } from "./word-form-permissions-context";

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

      <Button type="button" variant="outline" size="sm" onClick={() => append(emptyMeaning)}>
        <PlusIcon />
        意味を追加
      </Button>
    </div>
  );
}

type MeaningCardProps = {
  index: number;
  onRemove: () => void;
};

function MeaningCard({ index, onRemove }: MeaningCardProps) {
  const form = useFormContext<WordFormValues>();
  const ownerId = useWatch({ control: form.control, name: `meanings.${index}.ownerId` });
  const isCurrentUserSystem = useIsCurrentUserSystem();
  const isSystemOwned = ownerId === SYSTEM_USER_ID && !isCurrentUserSystem;

  return (
    <div className="border-border bg-card/50 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">意味 {index + 1}</span>
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
            aria-label="この意味を削除"
            onClick={onRemove}
          >
            <Trash2Icon />
          </Button>
        )}
      </div>

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
    </div>
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
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => append(parentSystemOwned ? { ownerId: "", text: "" } : { text: "" })}
      >
        <PlusIcon />
        意味を追加
      </Button>
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
  const textOwnerId = useWatch({
    control: form.control,
    name: `meanings.${meaningIndex}.texts.${textIndex}.ownerId`,
  });
  const isCurrentUserSystem = useIsCurrentUserSystem();
  const isSystemText = textOwnerId === SYSTEM_USER_ID && !isCurrentUserSystem;

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
                disabled={isSystemText}
                {...f}
              />
            </FormControl>
            {canRemove && !isSystemText ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="この意味テキストを削除"
                onClick={onRemove}
              >
                <XIcon />
              </Button>
            ) : null}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
