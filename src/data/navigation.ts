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
    "results:巡检结果::结果",
    // EQ-01：设备巡检档案已移入「资源与地图 › 设备主数据」（结果与异常侧只保留按任务的结果查询）
    "alarms:告警管理::告警与处理",
    "alarm:告警详情 / 处理::告警与处理",

  ],
  [
    "资源与地图",
    // EQ-01：设备巡检档案并入设备台账（行内「设备档案」入口）；路由保留、菜单隐藏（见 hiddenIds），避免与台账语义重复
    "equipment:设备台账::点位与对象",
    "archive:设备巡检档案::点位与对象",
    "points:巡检目标台账::点位与对象",
    // TGT-01：空间 / 区域（非装置）类目标**不单独占菜单项**（2026-10-10 按产品要求删除）：
    // 路由 `#/resources/points-space` 与台账页 tab="space" 视图保留，入口收口到
    // 「巡检目标台账」的「空间与区域」筛选 + 新增抽屉第一步的「区域（环境）」页签
    // "points-space:空间与区域目标::点位与对象",
    "rules:采集结果与告警规则::点位与对象",
    // 巡检点管理（原「点位标注与验证工作台」）：巡检点 = 名称 + 地图 + 标定点 + 多个巡检项
    "annotation:巡检点管理::点位与对象",
    // 原「路线与轨道 → 路线管理」已下线：路线随地图带入，不再作为独立目录
    "maps:地图管理::地图",
    // 空间管理（「空间」目录）：厂区全局坐标系、碎片地图配准、巡检点全局坐标、
    // 全局↔局部坐标转换、地图拓扑与跨图切换点、版本绑定与校验
    "space:空间管理::空间",
  ],
  [
    "后台管理",
    "admin:工厂基础数据",
    // 算法模板管理：平台 AI 能力（算法）清单的唯一维护入口；被目标台账 / 巡检要求按名称引用
    "algo-templates:算法模板管理",
    // 告警模板管理：告警触发逻辑（模板 = 触发条件 + 处理流程；规则库 = 名称/级别/类型/阈值/触发条件）
    // 的唯一维护入口，供点位判定规则、告警处置页等其他页面引用
    "alarm-templates:告警模板管理",
    // 巡检要求管理：平台「看什么、怎么判」的标准表达（模板库）的唯一维护入口，
    // 巡检目标台账 = 仪表 / 区域 + 一条巡检要求 + 算法 + 阈值 + 判定；被台账按目标类型与采集方式匹配引用
    "requirements:巡检要求管理",
    // 机器人上装能力：机器人能力 / 任务指令集 / 派单校验的上游主数据
    "payloads:机器人上装能力",
  ],
  [
    "机器人管理",
    // ROB-03：「机器人管理」收口为「机器台账」单一菜单入口 ——
    // 运行监测（须指定机器人）、新增机器人（动作）、机器人能力（某台机器人的详情）
    // 三者都不是可与台账并列的目录页，降级为台账内的按钮 / 行内链接入口（菜单隐藏，路由保留）
    "robots:机器台账",
    "robot:机器人运行监测",
    "robot-new:新增机器人",
    // 原「能力与健康 / 地图与版本 / 机型专项」三页合并为一个「机器人能力」页（页内 Tab 切换）
    "health:机器人能力",
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
  "services",
  "analytics",
  "users",
  "quick",
  "replay",
  // 已合并进「机器人能力」页（health 的页内 Tab）；路由保留，旧链接仍可打开
  "robot-map",
  "device",
  // EQ-01：设备巡检档案并入设备台账（行内入口）；路由保留（含 result-detail/alarm-detail/replay-detail 的父级），仅隐藏菜单
  "archive",
  // EXE-03：人工接管与遥控降为「实时执行监控」的内置页（从现场态势 / 机器人详情进入）；路由保留，仅隐藏菜单
  "manual",
  // ROB-03：运行监测 / 新增机器人 / 机器人能力 降为「机器台账」的内置页
  // （分别由台账行「机器人名」、顶部「＋ 新增机器人」按钮、行「能力摘要」进入）；路由保留，仅隐藏菜单
  "robot",
  "robot-new",
  "health",
];
const roots = [
  "workbench",
  "execution",
  "dispatch",
  "result",
  "resource",
  "admin",
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
  /** 新增机器人（内置表单页）：挂在「机器人管理 › 机器人资产」下 */
  "robot-new": "robots/new",
  maps: "robots/maps",
  /** 空间管理（资源与地图 › 空间）：全局坐标系与地图拓扑 */
  space: "resources/space",
  health: "robots/health",
  "robot-map": "robots/map",
  manual: "execution/manual",
  device: "robots/device",
  equipment: "resources/equipment",
  /** 后台管理：工厂已有基础数据（区域 / 设备 / 仪表）配置 */
  admin: "admin",
  /** 后台管理：算法模板管理（AI 能力清单；target 台账按名称引用） */
  "algo-templates": "admin/algo-templates",
  /** 后台管理：告警模板管理（触发条件 + 处理流程 / 平台标准规则库） */
  "alarm-templates": "admin/alarm-templates",
  /** 后台管理：巡检要求管理（平台「看什么、怎么判」的标准表达，台账按目标类型与采集方式匹配引用） */
  requirements: "admin/requirements",
  /** 后台管理：机器人上装能力（上装主数据） */
  payloads: "admin/payloads",
  points: "resources/points",
  /** 空间 / 区域（非装置）类目标：复用巡检目标台账页，预置为空间与区域视图 */
  "points-space": "resources/points-space",
  /** 添加 / 编辑巡检点（内置页）：名称 + 地图 + 标定点 + 多个巡检项 */
  "point-edit": "resources/points/edit",
  /** 现场采集（跑图）新增巡检点（内置页）：巡检点新增的唯一入口 */
  "point-onsite": "resources/points/onsite",
  /** 地图标注工作台（内置页）：候选目标 / 图面双击打点 / 试采与自主验证 */
  "point-annotate": "resources/points/annotate",
  /** 巡检点管理（菜单页）：已配置巡检点列表 + 添加巡检点 */
  annotation: "resources/annotation",
  templates: "resources/templates",
  plans: "planning/plans",
  "plan-edit": "planning/plan-edit",
  tasks: "planning/tasks",
  quick: "planning/quick",
  dispatch: "dispatch/workbench",
  queue: "dispatch/queue",
  "dispatch-log": "dispatch/records",
  execution: "execution/live",
  /** 单任务现场态势（内置页）：挂在「实时执行监控」下，由执行总览行内「监控」进入 */
  "execution-monitor": "execution/monitor",
  replay: "execution/replay",
  results: "results/query",
  review: "results/review",
  archive: "results/equipment",
  /** 结果详情内置页：挂在设备巡检档案目录下，不进入「巡检结果」这一支 */
  "result-detail": "results/equipment/detail",
  /** 告警详情内置页：同样挂在设备巡检档案目录下，用于档案内的关联告警查看 */
  "alarm-detail": "results/equipment/alarm",
  /** 执行回溯内置页：挂在设备巡检档案目录下，用于档案内的任务过程回放 */
  "replay-detail": "results/equipment/replay",
  /** 巡检结果详情内置页：挂在「巡检结果」分支下，由结果查询任务行「详情」进入（非弹窗） */
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
  /** 地图详情内置页：挂在「地图管理」下（列表 → 详情 → 两个抽屉） */
  "map-detail": "robots/maps/detail",
  /** 独立大屏窗口：由顶栏「驾驶舱大屏」以新标签页打开，不进入侧边栏与中心 Tab */
  bigscreen: "screen/bigscreen",
};
const parents: Record<string, string> = {
  /** ROB-03：运行监测 / 新增机器人 / 机器人能力 都是「机器台账」的内置页 */
  robot: "robots",
  "robot-new": "robots",
  health: "robots",
  "map-detail": "maps",
  /** 单任务现场态势（内置页）：归属「实时执行监控」 */
  "execution-monitor": "execution",
  /** EXE-03：「人工操作与遥控」降为执行监控的内置页（菜单隐藏，仅保留行内入口） */
  manual: "execution",
  /**
   * EQ-01：设备巡检档案并入「设备台账」（菜单隐藏，仅保留行内入口）。
   * 这里仍登记其父级为「设备台账」，才能：
   *  ① 进入档案页时侧边栏继续高亮设备台账（menuIdOf 逐级回落）；
   *  ② 面包屑补出「设备台账 › 设备巡检档案」；
   *  ③ 「返回」按钮回到设备台账（而非置灰）。
   */
  archive: "equipment",
  /** 添加 / 编辑巡检点、现场采集新增、地图标注工作台、巡检点详情都归属「巡检点管理」 */
  "point-edit": "annotation",
  "point-onsite": "annotation",
  "point-annotate": "annotation",
  "plan-edit": "plans",
  review: "results",
  "result-detail": "archive",
  "alarm-detail": "archive",
  "replay-detail": "archive",
  "result-view": "results",
  alarm: "alarms",
  /** 巡检点详情：归属「巡检点管理」（原挂在已下线的「巡检点列表」内置页下） */
  point: "annotation",
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
    // 添加 / 编辑巡检点（内置页）：从「巡检点管理」列表的行内「编辑巡检点」进入
    ...pages.find((x) => x.id === "annotation")!,
    id: "point-edit",
    name: "添加 / 编辑巡检点",
    path: paths["point-edit"],
    parent: "annotation",
  },
  {
    // 现场采集（跑图）新增巡检点（内置页）：巡检点新增的唯一入口，从「巡检点管理」工具条进入
    ...pages.find((x) => x.id === "annotation")!,
    id: "point-onsite",
    name: "现场采集新增巡检点",
    path: paths["point-onsite"],
    parent: "annotation",
  },
  {
    // 地图标注工作台（内置页）：候选目标、图面双击打点、试采与自主验证；仍被地图上线工作台第 1 步内嵌
    ...pages.find((x) => x.id === "annotation")!,
    id: "point-annotate",
    name: "地图标注工作台",
    path: paths["point-annotate"],
    parent: "annotation",
  },
  {
    ...pages.find((x) => x.id === "annotation")!,
    id: "point",
    name: "巡检点详情",
    path: paths.point,
    parent: "annotation",
  },
  {
    ...pages.find((x) => x.id === "tasks")!,
    id: "task-detail",
    name: "任务详情",
    path: paths["task-detail"],
    parent: "tasks",
  },
  {
    // 单任务现场态势（内置页）：由「实时执行监控」执行总览行内「监控」进入
    ...pages.find((x) => x.id === "execution")!,
    id: "execution-monitor",
    name: "现场态势",
    path: paths["execution-monitor"],
    parent: "execution",
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
    // 巡检结果详情内置页：无侧边栏入口，挂在「巡检结果」下（入口为结果查询任务行「详情」）
    ...pages.find((x) => x.id === "results")!,
    id: "result-view",
    name: "巡检结果详情",
    path: paths["result-view"],
    parent: "results",
  },
  {
    // 地图详情内置页：无侧边栏入口，挂在「地图管理」目录下（列表 →「详情」进入）
    ...pages.find((x) => x.id === "maps")!,
    id: "map-detail",
    name: "地图详情",
    path: paths["map-detail"],
    parent: "maps",
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
/**
 * 侧边栏当前应高亮的叶子页面 ID：
 * 详情 / 内置子页逐级回落到其列表父页；带显式来源（from）时按来源页归属
 * @param page 当前页面 ID
 * @param from 显式来源页（入口链接带回）
 * @returns 侧边栏应高亮的叶子页面 ID
 */
export function activeMenuId(page: string, from?: { page: string }): string {
  const src = from ? routeMeta.find((x) => x.id === from.page) : undefined;
  return menuIdOf(src ? src.id : page);
}
/**
 * 侧边栏当前应高亮的一级中心分组：以高亮叶子（activeMenuId）所属分组为准，
 * 而非当前详情页自身的静态归属 —— 否则「执行回溯」等挂在设备档案（资源与地图）下的
 * 详情页从「结果与异常」进入时，一级中心会错高亮到「资源与地图」
 * @param page 当前页面 ID
 * @param from 显式来源页（入口链接带回）
 * @returns 应高亮的一级中心分组名；无法判定时返回 undefined
 */
export function activeGroupOf(
  page: string,
  from?: { page: string },
): string | undefined {
  return routeMeta.find((x) => x.id === activeMenuId(page, from))?.group;
}
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
