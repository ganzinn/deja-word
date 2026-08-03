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
 * 日本語→英語の問題文。最初の Meaning の MeaningText を「; 」で連結したプレーン文字列
 * （品詞なし。英語→日本語の選択肢表示と同じルール）。出題画面は headword の代わりに
 * これを表示し、解答（英単語＝headword）は形式ごとの UI が確定後に見せる。
 */
export type JaEnPrompt = { prompt: string };

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

/**
 * TG四択（英語→日本語）。prompt は TG 例文の英文、choices は各単語の TG 例文の意味。
 * 出題画面は headword の代わりに英文を表示する（headword は英文中に含まれるため出さない）。
 */
export type ChoiceTgQuestion = QuestionBase & {
  prompt: string;
  choices: { text: string }[];
  correctIndex: number;
};

/** TG四択（日本語→英語）。prompt は TG 例文の意味、choices は各単語の TG 例文の英文。 */
export type ChoiceTgJaEnQuestion = QuestionBase & {
  prompt: string;
  choices: { text: string }[];
  correctIndex: number;
};

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
