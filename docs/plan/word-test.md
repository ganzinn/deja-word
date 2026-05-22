# 単語テスト機能 仕様

## Context

`deja-word` は「一度忘れた単語との再会体験」をコンセプトとする英単語学習アプリ。基盤整備フェーズ（M1〜M5）と単語登録/一覧/出典管理が実装済みで、ユーザーは自分の単語（`owner_id = <user>`）とシステム共有単語（`owner_id = "system"`）を扱える。

本書は **「登録した単語を覚えるためのテスト機能」** の仕様。複数の回答形式と、ランクによる定着度管理、「全部覚えるまで繰り返す」定着モードを定義する。データモデルは未実装のため、本書で新規モデルも設計する。

> 表記: 本書中で **確定** はユーザーとのすり合わせで合意済みの事項、**提案（要確認）** は本書で初めて設計した、合意前の事項。実装着手前に「未確定事項」セクションを潰すこと。

---

## 用語と 2 つの軸

テストの挙動は **直交する 2 軸** で決まる。混同しやすいので最初に分離する。

| 軸 | 何を決めるか | 取りうる値 |
|---|---|---|
| **出題範囲モード**（scope mode） | どの単語を、どういう打ち切り条件で出すか | 通常 / 定着モード |
| **回答形式モード**（answer-format mode） | 1 問の出し方・答え方・採点方法 | 四択 / 多義語 / 綴り / 自己判定（英→日）/ 自己判定（日→英） |

- 定着モードは **出題範囲モード** であって回答形式ではない（重要）。定着モードに入っても、回答形式は別途選んだ 1 つを使う。
- ランクは **回答形式モードごとに独立** して持つ（後述）。「四択ではランク 3 だが綴りではランク 0」がありうる。

---

## 確定した方針（すり合わせ済み）

| 項目 | 決定 |
|---|---|
| 回答形式モード | **5 種**: ①四択（語義選択） ②多義語（訳語の複数選択） ③綴り（日→英 記述） ④自己判定（英→日 / 意味想起） ⑤自己判定（日→英 / 語想起） |
| ランクの粒度 | **5 モードそれぞれに独立したランク**を持つ（単語 × モードでランク 1 つ） |
| ランクの範囲 | **下限 0、上限なし**（0 以上の整数） |
| ランク更新（既定） | 正解 → **+1（上限なし）** / 不正解 → **−2（下限 0）** |
| 定着しきい値 | **ランクが 3 以上で「定着済み」**（既定値 3。上限撤廃に伴い、定着判定は固定の最大値ではなくしきい値で行う）→ 値は要確認 |
| 自己判定の採点 | 解答表示後に **○ / × の 2 ボタン**で自己採点。○ = 正解、× = 不正解として **ランクに算入**（他モードと同じ更新規則） |
| ランク反映タイミング | **既定は結果画面でまとめて反映**。設定で **「1 問ごとに即時反映」** にも切り替え可能 |
| 定着モード | **出題範囲モード**の一種。テスト開始時に選んだ**回答形式モードを引き継ぎ**、出題範囲の**全対象がそのモードで定着しきい値（既定: ランク 3）に達するまで**出題を続ける |
| 定着モードでの定着済み単語 | 完全除外せず **出題頻度を下げて**薄く再出題する（未定着語に集中しつつ復習も維持） |
| 通常テストでの定着済み単語 | **通常どおり出題する**（既定では除外しない） |
| 結果画面 | **詳細結果**（正解数 / 正答率、間違えた単語一覧（正解付き）、ランク変動）を表示 |
| 再挑戦 | 結果画面から **「間違えた単語だけ再挑戦」** 動線を用意 |
| 履歴 | テストごとの成績を **回答形式モード別に記録**して閲覧できる |

---

## 回答形式モード（5 種）詳細

すべて対象は **出題範囲内の単語**。出題対象・選択肢ともに **`scopedOwnerIds(user) = [system, user]`** の単語プールから引く（自分の単語＋システム共有単語）。

データ参照は `Word.headword`（英単語）/ `Meaning`（語義: 品詞・発音・注記）/ `MeaningText`（訳語: 実際の日本語テキスト）の関係を用いる。1 単語は複数 `Meaning` を持て、各 `Meaning` は複数 `MeaningText` を持つ（＝多義語）。

### ① 四択（語義選択） / `FOUR_CHOICE`
- **出題**: `headword` を提示。
- **解答**: 4 つの語義（日本語）から正しいものを 1 つ選ぶ。
- **採点**: 自動。正解の語義を選べば正解。
- **選択肢**: 正解 = 対象語の語義（代表 `MeaningText`）。誤答 3 = 他語の語義。
- **出題条件**: 対象語に `MeaningText` が 1 つ以上あること。

### ② 多義語（訳語の複数選択） / `POLYSEMY`
- **出題**: `headword` を提示。
- **解答**: 訳語候補（日本語）の一覧から、その単語の訳語を**すべて選ぶ**（select all that apply）。
- **採点**: 自動。対象語の訳語集合と完全一致で正解（過不足があれば不正解）。
- **選択肢**: 正解 = 対象語の全 `MeaningText`。ダミー = 他語の `MeaningText`。
- **出題条件**: 対象語に `MeaningText` が 1 つ以上あること（訳語が複数ある語ほど効果的）。

### ③ 綴り（日→英 記述） / `SPELLING`
- **出題**: 語義 / 訳語（日本語）を提示。
- **解答**: `headword` の綴りをテキスト入力。
- **採点**: 自動。入力と `headword` を正規化して一致判定（→ 判定基準は「未確定事項」）。
- **出題条件**: 対象語に `MeaningText` が 1 つ以上あること（提示用）。

### ④ 自己判定（英→日 / 意味想起） / `SELF_EN_JA`
- **出題**: `headword` を提示。意味を頭の中で想起。
- **解答**: 「解答を見る」で語義（日本語）を表示 → **○ / ×** で自己採点。
- **採点**: 自己判定。○ = 正解、× = 不正解としてランクに算入。

### ⑤ 自己判定（日→英 / 語想起） / `SELF_JA_EN`
- **出題**: 語義 / 訳語（日本語）を提示。英単語を頭の中で想起。
- **解答**: 「解答を見る」で `headword`（＋発音等）を表示 → **○ / ×** で自己採点。
- **採点**: 自己判定。○ = 正解、× = 不正解としてランクに算入。

---

## ランクシステム

- 単位は **(学習者ユーザー, 単語, 回答形式モード)**。値は **0 以上の整数（上限なし）**。
  - 注意: 単語はシステム共有（`owner_id = "system"`）でも、**ランクは学習者ごと**に持つ。ランク行のキーは単語の所有者ではなく**学習者**。
- 既定の更新規則:
  - 正解（自己判定は ○）: `rank = rank + 1`（上限なし）
  - 不正解（自己判定は ×）: `rank = max(rank - 2, 0)`（下限 0）
- 反映タイミング（ユーザー設定）:
  - `ON_RESULT`（**既定**）: テスト中は判定だけ蓄積し、結果画面でまとめてランクへ反映。
  - `PER_QUESTION`: 1 問回答するたび即時にランクへ反映。
- **定着済み** = ランクが**定着しきい値（既定: 3）以上**。上限を撤廃したため、「定着」は固定の最大値ではなく**しきい値以上**で判定する。

---

## 出題範囲モード

### 通常モード（`NORMAL`）
- 出題範囲（→ 範囲の指定方法は「未確定事項」）から、選んだ回答形式モードで出題。
- **定着済み（ランクが定着しきい値以上）の単語も通常どおり出題する**（既定では除外しない）。
- 問題数 / 出題順 → 「未確定事項」。

### 定着モード（`CONSOLIDATION`）
- テスト開始時に **回答形式モード 1 つ** と **出題範囲** を選ぶ。以後その回答形式を引き継ぐ。
- **打ち切り条件**: 出題範囲内の全対象が、そのモードで**定着しきい値（既定: ランク 3）に達するまで**出題を続ける。
- 定着済みの単語は **出題頻度を下げて**薄く混ぜる（完全除外しない）。未定着語（ランク < しきい値）を優先的・反復的に出題する。
- 不正解で −2 された語はしきい値を割ることがあり、再びしきい値まで積み直す必要がある（自然に反復される）。
- 1 回の定着モードを 1 セッションとして連続実行する想定（途中中断・再開の扱いは「未確定事項」）。

---

## 結果画面・履歴・再挑戦

### 結果画面（テスト終了時）
- サマリ: 正解数 / 出題数、正答率。
- 間違えた単語一覧: `headword` ＋ 正解（語義 / 訳語 / 綴り）を併記。
- ランク変動: モードごとの各単語の before → after（`ON_RESULT` ならここで初めて反映）。
- 動線: **「間違えた単語だけ再挑戦」**（同じ回答形式・誤答語のみで再テスト）。

### 履歴
- テスト 1 回 = 履歴 1 件。回答形式モード別に記録・絞り込みできる。
- 各件: 実施日時、回答形式モード、出題範囲モード、出題数 / 正解数 / 正答率。
- （詳細＝1 問単位の記録を残すかは下記データモデルの `TestSessionItem` 採否次第。）

---

## データモデル（提案 / Prisma）

既存規約に合わせる: cuid 主キー、`@map` でスネークケース列、`owner_id` 等。Prisma 7（driver adapter、`@/generated/prisma/client` から import）。

> 命名注意: 進捗・履歴の所有者は**学習者**を指すため、本モデルでは `userId` を用いる（単語側の `ownerId` とは別概念。システム共有単語に対しても学習者ごとの行を作る）。

```prisma
enum TestMode {
  FOUR_CHOICE  // 四択（語義選択）
  POLYSEMY     // 多義語（訳語複数選択）
  SPELLING     // 綴り（日→英）
  SELF_EN_JA   // 自己判定（英→日 / 意味想起）
  SELF_JA_EN   // 自己判定（日→英 / 語想起）
}

enum TestScopeMode {
  NORMAL
  CONSOLIDATION  // 定着モード
}

enum RankReflectTiming {
  ON_RESULT      // 結果画面でまとめて反映（既定）
  PER_QUESTION   // 1 問ごとに即時反映
}

/// (学習者, 単語, 回答形式モード) ごとのランク。0〜3。
model WordRank {
  id             String    @id @default(cuid())
  userId         String    @map("user_id")   // 学習者（単語所有者ではない）
  wordId         String    @map("word_id")
  mode           TestMode
  rank           Int       @default(0)        // 0 以上、上限なし
  correctCount   Int       @default(0) @map("correct_count")
  wrongCount     Int       @default(0) @map("wrong_count")
  lastAnsweredAt DateTime? @map("last_answered_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  word Word @relation(fields: [wordId], references: [id], onDelete: Cascade)

  @@unique([userId, wordId, mode])
  @@index([userId, mode])
  @@index([wordId])
  @@map("word_rank")
}

/// テスト 1 回 = 履歴 1 件。
model TestSession {
  id           String        @id @default(cuid())
  userId       String        @map("user_id")
  mode         TestMode
  scopeMode    TestScopeMode @default(NORMAL) @map("scope_mode")
  scope        Json?         // 出題範囲の指定（出典 ID 配列など）→ 未確定
  totalCount   Int           @map("total_count")
  correctCount Int           @default(0) @map("correct_count")
  startedAt    DateTime      @default(now()) @map("started_at")
  finishedAt   DateTime?     @map("finished_at")

  user  User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  items TestSessionItem[]

  @@index([userId, mode])
  @@index([userId, startedAt])
  @@map("test_session")
}

/// 1 問単位の記録（結果詳細・間違い再挑戦・履歴詳細用）。重ければフェーズ 2 送りも可。
model TestSessionItem {
  id         String  @id @default(cuid())
  sessionId  String  @map("session_id")
  wordId     String  @map("word_id")
  order      Int
  correct    Boolean
  rankBefore Int     @map("rank_before")
  rankAfter  Int     @map("rank_after")

  session TestSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  word    Word        @relation(fields: [wordId], references: [id], onDelete: Cascade)

  @@index([sessionId])
  @@index([wordId])
  @@map("test_session_item")
}

/// テストに関するユーザー設定。
model UserTestSetting {
  userId            String            @id @map("user_id")
  rankReflectTiming RankReflectTiming @default(ON_RESULT) @map("rank_reflect_timing")
  updatedAt         DateTime          @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_test_setting")
}
```

`User` 側に逆リレーション（`wordRanks` / `testSessions` / `userTestSetting`）、`Word` 側に `ranks` / `testSessionItems` を追加する。マイグレーションは新規 1 本（既存 SQL は編集しない）。

---

## 画面・ルート構成（提案 / 要確認）

| ルート | 役割 |
|---|---|
| `/test` | 開始画面。出題範囲モード（通常 / 定着）・回答形式モード・出題範囲・問題数を選んで開始 |
| `/test/session/[id]` | テスト実行（1 問ずつ）。自己判定は「解答を見る → ○/×」 |
| `/test/session/[id]/result` | 結果画面（サマリ・間違い一覧・ランク変動・再挑戦動線） |
| `/test/history` | 履歴一覧（モード別フィルタ） |
| `/settings`（既存に追記） | ランク反映タイミングの設定 |

保護方針は既存どおり: `proxy.ts` の matcher 追加＋各ページで `getCurrentSession()`。Server Action はオーナー（学習者）スコープを徹底。

---

## 未確定事項（実装前に確定する）

1. **出題範囲の指定方法**: 全単語 / 出典（`Occurrence`）単位 / ランクでの絞り込み（例: ランク < 3 のみ）など。出典がアプリの中心概念のため**出典単位を主軸に提案**するが要合意。`TestSession.scope` の表現（JSON か中間テーブルか）もここで決める。
2. **1 テストの問題数**: 固定 N / ユーザー指定 / 範囲全部。通常モードの既定値。
3. **出題順**: ランダム / 低ランク優先 / 登録順 など。
4. **四択・多義語の誤答（distractor）選定**: 同品詞優先か、ランダムか。重複・正解の混入防止規則。プールが少ない場合のフォールバック（選択肢が埋まらないとき）。
5. **綴りの正誤判定基準**: 前後 trim・大文字小文字無視・連続空白正規化での完全一致を**提案**。別綴り（米英差など）複数正解の許容、記号（ハイフン/アポストロフィ）の扱い。
6. **多義語モードの選択肢数**: 候補プールの総数、正解数の見せ方（正解数を提示するか）。
7. **各モードの出題可能条件の最終確定**: 訳語ゼロの単語の除外、システム単語の出題可否（既定は出す想定）。
8. **定着モードの中断・再開**: 1 セッション継続か、ラウンドで区切るか。ランク 3 到達語の「頻度を下げる」具体的な重み付け。
9. **`TestSessionItem` の採否**: 1 問単位記録を永続化するか（履歴詳細・再挑戦の永続化に必要だが容量増）。最小実装ではセッション内メモリのみで結果画面を作る選択肢もある。
10. **再挑戦のランク反映**: 「間違いだけ再挑戦」の結果も通常どおりランク更新する想定でよいか。
11. **定着しきい値**: 「定着済み」を判定するしきい値（既定 3）の値、および定数とするか `UserTestSetting` の設定項目とするか。ランク上限撤廃に伴い必須。

---

## 実装フェーズ分割（提案）

1. **データモデル**: 上記モデル＋マイグレーション、`WordRank` 読み書きの最小ヘルパー（`src/lib/test/*`）。ユニット/インテグレーションテストはコロケート（`*.unit.test.ts` / `*.integration.test.ts`）。
2. **出題エンジン**: 範囲→出題リスト生成、モード別の問題生成（選択肢・正解）、採点関数（pure 関数中心でユニットテスト）。
3. **通常テスト UI**: 開始画面 → 実行 → 結果（`ON_RESULT` 反映）。回答形式 5 種を順次。
4. **ランク反映タイミング設定** と `PER_QUESTION`。
5. **定着モード**（打ち切り・頻度調整）。
6. **履歴**（`TestSession` 一覧、必要なら `TestSessionItem` 詳細）。
7. **間違い再挑戦**。
