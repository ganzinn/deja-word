# 01. revalidate-path

状態: **未着手**　PR: （未作成）

## 目的

単語データを変更する Server Action に `revalidatePath` を追加し、チケット 03 で `prefetch={true}` を導入したときに「編集 → 詳細へ戻る」で編集前の stale なプリフェッチ結果（最大 5 分）が表示される問題を先回りで塞ぐ。プリフェッチ導入の前提整備であり、この変更単独でも害はない（プリフェッチを将来やめても戻す必要がない）。

スコープ外: `prefetch={true}` の付与（チケット 03）。`toggleBookmark` への追加（設計で除外が確定）。

## 依存チケット

なし（並行着手可）

## 前提（設計決定の再掲）

- 対象は **`updateWord`・音源のアップロード/削除系（`src/app/words/[id]/edit/actions.ts`）、`deleteWord`（`src/app/words/[id]/actions.ts`）、`createWord`（`src/app/words/new/actions.ts`）**。成功時に該当単語の詳細パス **`/words/<id>`** へ `revalidatePath` を呼ぶ（[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 3）
- **`toggleBookmark`（`src/app/words/actions.ts`）は除外**する。楽観的更新の現行方針（同ファイル冒頭コメント）を維持。高頻度トグルで全キャッシュクリア → プリフェッチが実質無効化されるため。副作用としてブックマーク初期表示が最大 5 分古いことがあり得るが許容（[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 3）
- 背景: Server Action からの `revalidatePath` はクライアントルーターキャッシュ**全体**を即時クリアする。`prefetch={true}` の結果はルーターキャッシュに static 扱い（既定 5 分）で保持されるため、これが無いと編集前の stale なページ本文が表示され得る（[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 1・3）
- `revalidatePath` 追加により、対象 action の既存 unit テストで **`next/cache` のモック**が必要になり得る（実装時に確認）（[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 5）

## 実装内容

### 変更: `src/app/words/[id]/edit/actions.ts`

- `updateWord(wordId, input)`: 成功時（`ok: true` を返す前）に `revalidatePath(`/words/${wordId}`)` を呼ぶ
- 音源系 6 action（`uploadPronunciationAudio` / `deletePronunciationAudio` / `uploadRelatedWordAudio` / `deleteRelatedWordAudio` / `uploadExampleAudio` / `deleteExampleAudio`）: 成功時に該当単語の `/words/<id>` を revalidate する。これらは wordId を引数に持たない（meaningId / relatedWordId / exampleId のみ）ため、wordId の入手方法は実装時に選ぶ:
  - (a) 呼び出し元の UI から props で渡す — 推奨（追加クエリ不要）。呼び出し元は `src/app/words/new/_components/meanings-fields.tsx`・`related-words-fields.tsx`・`examples-fields.tsx`（現状 props なし）で、これらに `wordId` prop を足し、描画元の `src/app/words/new/word-form.tsx` から渡す変更も本チケットのスコープに含む。`WordForm` は新規・編集共用（`mode: "create" | "edit"`）で create 時は `wordId` が undefined のため prop は optional にする（音源ボタンは行 id 確定時のみ描画されるため create 時に音源 action は呼ばれず実害なし。既存前例: `BasicFields` の `wordId={isEdit ? wordId : undefined}`）
  - (b) サービス層 / DB から識別子 → wordId を解決する

### 変更: `src/app/words/[id]/actions.ts`

- `deleteWord(wordId)`: 成功時に `revalidatePath(`/words/${wordId}`)` を呼ぶ

### 変更: `src/app/words/new/actions.ts`

- `createWord(input)`: 成功時に作成された単語の `/words/<id>` へ `revalidatePath` を呼ぶ（作成結果から id を取得）

### 変更（必要時）: 既存 unit テスト

- `src/app/words/[id]/edit/actions.unit.test.ts` / `src/app/words/[id]/actions.unit.test.ts`（`deleteWord`） / `src/app/words/new/actions.unit.test.ts` に `next/cache` のモックを追加する。既存前例: `src/app/settings/quiz-defaults/actions.unit.test.ts`（`vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))` 相当）

## 完了条件（Definition of Done）

- [ ] unit テスト: 各対象 action について、成功時に `revalidatePath` が該当パス（`/words/<id>`）で呼ばれること・失敗時（未ログイン / バリデーションエラー等）には呼ばれないことを既存 unit テストに追加して検証する（`next/cache` モック要否は実装時に確認。[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 5）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る
- [ ] 手動確認: 単語編集 → 保存 → 詳細ページに編集内容が反映される（現行挙動のリグレッション確認）

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
