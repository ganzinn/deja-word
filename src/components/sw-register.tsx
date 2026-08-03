"use client";

import { useEffect } from "react";

/**
 * 発音音源キャッシュ SW（public/sw.js、docs/adr/0075-audio-local-cache-and-prefetch.md）の登録。
 * 描画なし。SW 非対応環境では何もせず従来動作（毎回ネットワーク）のまま。
 * storage.persist() はストレージ逼迫時のキャッシュ追い出しを軽減する best-effort 要求で、
 * 拒否されても挙動は変わらない。
 */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 登録失敗は従来動作のままで無害
    });
    navigator.storage?.persist?.().catch(() => {});
  }, []);
  return null;
}
