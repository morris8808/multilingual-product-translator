"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

type Theme = Record<
  | "background"
  | "foreground"
  | "card"
  | "primary"
  | "sidebar"
  | "border"
  | "destructive",
  string
>;
type ThemePreferences = { theme?: string; customTheme?: Theme };

export function applyPreferencesTheme(preferences: ThemePreferences) {
  const localOverride = localStorage.getItem("app-theme-override");
  const theme = localOverride || preferences.theme || "system";
  const dark =
    theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("app-theme", theme);
  const custom = theme === "custom" ? preferences.customTheme : undefined;
  const keys: Array<keyof Theme> = [
    "background",
    "foreground",
    "card",
    "primary",
    "sidebar",
    "border",
    "destructive",
  ];
  for (const key of keys) {
    if (custom?.[key])
      document.documentElement.style.setProperty(`--${key}`, custom[key]);
    else document.documentElement.style.removeProperty(`--${key}`);
  }
  if (custom) {
    document.documentElement.style.setProperty(
      "--card-foreground",
      custom.foreground,
    );
    document.documentElement.style.setProperty(
      "--sidebar-foreground",
      "#ffffff",
    );
    document.documentElement.style.setProperty("--ring", custom.primary);
    document.documentElement.style.setProperty("--input", custom.border);
  } else {
    for (const key of [
      "card-foreground",
      "sidebar-foreground",
      "ring",
      "input",
    ])
      document.documentElement.style.removeProperty(`--${key}`);
  }
}
export function PreferenceSync() {
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: async () =>
      (await fetch("/api/settings")).json() as Promise<{
        preferences?: { theme?: string; customTheme?: Theme };
      }>,
  });
  useEffect(() => {
    const preferences = query.data?.preferences;
    if (!preferences) return;
    applyPreferencesTheme(preferences);
  }, [query.data]);
  return null;
}
