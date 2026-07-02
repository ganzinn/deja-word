-- AlterTable
ALTER TABLE "drill" ADD COLUMN     "source_range_from" INTEGER,
ADD COLUMN     "source_range_to" INTEGER;

-- 既存 drill は元テストの範囲が不明のため、自身の実効範囲（誤答単語の min/max）で代用する。
-- backfill 後の NULL は「元テストが範囲指定なし（Occurrence 全体）」の意味に確定する。
UPDATE "drill" SET "source_range_from" = "range_from", "source_range_to" = "range_to";
