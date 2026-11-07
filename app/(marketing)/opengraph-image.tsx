import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

/**
 * The share card for every public link: link previews on LinkedIn,
 * Slack, X, iMessage, and anywhere else that unfurls a URL. Without
 * one, posts show a blank rectangle, which reads as untrustworthy for a
 * product that asks people to let it answer their phone.
 *
 * Generated rather than stored as a PNG so the copy stays in one place
 * and matches BRAND.
 */

export const alt = `${BRAND.name} — ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const WAVE = [16, 34, 24, 44, 20];

const CHIPS = ["24/7 inbound", "Books appointments", "CRM sync"];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          // Deep teal, matching the dark brand tokens.
          background:
            "linear-gradient(135deg, #04100f 0%, #06201e 48%, #0a3a35 100%)",
          color: "#eef4f3",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 5,
              height: 46,
            }}
          >
            {WAVE.map((height, index) => (
              <div
                key={index}
                style={{
                  width: 6,
                  height,
                  borderRadius: 3,
                  background: "#2dd4bf",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>
            <span>{BRAND.nameLead}</span>
            <span style={{ color: "#2dd4bf" }}>{BRAND.nameTail}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              letterSpacing: 6,
              color: "#2dd4bf",
              fontWeight: 600,
            }}
          >
            AI PHONE AGENTS
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 74,
              fontWeight: 700,
              lineHeight: 1.06,
              letterSpacing: -2,
              marginTop: 20,
              maxWidth: 940,
            }}
          >
            Every call answered. Every job booked.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              lineHeight: 1.4,
              color: "#a7c2be",
              marginTop: 22,
              maxWidth: 900,
            }}
          >
            An agent that talks to your callers, books the work, writes the CRM
            record, and hands off to a person when it matters.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 12 }}>
            {CHIPS.map((chip) => (
              <div
                key={chip}
                style={{
                  display: "flex",
                  border: "1px solid rgba(45,212,191,0.35)",
                  background: "rgba(45,212,191,0.10)",
                  borderRadius: 999,
                  padding: "10px 20px",
                  fontSize: 22,
                  color: "#d7ece9",
                }}
              >
                {chip}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#78938f" }}>
            {BRAND.domain}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
