"use server";

import type { WordAiDraft } from "@/lib/schema/word-ai-draft";
import { getCurrentSession } from "@/lib/session";
import { generateWordAiDraft, isWordAiEnabled } from "@/lib/word-ai-draft";

export type GenerateAiDraftError = "unauthorized" | "invalid" | "ai_unavailable" | "ai_failed";

export type GenerateAiDraftResult =
  | { ok: true; draft: WordAiDraft }
  | { ok: false; error: GenerateAiDraftError; message: string };

// 新規・編集の両フォームで使う AI 下書き生成。create 専用の actions.ts とは凝集を分ける。
export async function generateAiDraft(input: { headword: string }): Promise<GenerateAiDraftResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      error: "unauthorized",
      message: "ログインが必要です。再度ログインしてください。",
    };
  }

  const headword = input.headword.trim();
  if (headword.length === 0) {
    return { ok: false, error: "invalid", message: "単語を入力してください。" };
  }

  // ボタン非表示で通常は到達しないが、Server Action は直接 POST できるため防御する。
  if (!isWordAiEnabled()) {
    return { ok: false, error: "ai_unavailable", message: "AI 入力は現在利用できません。" };
  }

  try {
    const draft = await generateWordAiDraft(headword);
    return { ok: true, draft };
  } catch (e) {
    console.error(e);
    return {
      ok: false,
      error: "ai_failed",
      message: "AI 生成に失敗しました。時間をおいて再度お試しください。",
    };
  }
}
