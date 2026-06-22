"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { setPasswordSchema } from "@/lib/schema/set-password";

export function SetPasswordForm() {
  return (
    <Suspense fallback={null}>
      <SetPasswordFormInner />
    </Suspense>
  );
}

function SetPasswordFormInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <Shell>
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          リンクが正しくありません。管理者に設定リンクの再発行を依頼してください。
        </p>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          パスワードを設定しました。ログインしてください。
        </p>
        <Link
          href="/sign-in"
          className="mt-4 inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          ログインへ進む
        </Link>
      </Shell>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    const parsed = setPasswordSchema.safeParse({ newPassword, confirmPassword });
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
      return;
    }

    setIsPending(true);
    try {
      const { error } = await authClient.resetPassword({
        newPassword: parsed.data.newPassword,
        token,
      });
      if (error) {
        setErrorMessage(
          error.code === "INVALID_TOKEN"
            ? "リンクの有効期限が切れているか、無効です。管理者に再発行を依頼してください。"
            : (error.message ?? "パスワードの設定に失敗しました"),
        );
        return;
      }
      setDone(true);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Shell>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="新しいパスワード（8 文字以上）" htmlFor="newPassword">
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="新しいパスワード（確認）" htmlFor="confirmPassword">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
          />
        </Field>

        {errorMessage ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isPending ? "設定中..." : "パスワードを設定"}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          パスワード設定
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          ログインに使うパスワードを設定します。
        </p>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
    </label>
  );
}
