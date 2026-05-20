import {
  DuplicateHeadwordError,
  DuplicateOccurrenceNumberError,
} from "@/lib/words-create";
import { ForbiddenUpdateError, WordNotFoundError } from "@/lib/words-update";

export type WordWriteErrorCode =
  | "not_found"
  | "forbidden"
  | "duplicate"
  | "duplicate_occurrence_number"
  | "unknown";

export type WordWriteErrorResult = {
  ok: false;
  error: WordWriteErrorCode;
  message: string;
};

export function mapWordWriteErrorToResult(e: unknown): WordWriteErrorResult {
  if (e instanceof WordNotFoundError) {
    return { ok: false, error: "not_found", message: "対象の単語が見つかりません。" };
  }
  if (e instanceof ForbiddenUpdateError) {
    return { ok: false, error: "forbidden", message: "編集権限のない項目が含まれています。" };
  }
  if (e instanceof DuplicateHeadwordError) {
    return {
      ok: false,
      error: "duplicate",
      message: "この単語はすでに登録されています。",
    };
  }
  if (e instanceof DuplicateOccurrenceNumberError) {
    return {
      ok: false,
      error: "duplicate_occurrence_number",
      message: "同じ出典内で重複する掲載番号が指定されています。",
    };
  }
  console.error("[words] write failed", e);
  return {
    ok: false,
    error: "unknown",
    message: "処理に失敗しました。しばらくしてから再度お試しください。",
  };
}
