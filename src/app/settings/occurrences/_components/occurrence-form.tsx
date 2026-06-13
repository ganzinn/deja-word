"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { occurrenceFormSchema, type OccurrenceFormValues } from "@/lib/schema/occurrence-form";
import { cn } from "@/lib/utils";

import { createOccurrence } from "../new/actions";
import { updateOccurrence } from "../[id]/edit/actions";

type OccurrenceFormProps =
  | { mode: "create"; defaultValues: OccurrenceFormValues; headerActions?: ReactNode }
  | {
      mode: "edit";
      occurrenceId: string;
      defaultValues: OccurrenceFormValues;
      headerActions?: ReactNode;
    };

export function OccurrenceForm(props: OccurrenceFormProps) {
  const router = useRouter();
  const form = useForm<OccurrenceFormValues>({
    resolver: zodResolver(occurrenceFormSchema),
    defaultValues: props.defaultValues,
    mode: "onSubmit",
  });

  const title = props.mode === "edit" ? "掲載箇所を編集" : "掲載箇所を追加";
  const submitLabel = props.mode === "edit" ? "更新する" : "登録する";

  async function onSubmit(values: OccurrenceFormValues) {
    const result =
      props.mode === "edit"
        ? await updateOccurrence(props.occurrenceId, values)
        : await createOccurrence(values);
    if (result.ok) {
      toast.success(props.mode === "edit" ? "更新しました" : "登録しました");
      router.push("/settings/occurrences");
      return;
    }
    if (result.error === "duplicate") {
      form.setError("location", { type: "manual", message: result.message });
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
          href="/settings/occurrences"
          aria-label="戻る"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ChevronLeftIcon />
        </Link>
        <h1 className="text-base font-semibold">{title}</h1>
        {props.headerActions ? <div className="ml-auto">{props.headerActions}</div> : null}
      </header>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit, onInvalid)}
          noValidate
          className="flex flex-col gap-6 px-4 pt-4"
        >
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  掲載箇所名<span className="text-destructive ml-1">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    placeholder="例: TOEIC 公式問題集 / 面接で出た"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isPreset"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                </FormControl>
                <div className="flex flex-col gap-1">
                  <FormLabel className="cursor-pointer">プリセットとして表示する</FormLabel>
                  <FormDescription>
                    単語登録画面のトグル候補としてこの掲載箇所を表示します。
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

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
                {form.formState.isSubmitting ? "送信中…" : submitLabel}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </main>
  );
}
