import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { PlatformShell } from "@/components/platform-shell";

export const metadata: Metadata = {
  title: "多语言工作台",
  description: "独立站商品处理、翻译与内容管理平台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('app-theme')||'light';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()",
          }}
        />
      </head>
      <body>
        <Providers>
          <PlatformShell>{children}</PlatformShell>
        </Providers>
      </body>
    </html>
  );
}
