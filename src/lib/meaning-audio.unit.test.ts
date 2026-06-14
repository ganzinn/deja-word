import { beforeEach, describe, expect, test, vi } from "vitest";

import type { BlobClient } from "@/lib/blob-client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    meaning: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const { prisma } = await import("@/lib/prisma");
const {
  AUDIO_MIME,
  MAX_AUDIO_BYTES,
  ForbiddenUpdateError,
  InvalidAudioError,
  MeaningNotFoundError,
  deletePronunciationAudioForUser,
  uploadPronunciationAudioForUser,
} = await import("@/lib/meaning-audio");

const findUnique = vi.mocked(prisma.meaning.findUnique);
const update = vi.mocked(prisma.meaning.update);

/** put → update → del の呼び出し順を記録するためのイベントログ。 */
let events: string[];

function makeBlob(): BlobClient {
  return {
    put: vi.fn(async (pathname: string) => {
      events.push(`put:${pathname}`);
      return { url: `https://blob.example/${pathname}-rand` };
    }),
    del: vi.fn(async () => {
      events.push("del");
    }),
  };
}

function mp3(sizeBytes = 1024, type = AUDIO_MIME): File {
  return new File([new Uint8Array(sizeBytes)], "audio.mp3", { type });
}

function meaningRow(
  over: Partial<{
    ownerId: string;
    pronunciationAudioUrl: string | null;
  }> = {},
) {
  return {
    id: "m1",
    ownerId: "u1",
    pronunciationAudioUrl: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  events = [];
  // update は put より後・del より前に呼ばれることを順序ログで検証する。
  update.mockImplementation((async () => {
    events.push("update");
    return { id: "m1" };
  }) as never);
});

describe("uploadPronunciationAudioForUser — 認可", () => {
  test("owner 本人は許可され put→update の順で書き込み newUrl を返す", async () => {
    findUnique.mockResolvedValue(meaningRow() as never);
    const blob = makeBlob();

    const result = await uploadPronunciationAudioForUser("u1", "m1", mp3(), blob);

    expect(result.url).toContain("audio/meaning/m1/pronunciation.mp3");
    expect(blob.put).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m1" },
        data: { pronunciationAudioUrl: result.url },
      }),
    );
    expect(blob.del).not.toHaveBeenCalled();
    expect(events).toEqual(["put:audio/meaning/m1/pronunciation.mp3", "update"]);
  });

  test("既存音源ありの差し替えは put→update→旧 del の順", async () => {
    findUnique.mockResolvedValue(
      meaningRow({ pronunciationAudioUrl: "https://blob.example/old" }) as never,
    );
    const blob = makeBlob();

    await uploadPronunciationAudioForUser("u1", "m1", mp3(), blob);

    expect(events).toEqual(["put:audio/meaning/m1/pronunciation.mp3", "update", "del"]);
    expect(blob.del).toHaveBeenCalledWith("https://blob.example/old");
  });

  test("他人の Meaning は ForbiddenUpdateError（書き込みなし）", async () => {
    findUnique.mockResolvedValue(meaningRow({ ownerId: "owner" }) as never);
    const blob = makeBlob();

    await expect(uploadPronunciationAudioForUser("u1", "m1", mp3(), blob)).rejects.toBeInstanceOf(
      ForbiddenUpdateError,
    );
    expect(blob.put).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  test("一般ユーザーは SYSTEM 所有 Meaning を操作できない", async () => {
    findUnique.mockResolvedValue(meaningRow({ ownerId: "system" }) as never);
    const blob = makeBlob();

    await expect(uploadPronunciationAudioForUser("u1", "m1", mp3(), blob)).rejects.toBeInstanceOf(
      ForbiddenUpdateError,
    );
  });

  test("SYSTEM は自身の Meaning を操作できる", async () => {
    findUnique.mockResolvedValue(meaningRow({ ownerId: "system" }) as never);
    const blob = makeBlob();

    const result = await uploadPronunciationAudioForUser("system", "m1", mp3(), blob);
    expect(result.url).toBeTruthy();
    expect(blob.put).toHaveBeenCalledOnce();
  });

  test("Meaning が存在しなければ MeaningNotFoundError", async () => {
    findUnique.mockResolvedValue(null as never);
    const blob = makeBlob();

    await expect(uploadPronunciationAudioForUser("u1", "m1", mp3(), blob)).rejects.toBeInstanceOf(
      MeaningNotFoundError,
    );
  });
});

describe("uploadPronunciationAudioForUser — 入力検証", () => {
  test("mp3 以外の MIME は InvalidAudioError（DB 参照前に弾く）", async () => {
    const blob = makeBlob();
    await expect(
      uploadPronunciationAudioForUser("u1", "m1", mp3(1024, "audio/wav"), blob),
    ).rejects.toBeInstanceOf(InvalidAudioError);
    expect(findUnique).not.toHaveBeenCalled();
    expect(blob.put).not.toHaveBeenCalled();
  });

  test("4MB 超は InvalidAudioError", async () => {
    const blob = makeBlob();
    await expect(
      uploadPronunciationAudioForUser("u1", "m1", mp3(MAX_AUDIO_BYTES + 1), blob),
    ).rejects.toBeInstanceOf(InvalidAudioError);
    expect(findUnique).not.toHaveBeenCalled();
  });

  test("空ファイルは InvalidAudioError", async () => {
    const blob = makeBlob();
    await expect(uploadPronunciationAudioForUser("u1", "m1", mp3(0), blob)).rejects.toBeInstanceOf(
      InvalidAudioError,
    );
  });
});

describe("deletePronunciationAudioForUser", () => {
  test("owner 本人: カラムを null 化し旧 Blob を del", async () => {
    findUnique.mockResolvedValue(
      meaningRow({ pronunciationAudioUrl: "https://blob.example/cur" }) as never,
    );
    const blob = makeBlob();

    await deletePronunciationAudioForUser("u1", "m1", blob);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { pronunciationAudioUrl: null } }),
    );
    expect(blob.del).toHaveBeenCalledWith("https://blob.example/cur");
    expect(events).toEqual(["update", "del"]);
  });

  test("音源が無ければ del は呼ばれない", async () => {
    findUnique.mockResolvedValue(meaningRow() as never);
    const blob = makeBlob();

    await deletePronunciationAudioForUser("u1", "m1", blob);
    expect(blob.del).not.toHaveBeenCalled();
  });

  test("他人の Meaning は ForbiddenUpdateError", async () => {
    findUnique.mockResolvedValue(meaningRow({ ownerId: "owner" }) as never);
    const blob = makeBlob();

    await expect(deletePronunciationAudioForUser("u1", "m1", blob)).rejects.toBeInstanceOf(
      ForbiddenUpdateError,
    );
    expect(update).not.toHaveBeenCalled();
  });
});
