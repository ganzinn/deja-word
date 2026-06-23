"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import { saveGeneralSettings } from "../actions";

type Props = {
  /** 発音音源未登録時の自動音声フォールバックの現在値（未設定は既定で true に解決済み）。 */
  ttsFallbackEnabled: boolean;
};

/**
 * 単語全般の設定フォーム。将来のセクション追加を見込んで section 単位で構成する。
 * 初回は「音声」セクション（自動音声フォールバック）のみ。
 */
export function GeneralSettingsForm({ ttsFallbackEnabled }: Props) {
  const [ttsFallback, setTtsFallback] = useState(ttsFallbackEnabled);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await saveGeneralSettings({ ttsFallback });
      if (result.ok) {
        toast.success("保存しました");
        return;
      }
      toast.error(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <Label>音声</Label>
        <div className="flex items-center gap-2">
          <Checkbox
            id="general-tts-fallback"
            checked={ttsFallback}
            onCheckedChange={(checked) => setTtsFallback(checked === true)}
          />
          <Label htmlFor="general-tts-fallback" className="font-normal">
            発音音源が未登録のとき自動音声で発音する
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">
          オンにすると、発音音源が登録されていない単語でも、端末内蔵の音声で読み上げる再生ボタンが
          表示されます（発音音源が登録されている場合は常にそちらを再生します）。音声の品質や声は
          端末・ブラウザによって異なり、未対応の端末では表示されません。
        </p>
        <p className="text-muted-foreground text-xs">
          自動音声の再生には、端末側の音声合成（テキスト読み上げ）機能と英語の音声データが必要です。
          再生ボタンを押しても音が出ない場合は、端末の「設定 → システム → 言語と入力 → 音声合成」
          などで、読み上げエンジンと英語の音声データが有効になっているかご確認ください。
        </p>
      </section>

      <div className="flex flex-col gap-2">
        <Button size="lg" disabled={isPending} onClick={handleSave}>
          {isPending ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );
}
