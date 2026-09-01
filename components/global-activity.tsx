"use client";
import { useIsMutating } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
export function GlobalActivity() {
  // Background polling must stay invisible; only user-triggered mutations show global activity.
  const active = useIsMutating();
  if (!active) return null;
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-primary/15">
        <div className="h-full w-1/3 animate-[loading_1.1s_ease-in-out_infinite] bg-primary" />
      </div>
      <div className="fixed bottom-5 right-5 z-[100] flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm shadow-lg">
        <LoaderCircle className="size-4 animate-spin text-primary" />
        正在刷新数据…
      </div>
    </>
  );
}
