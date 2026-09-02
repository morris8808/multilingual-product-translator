"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SetupAccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/complete-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.get("username"), password: form.get("password"), confirmPassword: form.get("confirmPassword") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "设置失败");
      router.replace("/"); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "设置失败"); }
    finally { setLoading(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-slate-950 p-5">
    <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-8 text-slate-900 shadow-2xl">
      <div className="grid size-12 place-items-center rounded-xl bg-blue-600 text-white"><ShieldCheck className="size-6" /></div>
      <div><p className="text-sm font-medium text-blue-600">首次登录</p><h1 className="mt-1 text-3xl font-bold">创建系统管理员账号</h1><p className="mt-2 text-sm leading-6 text-slate-500">初始账号仅用于启动系统。请设置新的管理员用户名和安全密码，完成前不能进入工作台。</p></div>
      <label className="block text-sm font-medium">新管理员用户名<div className="relative mt-2"><UserRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input name="username" required minLength={3} maxLength={32} autoComplete="username" className="control h-12 pl-10" placeholder="3–32 位字母或数字" /></div></label>
      <label className="block text-sm font-medium">新密码<div className="relative mt-2"><LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="control h-12 pl-10" placeholder="至少 8 个字符" /></div></label>
      <label className="block text-sm font-medium">确认新密码<input name="confirmPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="control mt-2 h-12" placeholder="再次输入新密码" /></label>
      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <Button className="h-12 w-full text-base" disabled={loading}>{loading ? <><LoaderCircle className="size-4 animate-spin" />保存中…</> : "创建管理员账号"}</Button>
    </form>
  </main>;
}
