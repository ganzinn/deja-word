// 出題形式 3 コンポーネント共通の解答結果型。
// quiz-flow / result-list（チケット 08）もこの型を import する。

import type { QuizResult } from "@/generated/prisma/enums";

export type QuestionOutcome = {
  result: QuizResult;
  // 結果一覧の「自分の回答」表示用文字列。
  // 四択＝選んだ選択肢テキスト、多義語選択＝選んだ意味の組（「; 」連結）、
  // 自己判定＝null、「わからない」（GAVE_UP）＝null
  answerDisplay: string | null;
};
