"use client";

import { createContext, useContext, type ReactNode } from "react";

const LinkedHeadwordsContext = createContext<Record<string, string>>({});

export function LinkedHeadwordsProvider({
  value,
  children,
}: {
  value: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <LinkedHeadwordsContext.Provider value={value}>{children}</LinkedHeadwordsContext.Provider>
  );
}

export function useLinkedHeadword(linkedWordId: string | undefined): string | undefined {
  const map = useContext(LinkedHeadwordsContext);
  if (!linkedWordId) return undefined;
  return map[linkedWordId];
}
