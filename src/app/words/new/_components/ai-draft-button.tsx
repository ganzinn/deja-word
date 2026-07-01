"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useTransition } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import type { WordFormValues } from "@/lib/schema/word-form";

import { generateAiDraft } from "../ai-draft-action";
import { computeAiDraftSections, mergeAiDraftIntoFormValues } from "./ai-draft-merge";

export function AiDraftButton() {
  const form = useFormContext<WordFormValues>();
  const headword = useWatch({ control: form.control, name: "headword" });
  const [isPending, startTransition] = useTransition();

  function onClick() {
    // 入力済みセクションは生成対象から外し、全部埋まっていれば AI を呼び出さない。
    const sections = computeAiDraftSections(form.getValues());
    if (!Object.values(sections).some(Boolean)) {
      toast.info("意味・熟語・例文はすべて入力済みのため、生成をスキップしました");
      return;
    }
    startTransition(async () => {
      const result = await generateAiDraft({ headword: headword.trim(), sections });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const merged = mergeAiDraftIntoFormValues(form.getValues(), result.draft);
      // useFieldArray の内部状態と確実に同期させるため reset で反映する。
      // merged は getValues() 起点なので手入力は保持され、keepDefaultValues で
      // defaultValues を据え置き isDirty 追跡を壊さない。
      form.reset(merged, { keepDefaultValues: true });
      toast.success("AI の下書きを反映しました");
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={isPending || headword.trim().length === 0}
        onClick={onClick}
      >
        {isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {isPending ? "生成中…" : "AI入力"}
      </Button>
      <p className="text-muted-foreground text-xs">
        意味・発音記号・熟語・例文の下書きを AI が生成します（空欄のみ反映）
      </p>
    </div>
  );
}
