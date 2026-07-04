-- TG 形式（CHOICE_TG / CHOICE_TG_JA_EN / SELF_JUDGE_TG / SELF_JUDGE_TG_JA_EN）追加に伴う
-- 一回限りのデータ移行。デフォルト確立済みの既存ユーザー（quiz_default_setting 行または
-- quiz_default_timeout 行あり = getQuizDefaultsForUser が非 null）は「初回保存時の全形式確立」を
-- 受けられず、形式追加後は行なし＝制限なしに見える。推奨デフォルト（TG四択 5 秒 /
-- TG自己判定 3 秒）の行を、行が無い場合のみ補完する（既存行は上書きしない）。
INSERT INTO "quiz_default_timeout" ("user_id", "format", "timeout_seconds", "updated_at")
SELECT u."user_id", v.format::"QuizFormat", v.seconds, now()
FROM (
  SELECT "user_id" FROM "quiz_default_setting"
  UNION
  SELECT "user_id" FROM "quiz_default_timeout"
) AS u
CROSS JOIN (VALUES
  ('CHOICE_TG', 5),
  ('CHOICE_TG_JA_EN', 5),
  ('SELF_JUDGE_TG', 3),
  ('SELF_JUDGE_TG_JA_EN', 3)
) AS v(format, seconds)
ON CONFLICT ("user_id", "format") DO NOTHING;
