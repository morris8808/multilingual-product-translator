import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fieldDefinitionSchema } from "@/lib/schemas/products";
import { getWorkspaceContext } from "@/lib/workspace-context";

export async function GET() {
  const { workspace } = await getWorkspaceContext();
  return Response.json(
    await db.fieldDefinition.findMany({
      where: { workspaceId: workspace.id },
      include: { rule: true },
      orderBy: { position: "asc" },
    }),
  );
}

export async function POST(request: Request) {
  try {
    const input = fieldDefinitionSchema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const current = input.id
      ? await db.fieldDefinition.findFirst({
          where: { id: input.id, workspaceId: workspace.id },
        })
      : null;
    if (input.id && !current)
      return Response.json({ error: "字段不存在" }, { status: 404 });
    const saved = await db.$transaction(async (tx) => {
      const values = {
        key: input.key,
        label: input.label,
        type: input.type,
        defaultValue:
          input.defaultValue === undefined
            ? Prisma.JsonNull
            : (JSON.parse(
                JSON.stringify(input.defaultValue),
              ) as Prisma.InputJsonValue),
        hidden: input.hidden,
        frozen: input.frozen,
        position: input.position,
      };
      const field = current
        ? await tx.fieldDefinition.update({
            where: { id: current.id },
            data: values,
          })
        : await tx.fieldDefinition.upsert({
            where: {
              workspaceId_key: { workspaceId: workspace.id, key: input.key },
            },
            update: values,
            create: { workspaceId: workspace.id, ...values },
          });
      if (input.rule)
        await tx.fieldRule.upsert({
          where: { fieldDefinitionId: field.id },
          update: {
            kind: input.rule.kind,
            config: input.rule.config as Prisma.InputJsonObject,
          },
          create: {
            fieldDefinitionId: field.id,
            kind: input.rule.kind,
            config: input.rule.config as Prisma.InputJsonObject,
          },
        });
      else
        await tx.fieldRule.deleteMany({
          where: { fieldDefinitionId: field.id },
        });
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          action: current ? "FIELD_UPDATE" : "FIELD_CREATE",
          entityType: "FieldDefinition",
          entityId: field.id,
          detail: {
            key: field.key,
            type: field.type,
            ruleKind: input.rule?.kind || null,
          },
        },
      });
      return tx.fieldDefinition.findUniqueOrThrow({
        where: { id: field.id },
        include: { rule: true },
      });
    });
    return Response.json(saved, { status: current ? 200 : 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "字段保存失败" },
      { status: 400 },
    );
  }
}
