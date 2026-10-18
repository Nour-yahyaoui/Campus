import { ImageResponse } from "next/og";
import { PRODUCT } from "@campussphere/contracts";

export const alt = `${PRODUCT.name} — ${PRODUCT.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#f6f2e9",
          color: "#1b1d16",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: "#24503c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#f6f2e9",
              fontSize: 28,
            }}
          >
            C
          </div>
          <div style={{ fontSize: 26, letterSpacing: 2, textTransform: "uppercase", color: "#24503c" }}>
            {PRODUCT.name}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 78, lineHeight: 1.05, maxWidth: 940, letterSpacing: -1.5 }}>
            Find your people on campus.
          </div>
          <div style={{ fontSize: 30, color: "#4b4f43", maxWidth: 880 }}>
            Clubs, student projects and events — built to be free, accessible and honest about what it can do.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#73786a" }}>
          <span>Open source · MIT</span>
          <span>campussphere.local</span>
        </div>
      </div>
    ),
    size,
  );
}
