"use client";

import { LoaderCircleIcon, Trash2Icon, UploadIcon, Volume2Icon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import {
  deletePronunciationAudio,
  deleteTranslationAudio,
  uploadPronunciationAudio,
  uploadTranslationAudio,
  type DeleteAudioResult,
  type UploadAudioResult,
} from "@/app/words/[id]/edit/actions";

import { AudioPlayButton } from "./audio-play-button";

const AUDIO_MIME = "audio/mpeg";
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

type MeaningAudioManagerProps = {
  meaningId: string;
  pronunciationAudioUrl: string | null | undefined;
  translationAudioUrl: string | null | undefined;
};

/**
 * 編集ページの各 Meaning 行に置く音源管理ブロック。発音 / 意味の 2 スロットを縦に並べる。
 * post-save（id 確定済み）でのみ表示する前提。upload / delete は Server Action の返り値で
 * 自身の表示状態を更新する（詳細ページは動的描画なので revalidate は不要）。
 */
export function MeaningAudioManager({
  meaningId,
  pronunciationAudioUrl,
  translationAudioUrl,
}: MeaningAudioManagerProps) {
  return (
    <div className="border-border/60 mt-1 flex flex-col gap-3 rounded-md border border-dashed p-3">
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <Volume2Icon className="size-3.5" />
        音源
      </span>
      <AudioSlot
        meaningId={meaningId}
        label="発音"
        initialUrl={pronunciationAudioUrl}
        upload={uploadPronunciationAudio}
        remove={deletePronunciationAudio}
      />
      <AudioSlot
        meaningId={meaningId}
        label="意味（読み上げ）"
        initialUrl={translationAudioUrl}
        upload={uploadTranslationAudio}
        remove={deleteTranslationAudio}
      />
    </div>
  );
}

type AudioSlotProps = {
  meaningId: string;
  label: string;
  initialUrl: string | null | undefined;
  upload: (meaningId: string, fd: FormData) => Promise<UploadAudioResult>;
  remove: (meaningId: string) => Promise<DeleteAudioResult>;
};

function AudioSlot({ meaningId, label, initialUrl, upload, remove }: AudioSlotProps) {
  const [url, setUrl] = useState<string | null>(initialUrl ?? null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じファイルを再選択できるようにリセット
    if (!file) return;

    if (file.type !== AUDIO_MIME) {
      toast.error(`${label}: mp3（audio/mpeg）ファイルを選択してください。`);
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      toast.error(`${label}: ファイルサイズは 4MB 以下にしてください。`);
      return;
    }

    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const result = await upload(meaningId, fd);
      if (result.ok) {
        setUrl(result.url);
        toast.success(`${label}の音源を登録しました`);
      } else {
        toast.error(result.message);
      }
    });
  }

  function onDelete() {
    startTransition(async () => {
      const result = await remove(meaningId);
      if (result.ok) {
        setUrl(null);
        toast.success(`${label}の音源を削除しました`);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-foreground w-28 shrink-0 text-xs">{label}</span>
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
            aria-label={`${label}の音源を削除`}
            onClick={onDelete}
          >
            <Trash2Icon />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
