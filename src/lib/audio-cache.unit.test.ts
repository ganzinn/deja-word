import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  AUDIO_CACHE_NAME,
  clearAudioCache,
  diffAudioCache,
  listCachedAudioUrls,
  prefetchAudioUrls,
  pruneAudioCache,
  toAbsoluteAudioUrl,
} from "@/lib/audio-cache";

const ORIGIN = "https://example.test";

/** Cache Storage の最小スタブ（put / match / keys / delete のみ使う）。 */
class FakeCache {
  readonly store = new Map<string, Response>();
  putCalls = 0;

  async keys(): Promise<Request[]> {
    return [...this.store.keys()].map((url) => new Request(url));
  }

  async match(url: string): Promise<Response | undefined> {
    return this.store.get(url);
  }

  async put(url: string, response: Response): Promise<void> {
    this.putCalls++;
    this.store.set(url, response);
  }

  async delete(url: string): Promise<boolean> {
    return this.store.delete(url);
  }
}

let cache: FakeCache;
let deletedCaches: string[];

function audioUrl(name: string): string {
  return `${ORIGIN}/api/dev-blob/audio/${name}.mp3`;
}

/** 指定バイト数の 200 応答を返す fetch スタブ。`fail` に含まれる URL は 404。 */
function stubFetch(options: { size?: number; fail?: string[]; onFetch?: (url: string) => void }) {
  const { size = 8, fail = [], onFetch } = options;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    onFetch?.(url);
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (fail.includes(url)) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(size), { status: 200 });
  });
}

beforeEach(() => {
  cache = new FakeCache();
  deletedCaches = [];
  vi.stubGlobal("caches", {
    open: async (name: string) => {
      expect(name).toBe(AUDIO_CACHE_NAME);
      return cache;
    },
    delete: async (name: string) => {
      deletedCaches.push(name);
      return true;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toAbsoluteAudioUrl", () => {
  test("dev の相対 key を絶対 URL に揃える（キャッシュキーと形を合わせるため）", () => {
    expect(toAbsoluteAudioUrl("/api/dev-blob/audio/a.mp3", `${ORIGIN}/settings/general`)).toBe(
      `${ORIGIN}/api/dev-blob/audio/a.mp3`,
    );
  });

  test("本番の絶対 URL はそのまま", () => {
    const url = "https://store.public.blob.vercel-storage.com/audio/a-1234.mp3";
    expect(toAbsoluteAudioUrl(url, `${ORIGIN}/settings/general`)).toBe(url);
  });
});

describe("diffAudioCache", () => {
  test("未取得と掃除対象を分ける", () => {
    const { missing, stale } = diffAudioCache(
      [audioUrl("a"), audioUrl("b"), audioUrl("c")],
      [audioUrl("b"), audioUrl("old")],
    );
    expect(missing).toEqual([audioUrl("a"), audioUrl("c")]);
    expect(stale).toEqual([audioUrl("old")]);
  });

  test("重複した manifest でも missing は一意になる", () => {
    const { missing } = diffAudioCache([audioUrl("a"), audioUrl("a")], []);
    expect(missing).toEqual([audioUrl("a")]);
  });

  test("すべて取得済みなら missing は空", () => {
    const { missing, stale } = diffAudioCache([audioUrl("a")], [audioUrl("a")]);
    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
  });
});

describe("listCachedAudioUrls / pruneAudioCache / clearAudioCache", () => {
  test("キャッシュ済みの URL を列挙する", async () => {
    cache.store.set(audioUrl("a"), new Response("x"));
    expect(await listCachedAudioUrls()).toEqual([audioUrl("a")]);
  });

  test("不要エントリを削除して削除件数を返す", async () => {
    cache.store.set(audioUrl("old"), new Response("x"));
    const deleted = await pruneAudioCache([audioUrl("old"), audioUrl("missing")]);
    expect(deleted).toBe(1);
    expect(cache.store.has(audioUrl("old"))).toBe(false);
  });

  test("掃除対象が無ければキャッシュを開かない", async () => {
    expect(await pruneAudioCache([])).toBe(0);
  });

  test("キャッシュ丸ごと削除", async () => {
    await clearAudioCache();
    expect(deletedCaches).toEqual([AUDIO_CACHE_NAME]);
  });
});

describe("prefetchAudioUrls", () => {
  test("対象をすべて取得してキャッシュに入れ、件数とバイト数を返す", async () => {
    stubFetch({ size: 10 });
    const result = await prefetchAudioUrls({ urls: [audioUrl("a"), audioUrl("b")] });

    expect(result).toMatchObject({ done: 2, total: 2, failed: 0, bytes: 20, aborted: false });
    expect([...cache.store.keys()].sort()).toEqual([audioUrl("a"), audioUrl("b")]);
  });

  test("SW が先に put 済みのエントリは書き直さない", async () => {
    cache.store.set(audioUrl("a"), new Response(new Uint8Array(10)));
    stubFetch({ size: 10 });

    const result = await prefetchAudioUrls({ urls: [audioUrl("a")] });

    expect(result.done).toBe(1);
    expect(cache.putCalls).toBe(0);
  });

  test("個別の失敗は failed に数えて続行する", async () => {
    stubFetch({ size: 4, fail: [audioUrl("b")] });

    const result = await prefetchAudioUrls({
      urls: [audioUrl("a"), audioUrl("b"), audioUrl("c")],
      concurrency: 1,
    });

    expect(result).toMatchObject({ done: 2, failed: 1, total: 3 });
    expect(cache.store.has(audioUrl("b"))).toBe(false);
  });

  test("中止するとそこで打ち切り、取得済みはキャッシュに残る", async () => {
    const controller = new AbortController();
    stubFetch({
      size: 4,
      onFetch: (url) => {
        if (url === audioUrl("b")) controller.abort();
      },
    });

    const result = await prefetchAudioUrls({
      urls: [audioUrl("a"), audioUrl("b"), audioUrl("c")],
      concurrency: 1,
      signal: controller.signal,
    });

    expect(result.aborted).toBe(true);
    expect(result.done).toBe(1);
    expect(cache.store.has(audioUrl("a"))).toBe(true);
    expect(cache.store.has(audioUrl("c"))).toBe(false);
  });

  test("容量超過は quotaExceeded で打ち切る", async () => {
    stubFetch({ size: 4 });
    vi.spyOn(cache, "put").mockRejectedValue(new DOMException("full", "QuotaExceededError"));

    const result = await prefetchAudioUrls({
      urls: [audioUrl("a"), audioUrl("b")],
      concurrency: 1,
    });

    expect(result.quotaExceeded).toBe(true);
    expect(result.done).toBe(0);
  });

  test("対象が空なら fetch もキャッシュ操作もしない", async () => {
    const fetchSpy = vi.fn();
    stubFetch({ onFetch: fetchSpy });

    const result = await prefetchAudioUrls({ urls: [] });

    expect(result).toMatchObject({ done: 0, total: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("進捗は 1 件ごとに通知される", async () => {
    stubFetch({ size: 4 });
    const seen: number[] = [];

    await prefetchAudioUrls({
      urls: [audioUrl("a"), audioUrl("b")],
      concurrency: 1,
      onProgress: (progress) => seen.push(progress.done),
    });

    expect(seen).toEqual([1, 2]);
  });
});
