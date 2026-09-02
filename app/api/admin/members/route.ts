import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";

export const runtime = "nodejs";

const ROLES = ["USER", "ADMIN", "DEVELOPER"] as const;

async function requireManager() {
  const context = await getWorkspaceContext();
  if (!["ADMIN", "DEVELOPER"].includes(context.user.role)) {
    throw new Error("FORBIDDEN");
  }
  return context;
}

export async function GET() {
  try {
    const { user, workspace } = await requireManager();
    const memberships = await db.membership.findMany({
      where: { workspaceId: workspace.id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
            authSource: true,
            externalUsername: true,
            externalStatus: true,
            lastSyncedAt: true,
            workbenchLoginEnabled: true,
          },
        },
      },
      orderBy: { user: { createdAt: "asc" } },
    });
    return Response.json({
      currentUserId: user.id,
      currentRole: user.role,
      members: memberships.map((membership) => membership.user),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return Response.json(
        { error: "仅管理员或开发者可以查看成员权限" },
        { status: 403 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "成员列表加载失败" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, workspace } = await requireManager();
    const input = (await request.json()) as { userId?: string; role?: string; workbenchLoginEnabled?: boolean };
    if (
      !input.userId ||
      (input.role !== undefined && !ROLES.includes(input.role as (typeof ROLES)[number]))
    ) {
      return Response.json({ error: "用户或角色无效" }, { status: 400 });
    }
    const target = await db.user.findFirst({
      where: {
        id: input.userId,
        memberships: { some: { workspaceId: workspace.id } },
      },
      select: { id: true, email: true, role: true },
    });
    if (!target)
      return Response.json({ error: "工作区成员不存在" }, { status: 404 });
    const nextRole = input.role || target.role;
    if (
      user.role === "ADMIN" &&
      (target.role === "DEVELOPER" || nextRole === "DEVELOPER")
    ) {
      return Response.json(
        { error: "管理员不能修改或授予开发者权限" },
        { status: 403 },
      );
    }
    if (target.role === "DEVELOPER" && nextRole !== "DEVELOPER") {
      const developerCount = await db.user.count({
        where: {
          role: "DEVELOPER",
          memberships: { some: { workspaceId: workspace.id } },
        },
      });
      if (developerCount <= 1) {
        return Response.json(
          { error: "必须保留至少一名系统开发者" },
          { status: 409 },
        );
      }
    }
    const updated = await db.user.update({
      where: { id: target.id },
      data: { role: nextRole, ...(typeof input.workbenchLoginEnabled === "boolean" ? { workbenchLoginEnabled: input.workbenchLoginEnabled } : {}) },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        authSource: true,
        externalUsername: true,
        externalStatus: true,
        lastSyncedAt: true,
        workbenchLoginEnabled: true,
      },
    });
    await db.auditLog.create({
      data: {
        workspaceId: workspace.id,
        action: "MEMBER_ROLE_UPDATED",
        entityType: "User",
        entityId: target.id,
        detail: {
          actorId: user.id,
          email: target.email,
          before: target.role,
          after: nextRole,
          workbenchLoginEnabled: input.workbenchLoginEnabled,
        },
      },
    });
    return Response.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return Response.json({ error: "没有权限修改成员角色" }, { status: 403 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "权限修改失败" },
      { status: 500 },
    );
  }
}
