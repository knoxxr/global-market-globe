import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ORBITAL MARKETS — 실시간 글로벌 마켓 3D 지구본",
    short_name: "Orbital Markets",
    description:
      "전 세계 주요 주가지수, 실시간 외환(FX), 원자재 선물과 글로벌 금융 속보를 3D 지구본에 실시간 시각화합니다.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#050911",
    theme_color: "#060a12",
    lang: "ko",
    categories: ["finance", "news", "utilities"],
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
