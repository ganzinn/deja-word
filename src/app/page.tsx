export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-24 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">deja-word</h1>
        <p className="text-base text-zinc-600 sm:text-lg dark:text-zinc-400">
          一度忘れた単語との再会体験をコンセプトにした英単語学習アプリ
        </p>
        <span className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          M1: プロジェクト土台セットアップ完了
        </span>
      </div>
    </main>
  );
}
