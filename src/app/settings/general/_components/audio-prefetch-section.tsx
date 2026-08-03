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
  type PrefetchProgress,
} from "@/lib/audio-cache";
import { cn } from "@/lib/utils";

type Props = {
  /** ダウンロード対象になる発音音源の件数（system + 本人のスコープ）。 */
  totalCount: number;
};

function formatCount(count: number): string {
  return count.toLocaleString("ja-JP");
}

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/**
 * 発音音源の一括プリフェッチ（docs/adr/0075-audio-local-cache-and-prefetch.md）の操作 UI。
 *
 * 同じ画面の「音声」設定は保存ボタン型だが、こちらはその場で実行される操作系のため、
 * 枠で囲って独立していることを見せる。実処理は `@/lib/audio-cache`（Cache Storage 直操作）。
 */
export function AudioPrefetchSection({ totalCount }: Props) {
  // null = 判定前（Cache Storage の有無はマウント後にしか分からない）
  const [supported, setSupported] = useState<boolean | null>(null);
  const [cachedCount, setCachedCount] = useState<number | null>(null);
  const [progress, setProgress] = useState<PrefetchProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    // 未対応環境では listCachedAudioUrls() が空配列を返す。判定と件数取得を同じ非同期の
    // 折り返しで行い、エフェクト本体からの同期 setState を避ける
    void listCachedAudioUrls().then((urls) => {
      if (!active) return;
      setSupported(isAudioCacheSupported());
      setCachedCount(urls.length);
    });
    return () => {
      active = false;
    };
  }, []);

  async function refreshCachedCount() {
    const urls = await listCachedAudioUrls();
    setCachedCount(urls.length);
  }

  async function handleDownload() {
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ done: 0, total: 0, failed: 0, bytes: 0 });
    try {
      const response = await fetch("/api/audio/manifest");
      if (!response.ok) {
        toast.error("発音音源の一覧を取得できませんでした");
        return;
      }
      const { urls } = (await response.json()) as { urls: string[] };
      const manifest = urls.map((url) => toAbsoluteAudioUrl(url));

      // 削除・差し替えで不要になったエントリを先に掃除して容量を戻す
      const { missing, stale } = diffAudioCache(manifest, await listCachedAudioUrls());
      await pruneAudioCache(stale);

      if (missing.length === 0) {
        toast.success("すべての発音音源がこの端末に保存されています");
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
      setProgress(null);
      await refreshCachedCount();
    }
  }

  async function handleClear() {
    await clearAudioCache();
    await refreshCachedCount();
    toast.success("この端末に保存した発音音源を削除しました");
  }

  if (supported === null) return null;

  const running = progress !== null;
  const processed = progress ? progress.done + progress.failed : 0;
  const percent = progress && progress.total > 0 ? (processed / progress.total) * 100 : 0;

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
          <p className="text-sm">
            対象 {formatCount(totalCount)} 件 ／ 端末に保存済み{" "}
            {cachedCount === null ? "…" : `${formatCount(cachedCount)} 件`}
          </p>

          {running ? (
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

          <div className="flex flex-wrap gap-2">
            {running ? (
              <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                中止
              </Button>
            ) : (
              <Button onClick={handleDownload} disabled={totalCount === 0}>
                ダウンロード
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger
                disabled={running || cachedCount === 0}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                端末から削除
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>保存した発音音源を削除しますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    この端末に保存した発音音源を削除して容量を空けます。単語や音源そのものは消えず、
                    次に再生するときに再びダウンロードされます。
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
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-xs">
          この端末（ブラウザ）は発音音源の保存に対応していないため、再生のたびに通信します。
        </p>
      )}
    </section>
  );
}
