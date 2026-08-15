# quiz-first-meaning-only 設計ドキュメント（ハブ）

単語テストの訳語表示を「先頭の訳語のみ」に統一制御する機能の設計ドキュメント群の入口。
**quiz-first-meaning-only の設計に関わるセッションは、必ずこのファイルから読み始めること。**

## 目的・スコープ

日本語→英語の出題（四択・自己判定・スペル確認）の問題文は、最初の Meaning の訳語すべてを「; 」連結して表示している。訳語が複数あると問題文が長くなり、先頭の訳語 1 つだけを手がかりに答えたい使い方に合わない。既に四択（英語→日本語）の選択肢にある「先頭の訳語のみ表示する」設定（`choiceFirstMeaningTextOnly`）を、形式をまたぐ 1 つの共通設定へ広げて日本語→英語の問題文にも効かせる。あわせて、訳語を減らさない自己判定（英語→日本語）の解答側では先頭の訳語をアプリが強調表示して代表的な訳語を見分けられるようにする。

スコープの詳細（何をやる / やらない）は [01-requirements.md](01-requirements.md) で定義する。

## 確定事項サマリ

結論のみを記載する。採用理由・却下した代替案は各トピックファイルを参照。

- **共通設定「先頭の訳語のみ表示」は出題データの生成時に反映し、四択（英→日）の選択肢と日→英 3 形式（四択・自己判定・スペル確認）の問題文にだけ効かせる**。結果一覧はその再表示なので該当列（四択（英→日）の正解列と「自分の回答」列、日→英 3 形式の問題文列）にも同じ内容が出る（結果一覧向けの分岐は作らない）。多義語選択の選択肢・自己判定（英→日）の解答表示とその正解列・TG 例文形式 4 種・訳語が出る他の画面は対象外。→ [01](01-requirements.md)
- **「先頭の訳語」は最初の Meaning の先頭 MeaningText 1 つ**（品詞は含めない）。OFF は従来どおり最初の Meaning の MeaningText を「; 」連結。→ [01](01-requirements.md)
- **既定値は未設定＝ON を維持**し、デフォルト設定の既存保存値は変換せずそのまま共通設定の値として引き継ぐ（進行中 drill に保存済みの値の扱いは 02 で決める）。→ [01](01-requirements.md)
- **自己判定（英→日）の解答表示と結果一覧のその正解列は、先頭 Meaning の先頭訳語をアプリが常時赤字にする**（共通設定の ON / OFF に連動しない）。装飾記法とはベース＋後勝ちで重ねる。単語一覧・単語詳細が既に行っている先頭訳語の強調を解答側へ広げるもので、ADR-0083 は覆さない。→ [01](01-requirements.md)
- **先頭の訳語だけでは答えが一意に定まらない問題文は許容する**（避けたい場合は開始フォームで OFF）。→ [01](01-requirements.md)
- **コード名・DB 列名とも `firstMeaningTextOnly` / `first_meaning_text_only` へ改名する**。マイグレーションは 2 テーブル分の `ALTER TABLE ... RENAME COLUMN` を手書きする（データコピーなし）。→ [02](02-settings-model.md)
- **既定値の非対称（設定側 null＝ON / 画面の初期値・推奨値 true / drill 列 default false / 生成オプション未指定＝false）は現状のまま残す**。層ごとに「未指定」の意味が違うため。→ [02](02-settings-model.md)
- **表示文字列の切替は共通ヘルパ 1 つに集約**し、生成オプションから四択（英→日）と日→英 3 形式の各ビルダーへ boolean で渡す。四択（英→日）の重複排除キーの扱いは変えない。→ [02](02-settings-model.md)
- **四択（日→英）は設定 ON のとき、先頭の訳語が正解と衝突する単語をダミーから外す**。そのためダミー候補のキーを「正解一致判定用」と「重複排除用」に分ける（キーの作り方は生成と成立判定で共有）。四択（日→英）が既に持つ「ダミーを確保できず成立しない」経路の条件が、先頭訳語の衝突にも広がることは許容する。→ [02](02-settings-model.md)
- **赤字強調は 2 経路**: 解答表示は `MeaningBlocks` の引数（赤は `MeaningText` にベース体裁を渡す口を開けて既存の合成経路に載せる）、結果一覧は正解列を「表示要素の配列＋先頭を強調するか」の構造へ変え、正解列専用の入口から既存の描画ヘルパへ委譲する。「自分の回答」列は従来どおり文字列・強調なし。→ [02](02-settings-model.md)
- **進行中 drill の保存値は移行しない**。実装後は保存値が ON の日→英 drill の問題文が次ラウンドから先頭の訳語 1 つになる。→ [02](02-settings-model.md)
- **`docs/reference/naming-book.md` を改名に追随させ**、`firstMeaningTextOnly` の単独エントリを新設し、「訳語には色を付けない」記述 2 箇所を訂正する（現状と食い違っているため。「描画は `MeaningText` に集約」は壊れないので触らない）。→ [02](02-settings-model.md)
- **トグルは対象 4 形式（四択（英→日）・日→英 3 形式）を選んでいるときだけ開始フォームに表示し**、デフォルト設定画面では形式カード群の直後に独立行として常時描画する。対象外の形式へ切り替えている間も値は保持し送信する。表示条件の述語 `isFirstMeaningTextOnlyFormat` は `format-options.ts` に置き、参照元は開始フォームだけ。→ [03](03-ui.md)
- **文言はラベル「最初の訳語だけを表示する」＋補足「オフにすると、複数の訳語を「; 」で連結して表示します。」を両画面共通**にする。開始フォームには補足文を新設し、「この設定をデフォルト設定とする」の補足文の列挙にも本項目を加える。→ [03](03-ui.md)
- **先頭訳語の赤字は `text-red-500`・太字なし・`dark:` なし**（単語一覧・装飾記法と同じ）。単語詳細（`font-bold text-red-400`）との体裁統一と、赤 4 系統のダークモード未対応は issue 化してスコープ外とする。→ [03](03-ui.md)
- **`docs/features/word-quiz.md` と `docs/features/settings.md` に本設定と赤字強調を新設し**、`--only quiz` / `--only settings` / `--only bookmark` の 3 セクションを再撮影する。`.claude/skills/e2e-verify/references/quiz.md` のトグル記述も更新する。→ [03](03-ui.md)
- **テストは生成側の unit を対象 4 形式へ広げ、設定の保存と改名追随を integration で守る**。UI コンポーネントテストは新設せず手動確認に委ねる。→ [03](03-ui.md)

## ADR 引き継ぎ候補

`docs/design/` は実装後に削除するため、コードから理由を復元できない判断は ADR へ引き継ぐ。トピック確定時に判定し、要のものだけをここに挙げる（判定基準は [docs/adr/README.md](../../adr/README.md)「ADR に書く判断の線引き」。起票は実装フェーズのチケット）。

- 新規 ADR: 訳語の「先頭のみ表示」は出題側にだけ効かせ、解答側は先頭訳語の強調で補う。同じ ADR に次も同居させる — 先頭の訳語だけでは答えが一意に定まらない問題文を許容すること、設定の適用範囲を広げても進行中 drill の保存値を移行しないこと、設定の既定を層ごとに揃えないこと（01 決定 1・決定 4・決定 5、02 決定 2・決定 6）
- ADR-0026（ダミー選択肢の選び方）への追記: 四択（日→英）で設定 ON のとき、先頭の訳語が正解と衝突する単語をダミーから外す（キーを 2 種類に分ける）。あわせて同 ADR の「四択の表示は最初の Meaning の連結表示とする」が設定で切り替わる旨に訂正する（02 決定 4）
- ADR-0083（プレースホルダの体裁）の更新: 「訳語には色を付けない」「訳語が出る全画面で同じ体裁」が `MeaningText` の自動体裁についての記述であることを明確化し、先頭の訳語だけは画面側が赤字にすること（単語一覧・単語詳細・単語テストの自己判定（英→日）の解答側）と、その体裁が画面ごとに揃っていない現状を記す。単語テストは単語一覧と同じ `text-red-500`・太字なしに合わせる（01 決定 4、03 決定 3）

## トピック状態表

状態: `未着手` → `議論中` → `確定`

| ファイル | 状態 | 要約 |
| --- | --- | --- |
| [01-requirements.md](01-requirements.md) | 確定 | 適用範囲（どの形式のどの表示に効かせるか）・既定値・スコープ外 |
| [02-settings-model.md](02-settings-model.md) | 確定 | 設定モデル（フラグ名・DB カラム・移行）・drill / 再テストの引き継ぎ |
| [03-ui.md](03-ui.md) | 確定 | 開始フォーム / デフォルト設定画面の文言・配置、テスト戦略 |

**全トピック確定。設計は完了**（2026-08-15）。次工程はチケット分割: `/ticket-split quiz-first-meaning-only`

## 実装への引き継ぎ

チケット分割が全トピックを読み直さずに開始できるための棚卸し。詳細が要る場合のみ各トピックの「決定 N」を参照する。

### 変更対象

**スキーマ・マイグレーション**

- `prisma/schema.prisma` — `QuizDefaultSetting` と `Drill` の `choiceFirstMeaningTextOnly` を `firstMeaningTextOnly`（DB 列 `first_meaning_text_only`）へ改名
- 新規マイグレーション — 2 テーブル分の `ALTER TABLE ... RENAME COLUMN` を手書き（データコピーなし）

**新規モジュール・関数**

- 表示文字列の切替共通ヘルパ `firstMeaningDisplayText(word, firstMeaningTextOnly)`（ON: 先頭 MeaningText 1 つ / OFF: 「; 」連結）— `src/lib/quiz/generation/material.ts`（既存の `firstMeaningText` / `firstMeaningHeadText` の隣。02 決定 3）
- 対象 4 形式の述語 `isFirstMeaningTextOnlyFormat` — `src/lib/quiz/format-options.ts`（既存の `isJaToEnFormat` は TG 2 形式を含むため流用しない。参照元は開始フォームの表示条件だけ。03 決定 1）

**既存ファイルの変更（生成・ドメイン）**

- `src/lib/quiz/generation/build-quiz.ts` — 生成オプションを対象 4 形式へ受け渡し、`CHOICE_JA_EN` の可用性判定に先頭訳語の衝突を加える
- `src/lib/quiz/generation/choice.ts` / `choice-ja-en.ts` / `self-judge-ja-en.ts` / `spelling.ts` — 共通ヘルパ経由の表示切替
- `src/lib/quiz/generation/dummy-pool.ts` — ダミー候補のキーを「正解一致判定用」と「重複排除用」に分ける（02 決定 4）
- `src/lib/quiz-generate.ts` — テスト開始の本経路。入力型と生成オプション組み立ての改名追随
- `src/lib/quiz/default-settings.ts` — `DEFAULT_QUIZ_SETTINGS` の推奨値（02 決定 2）
- `src/lib/schema/quiz.ts` — `startQuizInputSchema` / `saveQuizDefaultsInputSchema` の改名
- `src/lib/quiz-default-settings.ts` — 保存・読み出し・`saveStartSettingsAsDefaultsForUser`
- `src/lib/drill-create.ts` / `drill-round-generate.ts` ほか drill 系 — 改名の追随（保存値の移行はしない。02 決定 6）
- `src/app/quiz/actions.ts` / `src/app/settings/quiz-defaults/actions.ts` / `src/app/quiz/_lib/build-start-drill-input.ts` — 改名の追随

**UI コンポーネント**

- `src/app/quiz/_components/start-form.tsx` — 表示条件を対象 4 形式へ、ラベル・補足文・`id` の変更、「この設定をデフォルト設定とする」補足文の列挙訂正（03 決定 1・決定 2）
- `src/app/settings/quiz-defaults/_components/quiz-defaults-form.tsx` — `CHOICE` カード内から形式カード群の直後へ移動、ラベル・補足文・`id` の変更
- `src/components/meaning-text.tsx` — ベース体裁を受け取る口を開ける（02 決定 5）
- `src/components/placeholder-text.tsx` — `renderPlaceholders` は現状ベース体裁をプレースホルダのトークンにしか当てず、非トークン部分は素通しする。訳語全体にベース体裁を効かせるにはこの合成関数側の変更が要る
- `src/app/quiz/_components/meaning-blocks.tsx` — 先頭訳語を強調するかの引数を追加
- `src/app/quiz/_components/question-self-judge.tsx` — 強調ありで `MeaningBlocks` を呼ぶ
- `src/app/quiz/_components/result-list.tsx` / `quiz-flow.tsx` — 正解列の構造化と正解列専用の入口（強調は自己判定（英→日）のみ。「自分の回答」列は従来どおり文字列・強調なし）

**ADR（起票・追記）**

- 新規 ADR — 訳語の「先頭のみ表示」は出題側にだけ効かせ、解答側は先頭訳語の強調で補う（「ADR 引き継ぎ候補」の 1 件目。同居させる 3 判断を含む）
- ADR-0026 への追記＋既存記述の訂正
- ADR-0083 の更新

**既存ドキュメント**

- `docs/reference/naming-book.md` — `QuizDefaultSetting` エントリの列挙差し替え、`firstMeaningTextOnly` の単独エントリ新設、「訳語には色を付けない」記述 2 箇所の訂正（02 決定 7）
- `docs/features/word-quiz.md` — 設定の説明を新設（現状は未記載）、開始画面の保存項目の列挙に追加、自己判定（英→日）の赤字強調を追記
- `docs/features/settings.md` — デフォルト設定の項目列挙に追加
- `docs/features/drill.md` — 「もとのテストの設定を引き継ぐ」項目の列挙に追加（本設定も `Drill` 列として全ラウンド・再テストへ引き継がれる）
- スクリーンショット再撮影 — `pnpm e2e:capture-docs --only quiz` / `--only settings` / `--only bookmark`。bookmark セクションもトグル（`bookmark-quiz-start.png`）と自己判定の結果一覧（`bookmark-quiz-result.png` / `bookmark-quiz-result-bulk.png`）を撮っている
- `scripts/e2e/db.ts` — ON / OFF の差が出るのは先頭 Meaning に訳語が 2 つ以上ある `brisk` のみ。撮影の構図に入らない場合だけ語を冪等に追加する（03 決定 4）
- `.claude/skills/e2e-verify/references/quiz.md` — トグルのラベル文言と表示条件の記述

**別 issue（実装スコープ外）**

- 先頭訳語の赤字の体裁が単語一覧（`text-red-500`・非太字）と単語詳細（`font-bold text-red-400`）で食い違っている件の統一。訳語の赤（単語一覧 1 箇所・単語詳細 2 箇所・装飾記法の `red` マーク）と TG 例文の意味の赤がダークモード未対応な件も同じ issue で扱う（03 決定 3）

### 着手順序のヒント

1. **スキーマ改名＋マイグレーション＋型を通す最小の追随** — 以降のすべてが触る共有基盤。単独で先に入れる
2. **純関数** — 表示文字列の切替ヘルパ、対象 4 形式の述語
3. **生成側** — 四択（英→日）は既存挙動を維持したまま日→英 3 形式へ適用。四択（日→英）のダミー除外＋可用性判定（02 決定 4）はここに含む
4. **赤字強調** — `MeaningText` / `MeaningBlocks` / 結果一覧の構造化。3 とは独立で並行可
5. **設定画面 UI** — 開始フォーム・デフォルト設定画面の表示条件・配置・文言。1 の後なら並行可
6. **ADR 起票・用語集・機能紹介・E2E 手順書** — 実装が固まってから

競合しやすい共有物: `prisma/schema.prisma`、`src/lib/schema/quiz.ts`、`src/lib/quiz/generation/material.ts`、`src/lib/quiz/format-options.ts`、`src/lib/quiz/generation/build-quiz.ts`。1 と 2 を先に単独で入れると 3〜5 が並行しやすい。

### テスト戦略の要点

チケットの完了条件に転記できる粒度（詳細は 03 決定 5）。

- unit: 表示切替ヘルパの ON / OFF、`choice-ja-en` / `self-judge-ja-en` / `spelling` の ON 時に問題文が先頭訳語 1 つになること、四択（日→英）の ON 時のダミー除外とキー 2 種の使い分け、`build-quiz` の受け渡しを 4 形式へ、`CHOICE_JA_EN` の不成立条件に先頭訳語の衝突が加わることと可用性判定の一致。既存 `choice.unit.test.ts` の `describe("firstMeaningTextOnly = true")` はそのまま維持。`rich-text.unit.test.ts` は変更しない
- integration: `firstMeaningTextOnly` 単独の保存・再保存ケース新設、`saveStartSettingsAsDefaultsForUser` が本項目を保存すること、`drill-round-generate` の `sourceTest` アサートの改名追随と進行中 drill の保存値が移行されないこと、`prisma migrate deploy` で RENAME COLUMN が通ること
- 結果一覧の正解列の導出（02 決定 5）と `MeaningText` のベース体裁の合成（02 決定 5）は、JSX を返さない純関数として切り離し、`*.unit.test.ts` から検証できる形にする。別モジュールへ出すか `.tsx` から export するかは実装の裁量
- UI コンポーネントテストは新設しない（`.test.tsx` は実行対象外・0 件）。トグルの表示条件・文言・赤字は e2e-verify スキルでの手動確認に委ねる（観点は 03 決定 5 の「手動確認」）

### チケット分割

チケットは ticket-split スキルで `docs/plan/quiz-first-meaning-only/` に生成する: `/ticket-split quiz-first-meaning-only`

## セッション運用ルール

1. **読み込みは「ハブ + 対象トピック1ファイル」に限定する**。他のトピックファイルは原則読まない。依存する決定は各ファイル冒頭の「前提」に再掲されている。
2. **仕様書・設計書に記載した後は、毎回必ず整合性レビューを実施する**（成立しない記述・二重定義・決定間の矛盾・曖昧なシグネチャ等。観点は design-session スキル参照）。修正してから次へ進む。
3. **セッション終了（クリア）前に、このファイルの状態表・確定事項サマリ・ADR 引き継ぎ候補を必ず更新する**。これが次セッションへの引き継ぎとなる。
4. **議論の過程・却下案・採用理由はトピックファイルに残し、ハブには昇格させない**。ハブには結論のみ（各1〜3行）を書く。
5. **既存の確定事項を覆す場合は、ハブのサマリと元トピックファイルの両方を更新する**。あわせて、その決定を「前提」に再掲している他ファイルも更新する。
6. 全トピック確定後、ハブに「実装への引き継ぎ」セクションを追記して設計を閉じる。実装フェーズの分割計画は別途 `docs/plan/` で扱う（このディレクトリは設計のみ）。
