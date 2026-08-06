# 01. revalidate-path

状態: **完了**（2026-08-06）　PR: （統合 PR にて）

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

1. **音源系 action の `wordId` 入手方法はチケット記載の (a)（呼び出し元 UI から props）を採用**。signature を `(wordId, rowId, ...)` に変更した（例: `uploadPronunciationAudio(wordId, meaningId, fd)`）。呼び出し元は `meanings-fields.tsx` / `examples-fields.tsx` / `related-words-fields.tsx` の 3 つのみで、他に呼び出し箇所が無いことを grep で確認済み。
2. **音源マネージャの描画条件を `rowId ?` から `rowId && wordId ?` に変更した**。`wordId` prop が optional（新規作成時 undefined）のため、action へ `string` を渡すのに型安全なガードが要る。新規作成モードでは行 id 自体が undefined なので**実挙動は不変**（従来どおり「音源は保存してから追加できます。」が出る）。
3. **音源系 6 action には従来 unit テストが無かった**ため本チケットで新規追加した（`describe.each` で 6 本まとめて検証。共通ヘルパ `runUpload` / `runDelete` に revalidate を置いたため重複は最小）。`src/app/words/[id]/edit/actions.unit.test.ts` は 8 → 29 テストに増えた。
4. `revalidatePath` は成功パスのみ。`updateWord` / `createWord` はサービス層戻り値の `word.id` を、`deleteWord` は引数の `wordId` を使う。
5. `toggleBookmark`（`src/app/words/actions.ts`）は設計どおり**未変更**。同ファイル冒頭の「楽観的更新の方針のため revalidatePath は呼ばない」コメントもそのまま。
6. `next/cache` のモック（`vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))`）は**必要だった**。モック無しでは Next.js の非リクエストコンテキストで実行され失敗する。
7. ミューテーション確認を実施済み: `runUpload` の `revalidatePath` を一時的に潰すと新規テスト 3 本が落ちることを確認（アサートが実際に効いている）。
8. **チケット 03 への申し送り**: `prefetch={true}` 導入の前提はこれで整った。ただし本チケットの対象は「単語詳細を変更する Server Action」のみで、掲載箇所設定（`settings/occurrences`）等の並び順に影響し得る action は元から `/settings/*` を revalidate するだけ。前後ナビの並びに関わる懸念があれば 03 側で確認すること。
9. 競合点への影響なし: `adjacent-word-nav.tsx` / `word-content-transition*.ts(x)` / `globals.css` は一切触っていない。
