/**
 * @file App.tsx
 * @description 应用外壳：按角色过滤的侧边栏、角色切换器、路由分发与权限守卫
 * @interaction 消费 data/navigation.ts（菜单与路由）、data/store.tsx（状态）、data/roles.ts（权限）
 */
import { Fragment, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Workflow,
  FileCheck,
  MapPinned,
  BarChart3,
  Settings,
  ScanEye,
  Bell,
  Search,
  RotateCcw,
  ShieldCheck,
  Presentation,
  ChevronRight,
  ChevronDown,
  Gauge,
  ClipboardList,
  ListChecks,
  Zap,
  Split,
  ListOrdered,
  Activity,
  History,
  FileSearch,
  Eye,
  Archive,
  BellRing,
  LineChart,
  Bot,
  Boxes,
  MapPin,
  Pencil,
  FileStack,
  // 别名：避免与内置的 Map 构造器重名（侧边栏用 new Map 做分组）
  Map as MapIcon,
  ShieldHalf,
  ScrollText,
  Plug,
  SlidersHorizontal,
  Terminal,
  ArrowLeft,
  LogOut,
  Check,
  FileText,
  CalendarDays,
  Users,
  Route,
  type LucideIcon,
} from "lucide-react";
import {
  groups,
  visiblePages,
  go,
  href,
  parse,
  routeMeta,
  menuIdOf,
  back,
  parentTargetOf,
} from "./data/navigation";
import { useStore } from "./data/store";
import { canSee, roleOf, roles } from "./data/roles";
import { Maps } from "./pages/Maps";
import { MapDetail } from "./pages/MapDetail";
import { BusinessTargets } from "./pages/BusinessTargets";
import { InspectionPoints } from "./pages/InspectionPoints";
import { PointEdit } from "./pages/PointEdit";
import { Annotation } from "./pages/Annotation";
import { Planning } from "./pages/Planning";
import { AlarmConfiguration } from "./pages/AlarmConfiguration";
import { DispatchDesk } from "./pages/DispatchDesk";
import { Scheduling } from "./pages/Scheduling";
import { Execution } from "./pages/Execution";
import { Results, Alarms } from "./pages/Results";
import { Operations } from "./pages/Operations";
import { Supporting } from "./pages/Supporting";
import { Btn, Modal, Note } from "./components/UI";
import { FeedbackReview } from "./components/FeedbackReview";
import { PageTabs } from "./components/PageTabs";
import {
  NotificationCenter,
  noticeMessages,
  splitUnreadCount,
} from "./components/NotificationCenter";
import { ObjectDetails } from "./pages/ObjectDetails";
import { DeviceArchive } from "./pages/DeviceArchive";
import { DeviceMaster } from "./pages/DeviceMaster";
import { RobotNew } from "./pages/RobotNew";
import { MonitorCockpit } from "./pages/MonitorCockpit";
import { DispatchCockpit } from "./pages/DispatchCockpit";
import { CockpitScreen } from "./pages/CockpitScreen";
import { Workbench } from "./pages/Workbench";
import { Metrics } from "./pages/Metrics";
import { InspectionReport } from "./pages/InspectionReport";
/** 一级业务中心图标，顺序与 data/navigation 的 groups 一一对应 */
const icons = [
  LayoutDashboard,
  Workflow,
  Split,
  FileCheck,
  MapPinned,
  Bot,
  BarChart3,
  Settings,
];
/** 三级页面图标：按页面 ID 映射；未命中的页面使用通用页面图标 */
const pageIcons: Record<string, LucideIcon> = {
  workbench: Gauge,
  plans: ClipboardList,
  tasks: ListChecks,
  quick: Zap,
  dispatch: Split,
  queue: ListOrdered,
  execution: Activity,
  replay: History,
  results: FileSearch,
  review: Eye,
  archive: Archive,
  alarms: BellRing,
  metrics: LineChart,
  report: FileText,
  robots: Bot,
  robot: Bot,
  "robot-new": Bot,
  health: Activity,
  "robot-map": MapPinned,
  manual: Terminal,
  device: SlidersHorizontal,
  equipment: Boxes,
  points: MapPin,
  annotation: Pencil,
  templates: FileStack,
  calendar: CalendarDays,
  users: Users,
  routes: Route,
  services: Plug,
  analytics: BarChart3,
  rules: ShieldCheck,
  alarm: BellRing,
  "plan-edit": Pencil,
  "dispatch-log": History,
  maps: MapIcon,
  roles: ShieldHalf,
  audit: ScrollText,
  integration: Plug,
  "interface-log": Terminal,
  settings: SlidersHorizontal,
};
/**
 * 业务关键词 → 页面 ID
 * 让全局搜索支持"异常""待复核"等业务语言，而非仅匹配页面名称
 */
const keywordPages: Record<string, string[]> = {
  异常: ["alarms", "review"],
  告警: ["alarms"],
  失败: ["alarms", "execution"],
  待复核: ["review"],
  复核: ["review"],
  离线: ["robots"],
  低电量: ["robots"],
  接管: ["manual"],
  工单: ["alarms"],
  验收: ["results"],
  分析: ["metrics"],
  权限: ["roles"],
  日志: ["audit"],
};

export default function App() {
  const [route, RO] = useState(parse),
    [search, SE] = useState(""),
    [reset, R] = useState(false),
    /** 展开的一级中心：默认只展开当前所在组 */
    [expanded, SETE] = useState<Set<string>>(() => new Set()),
    /** 收起的二级 sub 分组：空表示全部展开 */
    [collapsedSubs, SETS] = useState<Set<string>>(() => new Set()),
    /** 消息中心弹窗：顶栏铃铛点击打开 */
    [noticeOpen, SETNOTICE] = useState(false),
    /** 顶栏用户下拉菜单：替代原生角色切换器 */
    [userMenu, SETUSER] = useState(false),
    /** 退出登录演示弹窗 */
    [logoutOpen, SETLOGOUT] = useState(false);
  const [reviewEnabled, setReviewEnabled] = useState(() => {
    try { return localStorage.getItem("inspection-review-enabled") === "true"; } catch { return false; }
  });
  function toggleReview() {
    const next = !reviewEnabled;
    setReviewEnabled(next);
    try { localStorage.setItem("inspection-review-enabled", String(next)); } catch { /* memory only */ }
  }
  const { message, reset: resetData, s, setRole } = useStore();
  const role = roleOf(s.roleId);
  /** 用户菜单容器：点击菜单外区域自动收起 */
  const userRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!userMenu) return;
    const fn = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) SETUSER(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [userMenu]);
  /** 消息中心未读数拆分：红色为告警未读（需立即处理），蓝色为其他未读。告警单独提级，入口即可见。 */
  const noticeSplit = splitUnreadCount(noticeMessages(s));
  // 当前页面所在一级组自动展开（首次进入时）
  useEffect(() => {
    const m = routeMeta.find((p) => p.id === route.page);
    if (m && !expanded.has(m.group)) {
      SETE((prev) => new Set(prev).add(m.group));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.page]);
  useEffect(() => {
    const fn = () => {
      RO(parse());
      document.querySelector("main")?.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  // 首次进入按当前角色落地页跳转：角色决定默认工作台（原型阶段代替真实登录）
  useEffect(() => {
    if (!location.hash || location.hash === "#" || location.hash === "#/")
      go(roleOf(s.roleId).landing);
    // 仅在首次挂载时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const meta = routeMeta.find((p) => p.id === route.page) || routeMeta[0];
  const { page, id, tab } = route;
  /**
   * 显式来源页：同一内置页可由不同业务页进入（如「执行回溯」从设备档案或机器人进入），
   * 链接带回的 from 决定面包屑归属与返回目标，避免上下文串台
   */
  const fromMeta = route.from
    ? routeMeta.find((x) => x.id === route.from!.page)
    : undefined;
  /** 面包屑一级分组：带来源时按来源页所属分组 */
  const breadcrumbGroup = fromMeta ? fromMeta.group : meta.group;
  /** 侧边栏高亮目标：详情页回落到其列表页；带来源时按来源页归属 */
  const activeId = menuIdOf(fromMeta ? fromMeta.id : page);
  /**
   * 返回目标：优先回到显式来源页；否则按导航目录层级逐级向上，
   * 不依赖点击历史；已到终点时为空，按钮置灰
   */
  const backTarget = fromMeta ? fromMeta.id : parentTargetOf(page);
  const backName = backTarget
    ? routeMeta.find((x) => x.id === backTarget)?.name || backTarget
    : "";
  // 驾驶舱大屏：独立窗口形态，不套用后台外壳（侧边栏 / 顶栏 / 中心 Tab）
  if (["bigscreen","overview","screen"].includes(page)) return <CockpitScreen key={page} initial={page === "screen" ? "screen" : "overview"} />;
  /** 权限守卫：页面不在当前角色可见范围时不渲染内容 */
  const allowed = canSee(role, meta.id, meta.group);
  let body;
  // 默认首页为「角色工作台」，驾驶舱为其同级页面，均套用常规外壳（左侧栏 + 工作区）
  if (page === "workbench") body = <Workbench />;
  else if (page === "overview") body = <MonitorCockpit />;
  else if (page === "screen") body = <DispatchCockpit />;
  else if (page === "metrics") body = <Metrics />;
  else if (
    [
      "calendar",
      "robots",
      "robot",
      "health",
      "robot-map",
      "manual",
      "device",
    ].includes(page)
  )
    body = <Operations page={page} id={id} tab={tab} />;
  // 巡检目标台账：仪表 + 巡检要求 + 算法 + 阈值 + 判断标准（巡检项从这里选"检什么、怎么判"）
  else if (page === "points") body = <BusinessTargets />;
  // 巡检点管理：已配置巡检点列表 +「添加巡检点」；id 传入时按该地图预筛
  else if (page === "annotation") body = <InspectionPoints id={id} />;
  // 添加 / 编辑巡检点（内置页）：名称 + 地图 + 地图点位 + 多个巡检项
  else if (page === "point-edit")
    body = <PointEdit id={id === "new" ? undefined : id} />;
  // 地图标注工作台（内置页）：候选目标 / 图面双击打点 / 试采与自主验证
  else if (page === "point-annotate") body = <Annotation id={id} />;
  else if (page === "maps") body = <Maps id={id} tab={tab} />;
  // 地图详情内置页：列表「详情」进入，内部两个抽屉（地图工作台 / 地图下发）
  else if (page === "map-detail") body = <MapDetail id={id} tab={tab} />;
  // 设备主数据（阶段③）：清单导入 / 审核 / 启停 / 是否巡检的后台，沿用 equipment 路由
  else if (page === "equipment") body = <DeviceMaster />;
  // 新增机器人（内置表单页）：编码 / 机型 / 能力 / 约束，提交即接入台账
  else if (page === "robot-new") body = <RobotNew />;
  else if (
    ["point", "task-detail", "replay-detail", "result-view"].includes(page)
  )
    body = <ObjectDetails page={page} id={id} />;
  else if (page === "archive") body = <DeviceArchive id={id} tab={tab} />;
  else if (["templates", "plans", "plan-edit", "tasks", "quick"].includes(page))
    body = <Planning page={page} id={id} />;
  else if (page === "dispatch" || page === "queue") body = <DispatchDesk key={id || "primary"} id={id} />;
  else if (["queue"].includes(page))
    body = <Scheduling page={page} id={id} />;
  // 旧深链 `rules`：规则配置挂在点位上，故落到巡检点列表（Supporting 的 points 视图）
  else if (page === "rules") body = <Supporting page="points" />;
  else if (page === "report") body = <InspectionReport />;
  else if (page === "execution") body = <Execution id={id} />;
  else if (["results", "review", "result-detail"].includes(page))
    body = <Results page={page} id={id} />;
  else if (["alarms", "alarm", "alarm-detail"].includes(page))
    body = <Alarms page={page} id={id} />;
  else if (page === "replay") body = <ObjectDetails page="replay" id={id} />;
  else body = <Supporting page={page} />;
  /** 搜索关键词命中的业务页面 */
  const kwHits = Object.entries(keywordPages)
    .filter(([k]) => k.includes(search) || search.includes(k))
    .flatMap(([, ids]) => ids);
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <ScanEye size={26} />
          </div>
          <div>
            智能机器巡检<small>INSPECTION PLATFORM</small>
          </div>
        </div>

        <div className="nav-search">
          <Search size={15} />
          <input
            aria-label="搜索菜单"
            placeholder="搜索"
            value={search}
            onChange={(e) => SE(e.target.value)}
          />
        </div>
        <nav aria-label="一级业务中心">
          {groups.map((g, i) => {
            const Icon = icons[i];
            const groupName = g[0];
            // 该组下的可见顶级页面（排除详情子页）
            const pages = visiblePages.filter(
              (p) =>
                p.group === groupName &&
                !p.parent &&
                canSee(role, p.id, p.group),
            );
            if (!pages.length) return null;
            const isExpanded = search || expanded.has(groupName);
            // 按 sub 标签把页面分组；无子分组的页面归入 "__flat__"
            // （Map 保持首次出现的顺序，子分组按 navigation.ts 的业务声明顺序呈现）
            const bySub = new Map<string, typeof pages>();
            for (const p of pages) {
              const key = p.sub || "__flat__";
              const arr = bySub.get(key);
              if (arr) arr.push(p);
              else bySub.set(key, [p]);
            }
            // 搜索过滤
            const flatPages = bySub.get("__flat__") || [];
            // 不做字典排序：保持 navigation.ts 中的业务声明顺序（标准与模板 → 任务与计划 → 调度 → 执行）
            const subGroups = [...bySub.entries()].filter(
              ([k]) => k !== "__flat__",
            );
            const searchHit = (p: (typeof pages)[0]) =>
              p.name.includes(search) || kwHits.includes(p.id);
            const anyHit =
              !search ||
              pages.some(searchHit) ||
              groupName.includes(search);
            if (search && !anyHit) return null;

            const toggleGroup = () =>
              SETE((prev) => {
                const n = new Set(prev);
                n.has(groupName) ? n.delete(groupName) : n.add(groupName);
                return n;
              });
            const toggleSub = (key: string) =>
              SETS((prev) => {
                const n = new Set(prev);
                n.has(key) ? n.delete(key) : n.add(key);
                return n;
              });
            const first = pages[0];
            return (
              <div key={groupName} className="nav-group">
                <button
                  className={
                    "center-nav " + (meta.group === groupName ? "active" : "")
                  }
                  onClick={toggleGroup}
                >
                  <Icon size={18} />
                  <span>{groupName}</span>
                  <small>{String(i + 1).padStart(2, "0")}</small>
                  <ChevronDown
                    size={13}
                    className="nav-chevron"
                    style={{
                      transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
                    }}
                  />
                </button>
                {isExpanded && (
                  <div className="nav-tree">
                    {/* 无子分组的页面直接平铺 */}
                    {flatPages.map((p) => {
                      if (search && !searchHit(p)) return null;
                      const active = p.id === activeId;
                      const LeafIcon = pageIcons[p.id] || FileText;
                      return (
                        <button
                          key={p.id}
                          className={"nav-leaf " + (active ? "active" : "")}
                          onClick={() => go(p.id)}
                        >
                          {LeafIcon && <LeafIcon size={14} className="leaf-icon" />}
                          {p.name}
                        </button>
                      );
                    })}
                    {/* 有 sub 分组的：每个 sub 一个可折叠小节 */}
                    {subGroups.map(([sub, items]) => {
                      const filtered = search
                        ? items.filter(searchHit)
                        : items;
                      if (!filtered.length) return null;
                      const key = groupName + "::" + sub;
                      const collapsed = collapsedSubs.has(key);
                      return (
                        <div key={key} className="nav-sub">
                          <button
                            className="nav-sub-head"
                            onClick={() => toggleSub(key)}
                          >
                            <ChevronDown
                              size={11}
                              style={{
                                transform: collapsed
                                  ? "rotate(-90deg)"
                                  : "rotate(0deg)",
                              }}
                            />
                            {sub}
                          </button>
                          {!collapsed &&
                            filtered.map((p) => {
                              const active = p.id === activeId;
                              const LeafIcon = pageIcons[p.id] || FileText;
                              return (
                                <button
                                  key={p.id}
                                  className={
                                    "nav-leaf " + (active ? "active" : "")
                                  }
                                  onClick={() => go(p.id)}
                                >
                                  {LeafIcon && (
                                    <LeafIcon size={14} className="leaf-icon" />
                                  )}
                                  {p.name}
                                </button>
                              );
                            })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="sf-row">
            <ShieldCheck size={15} />
            <span>权限随岗位 · 操作全程留痕</span>
          </div>
          {/* 版本与环境信息：原型演示时快速确认当前构建 */}
          <div className="sf-meta">
            <span>v1.4.0</span>
            <i />
            <span>演示环境</span>
            <i />
            <span>数据仅存本机</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <button
            className="back-btn"
            title={backTarget ? `返回：${backName}` : "已在顶层页面"}
            disabled={!backTarget}
            onClick={() => back()}
          >
            <ArrowLeft size={15} />
            返回
          </button>
          <div className="breadcrumb">
            {/* 首页入口：可点击回到角色工作台 */}
            <a
              href={href("workbench")}
              onClick={(e) => {
                e.preventDefault();
                go("workbench");
              }}
            >
              业务应用平台
            </a>
            <ChevronRight size={12} className="bc-sep" />
            {/* 一级分组：可点击跳到该组首个可见页面 */}
            <a
              href={href(breadcrumbGroup)}
              onClick={(e) => {
                e.preventDefault();
                const first = visiblePages.find(
                  (p) => p.group === breadcrumbGroup && !p.parent,
                );
                if (first) go(first.id);
              }}
            >
              {breadcrumbGroup}
            </a>
            {/* 父页面链：从显式来源页（或静态父页）递归往上，每级可点 */}
            {(() => {
              const chain: typeof routeMeta = [];
              let cur: string | undefined = fromMeta ? fromMeta.id : meta.parent;
              while (cur) {
                const p = routeMeta.find((x) => x.id === cur);
                if (!p) break;
                chain.unshift(p);
                cur = p.parent;
              }
              return chain.map((p) => {
                // 来源页本身是带 id 的详情页（如机器人运行监测）时，链接需带回其 id
                const pid =
                  route.from && p.id === route.from.page
                    ? route.from.id
                    : undefined;
                return (
                  <Fragment key={p.id}>
                    <ChevronRight size={12} className="bc-sep" />
                    <a
                      href={href(p.id, pid)}
                      onClick={(e) => {
                        e.preventDefault();
                        go(p.id, pid);
                      }}
                    >
                      {p.name}
                    </a>
                  </Fragment>
                );
              });
            })()}
            <ChevronRight size={12} className="bc-sep" />
            {/* 当前页面：高亮不可点 */}
            <b>{meta.name}</b>
            {/* 详情对象 ID：追加在最后 */}
            {id && (
              <>
                <ChevronRight size={12} className="bc-sep" />
                <b className="bc-id">{id}</b>
              </>
            )}
          </div>
          <div className="header-right">
            <button role="switch" aria-checked={reviewEnabled} onClick={toggleReview} title="开启后可标注页面、汇总和复制评审意见">页面评审：{reviewEnabled ? "开启" : "关闭"}</button>
            {reviewEnabled && <FeedbackReview pageTitle={meta.name} />}
            <button
              className="screen-entry"
              title="在新标签页打开驾驶舱大屏"
              onClick={() => window.open(href("bigscreen"), "_blank", "noopener")}
            >
              <Presentation size={16} />
              驾驶舱大屏
            </button>
            {/* <span className="mock-indicator">● 演示数据</span> */}
            <button title="重置演示" onClick={() => R(true)}>
              <RotateCcw size={17} />
            </button>
            {/* 消息中心入口：点击弹出消息中心弹窗（不再直接跳转告警页）。
              角标拆分：红色圆点告警未读（需立即处理）· 蓝色角标其他未读，
              让告警在入口层面即见，不再埋在 Tab 里 */}
            <button
              className={"bell-btn" + (noticeSplit.alarm > 0 ? " has-alarm" : "")}
              title={noticeSplit.alarm > 0 ? `有 ${noticeSplit.alarm} 条未处理告警` : "消息中心"}
              onClick={() => SETNOTICE(true)}
            >
              <Bell size={18} />
              {noticeSplit.alarm > 0 && (
                <i className="bell-dot" />
              )}
              {noticeSplit.other > 0 && (
                <i className="bell-badge">
                  {noticeSplit.other > 99 ? "99+" : noticeSplit.other}
                </i>
              )}
            </button>
            {/* 用户下拉菜单：头像 + 姓名角色，点击展开角色切换与退出登录（原型阶段代替真实登录） */}
            <div className="user-menu-wrap" ref={userRef}>
              <button
                className={"user-btn" + (userMenu ? " open" : "")}
                aria-label="用户菜单"
                onClick={() => SETUSER(!userMenu)}
              >
                <span className="user-avatar">{role.person.charAt(0)}</span>
                <span className="user-name">
                  {role.person}
                  <small>{role.name}</small>
                </span>
                <ChevronDown size={14} />
              </button>
              {userMenu && (
                <div className="user-menu" role="menu">
                  <div className="user-menu-head">
                    <span className="user-avatar lg">{role.person.charAt(0)}</span>
                    <div className="user-menu-info">
                      <b>{role.person} · {role.name}</b>
                      <small>数据范围：{role.scope}</small>
                    </div>
                  </div>
                  <div className="user-menu-sep" />
                  {roles.map((r) => (
                    <button
                      key={r.id}
                      role="menuitem"
                      className={"user-menu-item" + (r.id === role.id ? " active" : "")}
                      onClick={() => {
                        if (r.id !== role.id) {
                          setRole(r.id);
                          go(r.landing);
                        }
                        SETUSER(false);
                      }}
                    >
                      <ShieldCheck size={15} />
                      切换为 {r.person}（{r.name}）
                      {r.id === role.id && <Check size={14} className="user-menu-check" />}
                    </button>
                  ))}
                  <div className="user-menu-sep" />
                  <button
                    role="menuitem"
                    className="user-menu-logout"
                    onClick={() => {
                      SETUSER(false);
                      SETLOGOUT(true);
                    }}
                  >
                    <LogOut size={14} />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {/* 页签导航：仿浏览器多标签，记录访问过的页面，便于多功能页并存与快速切换 */}
        <PageTabs route={route} role={role} iconOf={pageIcons} />
        <main>
          {allowed ? (
            <div key={page + "-" + (id || "") + "-" + (tab || "")}>{body}</div>
          ) : (
            <Note>
              当前角色「{role.name}」无该页面的访问权限（数据范围：{role.scope}）。
              请使用顶栏角色切换器切换身份，或返回该角色的默认工作台。
            </Note>
          )}
          <footer>
            智能机器巡检平台 · 演示环境 · 数据仅存于本机 · 非真实机器人控制
          </footer>
        </main>
      </div>
      {message && (
        <div role="status" className="toast">
          {message}
        </div>
      )}
      {noticeOpen && <NotificationCenter onClose={() => SETNOTICE(false)} />}
      {logoutOpen && (
        <Modal title="退出登录" onClose={() => SETLOGOUT(false)}>
          <Note>
            演示环境用「角色切换」代替真实登录，无需退出。如需更换身份，请使用用户菜单中的
            「切换为…」选项。
          </Note>
          <Btn onClick={() => SETLOGOUT(false)}>知道了</Btn>
        </Modal>
      )}
      {reset && (
        <Modal title="重置演示数据" onClose={() => R(false)}>
          <Note>
            将清除当前浏览器的演示操作记录，恢复初始地图、任务、告警与工单。
          </Note>
          <Btn
            danger
            onClick={() => {
              resetData();
              R(false);
              go(role.landing);
            }}
          >
            确认重置
          </Btn>
        </Modal>
      )}
    </div>
  );
}
