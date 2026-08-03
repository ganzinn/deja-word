# 例文読み上げ（example-audio） 設計ドキュメント（ハブ）

単語の例文の英文を読み上げ可能にする（発音音源の登録＋未登録時の TTS フォールバック）機能の設計ドキュメント群の入口。
**example-audio の設計に関わるセッションは、必ずこのファイルから読み始めること。**

対応 issue: [#170](https://github.com/ganzinn/deja-word/issues/170)

## 目的・スコープ

単語の例文（TG例文・成句/熟語・MP例文・例文）の英文を読み上げられるようにする。見出し語・関連語と同じく発音音源（mp3）を登録でき、未登録のときだけ端末内蔵の自動音声（TTS）にフォールバックする。単語を「見て覚える」だけでなく、例文の音でも定着させられるようにするのが狙い。

スコープの詳細（何をやる / やらない）は [01-requirements.md](01-requirements.md) で定義する。

## 確定事項サマリ

結論のみを記載する。採用理由・却下した代替案は各トピックファイルを参照。

- **読み上げ対象は例文の英文（`Example.text`）のみ**。和訳（`Example.meaning`）は読み上げない。→ [01](01-requirements.md)
- **対象は全例文種別（TARGET / PHRASE / MINIMAL / SENTENCE）**。読み上げ・音源登録を種別で絞らない。→ [01](01-requirements.md)
- **例文にも発音音源（mp3）を登録でき、未登録のときだけ TTS にフォールバックする**。見出し語・関連語と同じ音源優先の方針（ADR-0046）。→ [01](01-requirements.md)
- **例文に発音記号は持たせない**。→ [01](01-requirements.md)
- **対象画面は単語詳細（全種別）と単語テストの TG 形式（TG例文のみ）**。ボタンのラベルは既存どおり「発音」で、音源あり／自動音声の描き分け（ADR-0076）を効かせる。→ [01](01-requirements.md)
- **単語テスト TG 形式ではボタンを増やさず、いま見出し語を鳴らしているボタンの対象を TG例文へ差し替える**。→ [01](01-requirements.md)
- **例文音源の一括取り込みは行わない**。登録は 1 件ずつの手動アップロードのみ。→ [01](01-requirements.md)
- **TTS 読み上げ時のテキスト正規化に括弧規則を追加することをスコープに含む**（規則の詳細は 04）。→ [01](01-requirements.md)
- **`Example` に `pronunciationAudioUrl String?` を追加する**（`Meaning` / `RelatedWord` と同名・同型・index なし）。既存行は NULL 開始で backfill 不要。→ [02](02-data-model.md)
- **blob key は `audio/example/<exampleId>/pronunciation.mp3`**。`AudioTarget.dir` に `"example"` を置く。→ [02](02-data-model.md)
- **音源 URL を横断で扱う 6 経路すべてに Example を追加する**（`words-delete` / `words-update` の orphan / `admin-user-delete` / `occurrence-purge` / `blob-purge` / `audio-manifest`）。カラム追加・登録・削除経路は同一チケットで揃える。→ [02](02-data-model.md)
- **例文の編集では音源を保持し、フォームから消えた例文の音源は orphan として消す**。`upsertExamples` は音源カラムを触らず、`words-update` の orphan 収集に example を足す。→ [02](02-data-model.md)
- **`db:import-audio` は見出し語・関連語のまま変更しない**。purge 系（`occurrence-purge` / `blob-purge`）のみ例文に追随する。→ [02](02-data-model.md)
- **一括プリフェッチは「見出し語・関連語の音源」と「例文の音源」を分けてダウンロードできるようにする**。manifest はグループ別に URL と件数を返す。→ [02](02-data-model.md)
- **Cache Storage は 1 つのまま維持し、prune は両グループの和集合に対して行う**。グループ別 manifest だけで prune すると相手のキャッシュが消えるため。→ [02](02-data-model.md)
- **`pronunciation-audio.ts` に `exampleTarget` ディスクリプタと `uploadExampleAudioForUser` / `deleteExampleAudioForUser` を追加し、共通コアは無改造とする**。`ExampleNotFoundError` を新設。→ [03](03-audio-registration.md)
- **入口は `words/[id]/edit/actions.ts` に `uploadExampleAudio` / `deleteExampleAudio` を追加する**。route handler は新設せず、Server Action の same-origin 保護に依拠する。→ [03](03-audio-registration.md)
- **system 所有の共通例文の音源は system としてログインしたときのみ操作でき、一般ユーザーは自分が追加した例文にのみ登録できる**（`ownerId === userId` の厳格一致）。→ [03](03-audio-registration.md)
- **blob は既存どおり `access: "public"` + random suffix のまま使う**。private 化・署名付き配信は行わない。→ [03](03-audio-registration.md)
- **音源登録 UI は例文カードの例文テキスト直後に置き、`PronunciationAudioManager` を再利用する**。system 所有行では欄を出さず、未保存の新規行では「音源は保存してから追加できます。」を表示する。→ [03](03-audio-registration.md)
- **`pronunciationAudioUrl` は `exampleSchema` に載せるが UI 表示専用**。`upsertExamples` は読み書きせず、音源 URL を書ける経路は専用 action のみ。→ [03](03-audio-registration.md)
- **入力検証は既存の `validateAudioFile`（audio/mpeg 限定・空ファイル拒否・4MB 上限）をそのまま共有する**。例文用の別上限は設けない。→ [03](03-audio-registration.md)

## トピック状態表

状態: `未着手` → `議論中` → `確定`

| ファイル | 状態 | 要約 |
| --- | --- | --- |
| [01-requirements.md](01-requirements.md) | 確定 | 要求・ユースケース・スコープ外 |
| [02-data-model.md](02-data-model.md) | 確定 | Example の音源カラム、削除 / orphan / manifest / purge の横断影響 |
| [03-audio-registration.md](03-audio-registration.md) | 確定 | アップロード・削除の経路、AudioTarget 拡張、認可、blob の公開前提 |
| [04-speech-normalization.md](04-speech-normalization.md) | 未着手 | 読み上げ時の括弧 (…) / […] の正規化 |
| [05-ui-playback.md](05-ui-playback.md) | 未着手 | 単語詳細・単語テストの発音ボタン、TG 例文への差し替え、自動再生 / プリロード |
| [06-architecture.md](06-architecture.md) | 未着手 | モジュール構成・データフロー・テスト戦略 |

想定順序（残り）: 04 → 05 → 06。要求次第で入れ替え可。

**次セッションの推奨トピック: 04（読み上げ時のテキスト正規化）**。引き継ぎ論点: (1) 01 でスコープに含めた括弧規則の詳細（`(…)` と `[…]` をそれぞれ読み飛ばすか読むか、種別ごとに変えるか）、(2) 正規化を適用する対象の範囲（TTS 読み上げのみか、既存の見出し語・関連語の読み上げにも及ぶか＝既存挙動の変更になるか）、(3) 正規化関数の置き場と純関数化（既存の読み上げ経路のどこに挟むか。テストしやすさの観点で unit テスト対象の純関数に切り出せるか）、(4) 例文特有の記号（省略記号・話者記号・引用符など）が括弧以外にもあるか。

## セッション運用ルール

1. **読み込みは「ハブ + 対象トピック1ファイル」に限定する**。他のトピックファイルは原則読まない。依存する決定は各ファイル冒頭の「前提」に再掲されている。
2. **仕様書・設計書に記載した後は、毎回必ず整合性レビューを実施する**（成立しない記述・二重定義・決定間の矛盾・曖昧なシグネチャ等。観点は design-session スキル参照）。修正してから次へ進む。
3. **セッション終了（クリア）前に、このファイルの状態表と確定事項サマリを必ず更新する**。これが次セッションへの引き継ぎとなる。
4. **議論の過程・却下案・採用理由はトピックファイルに残し、ハブには昇格させない**。ハブには結論のみ（各1〜3行）を書く。
5. **既存の確定事項を覆す場合は、ハブのサマリと元トピックファイルの両方を更新する**。あわせて、その決定を「前提」に再掲している他ファイルも更新する。
6. 全トピック確定後、ハブに「実装への引き継ぎ」セクションを追記して設計を閉じる。実装フェーズの分割計画は別途 `docs/plan/` で扱う（このディレクトリは設計のみ）。
