"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";

import {
  commonPartsOfSpeech,
  isCommonPartOfSpeech,
} from "@/lib/mock/parts-of-speech";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function PartOfSpeechPicker({ value, onChange }: Props) {
  const isOther = value !== "" && !isCommonPartOfSpeech(value);
  const [otherToggled, setOtherToggled] = useState(false);
  const showOtherInput = isOther || otherToggled;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {commonPartsOfSpeech.map((p) => (
          <Toggle
            key={p.value}
            variant="outline"
            size="sm"
            pressed={value === p.value}
            onPressedChange={(pressed) => {
              setOtherToggled(false);
              onChange(pressed ? p.value : "");
            }}
            aria-label={p.fullLabel}
          >
            {p.label}
          </Toggle>
        ))}
        <Toggle
          variant="outline"
          size="sm"
          pressed={showOtherInput}
          onPressedChange={(pressed) => {
            setOtherToggled(pressed);
            if (!pressed) onChange("");
            else if (isCommonPartOfSpeech(value)) onChange("");
          }}
        >
          他
        </Toggle>
      </div>
      {showOtherInput ? (
        <Input
          placeholder="例: 助動詞"
          value={isOther ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
    </div>
  );
}
