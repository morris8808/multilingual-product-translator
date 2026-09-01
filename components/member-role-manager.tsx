"use client";

import { useEffect, useState } from "react";

type Member = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  authSource?: string;
  externalUsername?: string | null;
  externalStatus?: string | null;
  lastSyncedAt?: string | null;
  workbenchLoginEnabled: boolean;
};
type ResponseData = {
  currentUserId: string;
  currentRole: string;
  members: Member[];
};

const roleLabel: Record<string, string> = {
  USER: "普通用户",
  ADMIN: "系统管理员",
  DEVELOPER: "系统开发者",
};

export function MemberRoleManager({ role }: { role: string }) {
  const [data, setData] = useState<ResponseData | null>(null);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [authConfig, setAuthConfig] = useState({ enabled: true, enforceLogin: false, apiBaseUrl: "https://www.brxshop.com/apiadmin/api", siteAdminUrl: "https://www.brxshop.com/apiadmin", skillToken: "", hasSkillToken: false });

  useEffect(() => {
    if (!["ADMIN", "DEVELOPER"].includes(role)) return;
    void fetch("/api/admin/members", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "成员列表加载失败");
        setData(result);
      })
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : "成员列表加载失败"),
      );
    void fetch("/api/admin/jofshop", { cache: "no-store" }).then((response) => response.json()).then((value) => { if (!value.error) setAuthConfig(value); });
  }, [role]);

  if (!["ADMIN", "DEVELOPER"].includes(role)) return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"><h2 className="text-lg font-semibold">当前账号没有用户管理权限</h2><p className="mt-2 text-sm">请使用 JOFSHOP 超级账户或由本系统管理员授予管理员权限。用户管理内容不会再以空白页面显示。</p></section>;

  async function updateRole(member: Member, nextRole: string) {
    setSavingId(member.id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id, role: nextRole }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "权限修改失败");
      setData((current) =>
        current
          ? {
              ...current,
              members: current.members.map((item) =>
                item.id === result.id ? result : item,
              ),
            }
          : current,
      );
      setMessage(`已将 ${member.email} 设置为${roleLabel[nextRole]}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "权限修改失败");
    } finally {
      setSavingId("");
    }
  }

  async function updateLoginPermission(member: Member, enabled: boolean) {
    setSavingId(member.id); setMessage("");
    try {
      const response = await fetch("/api/admin/members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: member.id, workbenchLoginEnabled: enabled }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "登录权限修改失败");
      setData((current) => current ? { ...current, members: current.members.map((item) => item.id === result.id ? result : item) } : current);
      setMessage(`${member.email} ${enabled ? "已允许" : "已禁止"}登录工作台`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "登录权限修改失败"); }
    finally { setSavingId(""); }
  }

  async function saveAuthConfig() {
    setMessage("");
    const response = await fetch("/api/admin/jofshop", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(authConfig) });
    const result = await response.json();
    if (response.ok) setAuthConfig((value) => ({ ...value, ...result, skillToken: "" }));
    setMessage(response.ok ? "JOFSHOP 登录设置已保存" : result.error || "设置保存失败");
  }

  async function syncUsers() {
    setSyncing(true); setMessage("");
    const response = await fetch("/api/admin/jofshop", { method: "POST" });
    const result = await response.json();
    setSyncing(false);
    if (!response.ok) { setMessage(result.error || "用户同步失败"); return; }
    setMessage(`${result.warning ? `${result.warning}。` : ""}已从 JOFSHOP 同步 ${result.synced} 名后台用户`);
    const refreshed = await fetch("/api/admin/members", { cache: "no-store" }).then((item) => item.json());
    setData(refreshed);
  }

  return (
    <div className="space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">JOFSHOP 服务端用户</p>
      <h2 className="mt-2 text-lg font-semibold">登录与用户同步</h2>
      <p className="mt-1 text-sm text-slate-500">账号密码只用于向 JOFSHOP 服务端实时验证，不保存密码；登录令牌会加密保存，用于管理员同步用户目录。</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="block text-sm font-medium">后台登录 API 地址<input className="control mt-2 w-full" value={authConfig.apiBaseUrl} onChange={(event) => setAuthConfig((value) => ({ ...value, apiBaseUrl: event.target.value }))} /></label><label className="block text-sm font-medium">Site admin URL<input className="control mt-2 w-full" value={authConfig.siteAdminUrl} onChange={(event) => setAuthConfig((value) => ({ ...value, siteAdminUrl: event.target.value }))} /></label></div>
      <label className="mt-4 block text-sm font-medium">服务端 Skill Token<input type="password" autoComplete="new-password" className="control mt-2 w-full" placeholder={authConfig.hasSkillToken ? "已加密保存；留空表示不修改" : "输入 skill-access-token"} value={authConfig.skillToken} onChange={(event) => setAuthConfig((value) => ({ ...value, skillToken: event.target.value }))} /></label>
      <p className="mt-2 text-xs text-slate-500">该 Token 只用于读取 JOFSHOP 服务端操作员目录，与用户登录密码分开管理。</p>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={authConfig.enabled} onChange={(event) => setAuthConfig((value) => ({ ...value, enabled: event.target.checked }))} />允许 JOFSHOP 登录</label><label className="flex items-center gap-2"><input type="checkbox" checked={authConfig.enforceLogin} onChange={(event) => setAuthConfig((value) => ({ ...value, enforceLogin: event.target.checked }))} />强制所有人登录（完成验证后再开启）</label></div>
      <div className="mt-4 flex gap-3"><button className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white" onClick={() => void saveAuthConfig()}>保存设置</button><button className="rounded-md border px-4 py-2 text-sm" disabled={syncing} onClick={() => void syncUsers()}>{syncing ? "正在同步…" : "同步后台用户"}</button><a href="/login" className="rounded-md border px-4 py-2 text-sm">测试登录页</a></div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
        权限管理
      </p>
      <h2 className="mt-2 text-lg font-semibold">工作区成员角色</h2>
      <p className="mt-1 text-sm text-slate-500">
        开发者为最高权限；管理员不能授予或修改开发者角色，系统始终保留至少一名开发者。
      </p>
      <div className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
        {data?.members.map((member) => {
          const protectedDeveloper =
            data.currentRole === "ADMIN" && member.role === "DEVELOPER";
          return (
            <div
              key={member.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">
                  {member.name || "未命名用户"}
                  {member.id === data.currentUserId ? "（当前账号）" : ""}
                </p>
                <p className="text-sm text-slate-500">{member.email}</p>
                {member.authSource === "JOFSHOP" ? <p className="mt-1 text-xs text-blue-600">JOFSHOP · {member.externalUsername || "未命名"} · {member.externalStatus || "状态未知"}</p> : <p className="mt-1 text-xs text-slate-400">本地账号</p>}
              </div>
              <div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={member.workbenchLoginEnabled} disabled={savingId === member.id} onChange={(event) => void updateLoginPermission(member, event.target.checked)} />允许登录工作台</label><select
                className="control h-10 min-w-40"
                value={member.role}
                disabled={savingId === member.id || protectedDeveloper}
                onChange={(event) =>
                  void updateRole(member, event.target.value)
                }
              >
                <option value="USER">普通用户</option>
                <option value="ADMIN">系统管理员</option>
                {data.currentRole === "DEVELOPER" ? (
                  <option value="DEVELOPER">系统开发者</option>
                ) : null}
              </select></div>
            </div>
          );
        })}
        {!data ? (
          <p className="p-4 text-sm text-slate-500">正在加载成员…</p>
        ) : null}
      </div>
      {message ? <p className="mt-3 text-sm text-blue-600">{message}</p> : null}
    </section>
    </div>
  );
}
