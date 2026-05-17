"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { deleteWord } from "../actions";

type DeleteWordButtonProps = {
  wordId: string;
  headword: string;
  incomingLinkCount: number;
};

export function DeleteWordButton({ wordId, headword, incomingLinkCount }: DeleteWordButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteWord(wordId);
      if (result.ok) {
        toast.success("削除しました");
        setOpen(false);
        router.push("/words");
        return;
      }
      toast.error(result.message);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        aria-label="削除"
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>「{headword}」を削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            この操作は取り消せません。意味・例文・関連語・メモ・掲載箇所もまとめて削除されます。
            {incomingLinkCount > 0
              ? `他に ${incomingLinkCount} 件の単語の関連語からリンクされています。リンクは自動で外れ、テキストのみが残ります。`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>キャンセル</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={isPending} onClick={handleConfirm}>
            {isPending ? "削除中…" : "削除する"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
