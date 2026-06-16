"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type WordsViewMode = "word" | "occurrence";

export function ViewModeToggle({ view }: { view: WordsViewMode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function handleChange(values: string[]) {
    const next = values[0];
    if (next !== "word" && next !== "occurrence") return;
    if (next === view) return;

    // モード切替時はモード固有パラメータ（sort/order/occ/from/to/page）を破棄し、
    // 共有のキーワード検索（q）と一致方法（match）だけ引き継ぐ。
    const current = new URLSearchParams(searchParams.toString());
    const params = new URLSearchParams();
    const q = current.get("q");
    const match = current.get("match");
    if (q) params.set("q", q);
    if (match) params.set("match", match);
    if (next !== "word") params.set("view", next);

    const qs = params.toString();
    startTransition(() => {
      router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <ToggleGroup
      value={[view]}
      onValueChange={handleChange}
      aria-label="表示単位"
      variant="outline"
      size="sm"
    >
      <ToggleGroupItem value="word">単語単位</ToggleGroupItem>
      <ToggleGroupItem value="occurrence">掲載箇所単位</ToggleGroupItem>
    </ToggleGroup>
  );
}
