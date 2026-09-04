// 成功路径单测：本地 mock Mastodon 服务器返回成功 → SocialPost 应置 PUBLISHED
import { createServer } from "node:http";
import { db } from "@/lib/db";
import { encryptCredential } from "@/lib/crypto";
import { publishSocialPost } from "@/lib/social-publish";

async function main() {
  const ws = "cmtmqeyj90002suocexccxqcy";
  // 本地 mock：扮演 Mastodon
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url?.includes("/api/v1/statuses")) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.end(JSON.stringify({ id: "mock-post-1", url: "https://mastodon.social/@succ/mock-post-1" }));
      });
      return;
    }
    res.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise<void>((resolve) => server.listen(18999, resolve));

  await db.socialChannel.create({
    data: {
      id: "ch-test-003", workspaceId: ws, platform: "mastodon", kind: "TOKEN",
      name: "成功测试", profileId: "1", username: "succ", picture: "",
      encryptedAccessToken: encryptCredential("mock-token"),
      metadata: { instance: "http://127.0.0.1:18999" },
      enabled: true,
    },
  });
  await db.socialPost.create({
    data: {
      id: "post-test-003", workspaceId: ws, channelId: "ch-test-003",
      content: "hello mock", status: "QUEUED",
    },
  });
  console.log("✅ mock 服务器 + 测试数据就绪，执行发布...");
  const result = await publishSocialPost("post-test-003");
  const post = await db.socialPost.findUnique({ where: { id: "post-test-003" } });
  console.log("publish 返回:", JSON.stringify(result));
  console.log("SocialPost 状态:", post?.status, "| postId:", post?.platformPostId, "| url:", post?.releaseUrl);
  if (post?.status === "PUBLISHED" && post.platformPostId === "mock-post-1") {
    console.log("🎉 成功路径验证通过：帖子已标记为 PUBLISHED");
  } else {
    console.log("❌ 成功路径验证失败");
  }
  server.close();
  await db.$disconnect();
  process.exit(post?.status === "PUBLISHED" ? 0 : 1);
}
main().catch((e) => {
  console.error("测试异常:", e);
  process.exit(1);
});
