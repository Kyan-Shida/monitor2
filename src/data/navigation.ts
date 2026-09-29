import { useState } from "react";
/**
 * @file navigation.ts
 * @description 菜单结构与路由：一级业务中心 → 页面（按业务域归并，不按厂商能力域切分）
 * @interaction App.tsx 渲染侧边栏与页面；useViewState 供各列表页做视图状态持久化
 */
/**
 * 菜单结构：一级业务中心 → 页面
 * 每项格式「页面ID:名称:优先级:二级分组」，优先级与二级分组可省略
 * 一级中心按业主业务场景归并为 6 个（工作台 / 巡检执行 / 结果与异常 / 资源与地图 / 分析与报表 / 系统设置）
 * P1 页面为未实现占位，保留路由不删，但默认从菜单隐藏（见 hiddenIds）
 */
export const groups = [
  ["工作台", "workbench:速览"],
  [
    "巡检执行",
    "execution:实时执行监控::执行",
    // 人工接管与遥控属"执行"动作（现场接管机器人继续任务），故归入「巡检执行 › 执行」
    "manual:人工操作与遥控::执行",
    "replay:执行回溯记录::执行",
  ],
  [
    "调度中心",
    "templates:巡检模板::标准与模板",
    "plans:计划列表::任务与计划",
    "plan-edit:计划编辑::任务与计划",
    "tasks:任务列表::任务与计划",
    "quick:目标与要求::任务与计划",
    "calendar:任务日历::任务与计划",
    "dispatch:调度中心::任务安排",
    "queue:机器人任务队列::调度",
    "dispatch-log:调度记录::调度",
  ],
  [
    "结果与异常",
    "results:巡检结果查询::结果",
    "review:结果详情 / 复核::结果",
    "archive:设备巡检档案::结果",
    "alarms:告警事件::告警与工单",
    "alarm:告警详情 / 复查::告警与工单",

  ],
  [
    "资源与地图",
    "equipment:设备资源树::点位与对象",
    "points:巡检点列表::点位与对象",
    "rules:采集结果与告警规则::点位与对象",
    "annotation:点位标注与验证工作台::点位与对象",
    "routes:路线管理::路线与轨道",

    "maps:地图管理::地图",
  ],
  [
    "机器人管理",
    "robots:机器台账::机器人资产",
    "robot:机器人运行监测::机器人资产",
    "health:能力与健康::机器人能力",
    "robot-map:地图与版本::机器人能力",
    "device:机型专项::机器人能力",
  ],
  ["分析与报表", "metrics:分析报表", "analytics:基础分析", "report:巡检结果报表::巡检报表"],
  [
    "系统设置",
    "services:能力 / 服务管理::配置中心",

    "roles:角色 / 权限::组织权限",
    "users:组织 / 用户::组织权限",
    "audit:审计日志::组织权限",
    "integration:上层任务服务 / 接口配置::系统与集成",
    "interface-log:接口日志::系统与集成",
    "settings:字典 / 参数::系统与集成",
  ],
];
/**
 * 未实现 / 暂不暴露的页面：保留路由与代码，仅从侧边栏隐藏
 * - 未实现占位页（rules / services…）：避免业主点进空页面
 * - replay（执行回溯记录列表）：已实现，但按评审要求收起侧边栏入口；
 *   页面本身与内置的「过程回放」（replay-detail）保留，仍可从任务详情、设备档案、机器人、结果详情进入
 */
const hiddenIds = [
  "rules",
  "queue",
  "calendar",
  "dispatch-log",
  "routes",
  "services",
  "analytics",
  "users",
  "quick",
  "replay",
];
const roots = [
  "workbench",
  "execution",
  "dispatch",
  "result",
  "resource",
  "robot",
  "analytics",
  "system",
];
const paths: Record<string, string> = {
  workbench: "workbench",
  overview: "monitor/overview",
  screen: "screen",
  calendar: "monitor/calendar",
  robots: "robots/monitor",
  robot: "robots/detail",
  maps: "robots/maps",
  health: "robots/health",
  "robot-map": "robots/map",
  manual: "execution/manual",
  device: "robots/device",
  equipment: "resources/equipment",
  points: "resources/points",
  annotation: "resources/annotation",
  routes: "resources/routes",
  templates: "resources/templates",
  plans: "planning/plans",
  "plan-edit": "planning/plan-edit",
  tasks: "planning/tasks",
  quick: "planning/quick",
  dispatch: "dispatch/workbench",
  queue: "dispatch/queue",
  "dispatch-log": "dispatch/records",
  execution: "execution/live",
  replay: "execution/replay",
  results: "results/query",
  review: "results/review",
  archive: "results/equipment",
  /** 结果详情内置页：挂在设备巡检档案目录下，不进入巡检结果查询这一支 */
  "result-detail": "results/equipment/detail",
  /** 告警详情内置页：同样挂在设备巡检档案目录下，用于档案内的关联告警查看 */
  "alarm-detail": "results/equipment/alarm",
  /** 执行回溯内置页：挂在设备巡检档案目录下，用于档案内的任务过程回放 */
  "replay-detail": "results/equipment/replay",
  /** 巡检结果详情内置页：挂在「巡检结果查询」分支下，由结果查询任务行「详情」进入（非弹窗） */
  "result-view": "results/task-result",
  services: "ai/services",
  rules: "alarms/rules",
  alarms: "alarms/events",
  alarm: "alarms/detail",
  metrics: "analytics/metrics",
  analytics: "analytics/overview",
  report: "analytics/report",
  integration: "integration/services",
  "interface-log": "integration/logs",
  users: "system/users",
  roles: "system/roles",
  settings: "system/settings",
  audit: "system/audit",
  point: "resources/points/detail",
  "task-detail": "planning/tasks/detail",
  /** 独立大屏窗口：由顶栏「驾驶舱大屏」以新标签页打开，不进入侧边栏与中心 Tab */
  bigscreen: "screen/bigscreen",
};
const parents: Record<string, string> = {
  robot: "robots",
  annotation: "points",
  "plan-edit": "plans",
  review: "results",
  "result-detail": "archive",
  "alarm-detail": "archive",
  "replay-detail": "archive",
  "result-view": "results",
  alarm: "alarms",
  point: "points",
  "task-detail": "tasks",
};
/**
 * 取页面的上级页面 ID
 * @param id 页面 ID
 * @returns 上级页面 ID；无上级时返回 undefined
 */
export const parentOf = (id: string): string | undefined => parents[id];
export const pages = groups.flatMap((g, i) =>
  g.slice(1).map((x) => {
    const [id, name, priority, sub] = x.split(":");
    return {
      id,
      name,
      priority: priority || "P0",
      group: g[0],
      root: roots[i],
      path: paths[id],
      parent: parents[id],
      /** 二级导航内的分组标签，用于在同级标签之间插入分隔符 */
      sub: sub || "",
      /** 未实现页面：仅隐藏菜单入口，路由仍可用 */
      hidden: hiddenIds.includes(id),
    };
  }),
);
/** 侧边栏可见页面：过滤掉未实现占位页 */
export const visiblePages = pages.filter((p) => !p.hidden);
/** 侧边栏实际渲染的叶子：与 App.tsx 中 nav-leaf 的过滤条件（可见且无父级）保持一致 */
const isLeaf = (id: string) =>
  visiblePages.some((p) => p.id === id && !p.parent);
/**
 * 取侧边栏应高亮的页面 ID
 * 详情页 / 内置子页（任务详情、巡检点详情、告警详情、结果复核…）不在侧边栏叶子中，
 * 逐级回落到其列表父页，保证打开这些页面时侧边栏仍保持高亮，不会丢失选中态
 * @param page 当前页面 ID
 * @returns 侧边栏叶子页面 ID；无可用父级时返回原页面 ID
 */
export function menuIdOf(page: string): string {
  let cur = page;
  const seen = new Set<string>([cur]);
  while (!isLeaf(cur)) {
    const parent = parentOf(cur);
    if (!parent || seen.has(parent)) break;
    seen.add(parent);
    cur = parent;
  }
  return cur;
}
export const routeMeta = [
  ...pages,
  {
    ...pages.find((x) => x.id === "points")!,
    id: "point",
    name: "巡检点详情",
    path: paths.point,
    parent: "points",
  },
  {
    ...pages.find((x) => x.id === "tasks")!,
    id: "task-detail",
    name: "任务详情",
    path: paths["task-detail"],
    parent: "tasks",
  },
  {
    // 结果详情内置页：无侧边栏入口，挂在设备巡检档案目录下，由档案内的结果引用点击进入
    ...pages.find((x) => x.id === "archive")!,
    id: "result-detail",
    name: "结果详情",
    path: paths["result-detail"],
    parent: "archive",
  },
  {
    // 告警详情内置页：无侧边栏入口，挂在设备巡检档案目录下，由档案内的关联告警进入
    ...pages.find((x) => x.id === "archive")!,
    id: "alarm-detail",
    name: "告警详情",
    path: paths["alarm-detail"],
    parent: "archive",
  },
  {
    // 执行回溯内置页：无侧边栏入口，挂在设备巡检档案目录下，由已结束任务的「过程回放」进入
    ...pages.find((x) => x.id === "archive")!,
    id: "replay-detail",
    name: "执行回溯",
    path: paths["replay-detail"],
    parent: "archive",
  },
  {
    // 巡检结果详情内置页：无侧边栏入口，挂在「巡检结果查询」下（入口为结果查询任务行「详情」）
    ...pages.find((x) => x.id === "results")!,
    id: "result-view",
    name: "巡检结果详情",
    path: paths["result-view"],
    parent: "results",
  },
  {
    // 驾驶舱大屏：仅由顶栏入口以新标签页打开，故不写入 groups（不出现在侧边栏与中心 Tab）
    ...pages.find((x) => x.id === "workbench")!,
    id: "bigscreen",
    name: "驾驶舱大屏",
    path: paths.bigscreen,
    parent: undefined,
    sub: "",
    hidden: true,
  },
];
export interface Route {
  page: string;
  id?: string;
  tab?: string;
  /** 详情页的显式来源页：由入口页在链接上带回（`?from=page/id`），用于面包屑与返回的动态归属 */
  from?: { page: string; id?: string };
}
export function parse(hash = location.hash): Route {
  const [raw, q] = hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(q);
  const match = Object.entries(paths)
    .sort((a, b) => b[1].length - a[1].length)
    .find(([, p]) => raw === p || raw.startsWith(p + "/"));
  // 默认落地「我的工作台」：业主打开即见待办，而非技术性总览页
  let page = match?.[0] || raw || "workbench";
  let id = match
    ? decodeURIComponent(raw.slice(match[1].length + 1)) || undefined
    : params.get("id") || undefined;
  if (page === "tasks" && id) page = "task-detail";
  // 显式来源页：格式 `page` 或 `page/id`（同一内置页可由不同业务页进入，故需带回来源）
  const fromRaw = params.get("from");
  let from: Route["from"];
  if (fromRaw) {
    const [fp, fid] = fromRaw.split("/");
    from = fp ? { page: fp, id: fid ? decodeURIComponent(fid) : undefined } : undefined;
  }
  return { page, id, tab: params.get("tab") || undefined, from };
}
export function href(
  page: string,
  id?: string,
  tab?: string,
  from?: { page: string; id?: string },
) {
  if (page === "tasks" && id) page = "task-detail";
  const qs = new URLSearchParams();
  if (tab) qs.set("tab", tab);
  if (from)
    qs.set(
      "from",
      from.page + (from.id ? "/" + encodeURIComponent(from.id) : ""),
    );
  const q = qs.toString();
  return (
    "#/" +
    (paths[page] || page) +
    (id ? "/" + encodeURIComponent(id) : "") +
    (q ? "?" + q : "")
  );
}

export function go(
  page: string,
  id?: string,
  tab?: string,
  from?: { page: string; id?: string },
) {
  const next = href(page, id, tab, from);
  if (next === location.hash) return;
  location.hash = next;
}
/**
 * 取当前页面在导航目录中的上一级（按目录层级，而非访问历史）
 * 层级链：内置详情页 → 所属二级页面（菜单列表页）→ 结束
 * @description 返回链在二级页面终止，不再上跳到一级中心入口或工作台；
 *              仅不在目录树中的页面（驾驶舱等）回落到角色工作台
 * @param page 当前页面 ID
 * @returns 上一级页面 ID；已处于返回链终点时返回 undefined
 */
export function parentTargetOf(page: string): string | undefined {
  const meta = routeMeta.find((x) => x.id === page);
  // 内置 / 详情子页（任务详情、巡检点详情…）：回到其列表父页，到此结束
  if (meta?.parent) return meta.parent;
  // 菜单页面（二级列表页 / 工作台）即返回链终点，不再继续上跳
  if (meta) return undefined;
  // 不在目录树中的页面（驾驶舱 overview / screen）：回到角色工作台
  return "workbench";
}
/**
 * 返回操作：沿导航目录逐级向上，不依赖点击历史
 * @description 内置页 → 二级列表页（终点）；驾驶舱 → 工作台
 */
export function back() {
  const r = parse();
  // 详情页带回了显式来源页时，优先沿该来源返回（含来源页的 id），保持上下文一致
  if (r.from) {
    go(r.from.page, r.from.id);
    return;
  }
  const target = parentTargetOf(r.page);
  if (target) go(target);
}
export function goCenter(page: string) {
  location.hash = href(page);
}
export function useViewState<T>(
  key: string,
  fallback: T,
): [T, (value: T | ((old: T) => T)) => void] {
  const [v, set] = useState<T>(() => {
    try {
      return (
        JSON.parse(sessionStorage.getItem("view:" + key) || "null") ?? fallback
      );
    } catch {
      return fallback;
    }
  });
  return [
    v,
    (value) =>
      set((old) => {
        const next =
          typeof value === "function" ? (value as (x: T) => T)(old) : value;
        // file:// 离线打开时部分浏览器禁用会话存储，写失败不影响本次浏览
        try {
          sessionStorage.setItem("view:" + key, JSON.stringify(next));
        } catch {
          /* 忽略存储失败 */
        }
        return next;
      }),
  ];
}
