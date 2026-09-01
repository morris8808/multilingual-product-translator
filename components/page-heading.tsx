"use client";
import { useQuery } from "@tanstack/react-query";

export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () =>
      (await fetch("/api/settings")).json() as Promise<{
        preferences?: { developerMode?: boolean };
      }>,
    staleTime: 60_000,
  });
  const developerMode = Boolean(settings.data?.preferences?.developerMode);
  return (
    <div>
      {developerMode && (
        <p className="text-xs font-medium uppercase tracking-wider text-blue-500">
          {eyebrow}
        </p>
      )}
      <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      {developerMode && (
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
