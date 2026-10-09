import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PUBLIC_CONFIG } from "../../src/config/config.ts";

export const alt = "Mentis. Memory for your coding agent.";
export const size = {
  width: PUBLIC_CONFIG.frontend.design.socialWidth,
  height: PUBLIC_CONFIG.frontend.design.socialHeight,
};
export const contentType = "image/png";
export const dynamic = "force-static";

export default async function SocialImage() {
  const logo = await readFile(
    join(process.cwd(), "public/images/mentis-logo.png"),
  );
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: PUBLIC_CONFIG.frontend.design.colors.background,
        color: PUBLIC_CONFIG.frontend.design.colors.foreground,
        padding: "48px 60px",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 28,
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 28,
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: ImageResponse requires a native image element. */}
        <img
          src={`data:image/png;base64,${logo.toString("base64")}`}
          alt=""
          width={36}
          height={36}
        />
        mentis
      </div>
      <div style={{ fontSize: 54, display: "flex", letterSpacing: -1.5 }}>
        Memory for your coding agent.
      </div>
      <div
        style={{
          fontSize: 22,
          display: "flex",
          color: PUBLIC_CONFIG.frontend.design.colors.muted,
          marginTop: 16,
        }}
      >
        Record coding attempts. Find related tasks. Inspect what happened.
      </div>
      <div
        style={{
          display: "flex",
          gap: 24,
          marginTop: 36,
          padding: 28,
          background: PUBLIC_CONFIG.frontend.design.colors.surface,
          borderRadius: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "50%",
            gap: 14,
          }}
        >
          <span style={{ fontSize: 24 }}>Change the login redirect</span>
          <span
            style={{
              fontSize: 20,
              color: PUBLIC_CONFIG.frontend.design.colors.red,
            }}
          >
            Check failed
          </span>
          <span style={{ fontSize: 18 }}>Browser returns to sign-in.</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "50%",
            gap: 14,
          }}
        >
          <span style={{ fontSize: 24 }}>Retain the session cookie</span>
          <span
            style={{
              fontSize: 20,
              color: PUBLIC_CONFIG.frontend.design.colors.green,
            }}
          >
            Check passed
          </span>
          <span style={{ fontSize: 18 }}>Browser stays signed in.</span>
        </div>
      </div>
      <span
        style={{
          display: "flex",
          fontSize: 16,
          marginTop: 18,
          color: PUBLIC_CONFIG.frontend.design.colors.muted,
        }}
      >
        Demonstration data · Both attempts remain available.
      </span>
    </div>,
    size,
  );
}
