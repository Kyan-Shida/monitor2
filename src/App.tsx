/**
 * @file App.tsx
 * @description 应用外壳：按角色过滤的侧边栏、角色切换器、路由分发与权限守卫
 * @interaction 消费 data/navigation.ts（菜单与路由）、data/store.tsx（状态）、data/roles.ts（权限）
 */
import { Fragment, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Workflow,
  MapPinned,
  BarChart3,
  Settings,
  ScanEye,
  Search,
  RotateCcw,
  ShieldCheck,
  Presentation,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
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
  BrainCircuit,
  LineChart,
  Bot,
  Boxes,
  Layers,
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
  UserCog,
  LockKeyhole,
  EyeOff,
  Eye as EyeOn,
  FileText,
  CalendarDays,
  Users,
  Route,
  Send,
  type LucideIcon,
} from "lucide-react";
import {
  groups,
  visiblePages,
  go,
  href,
  parse,
  routeMeta,
  activeMenuId,
  activeGroupOf,
  back,
  initTrail,
  parentTargetOf,
} from "./data/navigation";
import { useStore } from "./data/store";
import { canSee, roleOf, roles } from "./data/roles";
import { isSuper } from "./data/auth";
import { Login } from "./pages/Login";
import { ImpersonationBanner } from "./components/ImpersonationBanner";
import { Maps } from "./pages/Maps";
import { MapDetail } from "./pages/MapDetail";
import { MapCalibrate } from "./pages/MapCalibrate";
import { MapNavigate } from "./pages/MapNavigate";
import { SpaceManage } from "./pages/SpaceManage";
import { BusinessTargets } from "./pages/BusinessTargets";
import { InspectionPoints } from "./pages/InspectionPoints";
import { PointEdit } from "./pages/PointEdit";
import { Annotation } from "./pages/Annotation";
import { Planning } from "./pages/Planning";
import { AlarmConfiguration } from "./pages/AlarmConfiguration";
import { DispatchDesk } from "./pages/DispatchDesk";
import { Scheduling } from "./pages/Scheduling";
import { Execution, ExecutionMonitor } from "./pages/Execution";
import { Results, Alarms } from "./pages/Results";
import { AlarmClasses } from "./pages/AlarmClasses";
import {
  AlarmRobotEdit,
  AlarmSettingEdit,
  AlarmSettings,
} from "./pages/AlarmSettings";
import { AlarmPush } from "./pages/AlarmPush";
import { Tenants } from "./pages/Tenants";
import { Operations } from "./pages/Operations";
import { Supporting } from "./pages/Supporting";
import { Btn, Modal, Note, Drawer, Field, Alert } from "./components/UI";
import { FeedbackReview } from "./components/FeedbackReview";
import { PageTabs } from "./components/PageTabs";
import { AlarmCenter } from "./components/AlarmCenter";
import { NotificationCenter } from "./components/NotificationCenter";
import { TenantSwitcher } from "./components/TenantSwitcher";
import { ObjectDetails } from "./pages/ObjectDetails";
import { DeviceArchive } from "./pages/DeviceArchive";
import { DeviceTargets } from "./pages/DeviceTargets";
import { DeviceMaster } from "./pages/DeviceMaster";
import { Admin } from "./pages/Admin";
import { Requirements } from "./pages/Requirements";
import { RobotAbilities } from "./pages/RobotAbilities";
import { RobotNew } from "./pages/RobotNew";
import { MonitorCockpit } from "./pages/MonitorCockpit";
import { DispatchCockpit } from "./pages/DispatchCockpit";
import { CockpitScreen } from "./pages/CockpitScreen";
import { Workbench } from "./pages/Workbench";
import { PlatformOverview } from "./pages/PlatformOverview";
import { Metrics } from "./pages/Metrics";
import { InspectionReport } from "./pages/InspectionReport";
/** 一级业务中心图标，顺序与 data/navigation 的 groups 一一对应 */
const icons = [
  LayoutDashboard,
  Workflow,
  Split,
  BellRing,
  MapPinned,
  SlidersHorizontal,
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
  archive: Archive,
  alarms: BellRing,
  "alarm-classes": Layers,
  "alarm-settings": SlidersHorizontal,
  "alarm-setting-edit": SlidersHorizontal,
  "alarm-robot-edit": SlidersHorizontal,
  "alarm-push": Send,
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
  admin: SlidersHorizontal,
  "alarm-templates": BellRing,
  points: MapPin,
  "points-space": MapPinned,
  annotation: Pencil,
  templates: FileStack,
  "route-edit": FileStack,
  "route-navigate": MapPinned,
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
  space: Layers,
  roles: ShieldHalf,
  audit: ScrollText,
  tenants: Boxes,
  settings: SlidersHorizontal,
};
/**
 * 业务关键词 → 页面 ID
 * 让全局搜索支持"异常""告警"等业务语言，而非仅匹配页面名称
 */
const keywordPages: Record<string, string[]> = {
  异常: ["alarms"],
  告警: ["alarms", "alarm-classes", "alarm-settings", "alarm-push"],
  失败: ["alarms", "execution"],
  离线: ["robots"],
  低电量: ["robots"],
  租户: ["tenants"],
  接管: ["manual"],
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
    /** 顶栏用户下拉菜单：替代原生角色切换器 */
    [userMenu, SETUSER] = useState(false),
    /** 退出登录演示弹窗 */
    [logoutOpen, SETLOGOUT] = useState(false),
    /** 个人信息抽屉 */
    [profileOpen, SETPROFILE] = useState(false),
    /** 修改密码弹窗（演示级：8-16 位 + 大小写 + 数字 + 特殊符号 _!@#$%^&*） */
    [pwdOpen, SETPWD] = useState(false),
    [oldPwd, SETOLD] = useState(""),
    [newPwd, SETNEW] = useState(""),
    [newPwd2, SETNEW2] = useState(""),
    [pwdShow, SETSHOW] = useState<"old" | "new" | "new2" | null>(null),
    /** 侧边栏折叠：隐藏后工作区自动占满；记忆到本地，刷新保持 */
    [sidebarCollapsed, SETSC] = useState(() => {
      try { return localStorage.getItem("inspection-sidebar-collapsed") === "true"; } catch { return false; }
    });
  function toggleSidebar() {
    SETSC((prev) => {
      const next = !prev;
      try { localStorage.setItem("inspection-sidebar-collapsed", String(next)); } catch { /* memory only */ }
      return next;
    });
  }
  const [reviewEnabled, setReviewEnabled] = useState(() => {
    try { return localStorage.getItem("inspection-review-enabled") === "true"; } catch { return false; }
  });
  function toggleReview() {
    const next = !reviewEnabled;
    setReviewEnabled(next);
    try { localStorage.setItem("inspection-review-enabled", String(next)); } catch { /* memory only */ }
  }
  const {
    message,
    messageTone,
    clearMessage,
    reset: resetData,
    s,
    setRole,
    setTenant,
    account,
    platformMode,
    signOut,
  } = useStore();
  const baseRole = roleOf(s.roleId);
  /**
   * 平台超管在「平台管理」视角下只做平台运营：侧边栏仅保留系统设置下的租户管理与角色/权限；
   * 切到某厂区（platformMode = false）后回到普通管理员视角，可查看该厂区业务内容
   */
  const superPlatform = isSuper(account) && platformMode;
  /**
   * 平台管理视角的菜单命名：该视角下「角色 / 权限」页只剩账号管理一个 tab，
   * 菜单 / 面包屑 / 页签统一显示为「账号管理」
   */
  const pageLabel = (id: string, name: string) =>
    superPlatform && id === "roles" ? "账号管理" : name;
  /**
   * 实际生效的角色：「租户管理」只在平台管理视角出现（超管切进厂区后也不给）：
   * 侧边栏 / 中心序号 / 权限守卫 / 页签清理共用同一口径
   */
  const role = superPlatform
    ? {
        ...baseRole,
        landing: "tenants",
        // 平台管理：速览 / 账号 / 租户 / 日志各一个入口
        centers: ["工作台", "系统设置"],
        pages: ["workbench", "roles", "tenants", "audit"],
      }
    : {
        ...baseRole,
        // 全路由减去「租户管理」：等价于原来的 "*"，但 hidden 页（执行监控 / 机器人详情等）不受影响
        pages: (baseRole.pages === "*"
          ? routeMeta.map((p) => p.id)
          : baseRole.pages
        ).filter((id) => id !== "tenants"),
      };
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
  // 当前页面所在一级组自动展开（首次进入时）；带来源时按来源页所属分组，避免跨目录详情页展开错组
  useEffect(() => {
    const g = activeGroupOf(route.page, route.from);
    if (g && !expanded.has(g)) {
      SETE((prev) => new Set(prev).add(g));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.page, route.from?.page]);
  useEffect(() => {
    const fn = () => {
      RO(parse());
      document.querySelector("main")?.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  /** 访问轨迹：让「返回」回到来时的页面而非死板的目录父级 */
  useEffect(() => initTrail(), []);
  // 登录后按当前角色落地页跳转：未登录时不跳（登录页不依赖路由）
  useEffect(() => {
    if (!account) return;
    if (!location.hash || location.hash === "#" || location.hash === "#/")
      go(isSuper(account) ? "tenants" : roleOf(s.roleId).landing);
    // 仅在登录态变化时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);
  /**
   * 全站缩放系数下发到根元素
   * @description 弹窗 / 抽屉 portal 到 body，读不到 main 上的变量；
   *              挂到根上一处控制，浮层与页面内容保持同一缩放比例。
   *              驾驶舱大屏按视口自绘，保持 1（不缩放）
   */
  useEffect(() => {
    const big = ["bigscreen", "overview", "screen", "video"].includes(route.page);
    document.documentElement.style.setProperty("--ui-scale", big ? "1" : "0.82");
  }, [route.page]);
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
  const activeId = activeMenuId(page, route.from);
  /** 侧边栏高亮的一级中心：以高亮叶子所属分组为准，与叶子保持一致（避免详情页错高亮到自身的静态归属组） */
  const activeGroup = activeGroupOf(page, route.from);
  /**
   * 侧边栏一级中心序号：按当前角色可见的中心连续编号
   * @description 整组页面都不可见的中心（如已收起的「巡检执行」）不占序号，
   *              否则侧边栏会出现 01 / 03 的跳号；判定与侧边栏渲染同一套条件
   */
  const centerNos = new Map<string, number>();
  for (const [name] of groups)
    if (
      visiblePages.some(
        (p) => p.group === name && !p.parent && canSee(role, p.id, p.group),
      )
    )
      centerNos.set(name, centerNos.size + 1);
  /**
   * 返回目标：与 back() 同口径 —— 有显式来源时回来源页，否则按导航目录层级取上级页面
   */
  const backTarget =
    (route.from && route.from.page !== page
      ? route.from.page
      : undefined) || parentTargetOf(page);
  const backName = backTarget
    ? routeMeta.find((x) => x.id === backTarget)?.name || backTarget
    : "";
  // 未登录：只渲染登录页（不套侧边栏 / 顶栏 / 页签）
  if (!account) return <Login />;
  // 大屏：独立窗口形态，不套用后台外壳（侧边栏 / 顶栏 / 中心 Tab）
  if (["bigscreen","overview","screen","video"].includes(page)) return <CockpitScreen key={page} initial={page === "screen" ? "screen" : page === "video" ? "video" : "overview"} />;
  /** 权限守卫：页面不在当前角色可见范围时不渲染内容 */
  const allowed = canSee(role, meta.id, meta.group);
  let body;
  // 默认首页为「角色工作台」，驾驶舱为其同级页面，均套用常规外壳（左侧栏 + 工作区）
  // 工作台：平台管理视角渲染平台侧速览，业务视角仍是角色工作台
  if (page === "workbench") body = superPlatform ? <PlatformOverview /> : <Workbench />;
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
  // 空间 / 区域（非装置）类目标：复用目标台账页，预置为「虚拟设备」筛选视图
  else if (page === "points-space") body = <BusinessTargets tab="space" />;
  // 巡检目标台账 › 添加 / 编辑（内置页）：台账设置弹窗装不下，改为整页
  else if (page === "business-target-edit")
    body = <BusinessTargets mode="edit" id={id} key={id || "new"} />;
  // 巡检点管理：已配置巡检点列表 +「添加巡检点」；id 传入时按该地图预筛
  else if (page === "annotation") body = <InspectionPoints id={id} />;
  // 巡检点详情（内置页）：新增 / 编辑巡检点合并成一页（基本信息 + 巡检项清单 / 详情就地切换）
  else if (page === "point-edit")
    body = <PointEdit id={id === "new" ? undefined : id} />;
  // 现场采集（跑图）新增巡检点：同一页，只是入口语义不同（「采集当前位置」可点，自动读实时坐标）
  else if (page === "point-onsite")
    body = <PointEdit field robot={id} key={`onsite-${id || "new"}`} />;
  // 地图标注工作台（内置页）：候选目标 / 图面双击打点 / 试采与自主验证
  else if (page === "point-annotate") body = <Annotation id={id} />;
  else if (page === "maps") body = <Maps id={id} tab={tab} />;
  // 地图详情内置页：列表「详情」进入，内部抽屉（地图下发）
  else if (page === "map-detail") body = <MapDetail id={id} tab={tab} />;
  // 地图标定工作台（内置页）：像素地图打点、连线成路网（地图卡片「编辑」进入）
  else if (page === "map-calibrate") body = <MapCalibrate id={id} key={id} />;
  // 地图导航实时监控页（内置页）：选完机器狗后进入，导航操作 + 实时监控二合一
  else if (page === "map-navigate") body = <MapNavigate id={id} tab={tab} />;
  // 路线导航（内置页）：巡检路线列表「导航」进入，页面同一套，但归属「巡检路线」目录
  else if (page === "route-navigate")
    body = <MapNavigate id={id} tab={tab} />;
  // 空间管理（资源与地图 › 空间）：全局坐标系配准、全局↔局部换算、地图拓扑与版本校验
  else if (page === "space") body = <SpaceManage />;
  // 设备主数据（阶段③）：清单导入 / 启停 / 是否巡检的后台，沿用 equipment 路由
  else if (page === "equipment") body = <DeviceMaster />;
  // 设备巡检目标（内置页）：设备台账行内「巡检目标」进入，按设备维护检测项
  else if (page === "device-targets")
    body = <DeviceTargets id={id} key={id || "new"} />;
  // 后台管理：工厂已有基础数据（区域）配置
  // 旧深链 `admin?tab=algo`：算法原独立成页，现已并入「后台管理 › 算法模板」
  else if (page === "admin") body = <Admin />;
  // 后台管理：算法模板（原「算法模板管理」+「巡检要求管理」合并；供巡检目标台账引用）
  else if (page === "requirements") body = <Requirements />;
  // 后台管理：机器人能力（两级清单：能力类型 → 能力参数；巡检项能力项的候选来源）
  else if (page === "payloads") body = <RobotAbilities />;
  // 新增机器人（内置表单页）：编码 / 机型 / 能力 / 约束，提交即接入台账
  else if (page === "robot-new") body = <RobotNew />;
  else if (
    ["point", "task-detail", "replay-detail", "result-view"].includes(page)
  )
    body = <ObjectDetails page={page} id={id} />;
  else if (page === "archive") body = <DeviceArchive id={id} tab={tab} />;
  else if (
    ["templates", "route-edit", "plans", "plan-edit", "tasks", "quick"].includes(
      page,
    )
  )
    body = <Planning page={page} id={id} />;
  else if (page === "dispatch" || page === "queue") body = <DispatchDesk key={id || "primary"} id={id} />;
  else if (["queue"].includes(page))
    body = <Scheduling page={page} id={id} />;
  // 旧深链 `rules`：规则配置挂在点位上，故落到巡检点列表（Supporting 的 points 视图）
  else if (page === "rules") body = <Supporting page="points" />;
  else if (page === "report") body = <InspectionReport />;
  else if (page === "execution") body = <Execution />;
  // 单任务现场态势（内置页）：执行总览行内「监控」进入
  else if (page === "execution-monitor")
    body = <ExecutionMonitor id={id} />;
  else if (["results", "result-detail"].includes(page))
    body = <Results page={page} id={id} />;
  else if (["alarms", "alarm", "alarm-detail"].includes(page))
    body = <Alarms page={page} id={id} />;
  // 告警管理 › 告警类别：告警分类主数据（分类名称 / 告警大类 / 是否启用）
  else if (page === "alarm-classes") body = <AlarmClasses />;
  // 告警管理 › 告警设置：一个台账一个告警设置（可含多个告警项），与巡检目标台账同一份数据
  else if (page === "alarm-settings") body = <AlarmSettings />;
  // 告警设置 › 添加 / 编辑告警配置（内置页）：台账 + 告警项清单装不下，弹窗改为整页
  else if (page === "alarm-setting-edit")
    body = <AlarmSettingEdit id={id} key={id || "new"} />;
  // 告警设置 › 机器人预警分类配置（内置页）：机器人预警不绑台账，按分类维护
  else if (page === "alarm-robot-edit")
    body = <AlarmRobotEdit id={id} key={id || "new"} />;
  // 告警管理 › 推送设置：推送人员名单 + 区域 / 设备绑定范围
  else if (page === "alarm-push") body = <AlarmPush />;
  // 系统设置 › 租户管理：平台级租户清单（新增 / 改编码 / 启用停用，停用由引擎校验）
  else if (page === "tenants") body = <Tenants />;
  else if (page === "replay") body = <ObjectDetails page="replay" id={id} />;
  else body = <Supporting page={page} />;
  /** 搜索关键词命中的业务页面 */
  const kwHits = Object.entries(keywordPages)
    .filter(([k]) => k.includes(search) || search.includes(k))
    .flatMap(([, ids]) => ids);
  return (
    <div className={"app" + (sidebarCollapsed ? " sidebar-collapsed" : "")}>
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
            // 不做字典排序：保持 navigation.ts 中的业务声明顺序（标准与路线 → 任务与计划 → 调度 → 执行）
            const subGroups = [...bySub.entries()].filter(
              ([k]) => k !== "__flat__",
            );
            const searchHit = (p: (typeof pages)[0]) =>
              pageLabel(p.id, p.name).includes(search) || kwHits.includes(p.id);
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
                    "center-nav " + (activeGroup === groupName ? "active" : "")
                  }
                  onClick={toggleGroup}
                >
                  <Icon size={18} />
                  <span>{groupName}</span>
                  <small>{String(centerNos.get(groupName) ?? 0).padStart(2, "0")}</small>
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
                          {pageLabel(p.id, p.name)}
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
                                  {pageLabel(p.id, p.name)}
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
        {/* 角色模拟横幅：模拟期间常驻顶部，退出按钮恢复真实身份 */}
        <ImpersonationBanner />
        <header>
          <button
            className="sidebar-toggle"
            title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            aria-pressed={sidebarCollapsed}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
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
            {/* 首级入口：超管平台管理视角回「租户管理」，业务视角回角色工作台 */}
            <a
              href={href(superPlatform ? "tenants" : "workbench")}
              onClick={(e) => {
                e.preventDefault();
                go(superPlatform ? "tenants" : "workbench");
              }}
            >
              {superPlatform ? "平台管理" : "业务应用平台"}
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
                      {pageLabel(p.id, p.name)}
                    </a>
                  </Fragment>
                );
              });
            })()}
            <ChevronRight size={12} className="bc-sep" />
            {/* 当前页面：高亮不可点 */}
            <b>{pageLabel(meta.id, meta.name)}</b>
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
            {/* 驾驶舱大屏是业务入口：平台管理视角不显示，切到厂区业务后再出现 */}
            {!superPlatform && (
              <button
                className="screen-entry"
                title="在新标签页打开驾驶舱大屏"
                onClick={() => window.open(href("bigscreen"), "_blank", "noopener")}
              >
                <Presentation size={16} />
                驾驶舱大屏
              </button>
            )}
            {/* <span className="mock-indicator">● 演示数据</span> */}
            <button title="重置演示" onClick={() => R(true)}>
              <RotateCcw size={17} />
            </button>
            {/* 告警入口：点击打开告警弹窗（业务浮标，平台管理视角不显示） */}
            {!superPlatform && <AlarmCenter />}
            {/* 通知中心：系统消息 / 任务通知 / 审批提醒 合并下拉 */}
            <NotificationCenter />
            {/* 分组分隔：告警 / 通知 与「租户 · 账号」两类上下文分开 */}
            <span className="header-sep" aria-hidden="true" />
            {/* 顶栏常驻租户切换（多租户省事版）：仿 SaaS 组织上下文切换 */}
            <TenantSwitcher />
            {/* 用户下拉菜单：登录账号 + 数据范围 + 退出登录 */}
            <div className="user-menu-wrap" ref={userRef}>
              <button
                className={"user-btn" + (userMenu ? " open" : "")}
                aria-label="用户菜单"
                onClick={() => SETUSER(!userMenu)}
              >
                <span className="user-avatar">{account.name.charAt(0)}</span>
                <span className="user-name">{account.name}</span>
                <ChevronDown size={14} />
              </button>
              {userMenu && (
                <div className="user-menu" role="menu">
                  <div className="user-menu-head">
                    <span className="user-avatar lg">{account.name.charAt(0)}</span>
                    <div className="user-menu-info">
                      <b>{account.name}</b>
                      <small>{account.title}</small>
                    </div>
                  </div>
                  {/* 角色切换仅超管在业务视角下保留（平台管理模式没有业务角色可切） */}
                  {isSuper(account) && !platformMode && (
                    <>
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
                          切换为 {r.person}（{r.name}）
                          {r.id === role.id && <Check size={14} className="user-menu-check" />}
                        </button>
                      ))}
                    </>
                  )}
                  <div className="user-menu-sep" />
                  <button
                    role="menuitem"
                    className="user-menu-item"
                    onClick={() => {
                      SETUSER(false);
                      SETPROFILE(true);
                    }}
                  >
                    <UserCog size={15} />
                    个人信息
                  </button>
                  <button
                    role="menuitem"
                    className="user-menu-item"
                    onClick={() => {
                      SETUSER(false);
                      SETOLD(""); SETNEW(""); SETNEW2(""); SETSHOW(null);
                      SETPWD(true);
                    }}
                  >
                    <LockKeyhole size={15} />
                    修改密码
                  </button>
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
        <PageTabs route={route} role={role} iconOf={pageIcons} labelOf={pageLabel} />
        {/* 全站统一缩放（CSS 一处控制：main.main-zoom）：常规页按 82% 排版后铺满内容区；
            驾驶舱大屏按视口自绘，保持不缩放 */}
        <main
          className={
            ["bigscreen", "overview", "screen", "video"].includes(page)
              ? ""
              : "main-zoom"
          }
        >
          {allowed ? (
            <div key={page + "-" + (id || "") + "-" + (tab || "")}>{body}</div>
          ) : (
            <Note>
              当前角色「{role.name}」无该页面的访问权限（数据范围：{role.scope}）。
              请使用顶栏角色切换器切换身份，或返回该角色的默认工作台。
            </Note>
          )}
        </main>
      </div>
      {/* 反馈两档：拦截类错误用居中弹窗（必须被看见）；成功类用底部轻提示（不打断连续操作） */}
      {message &&
        (messageTone === "error" ? (
          <Alert message={message} onClose={clearMessage} />
        ) : (
          <div role="status" className="toast">
            {message}
          </div>
        ))}
      {logoutOpen && (
        <Modal title="退出登录" onClose={() => SETLOGOUT(false)}>
          <Note>退出后需要重新输入账号密码，当前租户数据仍保留在本机。</Note>
          <div className="modal-actions">
            <Btn onClick={() => SETLOGOUT(false)}>取消</Btn>
            <Btn
              danger
              onClick={() => {
                SETLOGOUT(false);
                SETUSER(false);
                signOut();
              }}
            >
              确认退出
            </Btn>
          </div>
        </Modal>
      )}

      {/* ── 个人信息抽屉：只读展示账号字段，参考图 1 ── */}
      {profileOpen && (() => {
        const curRole = roles.find((r) => r.id === role.id);
        const tenantName =
          account.level === "super"
            ? `全部租户（${s.tenants?.length || 0} 个）`
            : account.level === "customer"
              ? `${account.title.split(" · ")[0]} 全部厂区（${s.tenants?.filter((t) => t.customerId === account.customerId).length || 0} 个）`
              : account.level === "tenant"
                ? s.tenants?.find((t) => t.id === account.tenantId)?.name || "所属厂区"
                : `已授权厂区（${account.tenantIds?.length || 0} 个）`;
        return (
          <Drawer
            title="个人信息"
            subtitle="登录账号 · 姓名 · 所属部门 · 所属角色"
            onClose={() => SETPROFILE(false)}
            footer={<Btn onClick={() => SETPROFILE(false)}>关闭</Btn>}
          >
            <div className="profile-fields">
              <Field label="登录账号"><input value={account.username} readOnly /></Field>
              <Field label="姓名"><input value={account.name} readOnly /></Field>
              <Field label="岗位"><input value={account.title} readOnly /></Field>
              <Field label="所属租户 / 数据范围"><input value={tenantName} readOnly /></Field>
              <Field label="所属角色">
                <input value={curRole ? curRole.name : role.name} readOnly />
              </Field>
              <Field label="账号 ID"><input value={account.id} readOnly /></Field>
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <Btn
                primary
                onClick={() => {
                  SETPROFILE(false);
                  SETOLD(""); SETNEW(""); SETNEW2(""); SETSHOW(null);
                  SETPWD(true);
                }}
              >
                <LockKeyhole size={14} style={{ marginRight: 6 }} />
                修改密码
              </Btn>
            </div>
          </Drawer>
        );
      })()}

      {/* ── 修改密码弹窗：原密码 / 新密码 / 确认新密码，参考图 2 ── */}
      {pwdOpen && (() => {
        const pwdOk = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[_!@#$%^&*]).{8,16}$/;
        const errOld = oldPwd && oldPwd !== account.password ? "原密码不正确" : "";
        const errNew = newPwd && !pwdOk.test(newPwd)
          ? "密码需包含大小写字母、数字及特殊符号 _!@#$%^&*，8-16 位"
          : "";
        const errMatch = newPwd2 && newPwd2 !== newPwd ? "两次输入不一致" : "";
        const canSubmit = oldPwd && pwdOk.test(newPwd) && newPwd === newPwd2 && !errOld;
        const pwdField = (label: string, value: string, setter: (v: string) => void, key: "old" | "new" | "new2", err?: string) => {
          const type = pwdShow === key ? "text" : "password";
          return (
            <div className="pwd-field">
              <label>{label}</label>
              <div className="pwd-input-wrap">
                <input
                  type={type}
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  autoComplete="off"
                  placeholder={pwdShow === key ? "已显示" : "请输入"}
                />
                <button
                  type="button"
                  className="pwd-toggle"
                  onClick={() => SETSHOW(pwdShow === key ? null : key)}
                  aria-label={pwdShow === key ? "隐藏密码" : "显示密码"}
                  tabIndex={-1}
                >
                  {pwdShow === key ? <EyeOn size={15} /> : <EyeOff size={15} />}
                </button>
              </div>
              {err && <small className="pwd-err">{err}</small>}
            </div>
          );
        };
        return (
          <Modal title="修改密码" onClose={() => SETPWD(false)}>
            {pwdField("原密码", oldPwd, SETOLD, "old", errOld)}
            {pwdField("新密码", newPwd, SETNEW, "new", errNew)}
            {pwdField("确认新密码", newPwd2, SETNEW2, "new2", errMatch)}
            <p className="pwd-hint">
              密码要求：需要包含大小写字母、数字及特殊符号 <code>_!@#$%^&amp;*</code>，且长度在 8-16 位之间。
            </p>
            <div className="modal-actions">
              <Btn onClick={() => SETPWD(false)}>取消</Btn>
              <Btn
                primary
                disabled={!canSubmit}
                onClick={() => {
                  SETPWD(false);
                  SETOLD(""); SETNEW(""); SETNEW2(""); SETSHOW(null);
                  window.alert("密码修改成功（演示占位，未写入本地账号）");
                }}
              >
                确定
              </Btn>
            </div>
          </Modal>
        );
      })()}
      {reset && (
        <Modal title="重置演示数据" onClose={() => R(false)}>
          <Note>
            将清除当前浏览器的演示操作记录，恢复初始地图、任务与告警。
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
