import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Serif, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";
import { Toaster } from "@/components/ui/sonner";
import { SiteHeader } from "./_components/site-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 単語コンテンツ表示用のセリフ体（ラテン文字のみ）。適用は `font-content` を
// 付けた箇所だけで、UI 全体のフォントは Geist Sans のまま (globals.css の --font-content)。
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

// 発音記号（IPA）表示用のセリフ体。Source Serif 4 は IPA グリフ（ɪ ʃ ʊ ː 等）を
// 収録しないため、完全収録する Noto Serif を発音記号専用に使う（θ は greek に入る）。
// preload はせず、発音記号を含むページだけ unicode-range 単位でオンデマンド取得させる。
const notoSerif = Noto_Serif({
  variable: "--font-noto-serif",
  subsets: ["latin", "latin-ext", "greek"],
  weight: "400",
  preload: false,
});

export const viewport: Viewport = {
  themeColor: "#18181b",
};

export const metadata: Metadata = {
  title: "DejaWord",
  description: "一度忘れた単語との再会体験をコンセプトにした英単語学習アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} ${notoSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
        <Toaster position="top-center" />
        <SwRegister />
      </body>
    </html>
  );
}
