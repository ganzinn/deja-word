-- 旧 enable_sound（発音の自動再生＋正誤効果音の単一トグル）を 2 列に分割する。
-- 既存値は両方へコピーして現状の動作を保つ（null は null のまま＝既定で有効）。
ALTER TABLE "quiz_default_setting" ADD COLUMN "autoplay_pronunciation" BOOLEAN;
ALTER TABLE "quiz_default_setting" ADD COLUMN "enable_answer_sound" BOOLEAN;

UPDATE "quiz_default_setting"
SET "autoplay_pronunciation" = "enable_sound",
    "enable_answer_sound"    = "enable_sound"
WHERE "enable_sound" IS NOT NULL;

ALTER TABLE "quiz_default_setting" DROP COLUMN "enable_sound";
