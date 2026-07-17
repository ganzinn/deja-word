"use client";

import { useRef, useState } from "react";

/**
 * URL 同期する入力欄用のフック。値はローカルに即時反映しつつ、commit を debounce する。
 * `initial`（props）の変化のうち、自分の commit が URL 経由で戻ってきたエコーは無視し、
 * 外部変化（ブラウザ戻る・リンク遷移）のときだけ state を同期する。エコーで同期すると
 * RSC ラウンドトリップ中に打った文字が巻き戻されて消えるため。
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
  // commit 済みで URL からのエコー（initial への反映）待ちの値。エコーはデバウンス間隔より
  // 遅れて届き得るため、複数 commit 分を順序付きで持つ。render 中に参照するため ref でなく state。
  const [pendingEchoes, setPendingEchoes] = useState<string[]>([]);

  if (initial !== last) {
    setLast(initial);
    const echoIndex = pendingEchoes.indexOf(initial);
    if (echoIndex >= 0) {
      // 自分の commit のエコー: ローカル値は触らない。追い越された古い entry だけ捨て、
      // 一致 entry は残す（StrictMode の二重 render でも冪等になる削り方）。
      if (echoIndex > 0) setPendingEchoes(pendingEchoes.slice(echoIndex));
    } else {
      // 外部変化（ブラウザ戻る・リンク遷移）: ローカル値を同期する。
      if (pendingEchoes.length > 0) setPendingEchoes([]);
      setValue(initial);
    }
  }

  function commitNow(next: string) {
    // URL には trim 済みの値が載る（buildHref 側の trim と対応）ため、エコー待ちにも
    // trim 済みを記録して一致判定を成立させる。
    const trimmed = next.trim();
    setPendingEchoes((pending) => [...pending, trimmed]);
    commit(trimmed);
  }

  function onChange(next: string) {
    setValue(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => commitNow(next), delayMs);
  }

  function clear() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setValue("");
    commitNow("");
  }

  return { value, onChange, clear };
}

/** デフォルト値なら削除、それ以外は set。URL にデフォルト値を載せないための小ヘルパ。 */
export function setParam(params: URLSearchParams, key: string, value: string, defaultValue = "") {
  if (value === defaultValue) params.delete(key);
  else params.set(key, value);
}
