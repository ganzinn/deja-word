// 問題生成・drill ラウンド生成が使う素材型と取得行のパーティション純関数
// （docs/adr/0030-dummy-pool-bounded-fetch.md。プレビューはこの分割を使わず件数のみ取得する）。
// 取得クエリ `fetchQuizSource` は別ファイル。本ファイルは DB 非依存。

import { isTgExampleFormat } from "@/lib/quiz/format-options";
import type { QuizFormat } from "@/generated/prisma/enums";
import type { JaEnPrompt, MeaningDisplay, QuestionBase } from "@/lib/quiz/payload";

/**
 * `fetchQuizSource` が返す 1 行（ユーザーの可視単語）。
 * 非 TG 形式は MeaningText 1 件以上が前提だが、TG 例文形式では meaning 空の単語（meanings=[]）も
 * 「使える TG 例文を持つ」なら出題対象になりうる。表示は tgExample と headword で完結する。
 */
export type QuizSourceRow = {
  id: string;
  headword: string;
  /** sortOrder 順。先頭が「最初の Meaning」。 */
  meanings: {
    partOfSpeech: string | null;
    pronunciationAudioUrl: string | null;
    texts: { text: string }[];
  }[];
};

export type QuizMeaning = {
  partOfSpeech: string | null;
  pronunciationAudioUrl: string | null;
  texts: string[];
};

/**
 * 使える TG 例文の取得行（単語ごとに sortOrder 最小の 1 件へ選抜済み。`fetchQuizSource` の
 * `tgExampleRows`）。text = 英文、meaning = 意味（非 null・非空へ取得側で選抜済み）。
 */
export type TgExampleRow = {
  wordId: string;
  text: string;
  meaning: string;
  /** 例文の発音音源 URL（未登録なら null）。TG 例文形式の発音ボタン・自動再生が鳴らす音源。 */
  pronunciationAudioUrl: string | null;
};

export type QuizWord = {
  id: string;
  headword: string;
  /**
   * sortOrder 順。先頭が「最初の Meaning」。非 TG 形式は意味 1 件以上が前提だが、
   * TG 例文形式の対象・ダミーでは空配列でありうる（tgExample だけで成立するため）。
   */
  meanings: QuizMeaning[];
  /** 使える TG 例文（sortOrder 最小の 1 件）。TG 例文形式以外の生成時・未登録の単語は null。 */
  tgExample: { text: string; meaning: string; pronunciationAudioUrl: string | null } | null;
};

/**
 * 出題素材。(a)(b)(c) は互いに素な分割。
 * ある問題のダミー候補は (a)∪(b) から出題中の単語自身を除いたもの。(c) は不足時の補完用。
 */
export type QuizSourceMaterial = {
  /** (a) 出題対象（occurrenceNumber が範囲内）。 */
  targets: QuizWord[];
  /** (b) 同一 Occurrence プール（紐づきはあるが範囲外・番号なしの単語）。 */
  sameOccurrencePool: QuizWord[];
  /** (c) 全登録プール（対象 Occurrence に紐づかない残りの単語）。 */
  allWordsPool: QuizWord[];
};

function toQuizWord(row: QuizSourceRow, tgExampleByWordId: Map<string, TgExampleRow>): QuizWord {
  const tgExample = tgExampleByWordId.get(row.id);
  return {
    id: row.id,
    headword: row.headword,
    meanings: row.meanings.map((m) => ({
      partOfSpeech: m.partOfSpeech,
      pronunciationAudioUrl: m.pronunciationAudioUrl,
      texts: m.texts.map((t) => t.text),
    })),
    tgExample: tgExample
      ? {
          text: tgExample.text,
          meaning: tgExample.meaning,
          pronunciationAudioUrl: tgExample.pronunciationAudioUrl,
        }
      : null,
  };
}

/**
 * 取得済みの 3 つの行集合を素材 (a)(b)(c) に対応づける純マッパ。
 *
 * 範囲（range）判定・Occurrence 紐付き判定・目標件数までの不足分取得は取得側（`fetchQuizSource`）が
 * SQL で済ませているため、ここでは `QuizWord` への変換のみを行う:
 * `targetRows`→(a) 出題対象、`sameOccurrenceRows`→(b) 同一 Occurrence プール、
 * `fallbackRows`→(c) 全登録プール。
 * `tgExampleRows`（TG 例文形式のみ取得される）は wordId で各 `QuizWord.tgExample` に対応づける。
 */
export function partitionMaterial(
  targetRows: QuizSourceRow[],
  sameOccurrenceRows: QuizSourceRow[],
  fallbackRows: QuizSourceRow[],
  tgExampleRows: TgExampleRow[] = [],
): QuizSourceMaterial {
  const tgExampleByWordId = new Map(tgExampleRows.map((r) => [r.wordId, r]));
  return {
    targets: targetRows.map((row) => toQuizWord(row, tgExampleByWordId)),
    sameOccurrencePool: sameOccurrenceRows.map((row) => toQuizWord(row, tgExampleByWordId)),
    allWordsPool: fallbackRows.map((row) => toQuizWord(row, tgExampleByWordId)),
  };
}

/**
 * 範囲ベースのパーティション結果を、指定 id 集合を出題対象とする素材に再分割する純関数。
 * drill ラウンド生成（未定着単語のみ）・再テスト生成（直前ラウンドの単語のみ）が使う。
 *
 * 出題対象から外れた範囲内の単語（(a) の非 target 分）はダミー候補として
 * 同一 Occurrence プール (b) 側に回す。(c) は非 target 分のみ残す。
 */
export function retargetMaterial(
  partitioned: QuizSourceMaterial,
  targetIds: Set<string>,
): QuizSourceMaterial {
  const isTarget = (w: QuizWord) => targetIds.has(w.id);
  return {
    targets: [
      ...partitioned.targets,
      ...partitioned.sameOccurrencePool,
      ...partitioned.allWordsPool,
    ].filter(isTarget),
    sameOccurrencePool: [...partitioned.targets, ...partitioned.sameOccurrencePool].filter(
      (w) => !isTarget(w),
    ),
    allWordsPool: partitioned.allWordsPool.filter((w) => !isTarget(w)),
  };
}

/** 全 Meaning 横断の全 MeaningText（trim なしの生テキスト）。 */
export function allMeaningTexts(word: QuizWord): string[] {
  return word.meanings.flatMap((m) => m.texts);
}

/** 使える TG 例文を持つことが型で保証された単語（TG 例文形式の出題対象・ダミー）。 */
export type TgQuizWord = QuizWord & { tgExample: NonNullable<QuizWord["tgExample"]> };

/** 使える TG 例文（意味つき）を持つ単語か。TG 例文形式の出題対象・ダミー候補の絞り込みに使う。 */
export function hasTgExample(word: QuizWord): word is TgQuizWord {
  return word.tgExample !== null;
}

/** TG 例文形式の出題対象（使える TG 例文を持つ target のみ）。生成と成立判定で共用する。 */
export function tgTargetsOf(material: QuizSourceMaterial): TgQuizWord[] {
  return material.targets.filter(hasTgExample);
}

/** 出題対象に使える TG 例文の単語が 1 件もないときの理由（TG 例文形式の生成・成立判定で共用）。 */
export const NO_TG_TARGET_REASON = "TG例文（意味つき）が登録された出題対象の単語がありません";

/**
 * sortOrder 順の全 Meaning の表示用データ（品詞＋テキスト）。
 * 自己判定（英語→日本語）の解答表示で使う。
 */
export function meaningDisplaysOf(word: QuizWord): MeaningDisplay[] {
  return word.meanings.map((m) => ({ partOfSpeech: m.partOfSpeech, texts: m.texts }));
}

/**
 * 最初の Meaning（sortOrder 先頭）の MeaningText を sortOrder 順のまま。未登録なら空配列。
 * 「連結するか・先頭だけに絞るか」は表示側の都合なので、素材の切り出しはここに 1 本化する。
 */
export function firstMeaningTexts(word: QuizWord): string[] {
  return word.meanings[0]?.texts ?? [];
}

/**
 * 最初の Meaning（sortOrder 先頭）の MeaningText を「; 」で連結。品詞は含めない。
 * 「先頭の訳語だけ表示する」設定が OFF のときの表示（`firstMeaningDisplayText` の OFF 経路）。
 */
export function firstMeaningText(word: QuizWord): string {
  return firstMeaningTexts(word).join("; ");
}

/**
 * 最初の Meaning（sortOrder 先頭）の先頭 MeaningText（先頭の訳語）のみ。未登録なら空文字。
 * 「先頭の訳語だけ表示する」設定が ON のときの表示（`firstMeaningDisplayText` の ON 経路）。
 */
export function firstMeaningHeadText(word: QuizWord): string {
  return word.meanings[0]?.texts[0] ?? "";
}

/**
 * 設定に従った最初の Meaning の表示文字列。
 * `firstMeaningTextOnly` が true なら先頭の訳語のみ、false なら MeaningText を「; 」で連結。
 * 四択（英→日）の選択肢表示で使う（日本語→英語 3 形式の問題文は `firstMeaningPrompt`）。
 */
export function firstMeaningDisplayText(word: QuizWord, firstMeaningTextOnly: boolean): string {
  return firstMeaningTextOnly ? firstMeaningHeadText(word) : firstMeaningText(word);
}

/**
 * 設定に従った日本語→英語 3 形式の問題文（連結は描画側が行う）。
 * ON は先頭の訳語 1 件だけを出すので赤字にしない（表示が絞られていて代表なのは自明）。
 * OFF は全訳語を出すので先頭を赤字にする — 訳語が 1 件でも赤字にするため、
 * 描画側が件数から判別することはできず、ここで決めて payload に持たせる（ADR-0103）。
 */
export function firstMeaningPrompt(
  word: QuizWord,
  firstMeaningTextOnly: boolean,
): JaEnPrompt["prompt"] {
  const texts = firstMeaningTexts(word);
  return firstMeaningTextOnly
    ? { texts: texts.slice(0, 1), emphasizeFirst: false }
    : { texts, emphasizeFirst: true };
}

/**
 * 問題の共通項目。「この問題の発音ボタンが鳴らす対象」（音源 URL ＋ 音源が無いときの読み上げ語）を
 * ここで 1 組に決め、UI 側は形式を見た分岐を持たない。
 *
 * - TG 例文形式（4 形式）: TG 例文の音源と英文。**見出し語の音源へフォールバックしない**
 *   （TG 例文の音源が未登録なら null のまま → 例文の英文を TTS で読み上げる）。
 * - それ以外: 最初の Meaning の音源と headword（従来どおり）。
 *
 * TG 形式で `tgExample` が null になるのは不変条件違反だが、防御的に `ttsText: ""` へ落とす
 * （`AudioPlayButton` は空なら TTS を出さないため、見出し語が鳴る事故ではなくボタンが消えるだけになる）。
 */
export function questionBaseOf(word: QuizWord, format: QuizFormat): QuestionBase {
  const base = { wordId: word.id, headword: word.headword };
  if (isTgExampleFormat(format)) {
    return {
      ...base,
      pronunciationAudioUrl: word.tgExample?.pronunciationAudioUrl ?? null,
      ttsText: word.tgExample?.text ?? "",
    };
  }
  return {
    ...base,
    pronunciationAudioUrl: word.meanings[0]?.pronunciationAudioUrl ?? null,
    ttsText: word.headword,
  };
}
