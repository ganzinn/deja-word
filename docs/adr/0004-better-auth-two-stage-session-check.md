# ADR-0004: 認証は Better Auth、proxy の楽観チェック + Server Component の DB 正検証

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

メール + パスワード認証とルート保護を実装する必要があった（M3/M4）。Next.js 16 では async cookies/params などの変更があり、認証ライブラリ側の対応も考慮点だった。

## 決定内容

- 認証ライブラリに **Better Auth** を採用し、catch-all Route Handler（`src/app/api/auth/[...all]/route.ts`）の `toNextJsHandler` で Next.js 16 の async cookies/params を吸収する（commit `882bfef`）
- ルート保護は二段構え:
  1. `src/proxy.ts` で `getSessionCookie` による**楽観的 cookie チェック**（DB を見ない高速な門前払い）
  2. Server Component / Server Action では `getCurrentSession()`（`src/lib/session.ts`）が `auth.api.getSession` で **DB を正とした検証**を行う

## 採らなかった代替案

- proxy（middleware）だけで認可を完結させる方式 —（推定）cookie の存在確認だけでは失効セッションを検出できないため、DB 正検証を層として分離したと考えられる。明示的な比較記録はコミットに無い
- 認証ライブラリの他候補（NextAuth 等）— 比較の記録なし

## 影響

- セッション取得の入口は `getCurrentSession()` に統一される。例外は `src/app/api/words/` 配下の Route Handler 2 件が `auth.api.getSession` を直接呼ぶ箇所のみで、これは「既存の例外で、修正対象のバグではない」と規約に明記されている（`src/app/CLAUDE.md`）
- Better Auth のパスワードリセット機構が後の管理者招待フロー（[ADR-0048](0048-admin-invite-without-email.md)）の土台として転用された

## 根拠（コード・コミット・文書参照）

- commit `882bfef` "M3: Better Auth を導入"
- commit `2055e88` "M4: 認証 UI & ルート保護を実装" — 楽観 cookie チェック + DB 正検証の構成を記載
- `src/proxy.ts` / `src/lib/session.ts` / `src/lib/auth.ts`
- `src/app/CLAUDE.md` — `getCurrentSession()` 規約と例外 2 件
