"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Accordion } from "@/components/ui/accordion";
import { Button, buttonVariants } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { cn } from "@/lib/utils";

import type { OccurrencePreset } from "@/lib/occurrences";
import { defaultWordFormValues, wordFormSchema, type WordFormValues } from "@/lib/schema/word-form";

import { createWord } from "./actions";
import { BasicFields } from "./_components/basic-fields";
import { ExamplesFields } from "./_components/examples-fields";
import { FormSection } from "./_components/form-section";
import { MeaningsFields } from "./_components/meanings-fields";
import { MemosFields } from "./_components/memos-fields";
import { OccurrencesFields } from "./_components/occurrences-fields";
import { RelatedWordsFields } from "./_components/related-words-fields";

type WordFormProps = {
  occurrencePresets: OccurrencePreset[];
};

export function WordForm({ occurrencePresets }: WordFormProps) {
  const router = useRouter();
  const form = useForm<WordFormValues>({
    resolver: zodResolver(wordFormSchema),
    defaultValues: defaultWordFormValues,
    mode: "onSubmit",
  });

  const meanings = useWatch({ control: form.control, name: "meanings" });
  const examples = useWatch({ control: form.control, name: "examples" });
  const relatedWords = useWatch({ control: form.control, name: "relatedWords" });
  const memos = useWatch({ control: form.control, name: "memos" });
  const occurrences = useWatch({ control: form.control, name: "occurrences" });

  async function onSubmit(values: WordFormValues) {
    const result = await createWord(values);
    if (result.ok) {
      toast.success("登録しました");
      router.push(`/words/${result.wordId}`);
      return;
    }
    if (result.error === "duplicate") {
      form.setError("headword", { type: "manual", message: result.message });
    }
    toast.error(result.message);
  }

  function onInvalid() {
    toast.error("入力内容を確認してください");
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-0 pb-28 md:max-w-2xl">
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-3 backdrop-blur">
        <Link
          href="/dashboard"
          aria-label="戻る"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ChevronLeftIcon />
        </Link>
        <h1 className="text-base font-semibold">単語を登録</h1>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} noValidate>
          <Accordion
            multiple
            defaultValue={["basic", "meanings", "examples", "related", "memos", "occurrences"]}
            className="w-full"
          >
            <FormSection value="basic" title="基本" required>
              <BasicFields />
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
              <OccurrencesFields presets={occurrencePresets} />
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
                {form.formState.isSubmitting ? "送信中…" : "登録する"}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </main>
  );
}
