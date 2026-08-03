# 07. docs-and-adr（用語・機能紹介・スクリーンショット・ADR）

状態: **未着手**　PR: （未作成）

## 目的

example-audio の実装完了を受けて、`docs/reference/naming-book.md` の用語を更新し、`docs/features/` の機能紹介 4 ページとスクリーンショットを実態に合わせ、ADR を 0079 から起票する。最後に、役割を終えた `docs/design/example-audio/` を削除する。

スコープ外:

- 実装の変更（本チケットはドキュメント・撮影用 seed・ADR のみ）
- `--only` を使わない全セクションの撮り直し（差分の目視レビュー範囲が広がり、無関係な画像のピクセル差分が混ざる）（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 6）

## 依存チケット

- 01: `Example.pronunciationAudioUrl` カラム（`scripts/e2e/db.ts` の `ensureDemoAudio` が例文に音源を付けるため）
- 02: 例文の音源登録 UI（`word-edit.png` / `word-new.png` の被写体）
- 03: 括弧の読み上げ正規化と `TG_TEXT_PATTERN` の全角括弧（`settings.md` の読み飛ばし規則、naming-book の `TG例文` エントリ、ADR-0081）
- 04: 単語詳細の例文発音ボタン（`word-detail.png` の被写体）
- 05: TG 形式の発音対象の差し替え（`word-quiz.md` の本文、`QuestionBase.pronunciationAudioUrl` の意味変更）
- 06: 一括プリフェッチのグループ分け（`settings.md` の本文、`settings-general.png` の被写体、ADR-0080）

## 前提（設計決定の再掲）

### naming-book（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 7）

**既存エントリの修正（5 件）**

| エントリ | 修正内容 |
| --- | --- |
| `pronunciationAudioUrl`（発音音源） | 定義の対象に Example を追加。出典に `Example` の schema 行を追記 |
| `Example`（例文） | 発音音源を持つこと、書けるのは専用 action のみで `upsertExamples` は触らないことを混同注意に追記 |
| `AudioTarget` | 英語名の列挙に `exampleTarget` を追加 |
| `ttsFallback`（TTS 代替） | フォールバック対象に例文が入る旨を追記 |
| `TG例文`（TARGET） | ハイライト対象のプレースホルダに全角括弧を追加。TG 形式では発音ボタンの対象が TG例文になる旨を追記 |

**新規エントリ（2 件）**

- **読み上げ正規化（`toSpokenText`）** — 「読み上げ直前に表示用の記号を落とす一本道の関数」と、括弧の出し分け（`(…)` は中身を読む／`[…]` は落とす）を定義する
- **音源グループ（`word` / `example`）** — 一括プリフェッチの分類。「見出し語・関連語グループ」「例文グループ」の日本語名と、Cache Storage は 1 つで prune は和集合であることを混同注意に置く

あわせて `QuestionBase.pronunciationAudioUrl` の意味が「この問題の発音ボタンが鳴らす音源」（見出し語の音源とは限らない）に変わる点を、`TG例文` か新規の読み上げ関連エントリの混同注意に残す。

### docs/features 本文（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 6）

| ページ | 箇所 |
| --- | --- |
| `README.md` | 目次の説明文 2 行（単語管理・設定） |
| `word-management.md` | 単語詳細（例文カードに発音ボタン）／単語の編集（例文の音源登録、未保存行・共通例文の扱い）／補足（「意味・関連語には発音音源を登録でき」→ 例文を追加、TG例文の非フォールバック） |
| `word-quiz.md` | TG 形式の説明（「発音」が鳴らすのは TG例文の英文であること、未登録時は自動音声・それも不可ならボタン非表示） |
| `settings.md` | 自動音声の読み飛ばし規則に括弧を追加／「発音音源のダウンロード」をグループ別 2 行の説明に書き換え（容量目安の記述も見直す） |

### スクリーンショット（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 6）

- 必須: `pnpm e2e:capture-docs --only words,settings`（`word-detail.png` / `word-edit.png` / `settings-general.png`。新規登録フォームの例文カードにも「音源は保存してから追加できます。」の注記が出るため `word-new.png` も同じセクションで撮り直される）
- `quiz`（`quiz-play-tg-choice.png`）はボタンの位置・ラベルが変わらないため、**実装後に目視で差分を確認してから判断する**
- 撮影の被写体を作るため `scripts/e2e/db.ts` の `ensureDemoAudio` に Example への音源付与を追加する。**全例文には付けず一部だけに付ける**（例: TARGET と SENTENCE のみ）。戻り値の件数にも加算する。全件に付けると単語詳細で「音源あり（マイク）／自動音声（再生）」の描き分け（ADR-0076）が 1 種類しか写らないため

### ADR（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 8）

| 番号 | 主題 | 既存 ADR との関係 |
| --- | --- | --- |
| 0079 | 例文の発音音源（`Example` への音源カラム追加、`exampleTarget`、共通例文は system のみ登録可） | ADR-0046（TTS フォールバック）・0043/0044（blob DI・削除順序）を参照。supersede しない |
| 0080 | 一括プリフェッチのグループ分け（`word` / `example`、Cache Storage は 1 つ・prune は和集合） | ADR-0075 の追補。supersede しない |
| 0081 | 読み上げの括弧正規化（`(…)` は中身を読む／`[…]` は落とす） | ADR-0078 の追補。supersede しない |
| （0082 候補） | TG 形式で発音ボタンの対象を TG例文にする | ADR-0047（自動再生・プリロード）・0076（描き分け）を参照。0079 に含めるか分けるかは**実装時に判断** |

- 番号は現行 repo の最大番号 0078 の次から採番する（0079 以降は空いている）
- いずれも `docs/adr/README.md` の一覧表への追記を伴う

## 実装内容

### 変更: `docs/reference/naming-book.md`

前提の表のとおり、既存 5 エントリを修正し、新規 2 エントリを追加する。

### 変更: `scripts/e2e/db.ts`

`ensureDemoAudio` に Example への音源付与を追加する。撮影対象の単語の例文のうち**一部だけ**（例: TARGET と SENTENCE のみ）に `putFixedKey` で作った音源 URL を設定し、戻り値の件数に加算する。

### 変更: `docs/features/README.md` / `word-management.md` / `word-quiz.md` / `settings.md`

前提の表のとおり本文を更新する。

### 再撮影

`pnpm e2e:capture-docs --only words,settings` を実行し、生成された画像を目視レビューする（レビューの注意点は `docs/features/README.md`）。`quiz-play-tg-choice.png` は差分を目視確認し、必要と判断した場合のみ `--only quiz` を追加実行する。

### 作成: `docs/adr/0079-*.md` / `0080-*.md` / `0081-*.md`（＋必要なら `0082-*.md`）

前提の表のとおり起票し、`docs/adr/README.md` の一覧表に追記する。

### 削除: `docs/design/example-audio/` （ADR 起票の完了後）

`docs/design/` は実装済み分を削除していく運用で、長期の決定記録は `docs/adr/` が受け皿になる（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 7 の却下理由）。ADR 0079〜への転記が済んだことを確認してから、`docs/design/example-audio/` 一式（README.md ＋ 01〜06）を削除する。

**削除順序の注意**: `docs/plan/example-audio/` の各チケットは設計トピックへの相対リンクを多数持っているため、設計だけを消すと plan 側のリンクが全滅する。**設計の削除と同じ PR で `docs/plan/example-audio/` も削除する**のを既定とする（全チケット完了時点で plan の役割も終わっており、経緯は git 履歴と ADR で追える）。plan を残す判断をした場合は、リンク切れを承知のうえで実装メモに理由を書き残すこと。

削除前に、`docs/design/example-audio/` を参照している箇所が repo 内の他所（`docs/adr/` / `docs/features/` / `docs/reference/` / `AGENTS.md` など）に無いかを確認する。

## 完了条件（Definition of Done）

- [ ] naming-book の既存 5 エントリ修正・新規 2 エントリ追加が入っている
- [ ] `docs/features/` 4 ページの本文が実装と一致している
- [ ] `pnpm e2e:capture-docs --only words,settings` を実行し、`word-detail.png` / `word-edit.png` / `word-new.png` / `settings-general.png` を目視レビュー済み。単語詳細で「音源あり」「自動音声」の両方の見た目が写っていること
- [ ] `quiz-play-tg-choice.png` の差分を目視確認し、再撮影の要否を判断した（不要と判断した場合はその旨を実装メモに残す）
- [ ] ADR 0079 / 0080 / 0081 を起票し、`docs/adr/README.md` の一覧表に追記した。0082（TG 形式の発音対象）を分けるか 0079 に含めるかを判断した
- [ ] ADR に残すべき決定がすべて転記されていることを確認したうえで、`docs/design/example-audio/` を削除した
- [ ] `docs/design/example-audio/` への参照リンクが repo 内に残っていない（`docs/plan/example-audio/` を同時に削除したか、残す場合はその理由を実装メモに記載した）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が通る

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
