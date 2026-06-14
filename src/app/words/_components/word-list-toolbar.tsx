"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import type { WordListSort } from "@/lib/words-list";

type Props = {
  initialQuery: string;
  sort: WordListSort;
};

export function WordListToolbar({ initialQuery, sort }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [query, setQuery] = useState(initialQuery);
  const [lastInitialQuery, setLastInitialQuery] = useState(initialQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (initialQuery !== lastInitialQuery) {
    setLastInitialQuery(initialQuery);
    setQuery(initialQuery);
  }

  function buildHref(next: { q?: string; sort?: WordListSort }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.q !== undefined) {
      const trimmed = next.q.trim();
      if (trimmed.length === 0) params.delete("q");
      else params.set("q", trimmed);
    }
    if (next.sort !== undefined) {
      if (next.sort === "recent") params.delete("sort");
      else params.set("sort", next.sort);
    }
    params.delete("page");
    const qs = params.toString();
    return qs.length > 0 ? `${pathname}?${qs}` : pathname;
  }

  function commitQuery(value: string) {
    const href = buildHref({ q: value });
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commitQuery(value), 250);
  }

  function handleClear() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery("");
    commitQuery("");
  }

  function handleSortChange(values: string[]) {
    const next = values[0];
    if (next !== "recent" && next !== "headword") return;
    if (next === sort) return;
    const href = buildHref({ sort: next });
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="英単語を検索"
          className="pr-8 pl-8"
          aria-label="英単語を検索"
        />
        {query.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={handleClear}
            aria-label="検索をクリア"
            className="absolute top-1/2 right-1 -translate-y-1/2"
          >
            <XIcon />
          </Button>
        ) : null}
      </div>

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
