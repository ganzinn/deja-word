"use client";

import { Toggle } from "@/components/ui/toggle";

import { commonPartsOfSpeech } from "@/lib/mock/parts-of-speech";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function PartOfSpeechPicker({ value, onChange, disabled = false }: Props) {
  return (
    <div className="flex flex-wrap gap-1">
      {commonPartsOfSpeech.map((p) => (
        <Toggle
          key={p.value}
          variant="outline"
          size="sm"
          pressed={value === p.value}
          disabled={disabled}
          onPressedChange={(pressed) => onChange(pressed ? p.value : "")}
          aria-label={p.fullLabel}
        >
          {p.label}
        </Toggle>
      ))}
    </div>
  );
}
