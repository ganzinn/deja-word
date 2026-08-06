import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { defaultWordFormValues, type WordFormValues } from "@/lib/schema/word-form";

vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/lib/words-update", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/words-update")>();
  return {
    ...actual,
    updateWordForUser: vi.fn(),
  };
});

vi.mock("@/lib/pronunciation-audio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pronunciation-audio")>();
  return {
    ...actual,
    uploadPronunciationAudioForUser: vi.fn(),
    deletePronunciationAudioForUser: vi.fn(),
    uploadRelatedWordAudioForUser: vi.fn(),
    deleteRelatedWordAudioForUser: vi.fn(),
    uploadExampleAudioForUser: vi.fn(),
    deleteExampleAudioForUser: vi.fn(),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { getCurrentSession } = await import("@/lib/session");
const { updateWordForUser, WordNotFoundError, ForbiddenUpdateError } =
  await import("@/lib/words-update");
const { DuplicateHeadwordError, DuplicateOccurrenceNumberError } =
  await import("@/lib/words-create");
const {
  InvalidAudioError,
  uploadPronunciationAudioForUser,
  deletePronunciationAudioForUser,
  uploadRelatedWordAudioForUser,
  deleteRelatedWordAudioForUser,
  uploadExampleAudioForUser,
  deleteExampleAudioForUser,
} = await import("@/lib/pronunciation-audio");
const { revalidatePath } = await import("next/cache");
const {
  updateWord,
  uploadPronunciationAudio,
  deletePronunciationAudio,
  uploadRelatedWordAudio,
  deleteRelatedWordAudio,
  uploadExampleAudio,
  deleteExampleAudio,
} = await import("@/app/words/[id]/edit/actions");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedUpdate = vi.mocked(updateWordForUser);
const mockedRevalidatePath = vi.mocked(revalidatePath);

function validInput(): WordFormValues {
  return {
    ...defaultWordFormValues,
    headword: "renamed",
    meanings: [
      {
        partOfSpeech: "",
        pronunciation: "",
        texts: [{ text: "新しい意味" }],
        notes: [],
      },
    ],
  };
}

const SESSION = { user: { id: "u_1" } } as unknown as Awaited<ReturnType<typeof getCurrentSession>>;

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedUpdate.mockReset();
  mockedRevalidatePath.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("updateWord (Server Action)", () => {
  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await updateWord("w_1", validInput());
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects empty headword", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await updateWord("w_1", { ...validInput(), headword: "   " });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  test("not_found: throws WordNotFoundError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedUpdate.mockRejectedValue(new WordNotFoundError());
    const res = await updateWord("w_x", validInput());
    expect(res).toEqual({ ok: false, error: "not_found", message: expect.any(String) });
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  test("forbidden: throws ForbiddenUpdateError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedUpdate.mockRejectedValue(new ForbiddenUpdateError("test reason"));
    const res = await updateWord("w_x", validInput());
    expect(res).toEqual({ ok: false, error: "forbidden", message: expect.any(String) });
  });

  test("duplicate: DuplicateHeadwordError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedUpdate.mockRejectedValue(new DuplicateHeadwordError());
    const res = await updateWord("w_x", validInput());
    expect(res).toEqual({ ok: false, error: "duplicate", message: expect.any(String) });
  });

  test("duplicate_occurrence_number: DuplicateOccurrenceNumberError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedUpdate.mockRejectedValue(new DuplicateOccurrenceNumberError());
    const res = await updateWord("w_x", validInput());
    expect(res).toEqual({
      ok: false,
      error: "duplicate_occurrence_number",
      message: expect.any(String),
    });
  });

  test("unknown: generic error", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedUpdate.mockRejectedValue(new Error("boom"));
    const res = await updateWord("w_x", validInput());
    expect(res).toEqual({ ok: false, error: "unknown", message: expect.any(String) });
  });

  test("ok: returns wordId on success", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedUpdate.mockResolvedValue({ id: "w_1" });
    const res = await updateWord("w_1", validInput());
    expect(res).toEqual({ ok: true, wordId: "w_1" });
    expect(mockedUpdate).toHaveBeenCalledWith(
      "u_1",
      "w_1",
      expect.objectContaining({ headword: "renamed" }),
    );
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/words/w_1");
  });
});

/*
 * 音源系 6 action は runUpload / runDelete を共有するため、成功時に受け取った wordId の
 * 詳細パスが revalidate されること・失敗時は呼ばれないことを 6 本まとめて検証する。
 */
describe("音源系 Server Action の revalidatePath", () => {
  const mockedUploadFns = [
    uploadPronunciationAudioForUser,
    uploadRelatedWordAudioForUser,
    uploadExampleAudioForUser,
  ].map((fn) => vi.mocked(fn));
  const mockedDeleteFns = [
    deletePronunciationAudioForUser,
    deleteRelatedWordAudioForUser,
    deleteExampleAudioForUser,
  ].map((fn) => vi.mocked(fn));

  const uploads = [
    ["uploadPronunciationAudio", uploadPronunciationAudio, mockedUploadFns[0]],
    ["uploadRelatedWordAudio", uploadRelatedWordAudio, mockedUploadFns[1]],
    ["uploadExampleAudio", uploadExampleAudio, mockedUploadFns[2]],
  ] as const;

  const deletes = [
    ["deletePronunciationAudio", deletePronunciationAudio, mockedDeleteFns[0]],
    ["deleteRelatedWordAudio", deleteRelatedWordAudio, mockedDeleteFns[1]],
    ["deleteExampleAudio", deleteExampleAudio, mockedDeleteFns[2]],
  ] as const;

  function audioFormData(): FormData {
    const fd = new FormData();
    fd.set("file", new File(["dummy"], "a.mp3", { type: "audio/mpeg" }));
    return fd;
  }

  beforeEach(() => {
    for (const fn of [...mockedUploadFns, ...mockedDeleteFns]) fn.mockReset();
  });

  describe.each(uploads)("%s", (_name, action, mockedFn) => {
    test("ok: revalidates the word detail path", async () => {
      mockedGetSession.mockResolvedValue(SESSION);
      mockedFn.mockResolvedValue({ url: "/blob/a.mp3" });
      const res = await action("w_1", "row_1", audioFormData());
      expect(res).toEqual({ ok: true, url: "/blob/a.mp3" });
      expect(mockedFn).toHaveBeenCalledWith("u_1", "row_1", expect.any(File));
      expect(mockedRevalidatePath).toHaveBeenCalledWith("/words/w_1");
    });

    test("unauthorized: does not revalidate", async () => {
      mockedGetSession.mockResolvedValue(null);
      const res = await action("w_1", "row_1", audioFormData());
      expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
      expect(mockedRevalidatePath).not.toHaveBeenCalled();
    });

    test("invalid: no file in FormData, does not revalidate", async () => {
      mockedGetSession.mockResolvedValue(SESSION);
      const res = await action("w_1", "row_1", new FormData());
      expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
      expect(mockedFn).not.toHaveBeenCalled();
      expect(mockedRevalidatePath).not.toHaveBeenCalled();
    });

    test("failure: service throws, does not revalidate", async () => {
      mockedGetSession.mockResolvedValue(SESSION);
      mockedFn.mockRejectedValue(new InvalidAudioError("test reason"));
      const res = await action("w_1", "row_1", audioFormData());
      expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
      expect(mockedRevalidatePath).not.toHaveBeenCalled();
    });
  });

  describe.each(deletes)("%s", (_name, action, mockedFn) => {
    test("ok: revalidates the word detail path", async () => {
      mockedGetSession.mockResolvedValue(SESSION);
      mockedFn.mockResolvedValue();
      const res = await action("w_1", "row_1");
      expect(res).toEqual({ ok: true });
      expect(mockedFn).toHaveBeenCalledWith("u_1", "row_1");
      expect(mockedRevalidatePath).toHaveBeenCalledWith("/words/w_1");
    });

    test("unauthorized: does not revalidate", async () => {
      mockedGetSession.mockResolvedValue(null);
      const res = await action("w_1", "row_1");
      expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
      expect(mockedFn).not.toHaveBeenCalled();
      expect(mockedRevalidatePath).not.toHaveBeenCalled();
    });

    test("failure: service throws, does not revalidate", async () => {
      mockedGetSession.mockResolvedValue(SESSION);
      mockedFn.mockRejectedValue(new InvalidAudioError("test reason"));
      const res = await action("w_1", "row_1");
      expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
      expect(mockedRevalidatePath).not.toHaveBeenCalled();
    });
  });
});
