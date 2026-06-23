"use client";

import { createContext, useContext } from "react";

/**
 * 「発音音源が未登録のとき自動音声で代用する」設定の有効/無効を配る Context。
 * 設定はユーザー全般設定（`getTtsFallbackEnabled`）に由来し、設定画面を持つ
 * 各ページ（単語一覧・単語詳細・単語テスト）がツリー上部で Provider に流し込む。
 * Provider の外側（既定）は false: 音源がある場合しか発音ボタンを出さない従来挙動を保つ。
 */
const TtsFallbackContext = createContext(false);

export function TtsFallbackProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  return <TtsFallbackContext.Provider value={enabled}>{children}</TtsFallbackContext.Provider>;
}

/** 自動音声フォールバックが有効か。Provider の外では false。 */
export function useTtsFallbackEnabled(): boolean {
  return useContext(TtsFallbackContext);
}
