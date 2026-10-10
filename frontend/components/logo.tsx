import Image from "next/image";
import amp from "@/assets/icons/amp-color.svg";
import claude from "@/assets/icons/claude-color.svg";
import codex from "@/assets/icons/codex.svg";
import hermes from "@/assets/icons/hermes-agent.svg";
import neo4j from "@/assets/icons/neo4j.png";
import openai from "@/assets/icons/openai.svg";
import openclaw from "@/assets/icons/openclaw-color.svg";
import opencode from "@/assets/icons/opencode.svg";
import pi from "@/assets/icons/pi-agent.svg";

const logos = {
  amp,
  claude,
  codex,
  hermes,
  neo4j,
  openai,
  openclaw,
  opencode,
  pi,
  mentis: "/images/mentis-logo.png",
};

export type LogoName = keyof typeof logos;

export function Logo({ name, size = 24 }: { name: LogoName; size?: number }) {
  return (
    <Image
      src={logos[name]}
      alt=""
      width={size}
      height={size}
      className="brand-logo"
      unoptimized
    />
  );
}
