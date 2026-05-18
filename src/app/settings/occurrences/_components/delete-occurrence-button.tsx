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

import { deleteOccurrence } from "../[id]/actions";

type Props = {
  occurrenceId: string;
  location: string;
  wordLinkCount: number;
};

export function DeleteOccurrenceButton({ occurrenceId, location, wordLinkCount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteOccurrence(occurrenceId);
      if (result.ok) {
        toast.success("削除しました");
        setOpen(false);
        router.push("/settings/occurrences");
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
          <AlertDialogTitle>「{location}」を削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            この操作は取り消せません。
            {wordLinkCount > 0
              ? `現在 ${wordLinkCount} 件の単語に紐付いており、その紐付け（および詳細）もまとめて削除されます。単語自体は残ります。`
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
