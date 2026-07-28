import type { Metadata } from "next";
import "./globals.css";

const title = "方塊樂園｜兒童 8×8 方塊遊戲";
const description = "適合孩子的中文 8×8 方塊益智遊戲，沒有時間限制，可以一直遊玩。";

export const metadata: Metadata = {
  metadataBase: new URL("https://littlekmt.github.io/8x8/"),
  title,
  description,
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title, description, type: "website", images: [{ url: "og.png", width: 1728, height: 910, alt: "方塊樂園遊戲預覽" }] },
  twitter: { card: "summary_large_image", title, description, images: ["og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
