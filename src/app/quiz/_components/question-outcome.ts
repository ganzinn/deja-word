// 出題形式コンポーネント共通の解答結果型。
// quiz-flow / result-list もこの型を import する。

import type { QuizResult } from "@/generated/prisma/enums";

export type QuestionOutcome = {
  result: QuizResult;
  // 結果一覧の「自分の回答」表示用文字列。
  // 四択＝選んだ選択肢テキスト、多義語選択＝選んだ意味の組（「; 」連結）、
  // スペル確認＝入力したスペル、自己判定＝null、「わからない」（GAVE_UP）＝null、時間切れ＝null。
  // うろ覚え（VAGUE）は全形式とも null（正解時のみ選べ回答内容は正解と同じため、一律「うろ覚え」と表示する）。
  answerDisplay: string | null;
};
