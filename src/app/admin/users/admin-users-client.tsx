"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

import { changeUserEmail, inviteUser, type InviteUserResult } from "./actions";

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  hasPassword: boolean;
  createdAt: string;
};

type IssuedLink = { email: string; url: string; isNewUser: boolean };

export function AdminUsersClient({ users }: { users: AdminUserRow[] }) {
  const [email, setEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedLink | null>(null);

  function applyResult(result: InviteUserResult) {
    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }
    setIssued({ email: result.email, url: result.url, isNewUser: result.isNewUser });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setIssued(null);
    setIsPending(true);
    try {
      applyResult(await inviteUser({ email }));
    } finally {
      setIsPending(false);
    }
  }

  async function onReissue(targetEmail: string) {
    setErrorMessage(null);
    setIssued(null);
    setIsPending(true);
    try {
      applyResult(await inviteUser({ email: targetEmail }));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          ユーザー管理
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          メールアドレスを登録すると、本人用のパスワード設定リンクを発行します。パスワードは本人だけが設定します。
        </p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label htmlFor="email" className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              メールアドレス
            </span>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isPending ? "発行中..." : "登録 / リンク発行"}
          </button>
        </form>

        {errorMessage ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {issued ? <IssuedLinkCard issued={issued} /> : null}

        <h2 className="mt-12 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          登録済みユーザー
        </h2>
        {users.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            まだ登録されたユーザーはありません。
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                disabled={isPending}
                onReissue={() => onReissue(u.email)}
              />
            ))}
          </ul>
        )}

        <p className="mt-10 text-sm">
          <Link href="/menu" className="text-zinc-600 underline dark:text-zinc-400">
            メニューに戻る
          </Link>
        </p>
      </div>
    </main>
  );
}

function UserRow({
  user,
  disabled,
  onReissue,
}: {
  user: AdminUserRow;
  disabled: boolean;
  onReissue: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsPending(true);
    try {
      const result = await changeUserEmail({ userId: user.id, newEmail });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // この時点では user.email はまだ変わらない（本人が検証リンクを踏んで初めて切り替わる）。
      // 発行した検証リンクを表示し、編集を閉じる。
      setVerifyUrl(result.url);
      setEditing(false);
      setNewEmail("");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {user.email}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {user.hasPassword ? "パスワード設定済み" : "パスワード未設定"} ・{" "}
            {user.emailVerified ? "メール確認済み" : "メール未確認"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* パスワード未設定のユーザーはメール変更不可（サーバー側でも弾く）。 */}
          {user.hasPassword ? (
            <button
              type="button"
              disabled={disabled || isPending}
              onClick={() => {
                setVerifyUrl(null);
                setError(null);
                setEditing((v) => !v);
                setNewEmail("");
              }}
              className={rowButtonClass}
            >
              {editing ? "キャンセル" : "メール変更"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled || isPending}
            onClick={onReissue}
            className={rowButtonClass}
          >
            設定リンク再発行
          </button>
        </div>
      </div>

      {editing ? (
        <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              新しいメールアドレス
            </span>
            <input
              type="email"
              required
              autoComplete="off"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isPending ? "発行中..." : "検証リンクを発行"}
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {verifyUrl ? (
        <div className="mt-3 rounded-md border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            メール変更の検証リンクを発行しました。
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            {user.email}{" "}
            さんに以下の検証リンクを渡してください。本人がリンクを踏むと新しいメールアドレスに切り替わり、
            「確認済み」になります（有効期限 24 時間）。踏むまでは現在のメールアドレスのままです。
          </p>
          <LinkCopyBox url={verifyUrl} />
        </div>
      ) : null}
    </li>
  );
}

function IssuedLinkCard({ issued }: { issued: IssuedLink }) {
  return (
    <div className="mt-4 rounded-md border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {issued.isNewUser ? "ユーザーを登録しました。" : "設定リンクを再発行しました。"}
      </p>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        {issued.email} さんに以下のリンクを渡してください（有効期限 24 時間）。
      </p>
      <LinkCopyBox url={issued.url} />
    </div>
  );
}

function LinkCopyBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <input
        readOnly
        value={url}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {copied ? "コピーしました" : "コピー"}
      </button>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

const rowButtonClass =
  "shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";
