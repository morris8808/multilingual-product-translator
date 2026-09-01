"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n/client";
import { PreferenceSync } from "@/components/preference-sync";
import { GlobalActivity } from "@/components/global-activity";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 120_000,
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <PreferenceSync />
        <GlobalActivity />
        {children}
      </QueryClientProvider>
    </I18nextProvider>
  );
}
