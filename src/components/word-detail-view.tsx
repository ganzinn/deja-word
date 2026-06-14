import { LinkIcon } from "lucide-react";
import Link from "next/link";

import { AudioPlayButton } from "@/components/audio-play-button";
import { Badge } from "@/components/ui/badge";
import { exampleKindLabels, type ExampleKind } from "@/lib/mock/example-kinds";
import { commonPartOfSpeechFullLabel } from "@/lib/mock/parts-of-speech";
import { relatedWordKindLabels } from "@/lib/mock/related-word-kinds";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import type { WordDetail } from "@/lib/words-detail";

export function WordDetailView({ word }: { word: WordDetail }) {
  return (
    <div className="flex flex-col gap-6 px-4 pt-6">
      <div className="flex items-start gap-2">
        <h2 className="text-2xl font-bold tracking-tight break-words">{word.headword}</h2>
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
              <MeaningCard key={m.id} meaning={m} isFirst={i === 0} />
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
              <RelatedWordCard key={r.id} related={r} />
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
                className="border-border bg-card/50 rounded-lg border p-3 text-sm whitespace-pre-wrap"
              >
                {m.text}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="text-sm whitespace-pre-wrap">{children}</div>
    </div>
  );
}

function MeaningCard({
  meaning,
  isFirst,
}: {
  meaning: WordDetail["meanings"][number];
  isFirst: boolean;
}) {
  const partOfSpeech = nonEmpty(meaning.partOfSpeech);
  const pronunciation = nonEmpty(meaning.pronunciation);
  const pronunciationAudioUrl = nonEmpty(meaning.pronunciationAudioUrl);
  const note = nonEmpty(meaning.note);
  return (
    <div className="border-border bg-card/50 flex flex-col gap-2 rounded-lg border p-3">
      {partOfSpeech || pronunciation || pronunciationAudioUrl ? (
        <div className="flex flex-wrap items-center gap-2">
          {partOfSpeech ? (
            <Badge variant="outline">{commonPartOfSpeechFullLabel(partOfSpeech)}</Badge>
          ) : null}
          {pronunciation ? (
            <span className="text-muted-foreground font-mono text-xs">{pronunciation}</span>
          ) : null}
          <AudioPlayButton src={pronunciationAudioUrl} label="発音" />
        </div>
      ) : null}
      {meaning.texts.length === 1 ? (
        <p className={`text-sm whitespace-pre-wrap ${isFirst ? "text-red-500" : ""}`}>
          {meaning.texts[0].text}
        </p>
      ) : meaning.texts.length > 1 ? (
        <ul className="ml-4 list-disc text-sm">
          {meaning.texts.map((t, i) => (
            <li
              key={t.id}
              className={`whitespace-pre-wrap ${isFirst && i === 0 ? "text-red-500" : ""}`}
            >
              {t.text}
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <Field label="補足">{note}</Field> : null}
    </div>
  );
}

const exampleSectionOrder: ExampleKind[] = ["TARGET", "PHRASE", "MINIMAL", "SENTENCE"];

function ExampleCard({ example }: { example: WordDetail["examples"][number] }) {
  const meaning = nonEmpty(example.meaning);
  const note = nonEmpty(example.note);
  return (
    <div className="border-border bg-card/50 flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-sm whitespace-pre-wrap">{example.text}</p>
      {meaning ? (
        <p className="text-muted-foreground text-sm whitespace-pre-wrap">{meaning}</p>
      ) : null}
      {note ? <Field label="補足">{note}</Field> : null}
    </div>
  );
}

function RelatedWordCard({ related }: { related: WordDetail["relatedWords"][number] }) {
  const partOfSpeech = nonEmpty(related.partOfSpeech);
  const pronunciation = nonEmpty(related.pronunciation);
  const meaning = nonEmpty(related.meaning);
  const note = nonEmpty(related.note);
  return (
    <div className="border-border bg-card/50 flex flex-col gap-2 rounded-lg border p-3">
      {related.kind || partOfSpeech || pronunciation ? (
        <div className="flex flex-wrap items-center gap-2">
          {related.kind ? (
            <Badge variant="secondary">{relatedWordKindLabels[related.kind]}</Badge>
          ) : null}
          {partOfSpeech ? (
            <Badge variant="outline">{commonPartOfSpeechFullLabel(partOfSpeech)}</Badge>
          ) : null}
          {pronunciation ? (
            <span className="text-muted-foreground font-mono text-xs">{pronunciation}</span>
          ) : null}
        </div>
      ) : null}
      {related.linkedWord ? (
        <Link
          href={`/words/${related.linkedWord.id}`}
          className="text-primary inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
        >
          <LinkIcon className="size-3.5" />
          <span className="whitespace-pre-wrap">{related.term}</span>
        </Link>
      ) : (
        <p className="text-sm whitespace-pre-wrap">{related.term}</p>
      )}
      {meaning ? (
        <p className="text-muted-foreground text-sm whitespace-pre-wrap">{meaning}</p>
      ) : null}
      {note ? <Field label="補足">{note}</Field> : null}
    </div>
  );
}

function OccurrenceCard({
  wordOccurrence,
}: {
  wordOccurrence: WordDetail["wordOccurrences"][number];
}) {
  return (
    <div className="border-border bg-card/50 flex flex-col gap-2 rounded-lg border p-3">
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
          {wordOccurrence.details[0].detail}
        </p>
      ) : wordOccurrence.details.length > 1 ? (
        <ul className="text-muted-foreground ml-4 list-disc text-sm">
          {wordOccurrence.details.map((d) => (
            <li key={d.id} className="whitespace-pre-wrap">
              {d.detail}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function nonEmpty(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
