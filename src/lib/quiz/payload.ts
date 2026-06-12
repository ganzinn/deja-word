// 問題データ（payload）の型定義。
// クライアントからの型 import を許すため `server-only` は付けない
// （呼び出し元の UseCase / クエリが server-only を担う）。

export type QuestionBase = {
  wordId: string;
  headword: string;
  pronunciationAudioUrl: string | null;
};

export type ChoiceQuestion = QuestionBase & {
  choices: { text: string }[];
  correctIndex: number;
};

export type MultiMeaningQuestion = QuestionBase & {
  options: { text: string; isCorrect: boolean }[];
};

export type SelfJudgeQuestion = QuestionBase & {
  answer: { partOfSpeech: string | null; texts: string[] }[]; // 全 Meaning の表示用データ
};

export type QuizPayload =
  | { format: "CHOICE"; questions: ChoiceQuestion[] }
  | { format: "SELF_JUDGE"; questions: SelfJudgeQuestion[] }
  | { format: "MULTI_MEANING"; questions: MultiMeaningQuestion[] };
