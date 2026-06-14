"use client";

import { LoaderCircleIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { deletePronunciationAudio, uploadPronunciationAudio } from "@/app/words/[id]/edit/actions";

import { AudioPlayButton } from "./audio-play-button";

const AUDIO_MIME = "audio/mpeg";
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

type MeaningAudioManagerProps = {
  meaningId: string;
  pronunciationAudioUrl: string | null | undefined;
};

/**
 * 「発音」グループ内の音源（発音 mp3）アップロード/削除コントロール。post-save（id 確定済み）
 * でのみ表示する前提。upload / delete は Server Action の返り値で自身の表示状態を更新する
 * （詳細ページは動的描画なので revalidate は不要）。
 */
export function MeaningAudioManager({
  meaningId,
  pronunciationAudioUrl,
}: MeaningAudioManagerProps) {
  const [url, setUrl] = useState<string | null>(pronunciationAudioUrl ?? null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じファイルを再選択できるようにリセット
    if (!file) return;

    if (file.type !== AUDIO_MIME) {
      toast.error("音源は mp3（audio/mpeg）ファイルを選択してください。");
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      toast.error("音源のファイルサイズは 4MB 以下にしてください。");
      return;
    }

    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const result = await uploadPronunciationAudio(meaningId, fd);
      if (result.ok) {
        setUrl(result.url);
        toast.success("音源を登録しました");
      } else {
        toast.error(result.message);
      }
    });
  }

  function onDelete() {
    startTransition(async () => {
      const result = await deletePronunciationAudio(meaningId);
      if (result.ok) {
        setUrl(null);
        toast.success("音源を削除しました");
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {url ? (
        <AudioPlayButton src={url} label="試聴" />
      ) : (
        <span className="text-muted-foreground text-xs">未登録</span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,.mp3"
          className="hidden"
          onChange={onPick}
        />
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? <LoaderCircleIcon className="animate-spin" /> : <UploadIcon />}
          <span>{url ? "差し替え" : "登録"}</span>
        </Button>
        {url ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={pending}
            aria-label="音源を削除"
            onClick={onDelete}
          >
            <Trash2Icon />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
