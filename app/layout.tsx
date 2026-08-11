import type { Metadata } from "next";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "QZ Site",
    template: "%s | QZ Site",
  },
  description: "个人博客、Idea/Todo 与项目实践记录。",
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
  const locale = await getLocale().catch(() => "zh")
  // U14: 读取 proxy.ts 注入的 nonce，给内联主题脚本加 nonce 属性
  const nonce = (await headers()).get("x-nonce") ?? undefined

  return (
    <html
      lang={locale === "en" ? "en" : "zh-CN"}
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
