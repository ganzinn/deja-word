"use client";

import { Toggle } from "@/components/ui/toggle";

import { commonPartsOfSpeech } from "@/lib/mock/parts-of-speech";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function PartOfSpeechPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1">
      {commonPartsOfSpeech.map((p) => (
        <Toggle
          key={p.value}
          variant="outline"
          size="sm"
          pressed={value === p.value}
          onPressedChange={(pressed) => onChange(pressed ? p.value : "")}
          aria-label={p.fullLabel}
        >
          {p.label}
        </Toggle>
      ))}
    </div>
  );
}
