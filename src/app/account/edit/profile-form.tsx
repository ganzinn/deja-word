"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { accountProfileSchema, type AccountProfileValues } from "@/lib/schema/account-profile";
import { cn } from "@/lib/utils";

import { updateProfile } from "./actions";

export function ProfileForm({ defaultValues }: { defaultValues: AccountProfileValues }) {
  const router = useRouter();
  const form = useForm<AccountProfileValues>({
    resolver: zodResolver(accountProfileSchema),
    defaultValues,
    mode: "onSubmit",
  });

  async function onSubmit(values: AccountProfileValues) {
    const result = await updateProfile(values);
    if (result.ok) {
      toast.success("更新しました");
      router.push("/account");
      router.refresh();
      return;
    }
    toast.error(result.message);
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-0 pb-28 md:max-w-2xl">
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-3 backdrop-blur">
        <Link
          href="/account"
          aria-label="戻る"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ChevronLeftIcon />
        </Link>
        <h1 className="text-base font-semibold">アカウント編集</h1>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-4 px-4 pt-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    名前<span className="text-destructive ml-1">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="例: 山田 太郎" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-10 border-t p-3 backdrop-blur">
            <div className="mx-auto w-full max-w-sm md:max-w-md">
              <Button
                type="submit"
                size="lg"
                className="h-11 w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "送信中…" : "更新する"}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </main>
  );
}
