-- CreateTable
CREATE TABLE "occurrence_preset_setting" (
    "user_id" TEXT NOT NULL,
    "occurrence_id" TEXT NOT NULL,

    CONSTRAINT "occurrence_preset_setting_pkey" PRIMARY KEY ("user_id","occurrence_id")
);

-- CreateIndex
CREATE INDEX "occurrence_preset_setting_user_id_idx" ON "occurrence_preset_setting"("user_id");

-- CreateIndex
CREATE INDEX "occurrence_preset_setting_occurrence_id_idx" ON "occurrence_preset_setting"("occurrence_id");

-- AddForeignKey
ALTER TABLE "occurrence_preset_setting" ADD CONSTRAINT "occurrence_preset_setting_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrence_preset_setting" ADD CONSTRAINT "occurrence_preset_setting_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "occurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: 全 user (system 含む) × 既存 system occurrence を ON で seed
INSERT INTO "occurrence_preset_setting" ("user_id", "occurrence_id")
SELECT u."id", o."id"
FROM "user" u
CROSS JOIN "occurrence" o
WHERE o."owner_id" = 'system'
ON CONFLICT DO NOTHING;

-- Backfill: 既存自分所有 occurrence は所有者本人を ON で seed
INSERT INTO "occurrence_preset_setting" ("user_id", "occurrence_id")
SELECT o."owner_id", o."id"
FROM "occurrence" o
WHERE o."owner_id" <> 'system'
ON CONFLICT DO NOTHING;
