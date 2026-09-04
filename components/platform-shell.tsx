"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bot,
  Boxes,
  Bell,
  BookOpen,
  Database,
  FileCog,
  Home,
  Images,
  Languages,
  ListTodo,
  Send,
  Bug,
  Menu,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Settings,
  Sun,
  Moon,
  UserCircle,
  Users,
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Trash2,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
const WORK_ITEMS = [
  { href: "/", key: "home", icon: Home },
  { href: "/prepare", key: "prepare", icon: FileCog },
  { href: "/products", key: "products", icon: Languages },
  { href: "/images", key: "images", icon: Images },
  { href: "/terms", key: "terms", icon: BookOpen },
  { href: "/content", key: "content", icon: Boxes },
  { href: "/tasks", key: "tasks", icon: ListTodo },
  { href: "/social", key: "social", icon: Send },
] as const;
const SYSTEM_ITEMS = [
  { href: "/preferences", key: "preferences", icon: Settings },
] as const;
const SETTINGS_PATHS = ["/preferences", "/recycle-bin", "/models", "/connections", "/storage", "/users", "/developer"];
const PAGE_TITLES: Record<string, string> = {
  "/": "首页",
  "/prepare": "商品处理工作台",
  "/products": "商品翻译工作台",
  "/images": "商品图片工作台",
  "/terms": "术语管理",
  "/content": "内容翻译",
  "/tasks": "任务中心",
  "/social": "社媒发布",
  "/models": "模型设置",
  "/connections": "独立站 API",
  "/storage": "存储归档",
  "/profile": "个人中心",
  "/users": "用户管理中心",
  "/preferences": "设置",
  "/developer": "开发者中心",
};
export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [pendingPath, setPendingPath] = useState("");
  const [taskStatusOpen, setTaskStatusOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [workspaceBrand, setWorkspaceBrand] = useState<{
    name?: string;
    subtitle?: string | null;
    logoUrl?: string | null;
  }>();
  const [workspaceBrandLoaded, setWorkspaceBrandLoaded] = useState(false);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ name?: string | null; email?: string; authSource?: string }>();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const pageLoadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [health, setHealth] = useState<{
    database: { online: boolean };
    worker: { online: boolean; count: number };
    jobs: {
      running: number;
      completed: number;
      failed24h: number;
      progress: number;
    };
  }>();
  const [recentJobs, setRecentJobs] = useState<
    Array<{
      id: string;
      type: string;
      status: string;
      updatedAt: string;
      completedItems: number;
      totalItems: number;
    }>
  >([]);
  const pageTitle =
    Object.entries(PAGE_TITLES).find(([href]) =>
      href === "/"
        ? (pendingPath || pathname) === "/"
        : (pendingPath || pathname).startsWith(href),
    )?.[1] || "工作台";
  const inSettings = SETTINGS_PATHS.some((path) => pathname.startsWith(path));
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [healthResponse, jobsResponse, settingsResponse] = await Promise.all([
          fetch("/api/health", { cache: "no-store" }),
          fetch("/api/jobs", { cache: "no-store" }),
          fetch("/api/settings", { cache: "no-store" }),
        ]);
        if (!active) return;
        if (healthResponse.ok) setHealth(await healthResponse.json());
        else
          setHealth({
            database: { online: false },
            worker: { online: false, count: 0 },
            jobs: { running: 0, completed: 0, failed24h: 0, progress: 0 },
          });
        if (jobsResponse.ok)
          setRecentJobs((await jobsResponse.json()).slice(0, 8));
        if (settingsResponse.ok) {
          const settings = await settingsResponse.json();
          setWorkspaceBrand(settings.workspace);
          setWorkspaceBrandLoaded(true);
          setCurrentRole(settings.user?.role || "USER");
          setCurrentUser(settings.user);
        } else setWorkspaceBrandLoaded(true);
      } catch {
        if (active) setWorkspaceBrandLoaded(true);
        if (active)
          setHealth({
            database: { online: false },
            worker: { online: false, count: 0 },
            jobs: { running: 0, completed: 0, failed24h: 0, progress: 0 },
          });
      }
    };
    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (pageLoadingTimer.current) {
      clearTimeout(pageLoadingTimer.current);
      pageLoadingTimer.current = null;
    }
    setPageLoading(false);
    setPendingPath("");
  }, [pathname]);
  useEffect(() => {
    const handleInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === pathname) return;
      setPendingPath(url.pathname);
      setPageLoading(true);
      setAccountMenuOpen(false);
    };
    document.addEventListener("click", handleInternalNavigation, true);
    return () => document.removeEventListener("click", handleInternalNavigation, true);
  }, [pathname]);
  useEffect(() => {
    if (currentRole && !["ADMIN", "DEVELOPER"].includes(currentRole) && ["/users", "/developer"].some((path) => pathname.startsWith(path))) {
      router.replace("/");
    }
  }, [currentRole, pathname, router]);
  useEffect(() => {
    const prefetch = () => {
      for (const entry of [...WORK_ITEMS, ...SYSTEM_ITEMS]) {
        if (entry.href !== pathname) router.prefetch(entry.href);
      }
    };
    const idle = window.requestIdleCallback?.(prefetch, { timeout: 2000 });
    const timer = idle ? null : window.setTimeout(prefetch, 800);
    return () => {
      if (idle) window.cancelIdleCallback?.(idle);
      if (timer) window.clearTimeout(timer);
      if (pageLoadingTimer.current) clearTimeout(pageLoadingTimer.current);
    };
  }, [pathname, router]);
  useEffect(() => {
    setTheme(localStorage.getItem("app-theme") || "light");
    setSidebarCollapsed(localStorage.getItem("sidebar-collapsed") === "true");
    setFocusMode(localStorage.getItem("focus-mode") === "true");
  }, []);
  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      localStorage.setItem("sidebar-collapsed", String(!current));
      return !current;
    });
  };
  const toggleFocusMode = () => {
    setFocusMode((current) => {
      localStorage.setItem("focus-mode", String(!current));
      return !current;
    });
  };
  const changeTheme = async () => {
    const next = document.documentElement.classList.contains("dark")
      ? "light"
      : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("app-theme", next);
    localStorage.setItem("app-theme-override", next);
    setTheme(next);
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const settings = await response.json();
      if (!response.ok) throw new Error(settings.error || "主题设置读取失败");
      const saveResponse = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "preferences",
          data: { ...(settings.preferences || {}), theme: next },
        }),
      });
      if (!saveResponse.ok) throw new Error("主题设置保存失败");
      localStorage.removeItem("app-theme-override");
    } catch {
      // 保留本地覆盖，避免页面切换时被旧的服务端偏好反向覆盖。
    }
  };
  const startPageLoading = (href: string) => {
    setPendingPath(href);
    if (pageLoadingTimer.current) clearTimeout(pageLoadingTimer.current);
    pageLoadingTimer.current = null;
    setPageLoading(true);
  };
  const openAccountMenu = () => {
    if (accountMenuTimer.current) clearTimeout(accountMenuTimer.current);
    setAccountMenuOpen(true);
  };
  const closeAccountMenu = () => {
    accountMenuTimer.current = setTimeout(() => setAccountMenuOpen(false), 160);
  };
  const logout = async () => {
    setAccountMenuOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };
  const item = (
    entry: (typeof WORK_ITEMS)[number] | (typeof SYSTEM_ITEMS)[number],
  ) => {
    const active = entry.href === "/preferences"
      ? SETTINGS_PATHS.some((path) => (pendingPath || pathname).startsWith(path))
      : entry.href === "/"
        ? (pendingPath || pathname) === "/"
        : (pendingPath || pathname).startsWith(entry.href);
    const Icon = entry.icon;
    return (
      <Link
        key={entry.href}
        href={entry.href}
        onMouseEnter={() => router.prefetch(entry.href)}
        onFocus={() => router.prefetch(entry.href)}
        onClick={() => {
          setMobileOpen(false);
          if (!active) startPageLoading(entry.href);
        }}
        className={cn(
          "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-white/8 hover:text-white",
          sidebarCollapsed && "justify-center px-0",
          active &&
            "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-white",
        )}
        title={t(`nav.${entry.key}`)}
      >
        <Icon className="size-4" />
        {!sidebarCollapsed && <span>{t(`nav.${entry.key}`)}</span>}
      </Link>
    );
  };
  if (pathname === "/login" || pathname === "/setup-account") return <>{children}</>;
  return (
    <div
      className={cn(
        "min-h-screen bg-background text-foreground transition-[padding]",
        focusMode
          ? "lg:pl-0"
          : sidebarCollapsed
            ? "lg:pl-16"
            : "lg:pl-48",
      )}
    >
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/8 bg-sidebar text-sidebar-foreground transition-all lg:translate-x-0",
          sidebarCollapsed ? "w-16" : "w-48",
          focusMode && "lg:-translate-x-full",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          className={cn(
            "flex h-18 items-center gap-3 border-b border-white/10 px-4",
            sidebarCollapsed && "justify-center px-2",
          )}
        >
          <span className={cn("grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl", workspaceBrand?.logoUrl ? "bg-sidebar" : workspaceBrandLoaded ? "bg-primary shadow-lg shadow-primary/20" : "animate-pulse bg-white/10")}>
            {!workspaceBrandLoaded ? null : workspaceBrand?.logoUrl ? (
              <img
                src={workspaceBrand.logoUrl}
                alt=""
                className="size-full object-contain"
              />
            ) : (
              <Languages className="size-5" />
            )}
          </span>
          {!sidebarCollapsed && (
          <div className="min-w-0 flex-1">
            {workspaceBrandLoaded ? <>
              <p className="truncate text-sm font-semibold text-white">
                {workspaceBrand?.name || "工作台"}
              </p>
              <p className="truncate text-[10px] tracking-wider text-sidebar-foreground/50">
                {workspaceBrand?.subtitle || ""}
              </p>
            </> : <div className="space-y-2"><div className="h-3 w-24 animate-pulse rounded bg-white/10" /><div className="h-2 w-16 animate-pulse rounded bg-white/10" /></div>}
          </div>
          )}
        </div>
        <nav className="flex min-h-0 flex-1 flex-col p-3">
          <div className="space-y-1">{WORK_ITEMS.map(item)}</div>
          <div className="mt-auto space-y-1 border-t border-white/10 pt-3">
            <button
              type="button"
              className={cn(
                "hidden h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-white/8 hover:text-white lg:flex",
                sidebarCollapsed && "justify-center px-0",
              )}
              title={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
              onClick={toggleSidebar}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="size-5" />
              ) : (
                <PanelLeftClose className="size-5" />
              )}
            </button>
          </div>
        </nav>
      </aside>
      {mobileOpen && (
        <button
          aria-label="关闭菜单"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <header className="sticky top-0 z-30 flex h-18 items-center justify-between border-b bg-card/90 px-4 text-card-foreground shadow-sm backdrop-blur lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <p className="truncate text-base font-semibold">{pageTitle}</p>
          <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <span
              className={cn(
                "size-1.5 rounded-full",
                health?.database.online && health?.worker.online
                  ? "bg-emerald-500"
                  : "bg-amber-500",
              )}
            />
            {!health
              ? "正在检查服务…"
              : health.database.online && health.worker.online
                ? `${t("shell.online")} · ${health.worker.count} Worker`
                : health.database.online
                  ? "数据库在线 · Worker 离线"
                  : "数据库连接异常"}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            title={focusMode ? "退出专注模式" : "专注模式"}
            onClick={toggleFocusMode}
          >
            {focusMode ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="切换语言"
            onClick={() =>
              void i18n.changeLanguage(i18n.language === "zh" ? "en" : "zh")
            }
          >
            <span className="text-xs font-bold">
              {i18n.language === "zh" ? "EN" : "中"}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="切换主题"
            onClick={() => void changeTheme()}
          >
            {theme === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </Button>
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              title="任务通知"
              onClick={() => setNotificationsOpen((value) => !value)}
            >
              <Bell className="size-4" />
              {Boolean(health?.jobs.failed24h || health?.jobs.running) && (
                <span
                  className={cn(
                    "absolute right-1 top-1 size-2 rounded-full",
                    health?.jobs.failed24h ? "bg-destructive" : "bg-primary",
                  )}
                />
              )}
            </Button>
            {notificationsOpen && (
              <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl border bg-card shadow-xl">
                <div className="flex items-center justify-between border-b p-3">
                  <strong className="text-sm">任务通知</strong>
                  <Button size="sm" variant="ghost" asChild>
                    <Link
                      href="/tasks"
                      onClick={() => setNotificationsOpen(false)}
                    >
                      全部任务
                    </Link>
                  </Button>
                </div>
                <div className="max-h-80 overflow-auto p-2">
                  {recentJobs.map((job) => (
                    <Link
                      key={job.id}
                      href="/tasks"
                      onClick={() => setNotificationsOpen(false)}
                      className="flex items-start gap-2 rounded-lg p-2 hover:bg-muted"
                    >
                      {job.status === "FAILED" ? (
                        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                      ) : ["QUEUED", "RUNNING", "RETRYING", "PAUSED"].includes(
                          job.status,
                        ) ? (
                        <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {job.type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {job.status} ·{" "}
                          {new Date(job.updatedAt).toLocaleTimeString()}
                        </span>
                      </span>
                    </Link>
                  ))}
                  {!recentJobs.length && (
                    <p className="p-6 text-center text-sm text-muted-foreground">
                      暂无任务通知
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <Button variant="outline" size="sm" type="button" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((value) => !value)}>
              <UserCircle className="size-4" />
              <span className="hidden sm:inline">{t("nav.profile")}</span>
              <ChevronDown className={cn("hidden size-3.5 transition-transform sm:block", accountMenuOpen && "rotate-180")} />
            </Button>
            {accountMenuOpen ? <div role="menu" className="absolute right-0 top-full z-50 w-64 pt-2">
              <div className="overflow-hidden rounded-xl border bg-card p-2 text-card-foreground shadow-xl">
                <div className="border-b px-3 py-2.5"><p className="truncate text-sm font-semibold">{currentUser?.name || "工作台用户"}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{currentUser?.email || "当前登录账号"}</p></div>
                <Link role="menuitem" href="/profile" onClick={() => setAccountMenuOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><UserCircle className="size-4" />进入个人中心</Link>
                <Link role="menuitem" href="/preferences" onClick={() => setAccountMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><Settings className="size-4" />设置</Link>
                <button role="menuitem" type="button" onClick={() => void logout()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10"><LogOut className="size-4" />退出登录</button>
              </div>
            </div> : null}
          </div>
        </div>
      </header>
      <div className="relative mx-auto w-full max-w-[1600px]">
        {pageLoading ? (
          <div
            className={cn(
              "fixed left-0 right-0 top-[4.5rem] z-[45] grid h-[calc(100vh-4.5rem)] place-items-center bg-background transition-[left]",
              focusMode
                ? "lg:left-0"
                : sidebarCollapsed
                  ? "lg:left-16"
                  : "lg:left-48",
            )}
          >
            <div className="flex items-center gap-3 rounded-xl border bg-card px-5 py-4 text-sm shadow-xl">
              <LoaderCircle className="size-5 animate-spin text-primary" />
              正在打开{pageTitle}…
            </div>
          </div>
        ) : inSettings ? <div className="grid items-start xl:grid-cols-[220px_minmax(0,1fr)]"><SettingsNavigation role={currentRole} pathname={pathname} /><div className="min-w-0">{children}</div></div> : children}
      </div>
      <div
        className={cn(
          "fixed bottom-5 right-5 z-40 flex items-center gap-3 rounded-full border bg-card/95 py-2 pl-2 shadow-xl backdrop-blur hover:border-primary",
          taskStatusOpen ? "pr-4" : "pr-2",
        )}
      >
        <button
          type="button"
          onClick={() => setTaskStatusOpen((value) => !value)}
          className="grid size-10 place-items-center rounded-full"
        >
          <span
          className="grid size-10 place-items-center rounded-full border-2 border-white shadow-inner"
          style={{
            background: `conic-gradient(${health?.jobs.failed24h ? "#ef4444" : "#22c55e"} ${health?.jobs.running ? health.jobs.progress : 100}%, rgba(255,255,255,.28) 0)`,
          }}
          title={
            health?.jobs.failed24h
              ? "近 24 小时有失败任务"
              : `进行中任务总体进度 ${health?.jobs.progress || 0}%`
          }
        >
          <span className="grid size-6 place-items-center rounded-full bg-slate-900 text-[9px] font-semibold text-white">
            {health?.jobs.failed24h
              ? "!"
              : health?.jobs.running
                ? `${health.jobs.progress}%`
                : "✓"}
          </span>
          </span>
        </button>
        {taskStatusOpen && (
          <Link href="/tasks" className="text-xs">
            <strong className="block text-sm">任务状态</strong>处理中{" "}
            {health?.jobs.running || 0} · 已完成 {health?.jobs.completed || 0}
          </Link>
        )}
      </div>
    </div>
  );
}

function SettingsNavigation({ role, pathname }: { role: string | null; pathname: string }) {
  const groups = [
    { title: "工作台设置", items: [
      { href: "/preferences", label: "通用设置", note: "外观、分页与界面行为" },
      { href: "/models", label: "模型连接", note: "文本与图片模型" },
    ] },
    { title: "数据与集成", items: [
      { href: "/connections", label: "独立站 API", note: "店铺连接与语言" },
      { href: "/storage", label: "存储归档", note: "图片存储与归档" },
      { href: "/recycle-bin", label: "回收站", note: "恢复或清理数据" },
    ] },
    ...(["ADMIN", "DEVELOPER"].includes(role || "") ? [{ title: "权限与系统", items: [
      { href: "/users", label: "用户与权限", note: "成员角色与登录权限" },
      { href: "/developer", label: "开发者中心", note: "诊断日志与审计" },
    ] }] : []),
  ];
  return <aside className="sticky top-18 hidden h-[calc(100vh-4.5rem)] overflow-y-auto border-r bg-card/50 p-4 xl:block">
    <p className="mb-4 px-2 text-sm font-semibold">设置中心</p>
    <div className="space-y-5">{groups.map((group) => <section key={group.title}>
      <p className="px-2 pb-1 text-[11px] font-semibold text-muted-foreground">{group.title}</p>
      <div className="space-y-1">{group.items.map((entry) => {
        const active = pathname.startsWith(entry.href);
        return <Link key={entry.href} href={entry.href} className={cn("block rounded-lg px-2.5 py-2 text-sm hover:bg-muted", active && "bg-primary text-primary-foreground hover:bg-primary")}>
          <span className="block font-medium">{entry.label}</span>
          <span className={cn("mt-0.5 block text-[10px] text-muted-foreground", active && "text-primary-foreground/70")}>{entry.note}</span>
        </Link>;
      })}</div>
    </section>)}</div>
  </aside>;
}
