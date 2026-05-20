"use client";

import { type FieldPath, useFormContext, useWatch } from "react-hook-form";

import type { WordFormValues } from "@/lib/schema/word-form";

import { useIsCurrentUserSystem } from "../word-form-permissions-context";
import { isSystemOwned } from "./row-ownership";

export function useRowOwnership(name: FieldPath<WordFormValues>) {
  const form = useFormContext<WordFormValues>();
  const ownerId = useWatch({ control: form.control, name }) as string | undefined;
  const isCurrentUserSystem = useIsCurrentUserSystem();

  return {
    ownerId,
    isCurrentUserSystem,
    isSystemOwned: isSystemOwned(ownerId, isCurrentUserSystem),
  };
}
