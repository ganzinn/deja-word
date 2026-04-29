"use client";

import type { ReactNode } from "react";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

type Props = {
  value: string;
  title: string;
  count?: number;
  required?: boolean;
  children: ReactNode;
};

export function FormSection({ value, title, count, required, children }: Props) {
  return (
    <AccordionItem value={value} className="border-b border-border last:border-b">
      <AccordionTrigger className="px-4">
        <span className="flex items-center gap-2">
          <span className="text-base font-semibold">{title}</span>
          {required ? (
            <Badge variant="destructive" className="text-[10px]">
              必須
            </Badge>
          ) : null}
          {typeof count === "number" ? (
            <Badge variant="secondary" className="text-[10px]">
              {count}
            </Badge>
          ) : null}
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-4">{children}</AccordionContent>
    </AccordionItem>
  );
}
