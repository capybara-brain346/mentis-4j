import { PUBLIC_CONFIG } from "../../src/config/config.ts";

export function clientIcon(name: string): string | undefined {
  const key = name.trim().toLowerCase();
  const icons = PUBLIC_CONFIG.frontend.clientIcons;
  return Object.hasOwn(icons, key)
    ? `/icons/${icons[key as keyof typeof icons]}`
    : undefined;
}
