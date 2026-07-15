-- AlterTable
ALTER TABLE "drill" ADD COLUMN     "source_bookmarked_only" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "occurrence_id" DROP NOT NULL,
ALTER COLUMN "range_from" DROP NOT NULL,
ALTER COLUMN "range_to" DROP NOT NULL;

-- AlterTable
ALTER TABLE "quiz_default_setting" ADD COLUMN     "bookmarked_only" BOOLEAN;
