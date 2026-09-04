"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  ExternalLink,
  Link2,
  LoaderCircle,
  MessageSquareText,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Channel = {
  id: string;
  platform: string;
  kind: string;
  name: string;
  username: string | null;
  picture: string | null;
  enabled: boolean;
  createdAt: string;
};
type ProviderMeta = {
  id: string;
  name: string;
  kind: string;
  connectHint: string;
  missingEnv: string[];
};
type PostRow = {
  id: string;
  content: string;
  status: string;
  scheduledAt: string | null;
  platformPostId: string | null;
  releaseUrl: string | null;
  error: string | null;
  createdAt: string;
  publishedAt: string | null;
  channel: { id: string; platform: string; name: string; picture: string | null };
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  QUEUED: "已排期",
  PUBLISHING: "发布中",
  PUBLISHED: "已发布",
  FAILED: "失败",
  CANCELLED: "已取消",
};
const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  QUEUED: "bg-amber-100 text-amber-700",
  PUBLISHING: "bg-blue-100 text-blue-700",
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
  CANCELLED: "bg-muted text-muted-foreground",
};

export default function SocialPage() {
  const client = useQueryClient();
  const [channelOpen, setChannelOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<ProviderMeta | null>(null);
  const [credentials, setCredentials] = useState("");
  const [content, setContent] = useState("");
  const [pickChannel, setPickChannel] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduleAt, setScheduleAt] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [filter, setFilter] = useState("");

  const channelsQuery = useQuery({
    queryKey: ["social-channels"],
    queryFn: async () => {
      const r = await fetch("/api/social/channels", { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "读取失败");
      return data as { channels: Channel[]; providers: ProviderMeta[] };
    },
  });
  const channels = channelsQuery.data?.channels ?? [];
  const providers = channelsQuery.data?.providers ?? [];

  const postsQuery = useQuery({
    queryKey: ["social-posts", filter],
    queryFn: async () => {
      const qs = filter ? `?status=${encodeURIComponent(filter)}` : "";
      const r = await fetch(`/api/social/posts${qs}`, { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "读取失败");
      return data as { posts: PostRow[] };
    },
  });
  const posts = postsQuery.data?.posts ?? [];

  const addChannel = useMutation({
    mutationFn: async () => {
      if (!selectedPlatform) throw new Error("请选择平台");
      if (selectedPlatform.kind === "TOKEN") {
        const r = await fetch("/api/social/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: selectedPlatform.id, credentials }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "添加失败");
        return data;
      }
      const r = await fetch("/api/social/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: selectedPlatform.id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "发起授权失败");
      return data as { authUrl: string; state: string };
    },
    onSuccess: (data) => {
      if (selectedPlatform?.kind === "TOKEN") {
        setChannelOpen(false);
        setSelectedPlatform(null);
        setCredentials("");
        void client.invalidateQueries({ queryKey: ["social-channels"] });
      } else if (data && (data as { authUrl?: string }).authUrl) {
        window.open((data as { authUrl: string }).authUrl, "_blank", "noopener,width=760,height=640");
        setChannelOpen(false);
        setSelectedPlatform(null);
        // 授权走回调接口落地，轮询等待频道出现
        let tries = 0;
        const timer = window.setInterval(async () => {
          tries += 1;
          void client.invalidateQueries({ queryKey: ["social-channels"] });
          const fresh = await fetch("/api/social/channels", { cache: "no-store" }).then((res) => res.json());
          const count = (fresh?.channels ?? []).length;
          if (count > channels.length || tries > 60) window.clearInterval(timer);
        }, 2000);
      }
    },
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/social/channels/${id}`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "删除失败");
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["social-channels"] }),
  });

  const createPost = useMutation({
    mutationFn: async () => {
      if (!pickChannel) throw new Error("请选择发布频道");
      const r = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: pickChannel,
          content,
          immediate: scheduleMode === "now",
          scheduledAt: scheduleMode === "later" ? new Date(scheduleAt).toISOString() : null,
          media: mediaUrl.trim()
            ? mediaUrl.split(/[\n,]/).map((url) => ({ path: url.trim() })).filter((m) => m.path)
            : undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "发布失败");
      return data;
    },
    onSuccess: () => {
      setContent("");
      setMediaUrl("");
      setScheduleMode("now");
      void client.invalidateQueries({ queryKey: ["social-posts"] });
    },
  });

  const cancelPost = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/social/posts/${id}/cancel`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "取消失败");
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["social-posts"] }),
  });

  const pickChannelName = useMemo(
    () => channels.find((c) => c.id === pickChannel)?.name || "",
    [channels, pickChannel],
  );

  return (
    <main className="space-y-6 p-5 lg:p-8">
      <div className="flex items-end justify-between gap-4">
        <PageHeading
          eyebrow="内容分发"
          title="社媒发布"
          description="连接社交平台账号，编排内容并定时发布。发布任务由后台 Worker 自动执行。"
        />
        <Button
          onClick={() => {
            setSelectedPlatform(null);
            setCredentials("");
            setChannelOpen(true);
          }}
        >
          <Plus className="size-4" />
          添加频道
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">发布新内容</CardTitle>
              <CardDescription>
                将发布到：{pickChannelName || "（请先在下方选择一个频道）"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>选择频道</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {channels.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => setPickChannel(ch.id)}
                      className={
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors " +
                        (pickChannel === ch.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:border-primary/50")
                      }
                    >
                      {ch.picture ? (
                        <img src={ch.picture} alt="" className="size-5 rounded-full object-cover" />
                      ) : (
                        <Link2 className="size-4" />
                      )}
                      <span>{ch.name}</span>
                      <Badge variant="outline" className="text-[10px]">{ch.platform}</Badge>
                    </button>
                  ))}
                  {channels.length === 0 && (
                    <p className="text-sm text-muted-foreground">暂无频道，请先点击右上角「添加频道」。</p>
                  )}
                </div>
              </div>
              <div>
                <Label>内容</Label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="输入要发布的文案…"
                  rows={5}
                  className="mt-2 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <p className="mt-1 text-right text-xs text-muted-foreground">{content.length} 字符</p>
              </div>
              <div>
                <Label>媒体图片 URL（可选，每行一个）</Label>
                <Input
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://…/image.png"
                />
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <Label>发布方式</Label>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setScheduleMode("now")}
                      className={
                        "rounded-lg border px-3 py-2 text-sm " +
                        (scheduleMode === "now" ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50")
                      }
                    >
                      立即发布
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleMode("later")}
                      className={
                        "rounded-lg border px-3 py-2 text-sm " +
                        (scheduleMode === "later" ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50")
                      }
                    >
                      定时发布
                    </button>
                  </div>
                </div>
                {scheduleMode === "later" && (
                  <div>
                    <Label>发布时间</Label>
                    <Input
                      type="datetime-local"
                      value={scheduleAt}
                      onChange={(e) => setScheduleAt(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                )}
                <Button
                  disabled={createPost.isPending || !pickChannel || !content.trim()}
                  onClick={() => createPost.mutate()}
                  className="ml-auto"
                >
                  {createPost.isPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {createPost.isPending ? "提交中…" : scheduleMode === "now" ? "立即发布" : "加入排期"}
                </Button>
              </div>
              {createPost.error && (
                <p className="text-sm text-destructive">{createPost.error.message}</p>
              )}
              {createPost.data && (
                <p className="text-sm text-emerald-600">内容已加入发布队列。</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">发布队列</CardTitle>
                <CardDescription>全部频道的内容与状态</CardDescription>
              </div>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="rounded-lg border bg-transparent px-3 py-1.5 text-sm"
              >
                <option value="">全部状态</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </CardHeader>
            <CardContent className="space-y-2">
              {posts.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">暂无发布记录。</p>
              )}
              {posts.map((post) => (
                <div key={post.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="grid size-8 shrink-0 place-items-center rounded-full bg-muted">
                    {post.channel.picture ? (
                      <img src={post.channel.picture} alt="" className="size-8 rounded-full object-cover" />
                    ) : (
                      <MessageSquareText className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{post.channel.name}</span>
                      <Badge variant="outline" className="text-[10px]">{post.channel.platform}</Badge>
                      <Badge className={STATUS_STYLES[post.status] || ""}>{STATUS_LABELS[post.status] || post.status}</Badge>
                      {post.scheduledAt && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarClock className="size-3" />
                          {new Date(post.scheduledAt).toLocaleString("zh-CN")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{post.content}</p>
                    {post.error && <p className="mt-1 text-xs text-destructive">{post.error}</p>}
                    {post.releaseUrl && (
                      <a
                        href={post.releaseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="size-3" />
                        查看发布结果
                      </a>
                    )}
                  </div>
                  {["QUEUED", "DRAFT", "FAILED"].includes(post.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancelPost.mutate(post.id)}
                    >
                      <X className="size-3.5" />
                      取消
                    </Button>
                  )}
                </div>
              ))}
              {postsQuery.error && (
                <p className="text-sm text-destructive">{postsQuery.error.message}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">已连接频道</CardTitle>
              <CardDescription>{channels.length} 个账号</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {channels.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">还没有频道。</p>
              )}
              {channels.map((ch) => (
                <div key={ch.id} className="flex items-center gap-3 rounded-lg border p-3">
                  {ch.picture ? (
                    <img src={ch.picture} alt="" className="size-9 rounded-full object-cover" />
                  ) : (
                    <div className="grid size-9 place-items-center rounded-full bg-muted">
                      <Link2 className="size-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{ch.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {ch.platform}
                      {ch.username ? ` · @${ch.username}` : ""}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    title="删除频道"
                    onClick={() => {
                      if (window.confirm(`确定删除频道「${ch.name}」吗？`)) deleteChannel.mutate(ch.id);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {channelOpen && (
        <>
          <button
            type="button"
            aria-label="关闭添加频道弹窗"
            className="fixed inset-0 z-40 bg-black/45"
            onClick={() => setChannelOpen(false)}
          />
          <Card className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(620px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-auto shadow-2xl">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>{selectedPlatform ? `连接 ${selectedPlatform.name}` : "选择平台"}</CardTitle>
                  <CardDescription>
                    {selectedPlatform
                      ? selectedPlatform.connectHint
                      : "免开发者应用平台可直接填入凭据；主流平台通过 OAuth 授权连接。"}
                  </CardDescription>
                </div>
                <Button type="button" variant="ghost" onClick={() => setChannelOpen(false)}>
                  关闭
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedPlatform ? (
                <div className="grid grid-cols-2 gap-2">
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlatform(p)}
                      className="flex flex-col items-start gap-1 rounded-lg border p-3 text-left text-sm hover:border-primary"
                    >
                      <span className="font-medium">{p.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {p.kind === "OAUTH1" ? "OAuth 授权" : p.kind === "OAUTH2" ? "OAuth 授权" : "填入凭据"}
                      </Badge>
                      {p.missingEnv.length > 0 && (
                        <span className="text-[10px] text-amber-600">
                          需配置：{p.missingEnv.join(", ")}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : selectedPlatform.kind === "TOKEN" ? (
                <div className="space-y-3">
                  <div>
                    <Label>平台凭据</Label>
                    <textarea
                      value={credentials}
                      onChange={(e) => setCredentials(e.target.value)}
                      placeholder="按平台要求填写，例如 Bluesky 填 账号:应用密码"
                      rows={2}
                      className="mt-2 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{selectedPlatform.connectHint}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <Button variant="ghost" type="button" onClick={() => setSelectedPlatform(null)}>
                      <RefreshCw className="size-3.5" />
                      返回选择
                    </Button>
                    <Button onClick={() => addChannel.mutate()} disabled={addChannel.isPending || !credentials.trim()}>
                      {addChannel.isPending ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                      {addChannel.isPending ? "验证中…" : "连接账号"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="rounded-lg bg-muted/50 p-3 text-sm">
                    点击下方按钮将打开 {selectedPlatform.name} 授权页面，完成后自动回到本页并出现在频道列表。
                  </p>
                  {selectedPlatform.missingEnv.length > 0 && (
                    <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
                      服务器还缺少 {selectedPlatform.missingEnv.join(", ")} 配置，授权可能失败。请联系管理员完成平台应用配置。
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <Button variant="ghost" type="button" onClick={() => setSelectedPlatform(null)}>
                      <RefreshCw className="size-3.5" />
                      返回选择
                    </Button>
                    <Button onClick={() => addChannel.mutate()} disabled={addChannel.isPending}>
                      {addChannel.isPending ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <ExternalLink className="size-4" />
                      )}
                      {addChannel.isPending ? "处理中…" : "前往授权"}
                    </Button>
                  </div>
                </div>
              )}
              {addChannel.error && (
                <p className="text-sm text-destructive">{addChannel.error.message}</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
