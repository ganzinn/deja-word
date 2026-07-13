# 03. quiz 出題範囲へのブックマーク条件の組み込み

状態: **確定**（2026-07-13）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- quiz 開始フォームに「ブックマークのみ」チェックボックスを追加。掲載箇所×番号範囲と AND で絞り、掲載箇所未選択＋チェック ON ならブックマーク済み単語を全件出題する（01 確定）。
- ブックマークは 1 ユーザー × 1 単語の ON/OFF 1 種類（01 確定）。
- 共有マスタ単語（ownerId=system）にも本人のブックマークが付く（01 確定）。
- ブックマークは side table `Bookmark`（複合 PK userId × wordId、行があれば ON）。Prisma からは `bookmarks: { some: { userId } }`（Word 側）で絞り込める（02 確定）。

既存の確定済み前提（ADR）:

- 出題対象は掲載箇所＋掲載番号範囲の選択、範囲内全件出題（ADR-0022）。掲載番号なしの単語は出題対象外
- 再テストは同一範囲で行う（ADR-0042）。定着モード（Drill）は occurrenceId / rangeFrom / rangeTo を保持する

## 検討事項リスト

- [x] 掲載箇所×範囲×「ブックマークのみ」の AND 絞り込みの仕様（fetchQuizSource / countQuizTargets / countQuizSourceExclusions の where への組み込み）→ 決定 1
- [x] 「ブックマークのみ全件」（掲載箇所未指定）の仕様: occurrenceId 必須前提（quizRangeInputSchema・fetchQuizSource シグネチャ）をどう広げるか。掲載番号なし単語も対象になるか → 決定 3
- [x] ダミー選択肢生成への影響（ADR-0026: 同一掲載箇所優先 — 掲載箇所なしの場合のダミー候補の取り方、ADR-0030 の有界フェッチとの整合）→ 決定 2・決定 3
- [x] Drill（定着モード）への波及: occurrenceId 必須の Drill にブックマーク条件・掲載箇所なしをどう保存するか（ブックマーク集合は可変 — drill 開始後に外した場合の挙動）→ 決定 4・決定 5
- [x] 再テスト（ADR-0042 同一範囲）への波及: 「同一範囲」にブックマーク条件を含めるか、テスト時点のスナップショットか再評価か → 決定 5
- [x] QuizDefaultSetting への保存: 「ブックマークのみ」チェック状態をデフォルト設定に含めるか → 決定 6
- [x] 対象 0 件時の挙動（ブックマーク 0 個でチェック ON など。既存は rangeFrom>rangeTo を拒否せず対象 0 件として扱う流儀）→ 決定 7

## 議論・決定

### 決定 1: ブックマーク絞り込みは出題述語として 3 関数へ同一に適用する

quiz の入力（プレビュー・開始の両経路の基底 `quizRangeInputSchema`）に `bookmarkedOnly: boolean`（英語名はこれで統一、日本語名「ブックマークのみ」。zod では `.default(false)` とし省略時は false — パース後の型は必須 boolean のまま、未更新のフォームからの送信も後方互換で通る）を追加する。true のとき、出題対象の Word 述語に `bookmarks: { some: { userId } }` を AND で追加する。組み込み先は `src/lib/quiz/queries/quiz-source.ts` の 3 関数すべて:

- `fetchQuizSource` の targetRows 述語（`eligibleWord` ∧ `inRangeWordOccurrence` に AND）
- `countQuizTargets` の count 述語（同型を維持）
- `countQuizSourceExclusions` の 3 内訳（noNumber / noMeaning / noTgExample）すべて

除外内訳もブックマーク済み単語にスコープする（例: noNumber は「ブックマーク済みだが掲載番号なしで対象外」の件数になる）。3 関数とも引数に `bookmarkedOnly: boolean` を追加して受け取る（省略時 false の default 付き引数とし、既存の呼び出し箇所は無変更で成立させる。絞り込み条件はセッションの userId とこのフラグのみから組み立てる。クライアントが対象 wordId 集合を指定する経路は作らない）。

- 採用理由: 「プレビュー件数 = 実出題数」の既存契約（ADR-0030 で count 述語と取得述語を同型に保つ規約）を維持するには、絞り込み条件も 3 関数へ同一に入れる以外にない。除外内訳までスコープすることで、絞り込み ON 時の「なぜ対象が少ないか」の説明が正確になる。
- 却下した代替案: 除外内訳は非スコープのまま（掲載箇所全体の内訳を表示）— ブックマークのみモードではブックマーク外の単語の内訳が混ざり、対象件数との対応が読めなくなるため却下。

### 決定 2: ダミー候補（誤答選択肢）にはブックマーク条件を適用しない

`fetchQuizSource` の `sameOccurrenceRows` / `fallbackRows`（ダミープール供給）は現行のまま（scoped 可視の全単語が候補）。ブックマーク条件は出題対象（targets）だけに効く。

- 採用理由: ダミーは誤答選択肢であり、品質の源泉は紛らわしさ（ADR-0026: 同一掲載箇所優先）。ブックマークで絞る意味がない上、ブックマーク数が 4 語未満だと四択が生成不能になる（プール枯渇）。ADR-0030 の有界フェッチ（DUMMY_POOL_SIZE 不足分補充）も無変更で成立する。
- 却下した代替案: ダミーもブックマーク内から選ぶ — プール枯渇と品質低下を招くだけで利点がないため却下。

### 決定 3: 掲載箇所未選択（ブックマーク全件）モードの仕様

`occurrenceId` を optional 化し（`quizRangeInputSchema`・`fetchQuizSource` / `countQuizTargets` / `countQuizSourceExclusions` のシグネチャ）、掲載箇所未指定＋`bookmarkedOnly: true` を「ブックマーク全件モード」とする。

- 入力検証: **`occurrenceId` 未指定を許すのは `bookmarkedOnly: true` のときだけ。かつそのとき `rangeFrom` / `rangeTo` も未指定であること**をスキーマのクロスフィールド検証で拒否する。逆転範囲を拒否しない既存規約（`src/lib/quiz/CLAUDE.md`）は「意味的に対象 0 件」を下流へ一元化するものだが、こちらは形として無効（全単語出題という未定義モード／掲載箇所なしの範囲指定）なので入口で拒否する。
- 対象述語: `bookmarks: { some: { userId } }` ∧ 適格性（可視な意味 or 使える TG 例文）のみ。掲載箇所・掲載番号の条件は付けない。したがって**掲載番号なし・掲載箇所未紐付けの単語も出題対象になる**。ADR-0022 の「掲載番号なしの単語は出題対象外」は掲載箇所指定モードの規則であり、本モードはその明示的な例外とする（実装時に ADR-0022 へ補記を起票する）。
- `assertOccurrenceVisible` は `occurrenceId` があるときのみ呼ぶ。
- 除外内訳: `noNumber` は掲載箇所の概念がないため `null`（noMeaning / noTgExample の形式排他 null と同じ流儀。プレビューでの表示は 04 で決める）。noMeaning / noTgExample はブックマーク済み全体にスコープして count する。
- ダミー供給: `sameOccurrenceRows` は概念がないため常に空。primaryPool = targets のみ、fallbackPool = 全単語プール（`fallbackRows`、ブックマーク外含む）。ADR-0026 の優先順（同一掲載箇所 → 全単語）の自然な縮退であり、`selectDummies` のロジックは無変更。
- `ensureTargetWordIds`（drill ラウンド・再挑戦用）の追加条件は、掲載箇所指定時の「番号付き」（`numberedWordOccurrence`）に代えて適格性のみとする（番号条件を課す対象の掲載箇所がないため）。
- 履歴: QuizAnswer は範囲情報を持たないため無変更。

- 採用理由: 01 確定の「掲載箇所未選択＋チェック ON ならブックマーク全件出題」を、既存の述語構造（条件付きスプレッド）の自然な拡張で実現できる。番号なし単語を含めるのは「苦手単語を漏れなく復習する」というブックマークの目的に合う。
- 却下した代替案: (a) 全件モードでも掲載番号あり単語に限定する — ブックマークは掲載箇所横断の集合であり、番号の有無で復習対象から漏れるのはユーザーの期待に反するため却下。(b) `occurrenceId` 必須を維持し全件モードを別エンドポイントに分ける — プレビュー・開始・デフォルト設定の全経路が二重になり、3 関数の述語契約も二重管理になるため却下。

### 決定 4: Drill（定着モード）を掲載箇所なしに対応させる（スキーマ変更）

ブックマーク全件テストの結果からも drill を作れるようにする。Drill テーブルを次のとおり変更する:

- `occurrenceId` / `rangeFrom` / `rangeTo` を nullable 化（掲載箇所なし drill では 3 つとも null。実効範囲の min/max 計算は掲載箇所ありのときだけ行う）
- `sourceBookmarkedOnly Boolean @default(false)` を追加（元テストの「ブックマークのみ」指定。`sourceRangeFrom/To` と同役割の再テスト導線用）
- occurrence リレーションの `onDelete: Cascade` は維持（null 行は削除連鎖の対象外になるだけ）
- マイグレーションは nullable 化（既存データ影響なし）＋ default false の加算のみで backfill 不要

ADR-0008（side table 加算・既存テーブル無変更）との関係: ADR-0008 が保護するのは共有マスタが同居する core の Word 系テーブルであり、Drill は quiz 機能自身の side table（`sourceRangeFrom/To`・残数設定などカラム加算の前例あり）。02 の「既存テーブルは無変更」はブックマークの格納方式（Bookmark 新設で済ませる）の決定であり、本決定はそれを覆すものではなく 03 スコープの追加決定。

- 採用理由: 非対応だとブックマーク全件テストだけ「テスト → 定着 → 再テスト」の循環から外れる機能格差が残る。nullable 化は既存の掲載箇所あり drill の挙動を一切変えない。
- 却下した代替案: (a) 非対応（ブックマーク全件テストの結果画面では定着モード導線を出さない）— 機能格差が残るため却下。(b) 掲載箇所なし用の別テーブルを新設 — ラウンド生成・一覧・完了処理のすべてが分岐し二重管理になるため却下。

### 決定 5: ブックマーク集合は開始時に再評価する（スナップショットしない）

- 再テスト（「同じ範囲でもう一度テストする」）: `Drill.sourceBookmarkedOnly` を含めて `sourceTest`（StartQuizInput）を復元し、**再テスト開始時点のブックマーク集合**で出題する。既存の「指定条件を保存し、開始時に今のデータで再評価」方式（ADR-0042。単語の増減が反映されるのと同じ）と一貫させる。
- drill 本体: DrillWord が単語集合のスナップショット。**drill 開始後にブックマークを外しても drill からは消えない**（残数もそのまま）。ラウンド生成・同一問題再挑戦は DrillWord 集合ベースで動き、ブックマーク条件を再適用しない。
- 採用理由: 再テストの再評価は既存セマンティクスと一致し、追加の保存構造が不要。drill のスナップショット性は現行実装（DrillWord 固定）そのままで、「定着させる」という drill の目的にも合う（外した＝もう苦手でないなら定着で消化すればよい）。
- 却下した代替案: テスト時点のブックマーク済み wordId リストを保存し再テストもそれを使う — 外した単語が出題され続けるのは意図に反し、既存の「条件保存＋再評価」方式とも乖離した保存構造の追加が必要になるため却下。

### 決定 6: QuizDefaultSetting に「ブックマークのみ」を含める

`QuizDefaultSetting` に `bookmarkedOnly Boolean?` を追加する（null = アプリ既定 OFF。既存の nullable Boolean 項目と同じ流儀）。

- 設定画面（`saveQuizDefaultsInputSchema`）・開始画面の「デフォルトとして保存」トグル（`saveStartSettingsAsDefaultsForUser` の部分 upsert 対象）の両方に含める。`StartFormDefaults` にも載せる。
- Occurrence 削除（SetNull）で `occurrenceId` だけ null になった場合も `bookmarkedOnly` は残す（format / range が残るのと同じ）。結果として「occurrenceId null ＋ bookmarkedOnly true」のデフォルトはそのままブックマーク全件モードの初期値として成立する。
- 採用理由: ブックマーク学習を常用するユーザーの毎回チェックを省ける。既存項目（範囲・形式）と同じ扱いで一貫する。
- 却下した代替案: 保存しない（毎回 OFF 起点）— ON のまま気付かず狭い範囲でテストし続ける事故は防げるが、開始フォームは対象件数プレビューを常時表示しており気付ける導線があるため、常用ユーザーの利便を優先して却下。

### 決定 7: 対象 0 件時の挙動は既存流儀に従う

ブックマーク 0 個＋チェック ON、範囲内にブックマークなし等は、スキーマ・UseCase で特別扱いせず既存の対象 0 件処理に乗せる（プレビューは 0 件表示、開始時は形式不成立として QuizGenerationError）。

- 採用理由: 逆転範囲と同じ「意味的な空集合は下流で一元処理」の規約（`src/lib/quiz/CLAUDE.md`）に合わせる。0 件時の案内表示は 04 で扱う。
- 却下した代替案: ブックマーク 0 個時にチェックボックス自体を無効化・エラー化する — サーバー側の特別扱いは二重定義になるため却下（UI 上の補助表示は 04 の裁量に残す）。
