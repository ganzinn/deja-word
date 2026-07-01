import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { WordAiDraft } from "@/lib/schema/word-ai-draft";

vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/lib/word-ai-draft", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/word-ai-draft")>();
  return {
    ...actual,
    isWordAiEnabled: vi.fn(),
    generateWordAiDraft: vi.fn(),
  };
});

const { getCurrentSession } = await import("@/lib/session");
const { generateWordAiDraft, isWordAiEnabled } = await import("@/lib/word-ai-draft");
const { generateAiDraft } = await import("@/app/words/new/ai-draft-action");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedGenerate = vi.mocked(generateWordAiDraft);
const mockedEnabled = vi.mocked(isWordAiEnabled);

const SESSION = { user: { id: "u_1" } } as unknown as Awaited<ReturnType<typeof getCurrentSession>>;

const DRAFT: WordAiDraft = {
  meanings: [{ partOfSpeech: "adjective", pronunciation: "ɪˈfemərəl", texts: ["儚い"] }],
  phrases: [],
  sentences: [],
};

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedGenerate.mockReset();
  mockedEnabled.mockReset();
  mockedEnabled.mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateAiDraft (Server Action)", () => {
  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await generateAiDraft({ headword: "ephemeral" });
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  test("invalid: headword が空白のみ", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await generateAiDraft({ headword: "   " });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  test("ai_unavailable: 認証手段が未設定", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedEnabled.mockReturnValue(false);
    const res = await generateAiDraft({ headword: "ephemeral" });
    expect(res).toEqual({ ok: false, error: "ai_unavailable", message: expect.any(String) });
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  test("ai_failed: 生成が throw したら集約してエラー応答", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedGenerate.mockRejectedValue(new Error("boom"));
    const res = await generateAiDraft({ headword: "ephemeral" });
    expect(res).toEqual({ ok: false, error: "ai_failed", message: expect.any(String) });
  });

  test("ok: trim した headword で生成し draft を返す", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedGenerate.mockResolvedValue(DRAFT);
    const res = await generateAiDraft({ headword: " ephemeral " });
    expect(res).toEqual({ ok: true, draft: DRAFT });
    expect(mockedGenerate).toHaveBeenCalledWith("ephemeral");
  });
});
