# word-quiz 設計ドキュメント（ハブ）

登録済み英単語をテストする機能（quiz）の設計ドキュメント群の入口。
**quiz の設計に関わるセッションは、必ずこのファイルから読み始めること。**

## 目的・スコープ

ユーザーが登録した単語を出題し、覚えているかを確認できるようにする。
アプリのコンセプト「一度忘れた単語との再会」に沿い、忘れかけた単語と再会する機会を quiz として提供する。

スコープの詳細（何をやる / やらない）は [01-requirements.md](01-requirements.md) で定義する。

## 確定事項サマリ

結論のみを記載する。採用理由・却下した代替案は各トピックファイルを参照。

- **機能名は quiz**。「テスト」はソフトウェアテストと紛らわしいため、ディレクトリ名・コード上の命名は quiz を基準とする。
- **既存テーブルは変更せず side table 加算で対応**。`docs/refactor/word-registration.md` の将来方針を踏襲（StudySet / WordProgress 等の構想あり。具体的なモデル名・構造は [02-data-model.md](02-data-model.md) で再検討）。
- **任意起動の腕試し型**。復習期限ベース（SRS）はスコープ外（将来拡張）。→ [01](01-requirements.md)
- **出題対象は Occurrence＋掲載番号の範囲指定**。範囲内全出題・ランダム順。複数 Occurrence 横断はスコープ外。→ [01](01-requirements.md)
- **出題形式は英→日の3形式**（四択＋わからない / 自己判定 / 多義語選択）を開始画面で選択。日→英の2形式（綴り記述・自己判定）は将来拡張、形式追加に耐える設計とする。→ [01](01-requirements.md)
- **四択の選択肢は最初の Meaning の MeaningText を「; 」連結で表示**（例: `走る; 駆ける`）。2つ目以降の Meaning は表示しない。→ [03](03-algorithm.md)
- **四択のダミーは同一 Occurrence の他単語を優先**、不足時は全登録単語へ拡大（ダミー候補プールは目標50件まで「出題対象→同一Occurrence→他Occurrence」の順で不足分だけ取得。出題対象＝範囲内は全件）。正解と重複する訳語は除外、プール不足時は選択肢数を縮退（最低2択）。→ [03](03-algorithm.md)
- **多義語選択は MeaningText 単位**（正解集合との完全一致で CORRECT）。ダミー数は 2〜5 のランダム。3形式すべてに「わからない」（GAVE_UP）を置く。→ [03](03-algorithm.md)
- **自己判定は「合っていた / 間違っていた / 思い浮かばなかった」の3段階**（3つ目は GAVE_UP として記録）。→ [03](03-algorithm.md)
- **問題データはサーバーで全問生成し一括返却**（選択肢・シャッフル済み。正解情報も payload に含めクライアント採点）。drill も各ラウンド開始時にサーバー再生成。→ [03](03-algorithm.md)
- **生成ロジックは RNG 注入の純関数**（シャッフルは Fisher–Yates、テストはシード固定）。→ [03](03-algorithm.md)
- **画面フローは 開始 → カウントダウン → 出題 → 結果一覧**。カウントダウンの裏でテスト内容をクライアントへ全ロードし、テスト中はサーバー通信なしで進行する（発音音源の取得のみ例外）。→ [01](01-requirements.md)
- **解答履歴（正誤・日時・出題形式）を単語ごとに永続化**。テスト終了時に一括送信。中断は破棄（再開なし）。→ [01](01-requirements.md)
- **結果画面から定着モード（drill）へ**。間違えた問題中心の再テストを繰り返すモード。→ [01](01-requirements.md)
- **結果画面には自分の回答内容も表示**（直後のみ。履歴に選択内容は残さない）。→ [01](01-requirements.md)
- **drill は残数モデル**（元テスト誤答・うろ覚え・正答ごとの開始値から開始、正解で −1、間違いで誤答リセット値に戻し、0 で卒業）。**定着までの回数（残数 3 値）はテスト開始画面・設定画面で変更可**（既定 誤答=3 / うろ覚え=2 / 正答=1、各 1〜9。`Drill` に保存して全ラウンド引き継ぎ。2026-06-26）。ラウンド制で未卒業の単語を全出題。**既定は誤答のみ投入**で、正答は結果画面トグル「正解した問題も定着モードで出題する」ON 時のみ投入（既定 OFF、設定で変更可。決定 9）。→ [06](06-drill-mode.md)
- **drill は日をまたいで再開可能**（残数をサーバー永続化）。元テストごとに独立生成（結果画面で開始時のみ）。→ [06](06-drill-mode.md)
- **drill の履歴は mode 列（TEST / DRILL）で区別**し、各ラウンド終了時に一括送信。→ [06](06-drill-mode.md)
- **スキーマは QuizAnswer / Drill / DrillWord ＋ enum 3つ**（QuizFormat / QuizResult / QuizMode）を side table 加算。テストセッションテーブルは持たない。Drill には `roundCount`（ラウンド送信の冪等化用、05 起因で加算改訂）と `format`（元テスト形式の引き継ぎ用、06 起因で加算改訂）を持つ。→ [02](02-data-model.md)
- **範囲指定の対象は occurrenceNumber 付きの単語のみ**（既存スキーマで nullable のため）。→ [02](02-data-model.md)
- **意味（MeaningText）未登録の単語も出題対象から除外**（全形式共通。正解選択肢・解答表示が作れないため）。→ [03](03-algorithm.md)
- **エントリポイントはダッシュボードの「単語テスト」ボタン → `/quiz`**。カウントダウン〜結果は `/quiz` 内のクライアント状態遷移（URL 遷移なし）。drill ラウンドも同フローを再利用。→ [04](04-ui.md)
- **開始画面は Occurrence 選択＋番号範囲＋形式選択＋対象件数プレビュー**。除外件数（番号なし・意味未登録）を注記する。プレビューは件数のみの軽量経路で、形式の成立可否は開始時にサーバー判定し、不成立はカウントダウン画面でエラー表示（2026-06-21 改訂＝05 決定 8 改訂。改訂前は不成立の形式を選択不可＋理由表示）。→ [04](04-ui.md)
- **開始画面の 3 項目はユーザーごとのデフォルトとして保存可**（2026-06-13 加算）。設定は設定画面（/settings/quiz-defaults）のみ・全項目任意・プレビューなし。スキーマはユーザーごと 1 行の `QuizDefaultSetting`（occurrence は onDelete: SetNull）。→ [04](04-ui.md)・[02](02-data-model.md)
- **開始画面からもデフォルトを部分上書きできる**（2026-06-20 加算。当初の保存ボタン却下案の見直し）。開始画面の「この設定をデフォルト設定とする」トグル ON で開始すると開始画面の項目のみ上書き。トグルの初期状態はメタ設定 `QuizDefaultSetting.saveOnStart` 由来で、トグル操作はメタ設定に書き戻さない（一方向）。→ [04](04-ui.md)・[02](02-data-model.md)
- **1 問あたりの制限時間（タイムアウト）を任意設定可**（2026-06-13 加算）。デフォルトなし・1〜60 秒（ON 初期値 5 秒）。開始画面と、デフォルト設定画面で **出題形式ごとに**設定（後続改訂）。デフォルトは形式別の子テーブル `QuizDefaultTimeout(userId, format, timeoutSeconds)`（行なし＝制限なし）に保存し、開始画面で形式を選ぶとその形式の値を自動入力する。→ [01](01-requirements.md)・[02](02-data-model.md)・[04](04-ui.md)
- **時間切れは `QuizResult.TIMEOUT` として記録し間違い扱い**（集計・drill 残数計算は INCORRECT 同等＝3 にリセット）。出題画面に残り時間バーを表示し、時間切れで回答後と同じ状態（正解表示＋「次へ」）へ。自己判定はタイマーを「解答を表示」までに適用。→ [01](01-requirements.md)・[04](04-ui.md)
- **制限時間は payload（`QuizPayload.timeoutSeconds`）に一本化**。TEST は `startQuiz` 入力のエコーバック、DRILL は `Drill.timeoutSeconds`（format と同じく `startDrill` で 1 回受領・全ラウンド引き継ぎ）から導出。→ [05](05-architecture.md)・[06](06-drill-mode.md)
- **解答直後に即時正誤フィードバック**（正誤＋正解内容を表示し「次へ」で進行）。→ [04](04-ui.md)
- **出題時に発音音源を自動再生**（再生ボタンで再再生可）。音声は先読み（問題データ取得後に第1問、出題中に次問）し、取得失敗しても進行に影響させない。音声取得は「通信なし」原則の例外。**意味音源（読み上げ）は使わない**。→ [04](04-ui.md)
- **テスト中の離脱（ブラウザバック・リロード）には確認ダイアログ**を出してから破棄する（drill のラウンド中も同様）。→ [04](04-ui.md)
- **結果一覧の単語タップで単語詳細をフルスクリーンダイアログ表示**（表示専用・閉じると結果画面に戻る。詳細表示部は `/words/[id]` と共有コンポーネント化）。履歴送信失敗時はアラート＋再送ボタン、送信成功までテストでは drill 導線・drill では次ラウンドが無効。→ [04](04-ui.md)
- **結果一覧に「間違えた問題だけ表示」フィルタ**（2026-06-24 加算）。ON で `CORRECT` 以外（不正解・わからなかった・時間切れ）の行だけを表示する表示専用フィルタ。サマリ（正解数・正答率）は全問ベースで不変、初期 OFF、TEST・drill ラウンド結果の両方に表示。→ [04](04-ui.md)
- **進行中 drill の再開導線は quiz 開始画面の一覧**（ダッシュボードには置かない）。一覧の各行から削除も可能（確認ダイアログ付き。削除しても解答履歴は残る。06 起因で加算改訂）。→ [04](04-ui.md)・[06](06-drill-mode.md)
- **MVP では既存画面への解答履歴表示は見送り**（変更はダッシュボードのボタン追加のみ）。→ [04](04-ui.md)
- **モジュール配置は words の相似形**。UseCase は `src/lib/` 直下フラット（`quiz-*.ts` / `drill-*.ts`）、純関数・クエリ・handler・error-map は `src/lib/quiz/` 配下。単語詳細表示部は `src/components/word-detail-view.tsx` に抽出して共有。→ [05](05-architecture.md)
- **インターフェースは全部 Server Action**（Route Handler 追加なし）。プレビュー・問題生成・履歴送信・drill 生成／ラウンド生成／ラウンド送信／削除・単語詳細の 8 Action を `src/app/quiz/actions.ts` に集約。mode / ownerId はサーバー側で付与、format は TEST 履歴送信と drill 生成のトップレベルで 1 回だけ受け取り enum 検証（この 2 経路はセッション状態がなくサーバーで導出不可。drill ラウンド系は `Drill.format` から導出）。→ [05](05-architecture.md)
- **drill ラウンド送信は `Drill.roundCount` の CAS で冪等化**（期待ラウンド数一致で +1。再送は適用済み判定して確定残数を冪等返却）。drill 生成の入力はクライアントから結果（wordId・correct）と format を送る。→ [05](05-architecture.md)
- **TEST 履歴の多重送信はクライアント single-flight のみで防ぎ、成否不明後の再送による履歴重複は MVP 許容**。送信時に存在確認フィルタで削除済み単語を skip し FK 違反で全件失敗させない。→ [05](05-architecture.md)
- **素材取得は range を SQL に寄せ、ダミー候補プールを目標件数まで優先順で不足分だけ取得（出題対象＝範囲内は全件、最大3クエリ）＋純関数パーティション**。プレビューは件数のみの軽量経路に分離（形式の成立判定はテスト開始時にサーバー側で実施）。認可は `scopedOwnerIds` の where 句注入（EditorContext / row-policy は使わない）。→ [05](05-architecture.md)
- **形式追加の拡張点は「形式別生成器＋exhaustive switch ＋ payload の discriminated union」**で 4 箇所に閉じる。音声プリロードは新規 API なし（payload 内 URL を `new Audio()` で先読み）。→ [05](05-architecture.md)
- **drill の出題形式は元テストを引き継ぐ**（`Drill.format` に保存。ラウンドごとの形式選択はなし）。ラウンド間で出題順・選択肢は毎回変わる（シード永続化なし）。→ [06](06-drill-mode.md)
- **ラウンド結果画面の導線は「次のラウンドへ」/「終了」、全卒業で完了表示**。`completedAt` はラウンド送信の同一 tx 内でサーバーが設定し、完了 drill は進行中一覧から消える。元テスト全問正解でも「正解も出題する」ON なら開始可（既定 OFF では投入対象 0 件のため開始ボタンを無効化。決定 9）。→ [06](06-drill-mode.md)
- **drill と通常テストの共有範囲**: カウントダウン〜出題〜即時フィードバックは完全共有、結果画面は共有＋mode 差分、開始画面は drill では使わない。→ [06](06-drill-mode.md)

## トピック状態表

状態: `未着手` → `議論中` → `確定`

| ファイル | 状態 | 要約 |
| --- | --- | --- |
| [01-requirements.md](01-requirements.md) | 確定 | 要求・ユースケース・スコープ外を確定（2026-06-12。2026-06-13 制限時間（タイムアウト）を加算改訂） |
| [02-data-model.md](02-data-model.md) | 確定 | QuizAnswer / Drill / DrillWord ＋ enum 3つのスキーマ確定（2026-06-12、同日 05 起因で Drill.roundCount を、06 起因で Drill.format を加算改訂。2026-06-13 QuizDefaultSetting と制限時間（QuizResult.TIMEOUT・Drill.timeoutSeconds）を加算改訂。後続改訂でデフォルト制限時間を形式別の子テーブル QuizDefaultTimeout に分離） |
| [03-algorithm.md](03-algorithm.md) | 確定 | 選択肢生成・問題データ生成（サーバー生成・RNG注入）を確定（2026-06-12） |
| [04-ui.md](04-ui.md) | 確定 | 画面遷移・各画面仕様を確定（2026-06-12、同日 06 起因で進行中 drill 一覧に削除ボタンを加算改訂。2026-06-13 開始画面デフォルト設定と制限時間（残り時間バー・時間切れ挙動）を加算改訂。後続改訂でデフォルト制限時間を形式別化＝開始画面は形式選択で自動入力・設定画面は形式ごとに独立設定） |
| [05-architecture.md](05-architecture.md) | 確定 | モジュール配置・Server Action 統一・冪等性（roundCount CAS）・認可・形式拡張点・テスト戦略を確定（2026-06-12、同日 06 起因で format 引数の整理・deleteDrill 追加を改訂。2026-06-13 制限時間の payload 一本化を加算改訂） |
| [06-drill-mode.md](06-drill-mode.md) | 確定 | 残数モデル・形式継承・終了条件・削除導線・共有範囲を確定（2026-06-12。2026-06-13 制限時間の引き継ぎ（Drill.timeoutSeconds）を加算改訂） |

**全トピック確定（2026-06-12）— 設計完了**。次の工程はチケット分割（`docs/plan/` 管轄、後続スキルで実施）。開始情報は下の「実装への引き継ぎ」を参照。

## 実装への引き継ぎ

チケット分割は確定事項サマリ＋本セクションだけで開始できる。詳細が必要な場合のみ各トピックの「決定 N」を参照する。

### 変更対象の一覧

- **スキーマ（マイグレーション一括 1 回）**: `QuizAnswer` / `Drill` / `DrillWord` ＋ enum `QuizFormat` / `QuizResult` / `QuizMode` を加算（具体形は [02](02-data-model.md)）。既存テーブルは無変更（User / Word / Occurrence にリレーションフィールドのみ追加）。
- **新規 UseCase（`src/lib/` 直下、8 ファイル）**: `quiz-preview.ts` / `quiz-generate.ts` / `quiz-answers-submit.ts` / `drill-create.ts` / `drill-round-generate.ts` / `drill-round-submit.ts` / `drill-list.ts` / `drill-delete.ts`（[05](05-architecture.md) 決定 1）。
- **新規支援モジュール（`src/lib/quiz/` 配下)**: `payload.ts`（discriminated union）/ `error-map.ts` / `generation/`（RNG 注入の純関数 8 ファイル＋unit test）/ `queries/quiz-source.ts` / `handlers/`（quiz-answer-handler / drill-round-handler / shared）（[05](05-architecture.md) 決定 1・6・7・8）。
- **新規 zod スキーマ**: `src/lib/schema/quiz.ts`（[05](05-architecture.md) 決定 2）。
- **新規 UI（`src/app/quiz/`）**: `page.tsx` / `actions.ts`（8 Action 集約）/ `_components/` の 8 コンポーネント（quiz-flow / start-form / countdown / result-list / word-detail-dialog / question-choice / question-self-judge / question-multi-meaning）（[04](04-ui.md)・[05](05-architecture.md) 決定 1）。
- **既存ファイルの変更**: ダッシュボード（`src/app/dashboard/page.tsx`）に「単語テスト」ボタン追加。`/words/[id]` の詳細表示部を `src/components/word-detail-view.tsx` に抽出して共有（[04](04-ui.md)）。
- **テスト基盤の拡張**: `tests/setup/tx-mock.ts` に quizAnswer / drill / drillWord delegate 追加、`tests/setup/fixtures.ts` に番号付き／なし／意味なし単語の fixture 追加、シード付き PRNG ヘルパ追加（[05](05-architecture.md) 決定 7・9）。

### 着手順序のヒント

依存方向: スキーマ → `generation/` 純関数 → `queries/` ・ `handlers/` → UseCase → `actions.ts` → UI コンポーネント。

- `word-detail-view.tsx` の抽出は quiz 本体と独立しており、先行して別チケットにできる（`/words/[id]` と quiz の両方が触る共有物のため、並行実装時の競合点になりやすい）。
- `actions.ts` は 8 Action が 1 ファイルに集約されるため、Action 単位でチケットを分けるなら競合に注意（テスト系 → drill 系の順が安全）。
- `generation/` の純関数群は DB 非依存で並行実装しやすい（形式別生成器は互いに独立）。

### テスト戦略の要点（チケットの完了条件に転記できる粒度）

- `generation/` 全純関数: unit。シード付き PRNG 注入で決定的に検証（縮退・重複排除・シャッフル・残数遷移 `nextRemaining`）。
- `quiz/handlers/`: unit。`tx-mock.ts` の delegate 追加で流用。
- `fetchQuizSource`: integration。可視性スコープ・意味未登録除外・番号なし除外を実 DB で検証。
- UseCase（`submitQuizAnswersForUser`＝削除済み単語 skip / `createDrillForUser`＝初期残数は Drill の残数設定由来 / `submitDrillRoundForUser`＝残数遷移・completedAt・CAS）: integration、コロケート。冪等性は「同一 `expectedRoundCount` で 2 回呼び、2 回目が `alreadyApplied: true`・remaining と QuizAnswer 件数が 1 回分」を確認。
- `actions.ts`: unit（認証なし・zod 不正・エラーマップ）。`deleteDrill` は特殊ロジックがないためここでカバー。

### 次工程

チケット分割（PR 単位の実装内容＋優先順位・依存関係）は後続のチケット分割スキルで行う。置き場・形式はそのスキル側で決める（`docs/plan/` 管轄）。

## セッション運用ルール

1. **読み込みは「ハブ + 対象トピック1ファイル」に限定する**。他のトピックファイルは原則読まない。依存する決定は各ファイル冒頭の「前提」に再掲されている。
2. **セッション終了（クリア）前に、このファイルの状態表と確定事項サマリを必ず更新する**。これが次セッションへの引き継ぎとなる。
3. **議論の過程・却下案・採用理由はトピックファイルに残し、ハブには昇格させない**。ハブには結論のみ（各1〜3行）を書く。
4. **既存の確定事項を覆す場合は、ハブのサマリと元トピックファイルの両方を更新する**。あわせて、その決定を「前提」に再掲している他ファイルも更新する。
5. 全トピック確定後、実装フェーズの分割計画は別途 `docs/plan/` で扱う（このディレクトリは設計のみ）。
