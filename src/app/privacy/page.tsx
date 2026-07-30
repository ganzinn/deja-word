import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー | DejaWord",
  description: "DejaWord のプライバシーポリシー",
};

const CONTACT_EMAIL = "contact@example.com";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12 text-zinc-900 dark:text-zinc-50">
      <h1 className="text-2xl font-bold tracking-tight">プライバシーポリシー</h1>
      <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        本ポリシーは、英単語学習アプリ「DejaWord」（Web 版および Android
        アプリ版。以下「本サービス」）における利用者情報の取り扱いを定めるものです。
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">収集する情報</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          <li>
            アカウント情報: メールアドレス、パスワード（ハッシュ化して保存し、平文では保持しません）
          </li>
          <li>学習データ: 登録した単語・意味などの学習コンテンツ、クイズの解答履歴・成績</li>
          <li>Cookie: ログイン状態を維持するためのセッション Cookie</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">利用目的</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          収集した情報は、アカウントの認証と本サービスの機能（単語の管理・クイズの出題・学習履歴の表示）の提供のみに利用します。
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">第三者提供・トラッキング</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          <li>利用者情報を第三者に提供・販売しません。</li>
          <li>広告の配信、行動トラッキング、アクセス解析ツールは使用していません。</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">情報の保存と安全管理</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          利用者情報は、適切なアクセス制御を講じた外部のクラウド基盤上に保存されます。通信は TLS
          により暗号化されます。
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">アカウント・データの削除</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          アカウントおよび学習データの削除を希望する場合は、下記の連絡先までご連絡ください。確認のうえ、アカウントと関連データを削除します。
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">ポリシーの変更</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          本ポリシーの内容は、必要に応じて変更することがあります。変更後のポリシーは本ページに掲載した時点で効力を生じます。
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">連絡先</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          運営者: ganzinn（
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>
          ）
        </p>
      </section>

      <p className="mt-10 text-xs text-zinc-500 dark:text-zinc-500">制定日: 2026-07-27</p>
    </main>
  );
}
