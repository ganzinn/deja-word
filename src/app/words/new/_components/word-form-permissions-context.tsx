"use client";

import { createContext, useContext, type ReactNode } from "react";

type WordFormPermissions = {
  isCurrentUserSystem: boolean;
};

const WordFormPermissionsContext = createContext<WordFormPermissions>({
  isCurrentUserSystem: false,
});

export function WordFormPermissionsProvider({
  value,
  children,
}: {
  value: WordFormPermissions;
  children: ReactNode;
}) {
  return (
    <WordFormPermissionsContext.Provider value={value}>
      {children}
    </WordFormPermissionsContext.Provider>
  );
}

export function useIsCurrentUserSystem(): boolean {
  return useContext(WordFormPermissionsContext).isCurrentUserSystem;
}
