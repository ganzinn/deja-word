"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { PronunciationAudioManager } from "@/components/pronunciation-audio-manager";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { deletePronunciationAudio, uploadPronunciationAudio } from "@/app/words/[id]/edit/actions";

import { emptyMeaning, type WordFormValues } from "@/lib/schema/word-form";

import { CollapsibleField } from "./collapsible-field";
import { PartOfSpeechPicker } from "./part-of-speech-picker";
import { ArrayAddButton } from "./shared/array-add-button";
import { ArrayRemoveButton } from "./shared/array-remove-button";
import { FieldCard } from "./shared/field-card";
import { NoteList } from "./shared/note-list";
import { useRowOwnership } from "./shared/use-row-ownership";

type MeaningsFieldsProps = {
  /** 音源 action の revalidate 対象となる単語 id。新規時は undefined（音源は保存後のみ扱える）。 */
  wordId?: string;
};

export function MeaningsFields({ wordId }: MeaningsFieldsProps) {
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
        <MeaningCard key={field.id} index={index} wordId={wordId} onRemove={() => remove(index)} />
      ))}

      {/*
        RHF の既定フォーカス（`meanings.N.` 前方一致）だと、意味カード内で最後に登録される
        補足説明 (notes) にフォーカスが移ってしまう（ネストした配列 texts で走査が止まらず、
        後続の一致が上書きするため）。最初に入力すべき意味テキストを focusName で名指しする。
      */}
      <ArrayAddButton
        label="意味を追加"
        onClick={() =>
          append(emptyMeaning, { focusName: `meanings.${fields.length}.texts.0.text` })
        }
      />
    </div>
  );
}

type MeaningCardProps = {
  index: number;
  wordId?: string;
  onRemove: () => void;
};

function MeaningCard({ index, wordId, onRemove }: MeaningCardProps) {
  const form = useFormContext<WordFormValues>();
  const { isSystemOwned } = useRowOwnership(`meanings.${index}.ownerId`);
  const meaningId = useWatch({ control: form.control, name: `meanings.${index}.id` });
  const pronunciation = useWatch({
    control: form.control,
    name: `meanings.${index}.pronunciation`,
  });
  const pronunciationAudioUrl = useWatch({
    control: form.control,
    name: `meanings.${index}.pronunciationAudioUrl`,
  });

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

      <CollapsibleField label="発音" defaultOpen={!!pronunciation || !!pronunciationAudioUrl}>
        <div className="border-border/60 flex flex-col gap-3 rounded-md border border-dashed p-3">
          <span className="text-muted-foreground text-xs font-medium">発音</span>
          <FormField
            control={form.control}
            name={`meanings.${index}.pronunciation`}
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
                    placeholder="例: ɪˈfemərəl"
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
              {meaningId && wordId ? (
                <PronunciationAudioManager
                  value={pronunciationAudioUrl}
                  onUpload={(fd) => uploadPronunciationAudio(wordId, meaningId, fd)}
                  onDelete={() => deletePronunciationAudio(wordId, meaningId)}
                />
              ) : (
                <p className="text-muted-foreground text-xs">音源は保存してから追加できます。</p>
              )}
            </FormItem>
          ) : null}
        </div>
      </CollapsibleField>

      <MeaningTextList meaningIndex={index} parentSystemOwned={isSystemOwned} />

      <NoteList prefix={`meanings.${index}`} parentSystemOwned={isSystemOwned} />
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
              <ArrayRemoveButton icon="x" ariaLabel="この意味テキストを削除" onClick={onRemove} />
            ) : null}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
