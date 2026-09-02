"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Languages, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [returnTo, setReturnTo] = useState("/");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [username, setUsername] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedReturnTo = params.get("returnTo");
    setReturnTo(requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//") ? requestedReturnTo : "/");
    setUsername(localStorage.getItem("workbench-login-username") || "");
  }, []);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(""); setSuccess("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "登录失败");
      if (remember) localStorage.setItem("workbench-login-username", username); else localStorage.removeItem("workbench-login-username");
      router.replace(data.requiresSetup ? "/setup-account" : returnTo); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "登录失败"); }
    finally { setLoading(false); }
  }

  async function submitRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(""); setSuccess("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: form.get("username"), password: form.get("password"), confirmPassword: form.get("confirmPassword") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "注册失败");
      setUsername(String(form.get("username") || "")); setSuccess(data.message || "注册成功，请登录"); setMode("login");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "注册失败"); }
    finally { setLoading(false); }
  }

  const paddedInput = { paddingLeft: "2.5rem", paddingRight: "2.5rem" };
  return <main className="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-900">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(37,99,235,.32),transparent_32%),radial-gradient(circle_at_90%_85%,rgba(124,58,237,.25),transparent_30%)]" />
    <div className="relative mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[1.05fr_.95fr]">
      <section className="hidden flex-col justify-between p-12 text-white lg:flex xl:p-16">
        <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-xl bg-blue-600"><Languages className="size-6" /></span><div><p className="font-semibold">多语言商品工作台</p><p className="text-xs tracking-[.18em] text-slate-400">PRODUCT WORKBENCH</p></div></div>
        <div className="max-w-xl"><h1 className="text-5xl font-semibold leading-tight">让商品处理、翻译与发布协作更简单</h1><p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">登录后即可继续处理商品数据、翻译内容、生成图片并安全写回独立站。</p></div>
        <div />
      </section>
      <section className="flex min-h-screen items-center justify-center bg-slate-50/95 p-5 py-10 backdrop-blur-sm dark:bg-slate-950/90 lg:rounded-l-[2.5rem]">
        <div className="w-full max-w-md">
          <div className="mb-7 flex items-center gap-3 lg:hidden"><span className="grid size-11 place-items-center rounded-xl bg-blue-600 text-white"><Languages className="size-5" /></span><div><p className="font-semibold">多语言商品工作台</p><p className="text-xs text-muted-foreground">PRODUCT WORKBENCH</p></div></div>
          <div className="mb-4 grid grid-cols-2 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800"><button type="button" onClick={() => { setMode("login"); setError(""); }} className={`rounded-lg px-4 py-2 text-sm font-medium ${mode === "login" ? "bg-white shadow-sm dark:bg-slate-700" : "text-muted-foreground"}`}>账号登录</button><button type="button" onClick={() => { setMode("register"); setError(""); setSuccess(""); }} className={`rounded-lg px-4 py-2 text-sm font-medium ${mode === "register" ? "bg-white shadow-sm dark:bg-slate-700" : "text-muted-foreground"}`}>注册账号</button></div>
          {mode === "login" ? <form onSubmit={submitLogin} className="space-y-4 rounded-3xl border bg-white p-7 shadow-2xl shadow-slate-900/10 dark:bg-slate-900 sm:p-9">
            <div><p className="text-sm font-medium text-blue-600">欢迎回来</p><h2 className="mt-1 text-3xl font-bold tracking-tight">登录工作台</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">使用本工作台注册的用户名和密码登录</p></div>
            <label className="block text-sm font-medium">登录账号<div className="relative mt-2"><UserRound className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-slate-400" /><input name="username" autoComplete="username" required autoFocus className="control h-12" style={paddedInput} placeholder="请输入登录账号" value={username} onChange={(event) => setUsername(event.target.value)} /></div></label>
            <PasswordField name="password" label="密码" placeholder="请输入密码" visible={showPassword} onToggle={() => setShowPassword((value) => !value)} style={paddedInput} />
            <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />记住登录账号</label>
            <Feedback error={error} success={success} />
            <Button className="h-12 w-full text-base" disabled={loading}>{loading ? <><LoaderCircle className="size-4 animate-spin" />正在验证…</> : <>登录 <ArrowRight className="size-4" /></>}</Button>
          </form> : <form onSubmit={submitRegister} className="space-y-4 rounded-3xl border bg-white p-7 shadow-2xl shadow-slate-900/10 dark:bg-slate-900 sm:p-9">
            <div><p className="text-sm font-medium text-blue-600">创建工作台账号</p><h2 className="mt-1 text-3xl font-bold tracking-tight">注册账号</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">无需邮箱或验证码，注册后即可登录</p></div>
            <label className="block text-sm font-medium">用户名<input name="username" required minLength={3} maxLength={32} className="control mt-2 h-12" placeholder="3–32 位字母或数字" /></label>
            <PasswordField name="password" label="密码" placeholder="至少 8 个字符" visible={showPassword} onToggle={() => setShowPassword((value) => !value)} style={paddedInput} />
            <label className="block text-sm font-medium">确认密码<input name="confirmPassword" type={showPassword ? "text" : "password"} required className="control mt-2 h-12" placeholder="再次输入密码" /></label>
            <Feedback error={error} success={success} />
            <Button className="h-12 w-full text-base" disabled={loading}>{loading ? <><LoaderCircle className="size-4 animate-spin" />正在注册…</> : "创建账号"}</Button>
          </form>}
        </div>
      </section>
    </div>
  </main>;
}

function PasswordField({ name, label, placeholder, visible, onToggle, style }: { name: string; label: string; placeholder: string; visible: boolean; onToggle: () => void; style: React.CSSProperties }) {
  return <label className="block text-sm font-medium">{label}<div className="relative mt-2"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-slate-400" /><input name={name} type={visible ? "text" : "password"} autoComplete="new-password" required className="control h-12" style={style} placeholder={placeholder} /><button type="button" onClick={onToggle} className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-slate-400 hover:text-slate-700" title={visible ? "隐藏密码" : "显示密码"}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></label>;
}

function Feedback({ error, success }: { error: string; success: string }) {
  if (error) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  if (success) return <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>;
  return null;
}
