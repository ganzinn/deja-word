import { redirect } from "next/navigation";

import { ScreenHeader } from "@/components/screen-header";
import { getCurrentSession } from "@/lib/session";
import { getTtsFallbackEnabled } from "@/lib/user-preferences";

import { GeneralSettingsForm } from "./_components/general-settings-form";

/**
 * 単語全般の設定画面。quiz 専用でない横断設定をまとめる。
 * 現状は「音声」セクション（発音音源未登録時の自動音声フォールバック）のみ。
 * 今後、一覧のデフォルト表示設定などをセクション追加で収容する。
 */
export default async function GeneralSettingsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in?redirect=/settings/general");

  const ttsFallbackEnabled = await getTtsFallbackEnabled(session.user.id);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-0 pb-16 md:max-w-2xl">
      <ScreenHeader backHref="/settings" title="単語全般" />

      <div className="px-4 pt-4">
        <GeneralSettingsForm ttsFallbackEnabled={ttsFallbackEnabled} />
      </div>
    </main>
  );
}
