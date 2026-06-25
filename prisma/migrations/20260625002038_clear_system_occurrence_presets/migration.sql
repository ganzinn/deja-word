-- 「共通の掲載箇所」プリセットをデフォルトOFF化するのに伴う一回限りのデータ移行。
-- システム所有掲載箇所（owner_id = 'system'）に紐づくプリセット設定を全ユーザーぶん削除し、
-- 既存ユーザーの共通掲載箇所プリセットをOFFにリセットする。
-- 自分の掲載箇所（owner_id != 'system'）のプリセットは対象外なので保持される。
DELETE FROM "occurrence_preset_setting"
WHERE "occurrence_id" IN (
  SELECT "id" FROM "occurrence" WHERE "owner_id" = 'system'
);
