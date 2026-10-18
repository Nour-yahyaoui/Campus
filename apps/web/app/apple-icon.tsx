import { ImageResponse } from "next/og";

/**
 * Apple touch icon. iOS ignores SVG for home-screen icons, so this is rendered
 * to PNG at build time. Same mark as `icon.svg`.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#24503c",
          color: "#f6f2e9",
          fontSize: 104,
          fontWeight: 600,
          letterSpacing: -4,
        }}
      >
        C
      </div>
    ),
    { ...size },
  );
}
