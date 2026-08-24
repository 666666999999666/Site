import type { Metadata } from "next";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "QZ Site",
    template: "%s | QZ Site",
  },
  description: "以博客为主线，记录 Agent 应用、Python 与 Web 工程实践，并提供可核验的项目证据。",
  alternates: {
    types: { "application/rss+xml": "/feed.xml" },
  },
  openGraph: {
    type: "website",
    siteName: "QZ Site",
    locale: "zh_CN",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // U14: 读取 proxy.ts 注入的 nonce，给内联主题脚本加 nonce 属性
  const nonce = (await headers()).get("x-nonce") ?? undefined

  return (
    <html
      lang="zh-CN"
      className="antialiased"
      suppressHydrationWarning
    >
      <body>
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: `
          (function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()
        `}}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
