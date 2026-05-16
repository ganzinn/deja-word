"use client";

import { useFormContext } from "react-hook-form";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import type { WordFormValues } from "@/lib/schema/word-form";

export function BasicFields() {
  const form = useFormContext<WordFormValues>();
  return (
    <div className="flex flex-col gap-4">
      <FormField
        control={form.control}
        name="headword"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              単語<span className="text-destructive ml-1">*</span>
            </FormLabel>
            <FormControl>
              <Input
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="例: ephemeral"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
