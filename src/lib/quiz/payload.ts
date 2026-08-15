// 問題データ（payload）の型定義。
// クライアントからの型 import を許すため `server-only` は付けない
// （呼び出し元の UseCase / クエリが server-only を担う）。

export type QuestionBase = {
  wordId: string;
  headword: string;
  /**
   * この問題の発音ボタンが鳴らす音源の URL（未登録なら null）。TG 例文形式では TG 例文の音源、
   * それ以外の形式では見出し語（最初の Meaning）の音源。「見出し語の音源」ではないことに注意。
   */
  pronunciationAudioUrl: string | null;
  /** 上記の音源が無いときに読み上げる英語（TG 例文形式は例文の英文、それ以外は headword）。 */
  ttsText: string;
};

/** Meaning 1 件分の表示用データ（自己判定の解答／日本語→英語の問題文で共用）。 */
export type MeaningDisplay = { partOfSpeech: string | null; texts: string[] };

/**
 * 結果一覧の「正解」列に出す最初の Meaning の訳語（sortOrder 順）。
 * 出題側の表示（選択肢）は「先頭の訳語のみ表示」設定やシャッフルで内容・順序が変わるが、
 * 結果一覧は答え合わせの材料を出す解答側なので、設定に依らず全訳語を訳語順で出す（ADR-0102）。
 * 自己判定（英→日）は `answer[0].texts` が同じ役割を担うため持たない。
 */
type CorrectMeaningTexts = { correctMeaningTexts: string[] };

/**
 * 四択 4 形式に共通の出題データ。選択肢の中身（訳語 / 英単語 / TG 例文）は形式で違うが
 * 「選択肢を選んで採点する」挙動は同じで、出題 UI（`QuestionChoice`）は形式を問わず
 * この形だけを受け取る。形式固有のフィールドを増やすときは各形式の型側へ足すこと。
 */
export type ChoiceQuestionBase = QuestionBase & {
  choices: { text: string }[];
  correctIndex: number;
};

/** 四択（英語→日本語）。choices は訳語。 */
export type ChoiceQuestion = ChoiceQuestionBase & CorrectMeaningTexts;

export type MultiMeaningQuestion = QuestionBase &
  CorrectMeaningTexts & {
    options: { text: string; isCorrect: boolean }[];
  };

export type SelfJudgeQuestion = QuestionBase & {
  answer: MeaningDisplay[]; // 全 Meaning の表示用データ
};

/**
 * 日本語→英語の問題文。最初の Meaning の MeaningText（品詞なし。英語→日本語の選択肢表示と
 * 同じルール）を持つ。出題画面は headword の代わりにこれを表示し、解答（英単語＝headword）は
 * 形式ごとの UI が確定後に見せる。TG 例文形式の `prompt`（例文の英文・意味）と違い、
 * 文字列ではなく訳語の配列＋強調の有無を運ぶ。
 *
 * 「; 」での連結は描画側が行う（連結済みの文字列からは先頭の訳語を切り出せないため）。
 * `emphasizeFirst` は「全訳語を見せているか（＝設定 OFF）」で、訳語の件数からは判別できない
 * （設定 OFF なら訳語 1 件の単語も赤字にする）ため、生成時に決めて運ぶ（ADR-0103）。
 */
export type JaEnPrompt = {
  prompt: {
    /** 最初の Meaning の MeaningText（sortOrder 順。「先頭の訳語のみ表示」設定 ON なら先頭 1 件だけ）。 */
    texts: string[];
    /** 先頭の訳語を赤字で強調するか（全訳語を出す設定 OFF のときだけ true）。 */
    emphasizeFirst: boolean;
  };
};

/** 四択（日本語→英語）。choices は英単語、correctIndex が target の headword。 */
export type ChoiceJaEnQuestion = ChoiceQuestionBase & JaEnPrompt;

/** 自己判定（日本語→英語）。解答は headword（英単語）。 */
export type SelfJudgeJaEnQuestion = QuestionBase & JaEnPrompt;

/** スペル確認（日本語→英語）。入力したスペルを headword と照合して自動採点する。 */
export type SpellingQuestion = QuestionBase & JaEnPrompt;

/**
 * TG四択（英語→日本語）。prompt は TG 例文の英文、choices は各単語の TG 例文の意味。
 * 出題画面は headword の代わりに英文を表示する（headword は英文中に含まれるため出さない）。
 */
export type ChoiceTgQuestion = ChoiceQuestionBase & { prompt: string };

/** TG四択（日本語→英語）。prompt は TG 例文の意味、choices は各単語の TG 例文の英文。 */
export type ChoiceTgJaEnQuestion = ChoiceQuestionBase & { prompt: string };

/** TG自己判定（英語→日本語）。prompt は TG 例文の英文、answer は TG 例文の意味。 */
export type SelfJudgeTgQuestion = QuestionBase & { prompt: string; answer: string };

/** TG自己判定（日本語→英語）。prompt は TG 例文の意味、answer は TG 例文の英文。 */
export type SelfJudgeTgJaEnQuestion = QuestionBase & { prompt: string; answer: string };

/** 形式別の問題一式（`buildQuiz` の戻り値）。 */
export type QuizQuestionsPayload =
  | { format: "CHOICE"; questions: ChoiceQuestion[] }
  | { format: "SELF_JUDGE"; questions: SelfJudgeQuestion[] }
  | { format: "MULTI_MEANING"; questions: MultiMeaningQuestion[] }
  | { format: "CHOICE_JA_EN"; questions: ChoiceJaEnQuestion[] }
  | { format: "SELF_JUDGE_JA_EN"; questions: SelfJudgeJaEnQuestion[] }
  | { format: "SPELLING"; questions: SpellingQuestion[] }
  | { format: "CHOICE_TG"; questions: ChoiceTgQuestion[] }
  | { format: "CHOICE_TG_JA_EN"; questions: ChoiceTgJaEnQuestion[] }
  | { format: "SELF_JUDGE_TG"; questions: SelfJudgeTgQuestion[] }
  | { format: "SELF_JUDGE_TG_JA_EN"; questions: SelfJudgeTgJaEnQuestion[] };

/**
 * クライアントへ渡す問題データ一式。timeoutSeconds（null = 制限なし）は
 * TEST=開始入力のエコーバック、DRILL=`Drill.timeoutSeconds` 由来で、
 * play フェーズはモードを区別せずこの値だけを見る。
 */
export type QuizPayload = QuizQuestionsPayload & { timeoutSeconds: number | null };
