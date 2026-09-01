import { db } from "@/lib/db";
import { createJobSchema } from "@/lib/schemas/jobs";
import { getWorkspaceContext } from "@/lib/workspace-context";
export const runtime = "nodejs";
export async function GET() { const {workspace}=await getWorkspaceContext(); const jobs=await db.job.findMany({where:{workspaceId:workspace.id},include:{events:{orderBy:{createdAt:"desc"},take:30}},orderBy:{createdAt:"desc"},take:50}); return Response.json(jobs); }
export async function POST(request:Request) { try { const data=createJobSchema.parse(await request.json()); const {workspace}=await getWorkspaceContext(); const job=await db.job.create({data:{workspaceId:workspace.id,type:data.type,status:"QUEUED",payload:{steps:data.steps,delayMs:data.delayMs},totalItems:data.steps,events:{create:{level:"INFO",message:"SYSTEM_TEST 已进入队列"}}}}); return Response.json(job,{status:201}); } catch(error){return Response.json({error:error instanceof Error?error.message:"任务创建失败"},{status:400});} }
