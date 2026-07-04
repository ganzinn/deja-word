# src/app (Server Action・UI)

- Server Action は throw せず Result 型 `{ ok: true, ... } | { ok: false, error, message }` を返す。サービス層が throw するカスタム Error は error-map (`src/lib/words/error-map.ts` / `src/lib/quiz/error-map.ts`) で Result に変換する。message はユーザー向けの日本語。
- セッション取得は `getCurrentSession()` (`src/lib/session.ts`)。`src/app/api/words/` 配下の 2 つの Route Handler が `auth.api.getSession` を直接呼んでいるのは既存の例外で、修正対象のバグではない。
- 管理者判定は `session.user.id === SYSTEM_USER_ID` (`src/lib/system-user.ts`)。role カラムや admin フラグは存在しない。
- ルート内専用のコンポーネントは `_components/`、ヘルパは `_lib/`。横断共有は `src/components/`。
- フォームの定型: `"use client"` + `useForm` + `zodResolver` (スキーマは `src/lib/schema/` を server と共用) → Server Action を await → `result.ok` で分岐 → `sonner` の toast。
- クイズの出題形式を追加するときは `src/lib/quiz/CLAUDE.md` のチェックリストに従う (`question-<format>.tsx` と `quiz-flow.tsx` の追加を含む)。
