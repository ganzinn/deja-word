import { LinkIcon } from "lucide-react";
import Link from "next/link";

import { MeaningText } from "@/components/meaning-text";
import { detailCardClassName, PronunciationCard } from "@/components/pronunciation-card";
import { RichText } from "@/components/rich-text";
import { TgExampleMeaning, TgExampleText } from "@/components/tg-example-text";
import { Badge } from "@/components/ui/badge";
import { exampleKindLabels, type ExampleKind } from "@/lib/mock/example-kinds";
import { commonPartOfSpeechFullLabel } from "@/lib/mock/parts-of-speech";
import { relatedWordKindLabels } from "@/lib/mock/related-word-kinds";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import type { WordDetail } from "@/lib/words-detail";

export function WordDetailView({
  word,
  occurrenceNumber = null,
  onSelectRelated,
}: {
  word: WordDetail;
  /**
   * 掲載箇所コンテキストで開いたときの、その掲載箇所での掲載番号。見出し語の右に `#N` として出す
   * （「掲載箇所」セクションのカードと同じ表記）。コンテキスト無し・番号なしのときは null。
   */
  occurrenceNumber?: number | null;
  /**
   * 関連語（linkedWord あり）タップ時のコールバック。渡されたとき（ダイアログ内表示）は
   * ページ遷移せずこのコールバックで表示を切り替える。未指定（ページ表示）では従来の `<Link>` 遷移。
   */
  onSelectRelated?: (wordId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6 px-4 pt-6">
      <div className="flex items-start gap-2">
        {/* 見出し語と掲載番号はベースラインで揃える（外側は MY バッジを上端に置くため items-start）。
            番号は text-xl（見出し語 text-2xl の約 0.85 倍 = 「掲載箇所」カードの本文:番号と同じ比率） */}
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="font-content text-2xl font-bold tracking-tight break-words">
            {word.headword}
          </h2>
          {occurrenceNumber !== null ? (
            <span className="text-muted-foreground font-mono text-xl">#{occurrenceNumber}</span>
          ) : null}
        </div>
        {word.ownerId === SYSTEM_USER_ID ? null : (
          <Badge variant="secondary" className="mt-1 ml-auto shrink-0">
            MY
          </Badge>
        )}
      </div>

      {word.meanings.length > 0 ? (
        <Section title="意味">
          <div className="flex flex-col gap-3">
            {word.meanings.map((m, i) => (
              <MeaningCard key={m.id} meaning={m} headword={word.headword} isFirst={i === 0} />
            ))}
          </div>
        </Section>
      ) : null}

      {exampleSectionOrder.map((kind) => {
        const items = word.examples.filter((e) => e.kind === kind);
        if (items.length === 0) return null;
        return (
          <Section key={kind} title={exampleKindLabels[kind]}>
            <div className="flex flex-col gap-3">
              {items.map((e) => (
                <ExampleCard key={e.id} example={e} />
              ))}
            </div>
          </Section>
        );
      })}

      {word.relatedWords.length > 0 ? (
        <Section title="関連語">
          <div className="flex flex-col gap-3">
            {word.relatedWords.map((r) => (
              <RelatedWordCard key={r.id} related={r} onSelectRelated={onSelectRelated} />
            ))}
          </div>
        </Section>
      ) : null}

      {word.memos.length > 0 ? (
        <Section title="メモ">
          <ul className="flex flex-col gap-2">
            {word.memos.map((m) => (
              <li
                key={m.id}
                className="border-border bg-card/50 font-content rounded-lg border p-3 text-sm whitespace-pre-wrap"
              >
                <RichText text={m.text} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {word.wordOccurrences.length > 0 ? (
        <Section title="掲載箇所">
          <div className="flex flex-col gap-3">
            {word.wordOccurrences.map((wo) => (
              <OccurrenceCard key={wo.id} wordOccurrence={wo} />
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function MeaningCard({
  meaning,
  headword,
  isFirst,
}: {
  meaning: WordDetail["meanings"][number];
  headword: string;
  isFirst: boolean;
}) {
  const partOfSpeech = nonEmpty(meaning.partOfSpeech);
  const pronunciation = nonEmpty(meaning.pronunciation);
  const pronunciationAudioUrl = nonEmpty(meaning.pronunciationAudioUrl);
  return (
    // 2 個目以降の意味では自動音声フォールバックを使わない（`ttsText` を渡さない）ため、
    // 音源が登録されているときだけ鳴る（バッジも出る）。意味（品詞）が違えばアクセント・発音も
    // 異なりうる（`record` 名/動 など）が、自動音声は見出し語を一律に読むだけで
    // 「その意味の発音」にはならず、誤った発音を覚えさせうる。意味固有の発音は登録済み音源
    // でしか表せない、という位置づけ。先頭の意味は単語自体の代表発音として従来どおり扱う。
    <PronunciationCard
      src={pronunciationAudioUrl}
      label="発音"
      ttsText={isFirst ? headword : null}
      meta={
        <>
          {partOfSpeech ? (
            <Badge variant="outline" className="text-muted-foreground">
              {commonPartOfSpeechFullLabel(partOfSpeech)}
            </Badge>
          ) : null}
          {pronunciation ? (
            <span className="text-muted-foreground font-pronunciation text-xs">
              [{pronunciation}]
            </span>
          ) : null}
        </>
      }
    >
      {meaning.texts.length === 1 ? (
        <p className={`text-sm whitespace-pre-wrap ${isFirst ? "font-bold text-red-400" : ""}`}>
          <MeaningText text={meaning.texts[0].text} />
        </p>
      ) : meaning.texts.length > 1 ? (
        <ul className="list-none text-sm leading-normal">
          {meaning.texts.map((t, i) => (
            <li
              key={t.id}
              className={`whitespace-pre-wrap ${isFirst && i === 0 ? "font-bold text-red-400" : ""}`}
            >
              <MeaningText text={t.text} />
            </li>
          ))}
        </ul>
      ) : null}
      <NotesView notes={meaning.notes} />
    </PronunciationCard>
  );
}

const exampleSectionOrder: ExampleKind[] = ["TARGET", "PHRASE", "MINIMAL", "SENTENCE"];

function ExampleCard({ example }: { example: WordDetail["examples"][number] }) {
  const meaning = nonEmpty(example.meaning);
  const isTarget = example.kind === "TARGET";
  return (
    <PronunciationCard src={example.pronunciationAudioUrl} label="発音" ttsText={example.text}>
      <p className="text-sm whitespace-pre-wrap">
        {isTarget ? <TgExampleText text={example.text} /> : <RichText text={example.text} />}
      </p>
      {meaning ? (
        <p className="text-sm whitespace-pre-wrap">
          {isTarget ? (
            <TgExampleMeaning text={meaning} />
          ) : (
            <span className="text-muted-foreground">
              <RichText text={meaning} />
            </span>
          )}
        </p>
      ) : null}
      <NotesView notes={example.notes} />
    </PronunciationCard>
  );
}

const relatedLinkClassName =
  "text-primary inline-flex items-center gap-1 text-base font-semibold underline-offset-4 hover:underline";

function RelatedWordCard({
  related,
  onSelectRelated,
}: {
  related: WordDetail["relatedWords"][number];
  onSelectRelated?: (wordId: string) => void;
}) {
  const partOfSpeech = nonEmpty(related.partOfSpeech);
  const pronunciation = nonEmpty(related.pronunciation);
  // 関連語自身の音源が無くても、他の英単語にリンクされていればその単語の音源で発音できる
  // （リンク先は同じ見出し語なので発音も同じ）。関連語に音源が登録されていればそちらが優先。
  const pronunciationAudioUrl =
    nonEmpty(related.pronunciationAudioUrl) ??
    nonEmpty(related.linkedWord?.meanings[0]?.pronunciationAudioUrl);
  const meaning = nonEmpty(related.meaning);
  return (
    <PronunciationCard
      src={pronunciationAudioUrl}
      label="発音"
      ttsText={related.term}
      meta={
        <>
          {related.kind ? (
            <Badge variant="secondary">{relatedWordKindLabels[related.kind]}</Badge>
          ) : null}
          {pronunciation ? (
            <span className="text-muted-foreground font-pronunciation text-xs">
              [{pronunciation}]
            </span>
          ) : null}
        </>
      }
    >
      {related.linkedWord ? (
        onSelectRelated ? (
          <button
            type="button"
            onClick={() => onSelectRelated(related.linkedWord!.id)}
            className={`${relatedLinkClassName} text-left`}
          >
            <LinkIcon className="size-3.5 shrink-0" />
            <span className="whitespace-pre-wrap">{related.term}</span>
          </button>
        ) : (
          <Link href={`/words/${related.linkedWord.id}`} className={relatedLinkClassName}>
            <LinkIcon className="size-3.5" />
            <span className="whitespace-pre-wrap">{related.term}</span>
          </Link>
        )
      ) : (
        <p className="text-base font-semibold whitespace-pre-wrap">{related.term}</p>
      )}
      {partOfSpeech || meaning ? (
        <div className="flex items-start gap-2">
          {partOfSpeech ? (
            <Badge variant="outline" className="text-muted-foreground shrink-0">
              {commonPartOfSpeechFullLabel(partOfSpeech)}
            </Badge>
          ) : null}
          {meaning ? (
            <p className="text-foreground text-sm whitespace-pre-wrap">
              <RichText text={meaning} />
            </p>
          ) : null}
        </div>
      ) : null}
      <NotesView notes={related.notes} />
    </PronunciationCard>
  );
}

function OccurrenceCard({
  wordOccurrence,
}: {
  wordOccurrence: WordDetail["wordOccurrences"][number];
}) {
  return (
    // 発音は無いので `PronunciationCard` は使わないが、枠は他のカードと同じ見た目に揃える。
    <div className={detailCardClassName}>
      <p className="text-sm font-medium">
        {wordOccurrence.occurrence.location}
        {wordOccurrence.occurrenceNumber !== null ? (
          <span className="text-muted-foreground ml-2 font-mono text-xs">
            #{wordOccurrence.occurrenceNumber}
          </span>
        ) : null}
      </p>
      {wordOccurrence.details.length === 1 ? (
        <p className="text-muted-foreground text-sm whitespace-pre-wrap">
          <RichText text={wordOccurrence.details[0].detail} />
        </p>
      ) : wordOccurrence.details.length > 1 ? (
        <ul className="text-muted-foreground ml-4 list-disc text-sm">
          {wordOccurrence.details.map((d) => (
            <li key={d.id} className="whitespace-pre-wrap">
              <RichText text={d.detail} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// 補足説明（複数可）の表示。意味テキストと同様、1 件は段落・2 件以上は箇条書きにする。
function NotesView({ notes }: { notes: ReadonlyArray<{ id: string; text: string }> }) {
  if (notes.length === 1) {
    return (
      <p className="text-muted-foreground text-sm whitespace-pre-wrap">
        <RichText text={notes[0].text} />
      </p>
    );
  }
  if (notes.length > 1) {
    return (
      <ul className="text-muted-foreground marker:text-muted-foreground ml-4 list-disc text-sm leading-normal marker:text-[0.5rem]">
        {notes.map((n) => (
          <li key={n.id} className="whitespace-pre-wrap">
            <RichText text={n.text} />
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

function nonEmpty(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
