// SUT は public/sw.js（静的配信物）。Vitest の include が src/**/*.unit.test.ts のため
// SUT の隣に置けず、ここから読み込んで評価する（docs/design/audio-local-cache.md）。
// 出荷される sw.js そのものを評価するので、テスト用ソースと配信物の乖離が起きない。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

type Range = { start: number; end: number };

type SwInternals = {
  AUDIO_CACHE: string;
  isAudioRequestUrl: (urlString: string, origin: string) => boolean;
  parseRangeHeader: (value: string | null, size: number) => Range | null;
  buildRangeResponse: (fullBody: ArrayBuffer, range: Range, contentType: string | null) => Response;
  buildFullResponse: (fullBody: ArrayBuffer, contentType: string | null) => Response;
};

function loadSwInternals(): SwInternals {
  const code = readFileSync(resolve(__dirname, "../../public/sw.js"), "utf8");
  // イベント登録だけ捕捉する最小の self スタブ。ハンドラ本体はここでは実行されない
  const self: Record<string, unknown> = {
    addEventListener: () => {},
    location: { origin: "http://localhost:3000" },
  };
  new Function("self", code)(self);
  return self.__swInternals as SwInternals;
}

const sw = loadSwInternals();
const ORIGIN = "http://localhost:3000";

function bufferOfSize(size: number): ArrayBuffer {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = i % 256;
  return bytes.buffer;
}

describe("isAudioRequestUrl", () => {
  it("本番の公開 Blob ホストを対象にする", () => {
    expect(
      sw.isAudioRequestUrl(
        "https://abc123.public.blob.vercel-storage.com/audio/word-x1y2.mp3",
        ORIGIN,
      ),
    ).toBe(true);
  });

  it("同一オリジンの dev-blob 配信を対象にする", () => {
    expect(sw.isAudioRequestUrl(`${ORIGIN}/api/dev-blob/audio/word-x1y2.mp3`, ORIGIN)).toBe(true);
  });

  it("別オリジンの dev-blob パスは対象外", () => {
    expect(sw.isAudioRequestUrl("https://evil.example.com/api/dev-blob/a.mp3", ORIGIN)).toBe(false);
  });

  it("同一オリジンの通常ページ・API は対象外", () => {
    expect(sw.isAudioRequestUrl(`${ORIGIN}/words`, ORIGIN)).toBe(false);
    expect(sw.isAudioRequestUrl(`${ORIGIN}/api/words/import`, ORIGIN)).toBe(false);
  });

  it("Blob ホストに似せた別ホストは対象外", () => {
    expect(
      sw.isAudioRequestUrl("https://public.blob.vercel-storage.com.evil.example.com/a.mp3", ORIGIN),
    ).toBe(false);
  });

  it("URL として不正な文字列は対象外", () => {
    expect(sw.isAudioRequestUrl("not a url", ORIGIN)).toBe(false);
  });
});

describe("parseRangeHeader", () => {
  it("bytes=start- は末尾までの範囲に解決する", () => {
    expect(sw.parseRangeHeader("bytes=100-", 1000)).toEqual({ start: 100, end: 999 });
  });

  it("bytes=start-end はそのまま閉区間になる", () => {
    expect(sw.parseRangeHeader("bytes=0-499", 1000)).toEqual({ start: 0, end: 499 });
  });

  it("end がサイズ超過なら末尾に丸める", () => {
    expect(sw.parseRangeHeader("bytes=500-9999", 1000)).toEqual({ start: 500, end: 999 });
  });

  it("bytes=-suffix は末尾 N バイトに解決する", () => {
    expect(sw.parseRangeHeader("bytes=-200", 1000)).toEqual({ start: 800, end: 999 });
  });

  it("suffix がサイズ超過なら全量になる", () => {
    expect(sw.parseRangeHeader("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
  });

  it("start がサイズ以上なら null（全量 200 フォールバック）", () => {
    expect(sw.parseRangeHeader("bytes=1000-", 1000)).toBeNull();
  });

  it("start > end なら null", () => {
    expect(sw.parseRangeHeader("bytes=500-100", 1000)).toBeNull();
  });

  it("多重範囲は null", () => {
    expect(sw.parseRangeHeader("bytes=0-1,5-9", 1000)).toBeNull();
  });

  it("不正値・空・サイズ 0 は null", () => {
    expect(sw.parseRangeHeader("bytes=abc-", 1000)).toBeNull();
    expect(sw.parseRangeHeader("bytes=-", 1000)).toBeNull();
    expect(sw.parseRangeHeader("bytes=-0", 1000)).toBeNull();
    expect(sw.parseRangeHeader(null, 1000)).toBeNull();
    expect(sw.parseRangeHeader("bytes=0-", 0)).toBeNull();
  });
});

describe("buildRangeResponse", () => {
  it("206 と Content-Range / Content-Length を正しく組み立てる", async () => {
    const res = sw.buildRangeResponse(bufferOfSize(1000), { start: 100, end: 199 }, "audio/mpeg");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(res.headers.get("content-length")).toBe("100");
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body.byteLength).toBe(100);
    // 全量の 100 バイト目から始まっている（bufferOfSize は i % 256 で埋めている）
    expect(body[0]).toBe(100);
    expect(body[99]).toBe(199);
  });

  it("Content-Type 不明時は application/octet-stream", () => {
    const res = sw.buildRangeResponse(bufferOfSize(10), { start: 0, end: 9 }, null);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
  });
});

describe("buildFullResponse", () => {
  it("200 と全量ボディを返す", async () => {
    const res = sw.buildFullResponse(bufferOfSize(1000), "audio/mpeg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("1000");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect((await res.arrayBuffer()).byteLength).toBe(1000);
  });
});
