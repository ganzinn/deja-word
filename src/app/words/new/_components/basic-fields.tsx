"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useFormContext } from "react-hook-form";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import type { HeadwordDuplicate } from "@/lib/words-duplicate";
import type { WordFormValues } from "@/lib/schema/word-form";

type BasicFieldsProps = {
  readOnly?: boolean;
  /** 編集時に重複チェックから除外する単語 id。新規時は undefined。 */
  wordId?: string;
};

export function BasicFields({ readOnly = false, wordId }: BasicFieldsProps) {
  const form = useFormContext<WordFormValues>();
  const [duplicate, setDuplicate] = useState<HeadwordDuplicate | null>(null);
  // 直近のリクエストだけを採用し、古い応答を破棄するためのトークン。
  const requestRef = useRef(0);

  async function checkDuplicate(value: string) {
    const headword = value.trim();
    if (readOnly || headword.length === 0) {
      setDuplicate(null);
      return;
    }
    const token = ++requestRef.current;
    try {
      const params = new URLSearchParams({ headword });
      if (wordId) params.set("excludeId", wordId);
      const res = await fetch(`/api/words/headword-exists?${params.toString()}`);
      if (token !== requestRef.current) return; // stale 応答は無視
      if (!res.ok) {
        setDuplicate(null);
        return;
      }
      const data: { duplicate: HeadwordDuplicate | null } = await res.json();
      if (token !== requestRef.current) return;
      setDuplicate(data.duplicate);
    } catch {
      if (token === requestRef.current) setDuplicate(null);
    }
  }

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
                disabled={readOnly}
                {...field}
                onChange={(e) => {
                  // 値が変わったら前回の重複警告をクリアして再チェックに備える。
                  setDuplicate(null);
                  field.onChange(e);
                }}
                onBlur={(e) => {
                  field.onBlur();
                  void checkDuplicate(e.target.value);
                }}
              />
            </FormControl>
            <FormMessage />
            {duplicate ? (
              <p className="text-destructive text-sm" role="alert">
                この単語は既に登録されています。{" "}
                <Link
                  href={`/words/${duplicate.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline"
                >
                  詳細
                </Link>
              </p>
            ) : null}
          </FormItem>
        )}
      />
    </div>
  );
}
