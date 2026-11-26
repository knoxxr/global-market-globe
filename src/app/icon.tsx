import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #0c1f39 0%, #050911 100%)",
          borderRadius: 112,
        }}
      >
        <div
          style={{
            width: 310,
            height: 310,
            borderRadius: "50%",
            border: "16px solid #38bdf8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            background: "radial-gradient(circle at 35% 30%, #1c3d63 0%, #081426 75%)",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 310,
              height: 110,
              borderRadius: "50%",
              border: "8px solid rgba(124, 196, 250, 0.55)",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 110,
              height: 310,
              borderRadius: "50%",
              border: "8px solid rgba(124, 196, 250, 0.55)",
            }}
          />
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "#f43f5e",
              position: "absolute",
              top: 66,
              right: 72,
            }}
          />
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#60a5fa",
              position: "absolute",
              bottom: 72,
              left: 74,
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
