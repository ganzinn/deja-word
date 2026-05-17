import { ChevronLeftIcon, LinkIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { exampleKindLabels, type ExampleKind } from "@/lib/mock/example-kinds";
import { commonPartOfSpeechFullLabel } from "@/lib/mock/parts-of-speech";
import { relatedWordKindLabels } from "@/lib/mock/related-word-kinds";
import { getCurrentSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { countIncomingLinksForUser } from "@/lib/words-delete";
import { getWordDetailForUser, type WordDetail } from "@/lib/words-detail";

import { DeleteWordButton } from "./_components/delete-word-button";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function WordDetailPage({ params }: PageProps) {
  const { id } = await params;

  const session = await getCurrentSession();
  if (!session) redirect(`/sign-in?redirect=/words/${id}`);

  const word = await getWordDetailForUser(session.user.id, id);
  if (!word) notFound();

  const canEdit = word.ownerId === session.user.id;
  const incomingLinkCount = canEdit ? await countIncomingLinksForUser(session.user.id, id) : 0;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-0 pb-16 md:max-w-2xl">
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-3 backdrop-blur">
        <Link
          href="/dashboard"
          aria-label="戻る"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ChevronLeftIcon />
        </Link>
        <h1 className="truncate text-base font-semibold">{word.headword}</h1>
        {canEdit ? (
          <div className="ml-auto flex items-center gap-1">
            <Link
              href={`/words/${id}/edit`}
              aria-label="編集"
              className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
            >
              <PencilIcon />
            </Link>
            <DeleteWordButton
              wordId={id}
              headword={word.headword}
              incomingLinkCount={incomingLinkCount}
            />
          </div>
        ) : null}
      </header>

      <div className="flex flex-col gap-6 px-4 pt-6">
        <h2 className="text-2xl font-bold tracking-tight break-words">{word.headword}</h2>

        {word.meanings.length > 0 ? (
          <Section title="意味">
            <div className="flex flex-col gap-3">
              {word.meanings.map((m) => (
                <MeaningCard key={m.id} meaning={m} />
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
    </main>
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

function MeaningCard({ meaning }: { meaning: WordDetail["meanings"][number] }) {
  const partOfSpeech = nonEmpty(meaning.partOfSpeech);
  const pronunciation = nonEmpty(meaning.pronunciation);
  const note = nonEmpty(meaning.note);
  return (
    <div className="border-border bg-card/50 flex flex-col gap-2 rounded-lg border p-3">
      {partOfSpeech || pronunciation ? (
        <div className="flex flex-wrap items-center gap-2">
          {partOfSpeech ? (
            <Badge variant="outline">{commonPartOfSpeechFullLabel(partOfSpeech)}</Badge>
          ) : null}
          {pronunciation ? (
            <span className="text-muted-foreground font-mono text-xs">{pronunciation}</span>
          ) : null}
        </div>
      ) : null}
      {meaning.texts.length === 1 ? (
        <p className="text-sm whitespace-pre-wrap">{meaning.texts[0].text}</p>
      ) : meaning.texts.length > 1 ? (
        <ul className="ml-4 list-disc text-sm">
          {meaning.texts.map((t) => (
            <li key={t.id} className="whitespace-pre-wrap">
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
      {wordOccurrence.details.length > 0 ? (
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
