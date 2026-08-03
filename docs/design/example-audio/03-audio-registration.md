# 03. 音源の登録・削除と認可

状態: **確定**（2026-08-03）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 例文にも発音音源（mp3）を登録でき、未登録のときだけ TTS にフォールバックする（01 確定）。
- 対象は全例文種別（TARGET / PHRASE / MINIMAL / SENTENCE）で、音源登録を種別で絞らない（01 確定）。
- 例文音源の一括取り込みは行わず、登録は 1 件ずつの手動アップロードのみ（01 確定）。
- `Example` に `pronunciationAudioUrl String?` を追加する（`Meaning` / `RelatedWord` と同名・同型）（02 確定）。
- blob key は `audio/example/<exampleId>/pronunciation.mp3`（`AudioTarget.dir` = `"example"`）（02 確定）。
- 例文の本文・種別を編集しても音源は保持される（`upsertExamples` は音源カラムを触らない）（02 確定）。

## 検討事項リスト

- [x] `src/lib/pronunciation-audio.ts` の `AudioTarget` ディスクリプタへの example 追加 → 決定 1
- [x] アップロード・削除の入口（route / action）の配置と既存経路の再利用範囲 → 決定 2
- [x] system 所有の共通単語の例文に音源を登録できるか → 決定 3
- [x] blob を public 前提のまま例文音源に使ってよいか → 決定 4
- [x] 音源登録 UI の置き場 → 決定 5、フォーム値への載せ方 → 決定 6
- [x] 入力検証（mp3 のみ・サイズ上限など既存規約の継承） → 決定 7

## 議論・決定

### 決定 1: `exampleTarget` ディスクリプタを追加し、`pronunciation-audio.ts` のコアは無改造とする

`src/lib/pronunciation-audio.ts` に既存の `meaningTarget` / `relatedWordTarget` と同形の `exampleTarget` を追加する。実装は 4 フィールドのみ:

| フィールド | 内容 |
| --- | --- |
| `dir` | `"example"`（blob key は `audio/example/<exampleId>/pronunciation.mp3`。02 確定） |
| `loadOwned` | `prisma.example.findUnique({ where: { id }, select: { ownerId: true, pronunciationAudioUrl: true } })` |
| `writeUrl` | `prisma.example.update({ where: { id }, data: { pronunciationAudioUrl: url }, select: { id: true } })` |
| `notFound` | `() => new ExampleNotFoundError()`（`message: "EXAMPLE_NOT_FOUND"` を新設） |

公開 API も既存の命名規則に揃えて 2 本追加する。第 4 引数の `BlobClient` DI（ADR-0043）も既存どおり:

```ts
export function uploadExampleAudioForUser(userId: string, exampleId: string, file: File, blob: BlobClient = defaultBlobClient): Promise<{ url: string }>
export function deleteExampleAudioForUser(userId: string, exampleId: string, blob: BlobClient = defaultBlobClient): Promise<void>
```

共通コア（`loadOwnedRow` / `uploadAudio` / `deleteAudio` / `validateAudioFile` / `bestEffortDel`）は 1 行も変更しない。put → DB update → 旧 blob del の順序契約（ADR-0044）もそのまま継承する。

採用理由: `AudioTarget` は「どの行を読むか / どこに URL を書くか / blob パス接頭辞 / NotFound エラー型」の 4 点だけを差し替える拡張点としてすでに設計されており（`pronunciation-audio.ts` のディスクリプタ定義コメント）、例文はその 4 点以外に既存 2 種と違いがない。コアを触らないので、既存の認可・検証・順序契約に対する回帰リスクがゼロになる。

却下した代替案:
- **`loadOwned` / `writeUrl` を Prisma のモデル名文字列で汎用化する**（`prisma[modelName].findUnique(...)`）: ディスクリプタが 3 つに増えるだけで重複は 3 行程度しかなく、型安全性（Prisma の生成型による select 検証）を捨てる割に得るものがない。
- **`ExampleNotFoundError` を作らず `MeaningNotFoundError` を流用する**: エラー名が実体と食い違い、将来のログ調査で対象種別を判別できなくなる。既存 2 種が個別のエラー型を持つ非対称も生む。

### 決定 2: 入口は既存 Server Action ファイルに 2 action を追加する（新規 route handler は作らない）

`src/app/words/[id]/edit/actions.ts` に `uploadExampleAudio(exampleId, fd)` / `deleteExampleAudio(exampleId)` を追加する。既存の `runUpload` / `runDelete` ヘルパにサービス層関数を差し込む形で、セッション取得・`file instanceof File` チェック・Result 変換はすべて共有する。あわせて同ファイルの `mapAudioError` の `not_found` 分岐に `ExampleNotFoundError` を足す（`e instanceof MeaningNotFoundError || e instanceof RelatedWordNotFoundError || e instanceof ExampleNotFoundError`）。

`AudioActionError`（`"unauthorized" | "invalid" | "forbidden" | "not_found" | "unknown"`）とユーザー向けメッセージは既存のものをそのまま使い、増やさない。

CSRF は Server Action の same-origin 保護に依拠する（security-design-checklist「CSRF」）。route handler を新設しないため、この前提は現状のまま維持される。

採用理由: 音源の入口が 1 ファイルに集約されている現状を崩さない。単語編集フォーム内から呼ばれる点も既存 2 種と同じで、置き場を変える理由がない。

却下した代替案:
- **`(kind, id)` を引数に取る汎用 action 1 組にまとめて 6 action を 2 action に減らす**: `kind` が client 由来の文字列になるため、サーバー側で許可種別の検証を新設する必要が生じ、型で保証されていた対象がランタイム検証に格下げされる。action 数の削減は呼び出し側の記述量を減らさない（結局 `kind` を書く）。
- **アップロード用の route handler を新設する**: CSRF・認証を個別に設計し直す必要があり（同チェックリスト）、既存経路との二重管理になる。

### 決定 3: system 所有の共通例文には、一般ユーザーは音源を登録できない

既存の `loadOwnedRow`（`row.ownerId !== userId` の厳格一致）をそのまま適用する。`scopedOwnerIds` は使わない。結果として:

- 一般ユーザーが音源を登録・削除できるのは、**自分が追加した例文**（`ownerId = 自分`）のみ。
- system 所有の共通例文（target1900 由来の TG例文など）の音源は、**system としてログインしたときのみ**登録・差し替え・削除できる。
- UI 側でも system 所有行には音源欄自体を出さない（決定 5）。サーバー側は UI に依存せず `ForbiddenUpdateError` で弾く。

ユーザー体験上の含意: 共通単語の例文は多くがしばらく音源未登録のままになるが、その間は 01 確定の TTS フォールバックが効くため読み上げ自体は成立する。運用としては、見出し語音源と同様に system 側でまとめて登録していく。

採用理由: security-design-checklist の「read/write 非対称の維持」（read は `scopedOwnerIds`、write は自分の行のみ）を崩さない。例文本文は pass-through（ADR-0019）で一般ユーザーには編集できないのに音源だけ書けると、同じ行に対する読み書き権限が本文と音源で食い違い、row-policy を読んでも実際の権限が分からなくなる。加えて `pronunciationAudioUrl` は 1 行 1 値なので、共有行への書き込みを許すと「後から書いた人が他人（および system）の音源を上書きする」競合が構造的に発生する。

却下した代替案:
- **system 例文にも一般ユーザーが音源を書けるようにする**: 上記の読み書き非対称の崩れと上書き競合に加え、security-design-checklist 上は「row-policy 拡張案件」として `src/lib/words/policy/` に独立ルールを設ける規模の変更になる。例文音源のためだけに権限モデルを拡張する費用対効果が見合わない。
- **ユーザーごとの例文音源テーブルを別に持ち、共通例文にも自分用の音源を持てるようにする**: 上書き競合は解けるが、02 で確定した「`Example` に 1 カラム追加」というデータモデルを覆し、削除・orphan・manifest・purge の 6 経路すべてに別テーブルの取り回しが増える。MVP のスコープを超える。

### 決定 4: blob は既存どおり `access: "public"` + random suffix のまま使う

例文音源も `vercelBlobClient` の既定（`access: "public"`, `addRandomSuffix: true`）で保存する。private access 化やアクセス制御付き配信は導入しない。

採用理由: 保存されるのは例文英文を読み上げた mp3 で、個人情報ではなく学習コンテンツである。ユーザーが自作した例文の音源は非共有コンテンツだが、これは既存の意味・関連語の音源とまったく同じ性質であり、例文だけを別扱いする理由がない。URL は random suffix 付きで推測困難であり、DB 上の URL が外に出るのは認証済みの読み取り経路（単語詳細・一括プリフェッチの manifest）だけである。

却下した代替案:
- **private blob + 署名付き URL 配信**: 現行の `BlobClient` インターフェース（`put` / `del` のみ）と `<audio src>` 直参照の再生経路を作り替える必要があり、さらに一括プリフェッチ（02 確定）の Cache Storage 前提とも噛み合わない。既存音源を private 化しない限り例文だけ守っても全体の前提は変わらないため、やるなら音源機能全体の設計変更として別途扱う。

この決定は security-design-checklist「blob は public 前提」に対する明示的な受け入れである。

### 決定 5: 音源登録 UI は例文カードの例文テキスト直後に置き、`PronunciationAudioManager` を再利用する

`src/app/words/new/_components/examples-fields.tsx` の `ExampleCard` 内、例文（英文）Textarea の直後に「音源」`FormItem` を置く。中身は既存の `src/components/pronunciation-audio-manager.tsx` をそのまま使い、`onUpload` / `onDelete` に決定 2 の action を束縛する。`isSystemOwned` は既存の `useRowOwnership`、`exampleId` / `pronunciationAudioUrl` は `examples.${index}` のフォーム値（決定 6）から取る。表示条件も意味・関連語と同一の 2 段:

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

- system 所有行では欄ごと出さない（決定 3 のクライアント側の写し。強制はサーバー側）。
- 未保存の新規例文行（`id` 未確定）では「音源は保存してから追加できます。」を出す。音源はフォーム送信とは別経路の即時アップロードで、対象行の id が必要なため。
- `PronunciationAudioManager` の「試聴」は登録済み mp3 の確認再生であり、TTS フォールバックは効かせない。01 決定 5 のとおり編集フォームは読み上げ対象画面ではなく、ここで鳴るのは「いま登録した音源が正しいか」の確認に限られる。

採用理由: 読み上げ対象である英文のすぐ下に置くことで、どのテキストに対する音源かが迷いなく分かる。意味・関連語では発音記号とセットで「発音」`CollapsibleField` にまとめているが、01 確定で例文に発音記号を持たせないため、音源 1 項目のためだけに折りたたみ階層を作ると開閉の手間が増えるだけになる。

却下した代替案:
- **「発音」`CollapsibleField` を例文カードにも新設する**: 3 セクションで見出し名が揃う利点はあるが、中身が 1 項目の折りたたみは開くまで登録状況が分からず、既存音源の有無を確認するのに毎回クリックが要る。
- **カード最下部（補足説明の下）に置く**: 入力の流れは妨げないが、対象の英文から視覚的に離れ、例文が長いときに対応関係が読み取りにくい。

### 決定 6: `pronunciationAudioUrl` はフォーム値に載せるが、書き込み経路では常に無視する

`src/lib/schema/word-form.ts` の `exampleSchema` に `pronunciationAudioUrl: z.string().nullable().optional()` を追加し、`wordDetailToFormValues` の例文マッピングで `pronunciationAudioUrl: e.pronunciationAudioUrl` を渡す（`meaningSchema` / `relatedWordSchema` と同じ扱い）。

一方 `upsertExamples`（`src/lib/words/handlers/example-handler.ts`）は音源カラムを一切読み書きしない（02 確定）。フォーム値の `pronunciationAudioUrl` は **UI 表示専用の read-only pass-through** であり、`updateWord` 経由でクライアントから送られてきた値がサーバー側に反映される経路は存在しない。

採用理由: 既存の意味・関連語がまったく同じ構造で動いており、例文だけ別の値渡し方をする理由がない。書き込み側が触らないことで、クライアントが偽の URL を送っても DB に入らない（音源 URL を書ける唯一の経路は決定 2 の action → 決定 3 の owner 検証を通った `writeUrl` のみ）。

却下した代替案:
- **フォーム値に載せず、`ExampleCard` が別途 URL を取得する**: 単語詳細の取得を 2 回に増やすうえ、既存 2 種と構造が食い違う。

### 決定 7: 入力検証は既存の実装をそのまま共有する（mp3 のみ・4MB 上限）

サーバー側は `validateAudioFile`（`AUDIO_MIME = "audio/mpeg"` 完全一致 / 空ファイル拒否 / `MAX_AUDIO_BYTES = 4MB`）を共通コア経由でそのまま通す。決定 1 でコアを触らないため、検証は `loadOwnedRow` より前に走る（不正ファイルは DB 参照前に弾かれる）順序も自動的に継承される。クライアント側の事前検証も `PronunciationAudioManager` 内に実装済みのため、決定 5 の再利用で自動的に効く。例文用に別の上限・別の MIME は設けない。

採用理由: 例文音源は 1 文の読み上げで、見出し語（単語 1 語）より長いとはいえ数秒〜十数秒であり、4MB（`next.config.ts` の `bodySizeLimit: "4.5mb"` 内に収まる既存値）で十分に足りる。上限を種別ごとに変えると定数が増え、Server Action の body 上限との関係を 2 箇所で管理することになる。

却下した代替案:
- **例文用に上限を引き上げる**: Server Action の body 上限 4.5MB（Vercel Function のハード上限）が天井なので、引き上げ余地はほとんど無い。
