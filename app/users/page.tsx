import { PageHeading } from "@/components/page-heading";
import { MemberRoleManager } from "@/components/member-role-manager";
import { getWorkspaceContext } from "@/lib/workspace-context";
import { redirect } from "next/navigation";

export default async function UsersPage() {
  const { user } = await getWorkspaceContext();
  if (!["ADMIN", "DEVELOPER"].includes(user.role)) redirect("/");
  return (
    <main className="space-y-6 p-6 lg:p-8">
      <PageHeading
        eyebrow="权限"
        title="用户管理中心"
        description="管理员和开发者可以查看后台用户，并调整普通用户、管理员和开发者权限。"
      />
      <MemberRoleManager role={user.role} />
    </main>
  );
}
