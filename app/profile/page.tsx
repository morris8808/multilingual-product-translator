import { PageHeading } from "@/components/page-heading";
import { DataPurgePanel } from "@/components/data-purge-panel";
import { MemberRoleManager } from "@/components/member-role-manager";
import { getWorkspaceContext } from "@/lib/workspace-context";
import { LogoutButton } from "@/components/logout-button";

export default async function ProfilePage() {
  const { user } = await getWorkspaceContext();
  const roleLabel =
    user.role === "DEVELOPER"
      ? "系统开发者（最高权限）"
      : user.role === "ADMIN"
        ? "系统管理员"
        : "普通用户";
  const metrics = [
    ["处理商品", "0"],
    ["翻译单元格", "0"],
    ["图片任务", "0"],
    ["独立站写回", "0"],
  ];
  return (
    <main className="space-y-6 p-6 lg:p-8">
      <PageHeading
        eyebrow="账号"
        title="个人中心"
        description="个人资料、工作统计、安全和界面偏好的统一入口。"
      />
      <section className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <span className="grid size-16 place-items-center rounded-full bg-blue-100 text-xl font-semibold text-blue-600">
          管
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{user.name || "工作台用户"}</h2>
          <p className="mt-1 text-xs font-medium text-blue-600">
            身份：{roleLabel}
          </p>
          <p className="text-sm text-slate-500">{user.email}</p>
          <p className="mt-1 text-xs text-slate-400">账号来源：{user.authSource === "JOFSHOP" ? `JOFSHOP · ${user.externalUsername || "后台账号"}` : "本地工作台"}</p>
        </div>
        <LogoutButton />
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>
      <MemberRoleManager role={user.role} />
      <DataPurgePanel role={user.role} />
    </main>
  );
}
