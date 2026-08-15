# 04. answer-emphasis

状態: **未着手**　PR: （未作成）

## 目的

自己判定（英語→日本語 `SELF_JUDGE`）の**解答表示**で、先頭 Meaning の先頭訳語をアプリが赤字にする。全 Meaning を並べる画面でどれが代表的な訳語かを示すための強調で、共通設定の ON / OFF には連動せず常時適用する。そのために `MeaningText` へベース体裁を渡す口を開ける。

スコープ外:

- 結果一覧の正解列の赤字（05。本チケットが開ける口を使う）
- 共通設定（`firstMeaningTextOnly`）そのものには一切触れない。フラグの改名（01）を待つ必要もない
- 多義語選択の選択肢・正解列、四択（英→日）の選択肢と結果一覧の正解列・「自分の回答」列、日本語→英語の問題文、TG 例文形式、訳語が出る他の画面（単語詳細・単語一覧・テスト中の単語詳細ダイアログ）
- 単語一覧・単語詳細の既存の赤字の体裁を揃えること（別 issue。07 が起票する）

## 依存チケット

なし（並行着手可）

## 前提（設計決定の再掲）

- 対象は自己判定（英語→日本語 `SELF_JUDGE`）の解答表示（全 Meaning を品詞ごとに並べるブロック）と、結果一覧のその形式の正解列（後者は 05）。赤くするのは**先頭 Meaning の先頭 MeaningText 1 つ**。共通設定の ON / OFF に連動せず常時適用する（[01-requirements.md](../../design/quiz-first-meaning-only/01-requirements.md) 決定 4）
- 装飾記法（`==赤==` などのユーザー入力。ADR-0077）との重ね方: 自動の赤字を**ベース体裁**として置き、ユーザー記法をその上に重ねて競合するプロパティは**後勝ち**とする（`src/components/placeholder-text.tsx` の合成順）。自動赤字は装飾記法の赤と同じ色なので、赤の指定同士が重なっても見た目は変わらない（[01-requirements.md](../../design/quiz-first-meaning-only/01-requirements.md) 決定 4）
- 体裁は **`text-red-500`・太字なし・`dark:` なし**。単語一覧（`src/app/words/page.tsx`）および装飾記法の `red` マーク（`src/components/rich-text.tsx`）と同じ値（[03-ui.md](../../design/quiz-first-meaning-only/03-ui.md) 決定 3）
- payload（`MeaningDisplay[]`）は**変えない**。表示コンポーネント（`MeaningBlocks`）に「先頭 Meaning の先頭訳語を強調するか」の引数を足し、自己判定（英→日）の解答表示から ON で呼ぶ（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 5）
- 赤字の当て方は `MeaningText` にベース体裁を渡す口を開ける形にする（`renderPlaceholders` がプレースホルダの体裁とユーザー記法を合成しているのと同じ経路にベースとして載せ、ユーザー記法を後勝ちにする）。**呼び出し側でラッパー要素を足す形は採らない**（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 5）
- ADR-0083 の「訳語の描画は `MeaningText` に集約する」は覆さない（赤字もその描画経路に載せる）（[01-requirements.md](../../design/quiz-first-meaning-only/01-requirements.md) 決定 4）

## 実装内容

### 変更: `src/components/placeholder-text.tsx`

`renderPlaceholders` にベース体裁を受け取る引数を足す。現状の `push` は `cn(tokenClassName, markClassName)` を組んでおり、**非トークン部分にはユーザー装飾記法の `markClassName` は付くが、`classFor` が返すベース側（プレースホルダ体裁）は `push(chunk, null, ...)` で `null` が渡るため付かない**。訳語全体に色を効かせるにはこの合成関数側の変更が要る。

```ts
export function renderPlaceholders(
  text: string,
  pattern: RegExp,
  classFor: (token: string) => string,
  /** セグメント全体（プレースホルダ以外も含む）に当てるベース体裁。ユーザー記法が後勝ちする。 */
  baseClassName?: string,
): React.ReactNode[]
```

- 合成そのものを**純関数として export し、`*.unit.test.ts` から検証できるようにする**。新しいモジュールは作らず `placeholder-text.tsx` から export する（`src/components/rich-text.unit.test.ts` が `.tsx` の `richTextMarkClassName` を import してテストしている既存形に倣う。JSX を返さない関数なら `.tsx` からでも `.ts` のテストで検証できる）:

  ```ts
  /** ベース → プレースホルダ体裁 → ユーザー記法の順に合成する（tailwind-merge の後勝ちで記法が優先）。 */
  export function composeSegmentClassName(
    baseClassName: string | undefined,
    tokenClassName: string | null,
    markClassName: string,
  ): string {
    return cn(baseClassName, tokenClassName, markClassName);
  }
  ```

- 内部の `push` はこの関数を使う
- `baseClassName` 未指定時は現状と完全に同じ出力になること（合成結果が空文字なら素の文字列を push する既存の分岐も維持する）

### 変更: `src/components/meaning-text.tsx`

```tsx
/** 訳語。do / doing = 斜体、装飾記法は解釈して描画する。 */
export function MeaningText({ text, baseClassName }: { text: string; baseClassName?: string }) {
  return <>{renderPlaceholders(text, MEANING_TEXT_PATTERN, () => "italic", baseClassName)}</>;
}
```

冒頭のコメント（「ベースの体裁は共通ルールの斜体だけ。色も…付けない」）を、呼び出し側からベース体裁を渡せるようになった旨に合わせて更新する。

### 変更: `src/app/quiz/_components/meaning-blocks.tsx`

```tsx
export function MeaningBlocks({
  meanings,
  emphasizeFirstText = false,
}: {
  meanings: MeaningDisplay[];
  /** 先頭 Meaning の先頭訳語を赤字で強調する（自己判定（英→日）の解答表示のみ true）。 */
  emphasizeFirstText?: boolean;
})
```

- 強調するのは **`meanings` 全体で 1 箇所だけ**（`meanings[0]` の `texts[0]`）。「各 Meaning の先頭訳語」ではない
- 実装は `meanings.map((meaning, index) => ...)` の内側に 2 経路があるため、条件は次のとおり:
  - `texts.length === 1` の `<p>` 経路: `index === 0`
  - 複数の `<ul>` 経路: `index === 0 && i === 0`
- 該当箇所で `<MeaningText text={...} baseClassName="text-red-500" />` を渡す。それ以外は従来どおり `baseClassName` を渡さない
- 既定値 `false` により、既存の呼び出し元は挙動が変わらない

### 変更: `src/app/quiz/_components/question-self-judge.tsx`

`<MeaningBlocks meanings={question.answer} />` → `<MeaningBlocks meanings={question.answer} emphasizeFirstText />`。

`MeaningBlocks` の呼び出し元は現状**このファイル 1 箇所だけ**（日→英の問題文は別コンポーネントが文字列として描画しており、`MeaningBlocks` は経由しない）。同コンポーネントの docstring「自己判定（英語→日本語）の解答表示と、日本語→英語の問題文（意味の提示）で共用する」は現時点で不正確なので、本チケットで実態に合わせて直す。今後この経路が増えても既定 `false` のまま呼ばれるため強調は付かない（日→英の問題文は [01-requirements.md](../../design/quiz-first-meaning-only/01-requirements.md) 決定 4 の対象外）。

## 完了条件（Definition of Done）

- [ ] unit（`src/components/placeholder-text.unit.test.ts` を新設）: `composeSegmentClassName` が (1) ベース未指定なら現状と同じ結果を返す、(2) ベース `text-red-500` ＋ 記法の赤（`text-red-500`）で結果が `text-red-500` のまま変わらない、(3) ベース `text-red-500` ＋ 記法の太字で赤と太字が両立する、(4) 3 つとも空なら空文字を返す（素の文字列を push する既存分岐が保たれる）。**05 が使う `baseClassName` の契約を守る唯一の自動テスト**
- [ ] unit: JSX を返す関数（`renderPlaceholders` / `MeaningText` / `MeaningBlocks`）自体のテストは**追加しない**。`vitest.config.mts` の include が `*.unit.test.ts` のみ（`.test.tsx` は実行対象外）のため（[03-ui.md](../../design/quiz-first-meaning-only/03-ui.md) 決定 5）
- [ ] unit: `src/components/rich-text.unit.test.ts` は**変更しない**（装飾記法の色を変えないため）。既存のまま通ること
- [ ] 手動確認: 自己判定（英語→日本語）でテストを開始し、解答表示で**先頭 Meaning の先頭訳語だけ**が赤字になる。2 番目以降の訳語・2 番目以降の Meaning・品詞バッジは赤くならない
- [ ] 手動確認: 先頭 Meaning に訳語が 1 つだけの単語（`<p>` 経路）と 2 つ以上ある単語（`<ul>` 経路）の**両方**で強調が出る
- [ ] 手動確認: Meaning が 2 つ以上ある単語で、**2 番目以降の Meaning の先頭訳語は赤くならない**（「各 Meaning の先頭」を赤くする実装になっていないこと）
- [ ] `MeaningBlocks` の docstring が実際の呼び出し元（自己判定（英→日）の解答表示のみ）に合わせて直っている
- [ ] 手動確認: 装飾記法 `==赤==` を含む訳語が先頭にある場合も見た目が変わらない。`**太字**` を含む場合は太字と赤字が両立する
- [ ] 手動確認: 自己判定（英→日）以外の画面で訳語の見た目が変わっていない（四択（英→日）の選択肢、単語一覧、単語詳細、TG 例文）
- [ ] `pnpm format`（整形）の上で `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る

手動確認の手順は e2e-verify スキル（`.claude/skills/e2e-verify/references/quiz.md`）に従う。

## 競合注意

- `src/components/meaning-text.tsx` / `src/components/placeholder-text.tsx`: 05 が本チケットの開ける `baseClassName` を使う。05 より先にマージすること

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
