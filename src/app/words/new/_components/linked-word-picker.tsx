"use client";

import { LinkIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type WordSuggestion = {
  id: string;
  headword: string;
  ownerId: string;
  isSystem: boolean;
};

type LinkedWordPickerProps = {
  term: string;
  linkedWordId: string | undefined;
  initialLinkedHeadword?: string;
  onLink: (wordId: string, headword: string) => void;
  onUnlink: () => void;
  disabled?: boolean;
};

function firstToken(term: string): string {
  return term.split(/[\s/、,]+/).filter(Boolean)[0] ?? "";
}

export function LinkedWordPicker({
  term,
  linkedWordId,
  initialLinkedHeadword,
  onLink,
  onUnlink,
  disabled: disabledProp = false,
}: LinkedWordPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WordSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkedHeadword, setLinkedHeadword] = useState<string | undefined>(initialLinkedHeadword);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && query.length === 0) {
      setQuery(firstToken(term));
    }
    if (!nextOpen) {
      setResults([]);
      setLoading(false);
    }
    setOpen(nextOpen);
  };

  const handleQueryChange = (next: string) => {
    setQuery(next);
    if (next.trim().length === 0) {
      setResults([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length === 0) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/words/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = (await res.json()) as { results: WordSuggestion[] };
        setResults(data.results ?? []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open]);

  if (linkedWordId) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <LinkIcon className="size-3" />
          リンク中: <span className="font-content">{linkedHeadword ?? linkedWordId}</span>
        </Badge>
        {disabledProp ? null : (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              onUnlink();
              setLinkedHeadword(undefined);
            }}
          >
            <XIcon />
            解除
          </Button>
        )}
      </div>
    );
  }

  const disabled = disabledProp || term.trim().length === 0;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button type="button" variant="outline" size="sm">
            <LinkIcon />
            既存単語からリンク
          </Button>
        }
      />
      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="登録済み単語を検索"
            value={query}
            onValueChange={handleQueryChange}
          />
          <CommandList>
            {loading ? (
              <div className="text-muted-foreground py-6 text-center text-sm">検索中…</div>
            ) : results.length === 0 ? (
              <CommandEmpty>該当する単語はありません</CommandEmpty>
            ) : (
              results.map((w) => (
                <CommandItem
                  key={w.id}
                  value={w.id}
                  onSelect={() => {
                    onLink(w.id, w.headword);
                    setLinkedHeadword(w.headword);
                    setOpen(false);
                  }}
                >
                  <span className="font-content">{w.headword}</span>
                  {w.isSystem ? (
                    <Badge variant="outline" className="ml-auto">
                      共通
                    </Badge>
                  ) : null}
                </CommandItem>
              ))
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
