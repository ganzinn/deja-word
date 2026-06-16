"use client";

import { SearchIcon, XIcon } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { WordMatchMode } from "@/lib/words-list";

const MATCH_ITEMS: { value: WordMatchMode; label: string }[] = [
  { value: "prefix", label: "から始まる" },
  { value: "contains", label: "を含む" },
  { value: "suffix", label: "で終わる" },
];

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  onClear: () => void;
  match: WordMatchMode;
  onMatchChange: (match: WordMatchMode) => void;
  placeholder?: string;
};

/**
 * 検索キーワード入力と一致方法セレクタを 1 行にまとめた検索欄（プレゼンテーショナル）。
 * URL 更新・debounce は呼び出し側のツールバーが持ち、ここは値と変更ハンドラだけ受け取る。
 */
export function SearchInput({
  query,
  onQueryChange,
  onClear,
  match,
  onMatchChange,
  placeholder = "英単語を検索",
}: Props) {
  return (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder}
        aria-label="英単語を検索"
      />
      <InputGroupAddon align="inline-end">
        {query.length > 0 ? (
          <InputGroupButton size="icon-xs" onClick={onClear} aria-label="検索をクリア">
            <XIcon />
          </InputGroupButton>
        ) : null}
        <Select
          items={MATCH_ITEMS}
          value={match}
          onValueChange={(value) => {
            if (value !== null) onMatchChange(value);
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label="一致方法"
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MATCH_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </InputGroupAddon>
    </InputGroup>
  );
}
