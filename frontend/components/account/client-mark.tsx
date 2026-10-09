"use client";

import { Terminal } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { clientIcon } from "@/lib/client-icons";
import { PUBLIC_CONFIG } from "../../../src/config/config.ts";

export function ClientMark({ name }: { name: string }) {
  const src = clientIcon(name);
  const [failedSource, setFailedSource] = useState<string>();
  return (
    <span className="client-mark">
      {src && failedSource !== src ? (
        <Image
          src={src}
          alt=""
          width={PUBLIC_CONFIG.frontend.design.iconPx}
          height={PUBLIC_CONFIG.frontend.design.iconPx}
          unoptimized
          onError={() => setFailedSource(src)}
        />
      ) : (
        <Terminal size={24} aria-hidden="true" />
      )}
    </span>
  );
}
