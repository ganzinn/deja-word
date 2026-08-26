"use client";

import { BookmarkXIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { removeBookmarksByFilter } from "@/app/words/actions";
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
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { RemoveBookmarksByFilterInput } from "@/lib/schema/bookmark";

type RemoveBookmarksButtonProps = {
  /** 一覧の表示と同じ絞り込み条件（サーバ側で再評価される）。 */
  filter: RemoveBookmarksByFilterInput;
  /** サーバ描画時点の絞り込み結果の総件数（ラベル・確認文言用。実行時の実件数とは食い違いうる）。 */
  total: number;
};

/**
 * 「ブックマークのみ」絞り込み中の単語一覧で、絞り込み結果の全件（全ページ）の
 * ブックマークをまとめて解除するボタン。まとめて消える操作のため確認ダイアログを挟む。
 * 行単位トグル（BookmarkButton）の楽観的更新と違い、成功後は `router.refresh()` で
 * サーバ供給値を再取得する（絞り込み ON のため解除された行は一覧から消える）。
 * 成功トーストの件数は入力の total ではなく deleteMany の実件数を出す。
 */
export function RemoveBookmarksButton({ filter, total }: RemoveBookmarksButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await removeBookmarksByFilter(filter);
      if (result.ok) {
        toast.success(`${result.removedCount}語のブックマークを解除しました`);
        setOpen(false);
        router.refresh();
        return;
      }
      toast.error(result.message);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {/* 親が flex-col（stretch）のため self-start で内容幅・左寄せにする（quiz の一括登録と同じ）。 */}
      <AlertDialogTrigger
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}
      >
        <BookmarkXIcon />
        {total}語のブックマークをまとめて解除
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ブックマークをまとめて解除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            絞り込み中の {total} 語のブックマークをすべて解除します（表示中のページ以外も含む）。
            単語自体は削除されません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>キャンセル</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={isPending} onClick={handleConfirm}>
            {isPending ? "解除中…" : "解除する"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
