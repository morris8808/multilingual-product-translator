"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return <Button variant="outline" disabled={loading} onClick={async () => { setLoading(true); await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }}>{loading ? "正在退出…" : <><LogOut className="size-4" />退出登录</>}</Button>;
}
