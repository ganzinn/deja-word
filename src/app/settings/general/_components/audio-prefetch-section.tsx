"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  clearAudioCache,
  diffAudioCache,
  isAudioCacheSupported,
  listCachedAudioUrls,
  prefetchAudioUrls,
  pruneAudioCache,
  toAbsoluteAudioUrl,
  unionAudioUrlGroups,
  type PrefetchProgress,
} from "@/lib/audio-cache";
import { cn } from "@/lib/utils";

import type { AudioCountGroups, AudioGroup, AudioUrlGroups } from "@/lib/audio-manifest";

type Props = {
  /** ダウンロード対象になる発音音源のグループ別件数（system + 本人のスコープ）。 */
  totalCounts: AudioCountGroups;
};

/** 行の並びと表示ラベル。グループの中身は `@/lib/audio-manifest` の `AudioGroup` を参照。 */
const GROUPS: { key: AudioGroup; label: string }[] = [
  { key: "word", label: "見出し語・関連語" },
  { key: "example", label: "例文" },
];

function formatCount(count: number): string {
  return count.toLocaleString("ja-JP");
}

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/**
 * manifest（グループ別 URL）を取得し、Cache Storage のキーと同じ絶対 URL に揃えて返す。
 * 失敗時は null を返し、通知するかどうかは呼び出し側の文脈に委ねる。
 */
async function fetchAudioManifest(): Promise<AudioUrlGroups | null> {
  try {
    const response = await fetch("/api/audio/manifest");
    if (!response.ok) return null;
    const { urls } = (await response.json()) as { urls: AudioUrlGroups };
    return {
      word: urls.word.map((url) => toAbsoluteAudioUrl(url)),
      example: urls.example.map((url) => toAbsoluteAudioUrl(url)),
    };
  } catch {
    return null;
  }
}

/**
 * 発音音源の一括プリフェッチ（docs/adr/0075-audio-local-cache-and-prefetch.md）の操作 UI。
 *
 * 同じ画面の「音声」設定は保存ボタン型だが、こちらはその場で実行される操作系のため、
 * 枠で囲って独立していることを見せる。実処理は `@/lib/audio-cache`（Cache Storage 直操作）。
 *
 * ダウンロードは「見出し語・関連語」「例文」のグループ単位（同時実行はしない）。一方で
 * Cache Storage は 1 つのままなので、掃除の判定と「端末から削除」はグループをまたいで行う。
 */
export function AudioPrefetchSection({ totalCounts }: Props) {
  // null = 判定前（Cache Storage の有無はマウント後にしか分からない）
  const [supported, setSupported] = useState<boolean | null>(null);
  const [cachedUrls, setCachedUrls] = useState<string[] | null>(null);
  const [manifest, setManifest] = useState<AudioUrlGroups | null>(null);
  const [runningGroup, setRunningGroup] = useState<AudioGroup | null>(null);
  const [progress, setProgress] = useState<PrefetchProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    // 未対応環境では listCachedAudioUrls() が空配列を返す。判定と件数取得を同じ非同期の
    // 折り返しで行い、エフェクト本体からの同期 setState を避ける。
    // manifest も併せて読むのは、グループ別の「端末に保存済み」件数が
    // 「キャッシュ済み URL ∩ そのグループの URL」でしか出せないため（対象件数はサーバから来る）。
    void (async () => {
      const cacheSupported = isAudioCacheSupported();
      const [urls, groups] = await Promise.all([
        listCachedAudioUrls(),
        cacheSupported ? fetchAudioManifest() : Promise.resolve(null),
      ]);
      if (!active) return;
      setSupported(cacheSupported);
      setCachedUrls(urls);
      setManifest(groups);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function refreshCachedUrls() {
    setCachedUrls(await listCachedAudioUrls());
  }

  async function handleDownload(group: AudioGroup, label: string) {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunningGroup(group);
    setProgress({ done: 0, total: 0, failed: 0, bytes: 0 });
    try {
      const groups = await fetchAudioManifest();
      if (!groups) {
        toast.error("発音音源の一覧を取得できませんでした");
        return;
      }
      setManifest(groups);

      const cached = await listCachedAudioUrls();
      // 削除・差し替えで不要になったエントリを先に掃除して容量を戻す。判定は必ず両グループの
      // 和集合で行う（選んだグループだけで見ると、もう一方のキャッシュが消える）
      const { stale } = diffAudioCache(unionAudioUrlGroups(groups), cached);
      await pruneAudioCache(stale);

      // ダウンロードするのは選んだグループの分だけ
      const { missing } = diffAudioCache(groups[group], cached);
      if (missing.length === 0) {
        toast.success(`${label}の音源はすべてこの端末に保存されています`);
        return;
      }

      const result = await prefetchAudioUrls({
        urls: missing,
        signal: controller.signal,
        onProgress: setProgress,
      });

      if (result.quotaExceeded) {
        toast.error(
          `端末の空き容量が足りず中断しました（${formatCount(result.done)} 件を保存済み）`,
        );
      } else if (result.aborted) {
        toast(`中止しました（${formatCount(result.done)} 件を保存済み）`);
      } else if (result.done === 0) {
        toast.error("ダウンロードできませんでした。通信状況を確認して再度お試しください");
      } else {
        const failed = result.failed > 0 ? `／${formatCount(result.failed)} 件は失敗` : "";
        toast.success(
          `${formatCount(result.done)} 件をダウンロードしました（${formatBytes(result.bytes)}）${failed}`,
        );
      }
    } catch {
      toast.error("ダウンロードに失敗しました");
    } finally {
      abortRef.current = null;
      setRunningGroup(null);
      setProgress(null);
      await refreshCachedUrls();
    }
  }

  async function handleClear() {
    await clearAudioCache();
    await refreshCachedUrls();
    toast.success("この端末に保存した発音音源を削除しました");
  }

  if (supported === null) return null;

  const running = runningGroup !== null;
  const processed = progress ? progress.done + progress.failed : 0;
  const percent = progress && progress.total > 0 ? (processed / progress.total) * 100 : 0;

  const cached = cachedUrls === null ? null : new Set(cachedUrls);
  /** 「端末に保存済み」件数（キャッシュ済み URL ∩ そのグループの URL）。判定前は null。 */
  function savedCount(group: AudioGroup): number | null {
    if (!cached || !manifest) return null;
    return manifest[group].filter((url) => cached.has(url)).length;
  }

  return (
    <section className="border-border flex flex-col gap-2 rounded-lg border p-4">
      <Label>発音音源のダウンロード</Label>

      {supported ? (
        <>
          <p className="text-muted-foreground text-xs">
            発音音源をまとめて端末に保存します。保存後はオフラインでも再生でき、以後は通信しません。
            全部でおよそ 20〜60MB になるため、Wi-Fi 接続時のダウンロードをおすすめします。
            この操作は下の「保存」とは関係なく、その場で実行されます。
          </p>

          <div className="divide-border flex flex-col divide-y">
            {GROUPS.map(({ key, label }) => {
              const saved = savedCount(key);
              const isRunning = runningGroup === key;
              return (
                // 「ダウンロード」ボタンが 2 つ並ぶため、行を group にしてどちらの操作かを
                // 支援技術に伝える（ボタン側の aria-label も行と対応させる）
                <div
                  key={key}
                  role="group"
                  aria-label={label}
                  className="flex flex-col gap-2 py-3 first:pt-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm">{label}</p>
                      <p className="text-muted-foreground text-xs">
                        対象 {formatCount(totalCounts[key])} 件 ／ 端末に保存済み{" "}
                        {saved === null ? "…" : `${formatCount(saved)} 件`}
                      </p>
                    </div>
                    {isRunning ? (
                      <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                        中止
                      </Button>
                    ) : (
                      <Button
                        onClick={() => void handleDownload(key, label)}
                        disabled={running || totalCounts[key] === 0}
                        aria-label={`${label}をダウンロード`}
                      >
                        ダウンロード
                      </Button>
                    )}
                  </div>

                  {isRunning && progress ? (
                    <div className="flex flex-col gap-1">
                      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                        <div
                          className="bg-primary h-full transition-[width]"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {progress.total === 0
                          ? "対象を確認しています…"
                          : `ダウンロード中… ${formatCount(processed)} / ${formatCount(progress.total)} 件`}
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <AlertDialog>
            <AlertDialogTrigger
              disabled={running || cached?.size === 0}
              className={cn(buttonVariants({ variant: "outline" }), "self-start")}
            >
              端末から削除
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>保存した発音音源を削除しますか？</AlertDialogTitle>
                <AlertDialogDescription>
                  この端末に保存した発音音源を（見出し語・関連語も例文も）すべて削除して容量を空けます。
                  単語や音源そのものは消えず、次に再生するときに再びダウンロードされます。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleClear}>
                  削除する
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : (
        <p className="text-muted-foreground text-xs">
          この端末（ブラウザ）は発音音源の保存に対応していないため、再生のたびに通信します。
        </p>
      )}
    </section>
  );
}
