"use client";

import { useFormContext } from "react-hook-form";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import type { WordFormValues } from "@/lib/schema/word-form";

import { CollapsibleField } from "./collapsible-field";

export function BasicFields() {
  const form = useFormContext<WordFormValues>();
  return (
    <div className="flex flex-col gap-4">
      <FormField
        control={form.control}
        name="word"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              単語<span className="ml-1 text-destructive">*</span>
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
      <CollapsibleField label="発音記号">
        <FormField
          control={form.control}
          name="pronunciation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>発音記号</FormLabel>
              <FormControl>
                <Input
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="例: /ɪˈfemərəl/"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </CollapsibleField>
    </div>
  );
}
