// 問題データ（payload）の型定義。
// クライアントからの型 import を許すため `server-only` は付けない
// （呼び出し元の UseCase / クエリが server-only を担う）。

export type QuestionBase = {
  wordId: string;
  headword: string;
  pronunciationAudioUrl: string | null;
};

/** Meaning 1 件分の表示用データ（自己判定の解答／日本語→英語の問題文で共用）。 */
export type MeaningDisplay = { partOfSpeech: string | null; texts: string[] };

export type ChoiceQuestion = QuestionBase & {
  choices: { text: string }[];
  correctIndex: number;
};

export type MultiMeaningQuestion = QuestionBase & {
  options: { text: string; isCorrect: boolean }[];
};

export type SelfJudgeQuestion = QuestionBase & {
  answer: MeaningDisplay[]; // 全 Meaning の表示用データ
};

/**
 * 日本語→英語の問題文（全 Meaning）。出題画面は headword の代わりにこれを表示し、
 * 解答（英単語＝headword）は形式ごとの UI が確定後に見せる。
 */
export type JaEnPrompt = { prompt: MeaningDisplay[] };

/** 四択（日本語→英語）。choices は英単語、correctIndex が target の headword。 */
export type ChoiceJaEnQuestion = QuestionBase &
  JaEnPrompt & {
    choices: { text: string }[];
    correctIndex: number;
  };

/** 自己判定（日本語→英語）。解答は headword（英単語）。 */
export type SelfJudgeJaEnQuestion = QuestionBase & JaEnPrompt;

/** スペル確認（日本語→英語）。入力したスペルを headword と照合して自動採点する。 */
export type SpellingQuestion = QuestionBase & JaEnPrompt;

/** 形式別の問題一式（`buildQuiz` の戻り値）。 */
export type QuizQuestionsPayload =
  | { format: "CHOICE"; questions: ChoiceQuestion[] }
  | { format: "SELF_JUDGE"; questions: SelfJudgeQuestion[] }
  | { format: "MULTI_MEANING"; questions: MultiMeaningQuestion[] }
  | { format: "CHOICE_JA_EN"; questions: ChoiceJaEnQuestion[] }
  | { format: "SELF_JUDGE_JA_EN"; questions: SelfJudgeJaEnQuestion[] }
  | { format: "SPELLING"; questions: SpellingQuestion[] };

/**
 * クライアントへ渡す問題データ一式。timeoutSeconds（null = 制限なし）は
 * TEST=開始入力のエコーバック、DRILL=`Drill.timeoutSeconds` 由来で、
 * play フェーズはモードを区別せずこの値だけを見る。
 */
export type QuizPayload = QuizQuestionsPayload & { timeoutSeconds: number | null };
