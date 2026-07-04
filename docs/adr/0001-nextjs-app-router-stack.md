# ADR-0001: Next.js 16 App Router + React 19 + Tailwind v4 スタック採用

- ステータス: 提案
- 確信度: 低
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

単語学習アプリの土台として Web フレームワークを選定する必要があった。プロジェクトは M1（土台）〜M5（デプロイ）のマイルストーンで基盤を整備しており、その最初のコミットでスタック一式が導入された。

## 決定内容

Next.js 16（App Router）+ React 19 + TypeScript（strict）+ Tailwind CSS v4 を採用する。ホスティングは Vercel（[ADR-0050](0050-vercel-managed-integration.md)）、認証は Better Auth（[ADR-0004](0004-better-auth-two-stage-session-check.md)）を前提とする。

## 採らなかった代替案

記録なし。Remix / SvelteKit / Rails 等の他候補を比較した形跡はコミット・ドキュメントに残っていない（比較検討の有無自体が不明）。

## 影響

- Next.js 16 は破壊的変更が多く、AGENTS.md 冒頭に「This is NOT the Next.js you know」として `node_modules/next/dist/docs/` を先に読む規約が置かれている
- middleware → proxy 改名（`src/proxy.ts`）、async cookies/params 対応など、Next.js 16 固有の適応が各所の規約に波及している（`src/CLAUDE.md`）
- インターフェース層は Server Action 中心の設計（[ADR-0017](0017-server-actions-over-route-handlers.md)）が可能になった

## 根拠（コード・コミット・文書参照）

- commit `15bad7b` "M1: プロジェクト土台を実装" — スタック導入の初回コミット（選定理由の記載なし）
- `package.json` — `next 16.x` / `react 19.x` / `tailwindcss 4.x`
- `AGENTS.md` 冒頭 — Next.js 16 の破壊的変更への注意書き

## 人間への確認質問

- Next.js（App Router）を選んだ動機は何か？（Vercel デプロイ前提・学習目的・過去の経験など）
- 比較した候補フレームワークはあったか？あった場合、決め手は何だったか？
