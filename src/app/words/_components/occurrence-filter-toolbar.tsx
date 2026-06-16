"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import type { OccurrenceNumberOrder, WordMatchMode } from "@/lib/words-list";

import { SearchInput } from "./search-input";
import { setParam, useDebouncedCommit } from "./toolbar-url";

export type OccurrenceChoice = {
  id: string;
  location: string;
  isSystem: boolean;
};

type Props = {
  occurrences: OccurrenceChoice[];
  occurrenceId: string | null;
  initialQuery: string;
  match: WordMatchMode;
  /** URL の生の値（数値入力欄の初期表示用）。 */
  initialFrom: string;
  initialTo: string;
  order: OccurrenceNumberOrder;
};

export function OccurrenceFilterToolbar({
  occurrences,
  occurrenceId,
  initialQuery,
  match,
  initialFrom,
  initialTo,
  order,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function buildHref(next: {
    occ?: string;
    q?: string;
    match?: WordMatchMode;
    from?: string;
    to?: string;
    order?: OccurrenceNumberOrder;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "occurrence");
    if (next.occ !== undefined) params.set("occ", next.occ);
    if (next.q !== undefined) setParam(params, "q", next.q.trim());
    if (next.match !== undefined) setParam(params, "match", next.match, "prefix");
    if (next.from !== undefined) setParam(params, "from", next.from.trim());
    if (next.to !== undefined) setParam(params, "to", next.to.trim());
    if (next.order !== undefined) setParam(params, "order", next.order, "asc");
    params.delete("page");
    const qs = params.toString();
    return qs.length > 0 ? `${pathname}?${qs}` : pathname;
  }

  function commit(href: string) {
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  const search = useDebouncedCommit(initialQuery, (value) => commit(buildHref({ q: value })));
  const fromInput = useDebouncedCommit(initialFrom, (value) => commit(buildHref({ from: value })));
  const toInput = useDebouncedCommit(initialTo, (value) => commit(buildHref({ to: value })));

  function handleOccurrenceChange(value: string | null) {
    if (value === null || value === occurrenceId) return;
    commit(buildHref({ occ: value }));
  }

  function handleMatchChange(next: WordMatchMode) {
    if (next === match) return;
    commit(buildHref({ match: next }));
  }

  function handleOrderChange(values: string[]) {
    const next = values[0];
    if (next !== "asc" && next !== "desc") return;
    if (next === order) return;
    commit(buildHref({ order: next }));
  }

  const selectItems = occurrences.map((o) => ({ value: o.id, label: o.location }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="words-occurrence">掲載箇所</Label>
        <Select items={selectItems} value={occurrenceId} onValueChange={handleOccurrenceChange}>
          <SelectTrigger id="words-occurrence" className="w-full">
            <SelectValue placeholder="掲載箇所を選択" />
          </SelectTrigger>
          <SelectContent>
            {occurrences.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.location}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="words-range-from">掲載番号</Label>
        <div className="flex items-center gap-2">
          <Input
            id="words-range-from"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="指定なし"
            value={fromInput.value}
            onChange={(e) => fromInput.onChange(e.target.value)}
            aria-label="掲載番号（から）"
          />
          <span className="text-muted-foreground shrink-0 text-sm">〜</span>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="指定なし"
            value={toInput.value}
            onChange={(e) => toInput.onChange(e.target.value)}
            aria-label="掲載番号（まで）"
          />
        </div>
        <p className="text-muted-foreground text-xs">
          空欄は「指定なし」。範囲を指定すると掲載番号なしの単語は除外されます。
        </p>
      </div>

      <SearchInput
        query={search.value}
        onQueryChange={search.onChange}
        onClear={search.clear}
        match={match}
        onMatchChange={handleMatchChange}
      />

      <ToggleGroup
        value={[order]}
        onValueChange={handleOrderChange}
        aria-label="並び順"
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value="asc">番号昇順</ToggleGroupItem>
        <ToggleGroupItem value="desc">番号降順</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
