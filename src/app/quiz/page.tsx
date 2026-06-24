import { redirect } from "next/navigation";

import { TtsFallbackProvider } from "@/components/tts-fallback-context";
import { listActiveDrillsForUser } from "@/lib/drill-list";
import { listOccurrencesForUser } from "@/lib/occurrences-list";
import { getQuizDefaultsForUser } from "@/lib/quiz-default-settings";
import { DEFAULT_QUIZ_SETTINGS } from "@/lib/quiz/default-settings";
import { getCurrentSession } from "@/lib/session";
import { getTtsFallbackEnabled } from "@/lib/user-preferences";

import { QuizFlow } from "./_components/quiz-flow";

/**
 * 単語テストの開始画面（テストフロー一式の入口）。
 * カウントダウン → 出題 → 結果はクライアント状態遷移で URL 遷移しない。
 * 進行中の定着モード一覧（再開・削除）もここで取得して開始画面下部に表示する。
 * 開始フォームの初期値はデフォルト設定（/settings/quiz-defaults）から読み込む。
 */
export default async function QuizPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in?redirect=/quiz");

  const [occurrences, activeDrills, savedDefaults, ttsFallbackEnabled] = await Promise.all([
    listOccurrencesForUser(session.user.id),
    listActiveDrillsForUser(session.user.id),
    getQuizDefaultsForUser(session.user.id),
    getTtsFallbackEnabled(session.user.id),
  ]);
  // 未保存（レコードなし）のユーザーには推奨デフォルトを初期値として反映する。
  // 保存後に明示的に未設定にした状態は非 null で返るためここでは差し替わらない。
  const defaults = savedDefaults ?? DEFAULT_QUIZ_SETTINGS;

  // デフォルトの掲載箇所が選択肢にない場合（lib 層の可視判定との二重防御）は未選択に落とす
  const defaultOccurrenceId = occurrences.some((o) => o.id === defaults.occurrenceId)
    ? defaults.occurrenceId
    : null;

  // カウントダウン表示は設定画面のみで変更する挙動設定（開始フォームの初期値ではない）。
  // 未設定（null）はデフォルトで非表示。
  const showCountdown = defaults.showCountdown ?? false;
  // 発音の自動再生・正誤の効果音。それぞれ未設定（null）はデフォルトで有効。
  const autoplayPronunciation = defaults.autoplayPronunciation ?? true;
  const enableAnswerSound = defaults.enableAnswerSound ?? true;
  // 日→英の解答表示時の発音自動再生。未設定（null）はデフォルトで有効。
  const autoplayAnswerAudioJaEn = defaults.autoplayAnswerAudioJaEn ?? true;
  // 開始画面「この設定をデフォルト設定とする」トグルの初期状態。未設定（null）は OFF。
  const saveAsDefaultInitial = defaults.saveOnStart ?? false;
  // テスト結果画面「正解した問題も定着モードで出題する」トグルの初期状態。未設定（null）は OFF（誤答のみ）。
  const drillIncludeCorrectInitial = defaults.drillIncludeCorrect ?? false;

  return (
    <TtsFallbackProvider enabled={ttsFallbackEnabled}>
      <QuizFlow
        occurrences={occurrences.map((o) => ({
          id: o.id,
          location: o.location,
          wordCount: o.wordLinkCount,
        }))}
        activeDrills={activeDrills}
        defaults={{ ...defaults, occurrenceId: defaultOccurrenceId }}
        showCountdown={showCountdown}
        autoplayPronunciation={autoplayPronunciation}
        enableAnswerSound={enableAnswerSound}
        autoplayAnswerAudioJaEn={autoplayAnswerAudioJaEn}
        saveAsDefaultInitial={saveAsDefaultInitial}
        drillIncludeCorrectInitial={drillIncludeCorrectInitial}
      />
    </TtsFallbackProvider>
  );
}
