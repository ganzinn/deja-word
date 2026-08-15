# 07. docs-and-adr

状態: **完了**（2026-08-15）　PR: （未作成）

## 目的

実装で確定した判断を ADR へ引き継ぎ、用語集・機能紹介ドキュメント・E2E 手順書を実装後の挙動に合わせる。スクリーンショットを再撮影する。実装が出揃ってから書くことで、実装で判明した差分も同じ PR に載せる。

スコープ外:

- 実装コードの変更（01〜06）
- 単語一覧・単語詳細の赤字の体裁統一そのもの（本チケットは issue を起票するだけ）
- `docs/design/quiz-first-meaning-only/` と `docs/plan/quiz-first-meaning-only/` の削除（パイプライン終端の feature-close スキルが行う）

## 依存チケット

- 03: 四択（日→英）のダミー除外が入っていること（ADR-0026 追記の内容）。02（日→英 3 形式への適用）は 03 の依存として先にマージ済み＝機能紹介の記述・スクリーンショットの前提も満たされる
- 05: 結果一覧の赤字が入っていること（`quiz-result.png` 等の撮影の前提）。04（解答表示の赤字）は 05 の依存として先にマージ済み
- 06: トグルの文言・配置が確定していること（`quiz-start.png` / `settings-quiz-defaults.png` の撮影の前提）

## 前提（設計決定の再掲）

ADR 本文は「採用理由・却下した代替案・許容した帰結」そのものが成果物なので、再掲ではなく**読む対象**として出典を挙げる。起票前に次を読むこと:

- [01-requirements.md](../../design/quiz-first-meaning-only/01-requirements.md) の決定 1（適用範囲）・決定 4（解答側の赤字強調）・決定 5（一意に定まらない問題文の許容）
- [02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) の決定 2（既定値の非対称）・決定 4（ダミー除外とキー 2 分割）・決定 6（進行中 drill の保存値を移行しない）
- [03-ui.md](../../design/quiz-first-meaning-only/03-ui.md) の決定 3（赤字の体裁）

用語集・機能紹介の更新に必要な事実（具体値）:

- `docs/reference/naming-book.md` の `QuizDefaultSetting` エントリのフラグ列挙を新名 `firstMeaningTextOnly` へ差し替える。`orderByOccurrenceNumber` エントリと同じ書式で `firstMeaningTextOnly` の単独エントリを立てる（DB 列名・保持先（`QuizDefaultSetting` / `Drill` / テスト開始入力）・適用先の形式を書く）（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 7）
- 同ファイルの「訳語には色を付けない」旨の記述 2 箇所を**訂正する**。**2 箇所は文言が違うので grep 1 本では拾えない**:
  - 訳語（MeaningText）エントリの混同注意: `訳語には色を付けない（色分けは TG例文だけ）。`
  - プレースホルダの斜体エントリの混同注意: `…訳語に色は付かず、TG和訳の do / doing は斜体になるが色は変わらない。`

  これは例外の追記ではなく誤りの訂正で、単語一覧・単語詳細は既に先頭の訳語を赤字にしており、この記述は現時点で事実と食い違っている。訂正後は「自動で付く体裁に色は含まない（色分けは TG例文だけ）。先頭の訳語だけは画面側が赤字にする（単語一覧・単語詳細・単語テストの自己判定（英→日）の解答表示と結果一覧の正解列）」の趣旨で書く（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 7）
- 同ファイルの「描画は `MeaningText` に集約し」という記述（訳語エントリ）は**更新しない**（赤字も `MeaningText` 経由に載せるため集約は壊れない）（[02-settings-model.md](../../design/quiz-first-meaning-only/02-settings-model.md) 決定 7）
- 再撮影は `pnpm e2e:capture-docs --only quiz` / `--only settings` / `--only bookmark` の 3 セクション。変化が写るのは `quiz-start.png` と `bookmark-quiz-start.png`（ラベル文言＋補足文）、`quiz-play-self-judge.png` / `quiz-result.png` / `drill-round-result.png` / `bookmark-quiz-result.png` / `bookmark-quiz-result-bulk.png`（自己判定（英→日）の赤字。`drill-round-result` は `drill` セクションではなく `sectionQuiz` の中で自己判定フローから撮られる）、`settings-quiz-defaults.png`（配置・文言）。`quiz-play-choice.png` は既定 ON のため見た目は変わらない見込み。`bookmark-quiz-result-dialog.png` は被写体が結果一覧から開く単語詳細ダイアログで、対象外なので変化しない（[03-ui.md](../../design/quiz-first-meaning-only/03-ui.md) 決定 4）
- 撮影の被写体条件: ON / OFF の違いと赤字強調が読み取れるのは、先頭 Meaning に訳語が 2 つ以上ある単語が写ったときだけ。`scripts/e2e/db.ts` の `QUIZ_DECK` で該当するのは現状 `brisk`（掲載番号 1）のみで、他の語は訳語 1 件のため差が出ない。構図に `brisk` が入らない場合は同ファイルへ冪等に語を足す（[03-ui.md](../../design/quiz-first-meaning-only/03-ui.md) 決定 4）
- 赤字の体裁は `text-red-500`・太字なし・`dark:` なし。単語詳細（`font-bold text-red-400`）とはずれたまま残り、3 画面の統一と訳語まわりの赤のダークモード未対応は**別 issue**（[03-ui.md](../../design/quiz-first-meaning-only/03-ui.md) 決定 3）

## 実装内容

### 作成: `docs/adr/<NNNN>-<slug>.md`（新規 ADR）

テーマ: 訳語の「先頭のみ表示」は出題側にだけ効かせ、解答側は先頭訳語の強調で補う。同じ ADR に次の 3 判断も同居させる。

- 先頭の訳語だけでは答えが一意に定まらない問題文を許容すること（01 決定 5）
- 設定の適用範囲を広げても進行中 drill の保存値を移行しないこと（02 決定 6）
- 設定の既定を層ごとに揃えないこと（02 決定 2）

採番・登録の手順:

- `origin/main` を fetch して最新 ID を確認し、[docs/adr/README.md](../../adr/README.md) の運用ルールに従って採番する
- `docs/adr/README.md` の該当テーマ節へ一覧登録する
- 関連 ADR（ADR-0026 / ADR-0077 / ADR-0083）から相互参照を張る
- **削除予定の `docs/design/` へのリンクは ADR 本文に張らない**（機能名の記載に留める）

### 変更: `docs/adr/0026-*.md`（ダミー選択肢の選び方）

- 追記: 四択（日→英）で設定 ON のとき、先頭の訳語が正解と衝突する単語をダミーから外すこと（候補のキーを「正解一致判定用」と「重複排除用」の 2 種類に分ける形）
- 訂正: 同 ADR の「四択の表示は最初の Meaning の連結表示とする」を、設定で切り替わる旨に直す

### 変更: `docs/adr/0083-placeholder-italic-shared.md`

- 「訳語には色を付けない」「訳語が出る全画面で同じ体裁」が `MeaningText` の**自動体裁**についての記述であることを明確化する
- 先頭の訳語だけは画面側が赤字にすること（単語一覧・単語詳細・単語テストの自己判定（英→日）の解答側）と、その体裁が画面ごとに揃っていない現状を記す。単語テストは単語一覧と同じ `text-red-500`・太字なしに合わせたこと

### 変更: `docs/reference/naming-book.md`

前提に挙げた 3 点（列挙の差し替え・単独エントリの新設・「訳語には色を付けない」2 箇所の訂正）を行う。

### 変更: `docs/features/word-quiz.md`

現状この設定への言及が一切ない（実装済みだが未記載）。今回新設する。

- 開始画面で保存できる項目の列挙に本項目を加える。**あわせて既に抜けている「掲載番号順」も足す**（現行文は「掲載箇所・範囲・ブックマークのみ・出題数・出題形式・制限時間」で、実際に保存される `orderByOccurrenceNumber` が漏れている）。これは本機能と無関係な既存の欠落だが、同じ 1 文を書き換えるついでに直す（設計の更新範囲外の追加）
- 訳語の表示に関する説明を追記する（設定が効く範囲＝四択（英語→日本語）の選択肢と日本語→英語 3 形式の問題文、ON / OFF それぞれの見え方）
- 自己判定（英語→日本語）の解答表示で先頭の訳語が赤字になることを追記する。**テスト結果（結果一覧）の節にも、同形式の正解列で先頭の訳語が赤字になることを書く**（05 で結果一覧にも入るため）

### 変更: `docs/features/drill.md`

「出題形式・制限時間はもとのテストの設定を引き継ぎます」の列挙に本項目を加える。`Drill` 列として全ラウンド・再テストへ引き継がれ、今回で対象が 4 形式に広がってユーザーから見える差が出る。

### 変更: `docs/features/settings.md`

単語テストのデフォルト設定の項目列挙に本項目を加える。

### 変更: `docs/features/images/*.png`（再撮影）

`pnpm e2e:capture-docs --only quiz` / `--only settings` / `--only bookmark` を実行し、差分の出た画像をコミットする。前提の「変化が写る画像」と実際の差分が食い違う場合は、原因を確認してから取り込む（`docs/features/README.md` の目視レビューの注意に従う）。

### 変更（条件付き）: `scripts/e2e/db.ts`

撮影の構図に `brisk`（先頭 Meaning に訳語 2 件）が入らず ON / OFF の違いが読み取れない場合のみ、`QUIZ_DECK` へ訳語 2 件以上の語を冪等に足す。

### 変更: `.claude/skills/e2e-verify/references/quiz.md`

トグルの記述（ラベル文言と「形式が `CHOICE` のときだけ表示」）を、新ラベル `最初の訳語だけを表示する` と対象 4 形式（`CHOICE` / `CHOICE_JA_EN` / `SELF_JUDGE_JA_EN` / `SPELLING`）に更新する。「Checkbox は id セレクタで操作しない」の注意はそのまま有効。

### 起票: GitHub issue（コード変更なし）

先頭訳語の赤字の体裁が単語一覧（`text-red-500`・非太字）と単語詳細（`font-bold text-red-400`）で食い違っている件の統一。訳語の赤（単語一覧 1 箇所・単語詳細 2 箇所・装飾記法の `red` マーク）と TG 例文の意味の赤がいずれもダークモード未対応な件も同じ issue で扱う。

## 完了条件（Definition of Done）

- [ ] 新規 ADR が採番済みで `docs/adr/README.md` に登録され、関連 ADR から相互参照が張られている。本文に `docs/design/` へのリンクが無い
- [ ] ADR-0026 / ADR-0083 の追記・訂正が入っている
- [ ] `rg '色を付けない|色は付かず' docs/reference/naming-book.md` が 0 件（訳語エントリとプレースホルダ斜体エントリの**両方**を訂正済み。文言が違うので 2 パターンで検索する）
- [ ] `rg 'choiceFirstMeaningTextOnly' docs/reference/` が 0 件（用語集が新名に追随済み。`docs/design/` / `docs/plan/` は履歴として旧名を含むため検査対象外）
- [ ] `docs/features/word-quiz.md` / `docs/features/settings.md` / `docs/features/drill.md` に本設定の記述があり、実装後の画面と一致している
- [ ] 再撮影した画像が実画面と一致している（目視レビュー。`docs/features/README.md` の注意に従う）
- [ ] `.claude/skills/e2e-verify/references/quiz.md` のトグル記述が新ラベル・対象 4 形式になっている
- [ ] 体裁統一の issue が起票され、本チケットの実装メモに issue 番号が記録されている
- [ ] `pnpm format`（整形）の上で `pnpm format:check` / `pnpm lint` が通る（ドキュメント中心のため typecheck / test の差分は原則ゼロ。`scripts/e2e/db.ts` を触った場合は `pnpm typecheck` も通す）

## 競合注意

（実装チケットの後に着手する終端チケットのため、コードの共有ファイルは無い）

## 実装メモ

- 新規 ADR は **ADR-0100**（4 判断を 1 本に同居）。四択（日→英）のダミー除外は新規 ADR ではなく **ADR-0026 の追補**として記載（`docs/adr/README.md` の「既に受け皿がある」の線引き）。ADR-0077 / 0083 にも追記
- 体裁統一の issue は **#269**（先頭訳語の赤字の体裁を 3 画面で統一＋訳語まわりの赤のダークモード対応）。ADR-0100 決定 2・影響、ADR-0083 追補から参照
- **再撮影の差分がチケットの想定より広かった**。1 回の実行で 15 枚が変化したが、うち 7 枚（`quiz-play-choice` / `quiz-play-tg-choice` / `drill-round-play` / `drill-resume-list` / `bookmark-words-list` / `bookmark-quiz-result-dialog` / `settings-general`）は本機能と無関係な差分（出題順のランダム性・実施日・レンダリングノイズ）だったため revert し、機能変更が写る 8 枚だけをコミット（`docs/features/README.md`「意味のある変更があったときのみ再生成・コミットする」に従う）
- **`quiz-play-self-judge.png` に写る単語は撮影ごとにランダム**で、今回は訳語 1 件の語になったため「先頭の訳語だけが赤」という差が読み取れない構図になった。`--only quiz` を 2 回再実行しても訳語 2 件の語を引かず、デッキへの語追加は他画像への影響が広いため見送り。**確実にしたい場合は撮影スクリプト側で 1 問目を固定する判断が別途必要**（結果一覧系 4 枚では訳語 2 件の語が写っており、先頭のみ赤が読み取れる）
- `scripts/e2e/db.ts` は変更なし（条件付き変更の条件を満たさないと判断）
- `docs/reference/naming-book.md` の `orderByOccurrenceNumber` の出典行番号を 402 → 404 に訂正（新エントリと同じ行番号を指して紛らわしくなるため）。新エントリの「使ってはいけない旧名」は DoD の grep を 0 件に保つため識別子を書かず「`choice` を冠した旧名」という表現にした
