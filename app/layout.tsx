import type { Metadata } from "next";
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

  return (
    <html
      lang={locale === "en" ? "en" : "zh-CN"}
      className="antialiased"
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()
        `}} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
