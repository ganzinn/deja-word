# 02. example-audio-upload-ui（音源の登録 UI と Server Action）

状態: **未着手**　PR: （未作成）

## 目的

単語編集フォームの例文カードから、例文の発音音源（mp3）を 1 件ずつアップロード・削除できるようにする。入口は既存の Server Action ファイルへの 2 action 追加とし、UI は `PronunciationAudioManager` を再利用する。

スコープ外:

- サービス層（`uploadExampleAudioForUser` / `deleteExampleAudioForUser`）と認可・検証の実装（→ 01。本チケットは呼ぶだけ）。設計は 01 と同一チケットを想定していたが、PR サイズの都合で分割した（設計の意図が保たれる理由は [plan ハブ](README.md#01-と-02-の分割について設計の着手順序ヒントとの差分)を参照）
- 単語詳細・単語テストでの再生（→ 04 / 05）
- 例文音源の一括取り込み。登録は 1 件ずつの手動アップロードのみで、一括取り込み経路は作らない（[01-requirements.md](../../design/example-audio/01-requirements.md) 決定 7）
- `upsertExamples`（`src/lib/words/handlers/example-handler.ts`）の変更。音源カラムは触らないまま（[03-audio-registration.md](../../design/example-audio/03-audio-registration.md) 決定 6）

## 依存チケット

- 01: `uploadExampleAudioForUser` / `deleteExampleAudioForUser` と `ExampleNotFoundError`、および `Example.pronunciationAudioUrl` カラムを使う

## 前提（設計決定の再掲）

- 入口は `src/app/words/[id]/edit/actions.ts` に `uploadExampleAudio(exampleId, fd)` / `deleteExampleAudio(exampleId)` を追加する。**新規 route handler は作らない**。既存の `runUpload` / `runDelete` ヘルパにサービス層関数を差し込む形で、セッション取得・`file instanceof File` チェック・Result 変換をすべて共有する。CSRF は Server Action の same-origin 保護に依拠する（[03-audio-registration.md](../../design/example-audio/03-audio-registration.md) 決定 2）
- 同ファイルの `mapAudioError` の `not_found` 分岐に `ExampleNotFoundError` を足す（`e instanceof MeaningNotFoundError || e instanceof RelatedWordNotFoundError || e instanceof ExampleNotFoundError`）。`AudioActionError`（`"unauthorized" | "invalid" | "forbidden" | "not_found" | "unknown"`）とユーザー向けメッセージは既存のものをそのまま使い、**増やさない**（[03-audio-registration.md](../../design/example-audio/03-audio-registration.md) 決定 2）
- `src/lib/schema/word-form.ts` の `exampleSchema` に `pronunciationAudioUrl: z.string().nullable().optional()` を追加し、`wordDetailToFormValues` の例文マッピングで `pronunciationAudioUrl: e.pronunciationAudioUrl` を渡す（`meaningSchema` / `relatedWordSchema` と同じ扱い）。フォーム値の `pronunciationAudioUrl` は **UI 表示専用の read-only pass-through** で、`updateWord` 経由でクライアントから送られた値がサーバー側に反映される経路は存在しない（音源 URL を書ける唯一の経路は本チケットの action → 01 の owner 検証を通った `writeUrl` のみ）（[03-audio-registration.md](../../design/example-audio/03-audio-registration.md) 決定 6）
- 音源登録 UI は `src/app/words/new/_components/examples-fields.tsx` の `ExampleCard` 内、例文（英文）Textarea の**直後**に「音源」`FormItem` として置く。中身は `src/components/pronunciation-audio-manager.tsx` を**無改造で**再利用し、`onUpload` / `onDelete` に上記 action を束縛する。`isSystemOwned` は既存の `useRowOwnership`、`exampleId` / `pronunciationAudioUrl` はフォーム値 `examples.${index}` から取る（[03-audio-registration.md](../../design/example-audio/03-audio-registration.md) 決定 5）

  ```tsx
  {!isSystemOwned ? (
    <FormItem>
      <FormLabel>音源</FormLabel>
      {exampleId ? (
        <PronunciationAudioManager
          value={pronunciationAudioUrl}
          onUpload={(fd) => uploadExampleAudio(exampleId, fd)}
          onDelete={() => deleteExampleAudio(exampleId)}
        />
      ) : (
        <p className="text-muted-foreground text-xs">音源は保存してから追加できます。</p>
      )}
    </FormItem>
  ) : null}
  ```

- 表示条件は意味・関連語と同一の 2 段（[03-audio-registration.md](../../design/example-audio/03-audio-registration.md) 決定 5）
  - system 所有行では欄ごと出さない（決定 3 のクライアント側の写しで、強制はサーバー側）
  - 未保存の新規例文行（`id` 未確定）では「音源は保存してから追加できます。」を出す（音源はフォーム送信とは別経路の即時アップロードで、対象行の id が必要なため）
- 発音記号の入力欄は追加しない。例文に発音記号は持たせないため、音源 1 項目のために「発音」`CollapsibleField` を新設せず、`FormItem` 単体で置く（[01-requirements.md](../../design/example-audio/01-requirements.md) 決定 4、[03-audio-registration.md](../../design/example-audio/03-audio-registration.md) 決定 5）
- `PronunciationAudioManager` の「試聴」は登録済み mp3 の確認再生であり、**TTS フォールバックは効かせない**（編集フォームは読み上げ対象画面ではない）（[03-audio-registration.md](../../design/example-audio/03-audio-registration.md) 決定 5、[01-requirements.md](../../design/example-audio/01-requirements.md) 決定 5）
- クライアント側の事前検証（audio/mpeg 限定・4MB 上限）は `PronunciationAudioManager` 内に実装済みで、再利用により自動的に効く（[03-audio-registration.md](../../design/example-audio/03-audio-registration.md) 決定 7）

## 実装内容

### 変更: `src/app/words/[id]/edit/actions.ts`

- `uploadExampleAudio(exampleId: string, fd: FormData)` / `deleteExampleAudio(exampleId: string)` を追加する。既存の音源 4 action（意味・関連語）と同じく `runUpload` / `runDelete` ヘルパを通し、サービス層に `uploadExampleAudioForUser` / `deleteExampleAudioForUser` を差し込む。
- `mapAudioError` の `not_found` 分岐に `ExampleNotFoundError` を追加する。`AudioActionError` の値とメッセージは増やさない。

### 変更: `src/lib/schema/word-form.ts`

- `exampleSchema` に `pronunciationAudioUrl: z.string().nullable().optional()` を追加する。
- `wordDetailToFormValues` の例文マッピングに `pronunciationAudioUrl: e.pronunciationAudioUrl` を追加する。

### 変更: `src/app/words/new/_components/examples-fields.tsx`

`ExampleCard` の例文（英文）Textarea 直後に、前提のコードブロックのとおり「音源」`FormItem` を挿入する。`PronunciationAudioManager` は無改造で使う。

## 完了条件（Definition of Done）

- [ ] **テストは新設しない**。Server Action 層のテストは既存でも音源 4 action に無く、本機能でも追加しない。認可・検証はサービス層のテスト（01）で担保されている。コンポーネントテストも新設しない（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 5）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が通る（既存テストの回帰がないこと）
- [ ] 手動確認（`pnpm dev`）:
  - [ ] 自分が追加した単語の編集画面で、例文カードの英文直後に「音源」欄が出る。mp3 をアップロードでき、試聴・削除・差し替えができる
  - [ ] 例文を追加した直後の未保存行では「音源は保存してから追加できます。」が出る。保存後に再度開くと音源欄が使える
  - [ ] system 所有の共通単語（system 由来の例文）の編集画面では、例文カードに音源欄が出ない
  - [ ] 音源を登録した例文の本文・種別を編集して保存しても、音源が残る
  - [ ] mp3 以外のファイル・4MB 超のファイルがクライアント側で弾かれる

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
