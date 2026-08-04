"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { ScreenHeader } from "@/components/screen-header";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";

import type { OccurrencePreset } from "@/lib/occurrences";
import { wordFormSchema, type WordFormValues } from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { createWord } from "./actions";
import { updateWord } from "../[id]/edit/actions";
import { BasicFields } from "./_components/basic-fields";
import { ExamplesFields } from "./_components/examples-fields";
import { FormSection } from "./_components/form-section";
import { LinkedHeadwordsProvider } from "./_components/linked-headwords-context";
import { MeaningsFields } from "./_components/meanings-fields";
import { MemosFields } from "./_components/memos-fields";
import { OccurrencesFields } from "./_components/occurrences-fields";
import { RelatedWordsFields } from "./_components/related-words-fields";
import { RichTextHelp } from "./_components/rich-text-help";
import { WordFormPermissionsProvider } from "./_components/word-form-permissions-context";

type WordFormProps = {
  mode: "create" | "edit";
  defaultValues: WordFormValues;
  occurrencePresets: OccurrencePreset[];
  autoNumberByOccurrenceId?: Record<string, number>;
  wordId?: string;
  /** 編集モードの戻り先・更新後の遷移先。掲載箇所の絞り込みを保った詳細 URL を渡す。 */
  returnHref?: string;
  wordOwnerId?: string;
  isCurrentUserSystem?: boolean;
  linkedHeadwords?: Record<string, string>;
  aiEnabled?: boolean;
};

export function WordForm({
  mode,
  defaultValues,
  occurrencePresets,
  autoNumberByOccurrenceId,
  wordId,
  returnHref,
  wordOwnerId,
  isCurrentUserSystem = false,
  linkedHeadwords,
  aiEnabled = false,
}: WordFormProps) {
  const headwordReadOnly = wordOwnerId === SYSTEM_USER_ID && !isCurrentUserSystem;
  const router = useRouter();
  const form = useForm<WordFormValues>({
    resolver: zodResolver(wordFormSchema),
    defaultValues,
    mode: "onSubmit",
  });

  const meanings = useWatch({ control: form.control, name: "meanings" });
  const examples = useWatch({ control: form.control, name: "examples" });
  const relatedWords = useWatch({ control: form.control, name: "relatedWords" });
  const memos = useWatch({ control: form.control, name: "memos" });
  const occurrences = useWatch({ control: form.control, name: "occurrences" });

  const isEdit = mode === "edit";
  const title = isEdit ? "単語を編集" : "単語を登録";
  const submitLabel = isEdit ? "更新する" : "登録する";
  const submittingLabel = "送信中…";
  const backHref = isEdit && wordId ? (returnHref ?? `/words/${wordId}`) : "/words";

  async function onSubmit(values: WordFormValues) {
    const result = isEdit && wordId ? await updateWord(wordId, values) : await createWord(values);
    if (result.ok) {
      toast.success(isEdit ? "更新しました" : "登録しました");
      // 編集は元の詳細（＝絞り込み付き URL）へ戻す。新規は素の詳細へ。
      router.push(isEdit && returnHref ? returnHref : `/words/${result.wordId}`);
      return;
    }
    if (result.error === "duplicate") {
      form.setError("headword", { type: "manual", message: result.message });
    }
    if (result.error === "duplicate_occurrence_number") {
      form.setError("occurrences", { type: "manual", message: result.message });
    }
    toast.error(result.message);
  }

  function onInvalid() {
    toast.error("入力内容を確認してください");
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-0 pb-28 md:max-w-2xl">
      <ScreenHeader backHref={backHref} title={title} />

      <RichTextHelp />

      <Form {...form}>
        <WordFormPermissionsProvider value={{ isCurrentUserSystem }}>
          <LinkedHeadwordsProvider value={linkedHeadwords ?? {}}>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} noValidate>
              <Accordion
                multiple
                defaultValue={["basic", "meanings", "examples", "related", "memos", "occurrences"]}
                className="w-full"
              >
                <FormSection value="basic" title="基本" required>
                  <BasicFields
                    readOnly={headwordReadOnly}
                    wordId={isEdit ? wordId : undefined}
                    aiEnabled={aiEnabled}
                  />
                </FormSection>
                <FormSection value="meanings" title="意味" count={meanings?.length ?? 0}>
                  <MeaningsFields />
                </FormSection>
                <FormSection value="examples" title="例文" count={examples?.length ?? 0}>
                  <ExamplesFields />
                </FormSection>
                <FormSection value="related" title="関連語" count={relatedWords?.length ?? 0}>
                  <RelatedWordsFields />
                </FormSection>
                <FormSection value="memos" title="メモ" count={memos?.length ?? 0}>
                  <MemosFields />
                </FormSection>
                <FormSection value="occurrences" title="掲載箇所" count={occurrences?.length ?? 0}>
                  <OccurrencesFields
                    presets={occurrencePresets}
                    autoNumberByOccurrenceId={autoNumberByOccurrenceId}
                  />
                </FormSection>
              </Accordion>

              <div
                className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-10 border-t p-3 backdrop-blur"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
              >
                <div className="mx-auto w-full max-w-sm md:max-w-md">
                  <Button
                    type="submit"
                    size="lg"
                    className="h-11 w-full"
                    disabled={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting ? submittingLabel : submitLabel}
                  </Button>
                </div>
              </div>
            </form>
          </LinkedHeadwordsProvider>
        </WordFormPermissionsProvider>
      </Form>
    </main>
  );
}
