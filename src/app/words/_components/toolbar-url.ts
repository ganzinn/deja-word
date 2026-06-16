"use client";

import { useRef, useState } from "react";

/**
 * URL 同期する入力欄用のフック。値はローカルに即時反映しつつ、commit を debounce する。
 * `initial`（props）が変わったら state を同期する（ブラウザ戻る等）。
 * タイマーはインスタンスごとに持つため、複数の入力欄が互いに干渉せず独立して debounce される。
 */
export function useDebouncedCommit(
  initial: string,
  commit: (value: string) => void,
  delayMs = 250,
) {
  const [value, setValue] = useState(initial);
  const [last, setLast] = useState(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (initial !== last) {
    setLast(initial);
    setValue(initial);
  }

  function onChange(next: string) {
    setValue(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => commit(next), delayMs);
  }

  function clear() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setValue("");
    commit("");
  }

  return { value, onChange, clear };
}

/** デフォルト値なら削除、それ以外は set。URL にデフォルト値を載せないための小ヘルパ。 */
export function setParam(
  params: URLSearchParams,
  key: string,
  value: string,
  defaultValue = "",
) {
  if (value === defaultValue) params.delete(key);
  else params.set(key, value);
}
