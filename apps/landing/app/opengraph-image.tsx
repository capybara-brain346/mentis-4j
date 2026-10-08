import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Mentis. Memory for your coding agent.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default async function SocialImage() {
  const landscape = await readFile(
    join(process.cwd(), "assets/social-valley.jpg"),
  );
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
        background: "#f7f7f3",
        color: "#242721",
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
        {/* Next ImageResponse requires a native image element. */}
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
          color: "#60655c",
          marginTop: 16,
        }}
      >
        Record coding attempts. Find related tasks. Inspect what happened.
      </div>
      {/* Next ImageResponse requires a native image element. */}
      <img
        src={`data:image/jpeg;base64,${landscape.toString("base64")}`}
        alt=""
        width={1080}
        height={230}
        style={{ objectFit: "cover", marginTop: 34, borderRadius: 6 }}
      />
    </div>,
    size,
  );
}
