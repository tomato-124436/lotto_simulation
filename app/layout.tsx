import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "로또 1등 시뮬레이션 · 몇 주가 걸릴까?",
  description:
    "매주 100장씩 6/45 로또를 구매할 때 1등에 당첨되기까지 몇 주가 걸리는지 0.1초마다 시뮬레이션합니다.",
  openGraph: {
    title: "로또 1등 시뮬레이션",
    description: "매주 100장, 1등까지 몇 주가 걸릴까?",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
