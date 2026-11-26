import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-kr",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ORBITAL MARKETS — 실시간 글로벌 주가 · 외환 · 원자재 3D 지구본",
  description:
    "전 세계 35개 주요 주가지수, 실시간 외환(FX), 원자재 선물, 거시 리스크 지표와 글로벌 속보를 3D 지구본에 실시간으로 시각화합니다.",
  keywords: [
    "글로벌 주가지수",
    "실시간 환율",
    "원자재 시세",
    "3D 지구본",
    "Polygon.io",
    "Finnhub",
    "Vercel",
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Orbital Markets",
  },
  openGraph: {
    title: "ORBITAL MARKETS — 실시간 글로벌 주가 · 외환 · 원자재 3D 지구본",
    description:
      "다중 접속 Edge CDN 캐시와 3D 벡터 지구본으로 전 세계 주가·환율·원자재·속보를 한눈에 확인하세요.",
    type: "website",
    locale: "ko_KR",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#060a12",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} ${notoSansKr.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
