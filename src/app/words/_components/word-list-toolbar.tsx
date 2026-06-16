"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import type { WordListSort, WordMatchMode } from "@/lib/words-list";

import { SearchInput } from "./search-input";
import { setParam, useDebouncedCommit } from "./toolbar-url";

type Props = {
  initialQuery: string;
  sort: WordListSort;
  match: WordMatchMode;
};

export function WordListToolbar({ initialQuery, sort, match }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function buildHref(next: { q?: string; sort?: WordListSort; match?: WordMatchMode }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.q !== undefined) setParam(params, "q", next.q.trim());
    if (next.sort !== undefined) setParam(params, "sort", next.sort, "recent");
    if (next.match !== undefined) setParam(params, "match", next.match, "prefix");
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

  function handleSortChange(values: string[]) {
    const next = values[0];
    if (next !== "recent" && next !== "headword") return;
    if (next === sort) return;
    commit(buildHref({ sort: next }));
  }

  function handleMatchChange(next: WordMatchMode) {
    if (next === match) return;
    commit(buildHref({ match: next }));
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchInput
        query={search.value}
        onQueryChange={search.onChange}
        onClear={search.clear}
        match={match}
        onMatchChange={handleMatchChange}
      />

      <ToggleGroup
        value={[sort]}
        onValueChange={handleSortChange}
        aria-label="並び順"
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value="recent">新着順</ToggleGroupItem>
        <ToggleGroupItem value="headword">見出し順</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
