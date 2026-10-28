import { useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { StoreContext as C, type MessageTone } from "./storeContext";
import { advanceAutomation } from "./automation";
import { seed } from "./seed";
import { loadTenants, saveTenants, tenantEnabled } from "./tenants";
import {
  authenticate,
  allowedTenantIds,
  clearSession,
  isSuper,
  loadSession,
  saveSession,
  type AuthAccount,
} from "./auth";
import { SAMPLE_MAP_IMAGE } from "./sampleMap";
import { publishStateOf, transition, type Action } from "./engine";
import { roleOf } from "./roles";
import { algoDeploys, algoKinds } from "./types";
import {
  defaultDeviceKindOfType,
  defaultCategoryOfTarget,
} from "./deviceMaster";
import { targetsOf } from "./mapCalibration";
import { withAlarmSetting } from "./alarmSettings";
import type {
  MapVersionLog,
  State,
  AlgoKind,
  RobotPayloadAbility,
  BusinessTarget,
  Area,
  Point,
} from "./types";
import {
  ROOT_AREA_ID,
  ROOT_AREA_NAME,
  DEMO_AREA_POLYGONS,
  ensureAreaCodes,
  fmtDateTime,
} from "./types";

/**
 * 区域树固定根规整（幂等）：保证存在且仅存在一个「全厂区」根（AREA-ROOT）
 * @description 兼容三类历史数据：
 *  1) 新 seed：已含 AREA-ROOT，原样返回；
 *  2) 用户手建过名为「全厂区」的根区域：归一化为 AREA-ROOT，其下级 parentId 同步改指；
 *  3) 早期扁平区域（都没 parentId）：补 AREA-ROOT，并把无父级区域挂到根下；
 *  另外兜底：parentId 悬空（指向已删除区域）的节点也挂回根下。
 * @param list 载入的区域集合
 * @returns 规整后的区域集合
 */
function ensureRootArea(list: Area[] | undefined): Area[] {
  const areas = Array.isArray(list) ? list.map((a) => ({ ...a })) : [];
  const root = areas.find((a) => a.id === ROOT_AREA_ID);
  // 同名历史根（用户在手填父级时代自动建出来的「全厂区」）
  const legacy = areas.find(
    (a) => a.id !== ROOT_AREA_ID && a.name === ROOT_AREA_NAME && !a.parentId,
  );
  if (!root && !legacy) {
    // 情况 3：补根，原有无父级区域全部挂到根下
    areas.forEach((a) => {
      if (!a.parentId) a.parentId = ROOT_AREA_ID;
    });
    areas.unshift({ id: ROOT_AREA_ID, name: ROOT_AREA_NAME });
  } else if (!root && legacy) {
    // 情况 2：把历史根的 id 归一化，子级引用一并改指
    const oldId = legacy.id;
    legacy.id = ROOT_AREA_ID;
    areas.forEach((a) => {
      if (a.parentId === oldId) a.parentId = ROOT_AREA_ID;
    });
  } else if (root && legacy) {
    // 根与历史根并存：历史根的子级改挂正式根，再移除历史根
    const oldId = legacy.id;
    areas.forEach((a) => {
      if (a.parentId === oldId) a.parentId = ROOT_AREA_ID;
    });
    return ensureRootArea(areas.filter((a) => a.id !== oldId));
  }
  // 兜底：悬空父链（父级被删过）挂回根
  const ids = new Set(areas.map((a) => a.id));
  areas.forEach((a) => {
    if (a.parentId && a.parentId !== ROOT_AREA_ID && !ids.has(a.parentId))
      a.parentId = ROOT_AREA_ID;
  });
  return areas;
}
/**
 * 区域范围轮廓补缺（幂等）
 * @description 巡检点的区域归属按坐标推算（见 deviceMaster.areaOfCoord），
 *              老缓存里的区域没有 polygon 会让归属全部落空，这里按演示分区补一份；
 *              用户已经在「区域配置」里画过的保持原样
 * @param list 区域集合
 * @returns 轮廓已补全的区域集合
 */
function ensureAreaPolygons(list: Area[]): Area[] {
  return list.map((a) =>
    a.polygon?.length ? a : { ...a, polygon: DEMO_AREA_POLYGONS[a.name] },
  );
}
const BASE_KEY = "inspection-v14-prototype";
const DEFAULT_TENANT = "T-DEFAULT";
/** 当前租户：存独立键，切租户即整份换数据 */
function getTenant(): string {
  try {
    return localStorage.getItem("inspection-tenant") || DEFAULT_TENANT;
  } catch {
    return DEFAULT_TENANT;
  }
}
/** 默认租户沿用老键（零迁移）；其余租户用带后缀的独立键 */
function keyOf(tid: string): string {
  return tid === DEFAULT_TENANT ? BASE_KEY : `${BASE_KEY}:${tid}`;
}
/** 当前数据模型版本，须与 types.ts 的 State.schema 一致 */
const SCHEMA = 13;
/**
 * 老缓存升级：schema 1 → 2 时补齐接管/反馈等新增集合，
 * 并按序回填机型、约束、健康度、固件字段、已激活的地图版本号，
 * 避免页面读到 undefined（版本号缺失会渲染出 `Vundefined`）；
 * schema 2 → 3 时补齐 Template.state（启用/停用），否则路线列表状态列会渲染出空徽标；
 * schema 5 → 6 时补齐「地图 → 巡检任务」链路新增集合（devices/logicalPoints/routes/…），
 * 老缓存缺这些集合时由 seed() 兜底合并，页面读不到 undefined
 * @param raw 本地缓存解析出的状态对象
 * @returns 当前版本状态；无法识别时返回 null，由调用方回落到 seed()
 */
export function migrate(raw: unknown): State | null {
  const s = migrateInner(raw);
  return s ? normalizeTaskIds(s) : null;
}
/**
 * 任务编号规范化
 * @description 旧规则生成的任务 id 是时间戳+随机串（Tmvqqik3l1ei），跟种子数据（T009）、
 *              计划编号（PL01）混在一列里长短不一。加载时统一改成 `T` + 三位序号，
 *              并把结果 / 告警 / 接管会话里对它的引用一并改指，避免对不上号
 * @param s 迁移后的状态
 * @returns 编号已规范化的状态（本来就没有旧编号时原样返回）
 */
function normalizeTaskIds(s: State): State {
  const map = new Map<string, string>();
  let max = 0;
  s.tasks.forEach((t) => {
    const m = /^T(\d+)$/.exec(t.id);
    if (m) max = Math.max(max, Number(m[1]));
  });
  s.tasks.forEach((t) => {
    if (/^T\d+$/.test(t.id)) return;
    max += 1;
    map.set(t.id, `T${String(max).padStart(3, "0")}`);
  });
  if (!map.size) return s;
  const fix = (v?: string) => (v ? map.get(v) || v : v);
  return {
    ...s,
    tasks: s.tasks.map((t) => ({
      ...t,
      id: fix(t.id)!,
      retryOf: fix(t.retryOf),
      retriedBy: fix(t.retriedBy),
      preemptedTaskId: fix(t.preemptedTaskId),
    })),
    ...(s.results && {
      results: s.results.map((r) => ({ ...r, taskId: fix(r.taskId)! })),
    }),
    ...(s.alarms && {
      alarms: s.alarms.map((a) => ({ ...a, taskId: fix(a.taskId) })),
    }),
    ...(s.sessions && {
      sessions: s.sessions.map((x) => ({ ...x, taskId: fix(x.taskId) })),
    }),
  };
}
function migrateInner(raw: unknown): State | null {
  if (!raw || typeof raw !== "object") return null;
  const old = raw as Record<string, any>;
  if (old.schema === SCHEMA) {
    // 同一版本的老缓存里也可能残留 `2026/10/23 23:03:11` 这类写法，加载时就地归一
    unifyTimes(old);
    return old as State;
  }
  if ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(old.schema)) {
    const base = seed();
    const merged = { ...base, ...old, schema: SCHEMA } as State;
    // 告警处理口径 6→7：老缓存的告警带废弃的 validity 且缺处理时间，整体改用 seed
    // （告警在演示里是平台产生的数据，不涉及用户录入，直接换成新口径的一套最省事）
    if (
      (old.alarms as Record<string, unknown>[] | undefined)?.some(
        (a) => "validity" in a,
      )
    )
      merged.alarms = base.alarms;
    /**
     * 机器人逐台按序回填：老缓存的机器人可能缺机型 / 约束 / 固件，
     * 尤其缺 `mapVersion` 时页面会渲染出 `Vundefined`。
     * 先铺 seed 同序号那条、再盖上老缓存已有字段——只补缺，不覆盖用户数据
     */
    const oldRobots = (old.robots as any[]) || [];
    merged.robots = oldRobots.length
      ? oldRobots.map((r, i) => ({
          ...base.robots[i % base.robots.length],
          ...r,
        }))
      : base.robots;
    // Template 新增 state 字段：老缓存逐条回填默认值，保留用户已建路线
    merged.templates = (merged.templates || []).map((t: any) => ({
      ...t,
      state: t.state === "停用" ? "停用" : "启用",
    }));
    /**
     * 10 → 11：参数条目新增「类型 / 数据字典键值对」。
     * 老缓存里的参数缺 type 就从种子同 id 补，种子新条目（如 DIC01）也一并补进来
     */
    // 12 → 13：区域补业务编码（AR-01 顺延），老缓存只有名称
    if (Array.isArray(merged.areas)) ensureAreaCodes(merged.areas);
    const oldExtras = (old.extras as any[]) || [];
    merged.extras = [
      ...oldExtras.map((x) => ({
        ...base.extras.find((b) => b.id === x.id),
        ...x,
      })),
      ...base.extras.filter((b) => !oldExtras.some((x) => x.id === b.id)),
    ].map((x) => {
      // 数据字典是系统口径（值来自状态枚举），升级时以种子为准，避免老缓存的旧枚举残留
      const sys = base.extras.find((b) => b.id === x.id && b.type === "数据字典");
      return sys || x;
    });
    return merged;
  }
  return null;
}
/**
 * 老缓存补齐：schema 6 的缓存缺两类后加的数据，按需从 seed() 回填，
 * 保证「打开地图就有底图可标注」「打开设备主数据就有台账」。
 * @description 回填都不会覆盖用户的主动操作：
 *              - 底图：用户「清除底图」写入的是空串 `""`，不是 `undefined`；
 *              - 设备：仅在整份集合缺失时回填，用户删改过的集合不会被覆盖；
 *              - 统一坐标系：仅为缺 `world` 的巡检点 / 标定点补值（按底图 1:1，z=0）。
 * @param s 迁移后的状态
 * @returns 补全后的状态（无需补全时原样返回）
 */
/**
 * 老缓存的地图版本历史归一化：早期历史是字符串数组（`"V1 首次建图"`），
 * 迁移为结构化版本日志 `{ version, note, at }`；无法解析出时间的旧条目留空
 * @param raw 老历史数组
 * @returns 结构化版本日志（保持原顺序，最新在前）
 */
function normalizeHistory(raw: unknown): MapVersionLog[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((h, i) => {
    if (h && typeof h === "object") return h as MapVersionLog;
    const text = String(h ?? "");
    const mt = text.match(/^V?(\d+)\s*[·:：,，-]?\s*(.*)$/);
    return {
      version: mt ? Number(mt[1]) : Math.max(1, list.length - i),
      note: mt ? mt[2] || text : text,
      at: "",
    };
  });
}
/**
 * 老缓存（二级口径之前）的扁平告警类别 → 新二级口径的分类名映射
 * @description 只在迁移时用一次：命中任一旧名即认为该缓存还是老口径，
 *              类别主数据与台账的「告警类型」一并切到 seed 的新口径
 */
const LEGACY_ALARM_CLASS: Record<string, string> = {
  固定设备实时巡检: "生产运行",
  机器人定点巡检: "生产运行",
  机器人实时巡检: "生产运行",
  实时气体: "环境安全",
  环境红外巡检: "环境安全",
  机器人故障: "下装",
};
function withSeedDefaults(s: State): State {
  const needMapImage = s.maps?.some((m) => m.image === undefined);
  // 版本历史老缓存：仍是字符串数组时统一迁移为结构化版本日志
  const needHistoryNorm = s.maps?.some((m) =>
    (m.history as unknown[])?.some((h) => typeof h === "string"),
  );
  /**
   * 机器人版本字段：老缓存（含历史 schema 合并结果）可能缺 mapVersion，
   * 页面会渲染出 `Vundefined`；按 seed 顺序回填，只补缺、不覆盖已有值
   */
  const needRobotVersions = s.robots?.some(
    (r) => typeof r.mapVersion !== "number",
  );
  // 设备主数据 / 工厂树 / 巡检目标台账：老缓存缺任一项即整体回填（它们同源派生，必须成套）；
  // 设备仍带已删除的审核字段（reviewState）时属旧口径缓存，同样整体回填
  const devicesStale = s.devices?.some((d) =>
    Object.prototype.hasOwnProperty.call(d, "reviewState"),
  );
  const needDevices =
    !s.devices?.length ||
    !s.logicalPoints?.length ||
    !s.instruments?.length ||
    !s.businessTargets?.length ||
    !!devicesStale;
  /** 设备形态（实体设备 / 虚拟设备）：老缓存设备缺该字段，按设备类型回填，只补缺、不覆盖 */
  const needDeviceKind = !!s.devices?.some((d) => !d.deviceKind);
  /**
   * 设备「更新时间」与检测项「分类」：老缓存缺这两项时补缺。
   * 更新时间落固定的演示时间（不用"当前时间"，避免每次打开都变）；分类按检测目标名推导
   */
  const needDeviceMeta = !!s.devices?.some(
    (d) => !d.updatedAt || (d.items || []).some((it) => !it.category),
  );
  /**
   * 巡检点状态字段：老缓存里缺 state 的补「已启用」
   * @description 现场采集 / 地图导入的点位默认可用；只有标注工作台打点的点位才是「停用」
   */
  const needPointState = !!s.points?.some((p) => !p.state);
  /**
   * 装置区归属修正（老缓存的历史错标）：装置区的点位与设备曾被记为「一期罐区」，
   * 会让跨区派单不再被拦截、覆盖率分母混入装置区目标。
   * 判定用「点位所属设备名 / 设备安装位置」前缀（不写死 id），修正为装置区地图 MAP-B01
   */
  const needZoneFix =
    !!s.points?.some((p) => p.mapId === "MAP-A03" && /^装置区/.test(p.device)) ||
    !!s.devices?.some(
      (d) => d.region === "一期罐区" && d.locationDesc.startsWith("装置区"),
    );
  /** 老缓存引用了不存在的地图（机器人 / 点位 / 轨道指向 MAP-B01，但 maps 里没有）：按 seed 补齐 */
  const needMaps = [
    ...(s.robots || []).map((r) => r.mapId),
    ...(s.points || []).map((p) => p.mapId),
    ...(s.railSections || []).map((x) => x.mapId),
  ]
    .filter(Boolean)
    .some((id) => !s.maps?.some((m) => m.id === id));
  /**
   * 路网失效段（点位归属修正的连带影响）：roadnet 里可能引用了**已不在本图**的定位点
   * （如装置区的 O107 / O110 随点位迁到 MAP-B01），这些段画不出来、表现为「父线断了」。
   * 逐段剔除失效点，剩余不足 2 点的整段移除
   */
  const needRoadnetFix = !!s.maps?.some((m) => {
    const ids = new Set(targetsOf(s, m.id).map((t) => t.id));
    return !!(m.roadnet?.paths || []).some((p) =>
      p.pointIds.some((id) => !ids.has(id)),
    );
  });
  // 地图同步状态是派生值（口径见 engine.publishStateOf）：老缓存存的是旧口径，载入时按机器 / 下发记录校正
  const needMapState = s.maps?.some((m) => m.syncState !== publishStateOf(s, m));
  // 地图逻辑启停：新加字段，老缓存缺 status 时默认「启用」
  const needMapStatus = s.maps?.some((m) => !m.status);
  /** 告警被清空过的老缓存：回填示例，否则工作台与「告警事件」是空表（只为演示可读性） */
  const needAlarms = !s.alarms?.length;
  // 巡检点标定数据是独立模块：老缓存里没有该集合时从 seed 回填（地图上不再挂点位）
  const needCalibrations = !s.mapCalibrations?.length;
  // 下发记录：老缓存（schema 6 早期）没有该集合，会渲染出「0 条」空表；缺失时从 seed 回填
  const needSyncs = !s.syncs?.length;
  // 机器人上装能力：老缓存没有该主数据，缺失时从 seed 回填，否则后台配置页是空表
  const needPayloads = !s.robotPayloads?.length;
  // 老缓存的上装是「单一采集方式（kind / actions）」旧口径，缺 abilities 时按旧字段迁移为多采集能力组
  const needPayloadMigrate = !!s.robotPayloads?.some(
    (p) => !Array.isArray((p as { abilities?: unknown }).abilities),
  );
  // 算法（AI 能力）清单：老缓存没有该主数据，缺失时从 seed 回填，否则「算法模板管理」页是空表
  const needAlgos = !s.algoConfigs?.length;
  // 算法口径收敛（部署位置 / 适配类型）：老缓存里的「边缘 / 本地」与旧巡检要求分类统一归一
  const needAlgoNorm = !!s.algoConfigs?.some(
    (a) =>
      !algoDeploys.includes(a.deploy) ||
      a.adapt.some((x) => !algoKinds.includes(x as AlgoKind)),
  );
  /**
   * 统一坐标系回填（DATA-01）：老缓存的巡检点 / 标定点没有 `world`，
   * 巡检点列表会显示「未写入统一坐标」、任务快照也缺权威坐标。
   * 演示口径按底图 1:1（z=0）由底图坐标 x/y 回填，只补缺、不覆盖已有值。
   */
  const needWorld =
    s.points?.some((p) => !p.world) ||
    s.mapCalibrations?.some((c) => c.targets?.some((t) => !t.world));
  /**
   * 区域主数据：老缓存里是空的，或只剩早期派生出来的占位「未分区」，
   * 一律用 seed 的正式区域清单（一期罐区 / 装置区）覆盖，避免后台管理区域配置为空。
   */
  const areasStale =
    !s.areas?.length || s.areas.every((a) => a.name === "未分区");
  /**
   * 巡检要求（模板库）：老缓存缺新增条目（如区域类 REQ-GAS-AREA）时按 id 补回 seed，
   * 不覆盖用户在「巡检要求管理」后台页新建 / 修改的条目（该页已暴露编辑入口）
   */
  const needReqMaster =
    !s.requirements?.length ||
    !s.requirements?.some((r) => r.id === "REQ-GAS-AREA") ||
    // 合并为「算法模板」后新增了编码 / 部署位置：老缓存缺任一项也要迁移
    !s.requirements?.every((r) => r.code && r.deploy);
  const needAlgoMaster = !s.algoConfigs?.some((a) => a.id === "ALG-10");
  // 告警类别（告警管理 › 告警类别）：老缓存没有该集合时从 seed 回填，否则告警设置的可选类型与筛选为空
  const needAlarmClasses = !s.alarmClasses?.length;
  // 「识别故障」分类归属机器人预警（采集链路问题）：缺失或挂在业务下时要修正
  const needRecognizeFaultClass = !s.alarmClasses?.some(
    (c) => c.name === "识别故障" && c.main === "机器人预警",
  );
  /**
   * 识别失败口径：照片模糊 / 算法调用失败 / 传感器无数据这类告警应为
   * 「机器人预警 + 分类=识别故障 + 带执行机器人」，老缓存里可能还记在业务下
   */
  const needRecognizeFaultAlarm = !!s.alarms?.some((a) => {
    const r = s.results?.find((x) => x.id === a.resultId);
    const failed = !!r?.aiAbnormal && !r.abnormal;
    return (
      failed && (a.category !== "机器人" || a.alarmClass !== "识别故障")
    );
  });

  // 告警类别口径切换（扁平 6 类 → 二级口径）：命中旧分类名时整体切到 seed 的新口径
  const needAlarmClassNorm = !!s.alarmClasses?.some(
    (c) => c.name in LEGACY_ALARM_CLASS,
  );
  // 告警推送人员（告警管理 › 告警推送）：老缓存没有该集合时从 seed 回填
  const needAlarmPush = !s.alarmPushStaff?.length;
  // 推送范围（区域 / 设备）：老缓存没有该绑定，按 id 从 seed 回填演示范围，只补缺
  const needPushScope = !!s.alarmPushStaff?.some(
    (p) => !p.areas && !p.devices,
  );
  /**
   * 台账告警设置（类型 / 开关 / 告警项）：schema 7 的老缓存缺这些字段，
   * 按台账现有判定口径补齐（只补缺，不改已有规则），保证「告警管理 › 告警设置」不为空；
   * 告警名称已废弃，老缓存残留该字段时也走一次补齐把它清掉
   */
  const needAlarmSettings = !!s.businessTargets?.some(
    (b) =>
      !b.alarm?.items?.length ||
      b.alarm?.name !== undefined ||
      !b.alarm?.category ||
      b.alarm?.enabled === undefined,
  );
  /** 路线方式老口径（跟随父线 / 自定义 / 固定路线 / 自定义路线）→ 新口径（预设路线 / 自建路线），只改这一处，不重算路线内容 */
  const needRouteModeNorm = !!s.templates?.some((t) => {
    const m = t.mode as string | undefined;
    return (
      m === "跟随父线" || m === "自定义" || m === "固定路线" || m === "自定义路线"
    );
  });
  /** 执行周期老口径（每周 / 每班）→ 月 / 天 / 时 新口径，只改下拉可选项对应的字段，不动排期参数 */
  const needPlanCycleNorm = !!s.plans?.some(
    (p) => (p.cycle as string) === "每周" || (p.cycle as string) === "每班",
  );
  /** 环境 / 区域类示例台账的旧口径：改接新的区域巡检要求与区域模板 */
  const needEnvNorm = !!s.businessTargets?.some(
    (b) =>
      b.id === "BT-ENV-GAS" ||
      b.id === "BT-ENV-IR" ||
      (b.targetKind === "区域" && b.requirementId === "REQ-GAS"),
  );
  if (
    !needMapImage &&
    !needDevices &&
    !needMapState &&
    !needMapStatus &&
    !needAlarms &&
    !needCalibrations &&
    !needSyncs &&
    !needPayloads &&
    !needPayloadMigrate &&
    !needAlgos &&
    !needAlgoNorm &&
    !needReqMaster &&
    !needAlgoMaster &&
    !needAlarmClasses &&
    !needRecognizeFaultClass &&
    !needRecognizeFaultAlarm &&
    !needAlarmClassNorm &&
    !needAlarmPush &&
    !needPushScope &&
    !needAlarmSettings &&
    !needEnvNorm &&
    !areasStale &&
    !needHistoryNorm &&
    !needRobotVersions &&
    !needWorld &&
    !needDeviceKind &&
    !needDeviceMeta &&
    !needPointState &&
    !needZoneFix &&
    !needMaps &&
    !needRoadnetFix &&
    !needRouteModeNorm &&
    !needPlanCycleNorm
  )
    return s;
  const base = seed();
  /** 算法模板编码补缺：老缓存条目没有编码时，按已用编码顺延一个不冲突的（ALG-xx） */
  const reqUsedCodes = new Set(
    (s.requirements || []).map((r) => r.code).filter(Boolean) as string[],
  );
  let reqSeq = 0;
  const nextReqCode = () => {
    do reqSeq += 1;
    while (reqUsedCodes.has(`ALG-${String(reqSeq).padStart(2, "0")}`));
    const code = `ALG-${String(reqSeq).padStart(2, "0")}`;
    reqUsedCodes.add(code);
    return code;
  };
  /** 补齐台账告警设置所需的上下文（告警类别 + 仪表名 + 算法模板名兜底） */
  const alarmHost = {
    alarmClasses: needAlarmClasses ? base.alarmClasses : s.alarmClasses,
    instruments: needDevices ? base.instruments : s.instruments,
    requirements: s.requirements || base.requirements,
  };
  const merged: State = {
    ...s,
    // 统一坐标系：老缓存的巡检点 / 标定点按底图 1:1 回填 world（z=0）
    points:
      needWorld || needPointState || needZoneFix
        ? s.points.map((p) => ({
            ...p,
            ...(needWorld && !p.world
              ? { world: { x: p.x, y: p.y, z: 0 } }
              : {}),
            // 老缓存缺状态：现场采集 / 导入的点位默认可用
            ...(needPointState && !p.state ? { state: "已启用" as const } : {}),
            // 装置区归属修正：装置区的点改挂装置区地图
            ...(needZoneFix && /^装置区/.test(p.device)
              ? { mapId: "MAP-B01" }
              : {}),
          }))
        : s.points,
    // 标定数据：装置区归属修正时整体用 seed 覆盖（装置区点位的标定点要从罐区挪到装置区图）
    mapCalibrations: (
      needCalibrations || needZoneFix ? base.mapCalibrations : s.mapCalibrations
    ).map((c) =>
      needWorld
        ? {
            ...c,
            targets: (c.targets || []).map((t) =>
              t.world ? t : { ...t, world: { x: t.x, y: t.y, z: 0 } },
            ),
          }
        : c,
    ),
    maps: [
      ...s.maps.map((m) => {
        /** 本图当前可用的定位点：路网只允许引用它们，其余视为失效 */
        const ids = new Set(targetsOf(s, m.id).map((t) => t.id));
        return {
          ...m,
          ...(needMapStatus ? { status: (m.status || "启用") as "启用" | "停用" } : {}),
          ...(needHistoryNorm ? { history: normalizeHistory(m.history) } : {}),
          ...(needMapImage && m.image === undefined
            ? { image: SAMPLE_MAP_IMAGE }
            : {}),
          // 路网失效段清理：剔除已不在本图的定位点，剩余不足 2 点的整段移除
          ...(needRoadnetFix && m.roadnet
            ? {
                roadnet: {
                  paths: m.roadnet.paths
                    .map((p) => ({
                      ...p,
                      pointIds: p.pointIds.filter((id) => ids.has(id)),
                    }))
                    .filter((p) => p.pointIds.length >= 2),
                },
              }
            : {}),
        };
      }),
      // 补齐老缓存缺失、但已被机器人 / 点位 / 轨道引用的地图（如装置区 MAP-B01）
      ...(needMaps
        ? base.maps.filter((bm) => !s.maps.some((m) => m.id === bm.id))
        : []),
    ],
    robots: needRobotVersions
      ? s.robots.map((r, i) => {
          const d = base.robots[i % base.robots.length];
          return {
            ...d,
            ...r,
            mapVersion:
              typeof r.mapVersion === "number" ? r.mapVersion : d.mapVersion,
          };
        })
      : s.robots,
    // 路线方式口径切换：老缓存的模板逐条改写成新口径（内容 / 状态不动）
    templates: needRouteModeNorm
      ? (s.templates || []).map((t) => {
          const m = t.mode as string;
          const mode =
            m === "跟随父线" || m === "固定路线"
              ? ("预设路线" as const)
              : m === "自定义" || m === "自定义路线"
                ? ("自建路线" as const)
                : t.mode;
          return { ...t, mode };
        })
      : s.templates,
    // 执行周期口径切换：每周 → 每月、每班 → 每小时（其余原样，避免下拉里出现选不中的值）
    plans: needPlanCycleNorm
      ? (s.plans || []).map((p) => {
          const c = p.cycle as string;
          const cycle =
            c === "每周"
              ? ("每月" as const)
              : c === "每班"
                ? ("每小时" as const)
                : p.cycle;
          return { ...p, cycle };
        })
      : s.plans,
    devices: (needDevices ? base.devices : s.devices).map((d) => ({
      ...d,
      // 设备形态：老缓存缺该字段时按设备类型回填，只补缺、不覆盖已有值
      deviceKind: d.deviceKind || defaultDeviceKindOfType(d.type),
      // 更新时间 / 检测项分类：老缓存缺这两项时补缺（内容不变时不重建数组，避免引用漂移）
      ...(needDeviceMeta && !d.updatedAt
        ? { updatedAt: "2026-10-01 09:00:00" }
        : {}),
      ...(needDeviceMeta
        ? {
            items: (d.items || []).map((it) => ({
              ...it,
              category: it.category || defaultCategoryOfTarget(it.target),
            })),
          }
        : {}),
      // 装置区归属修正：安装位置在装置区的设备，厂区列改为「装置区」
      ...(needZoneFix && d.locationDesc.startsWith("装置区")
        ? { region: "装置区" }
        : {}),
    })),
    logicalPoints: needDevices ? base.logicalPoints : s.logicalPoints,
    areas: ensureAreaPolygons(
      ensureRootArea(needDevices || areasStale ? base.areas : s.areas),
    ),
    instruments: needDevices ? base.instruments : s.instruments,
    /**
     * 算法模板（原「巡检要求」）：设备主数据重建时整体用 seed 覆盖；否则按 id 合并——
     * 保留用户在「算法模板」后台页新建 / 修改的条目，只补 seed 里缺失的新增项；
     * 合并后新增的编码 / 部署位置 / 状态三项按序补缺（不覆盖已有值）
     */
    requirements: (
      needDevices
        ? base.requirements
        : [
            ...(s.requirements || []),
            ...(needReqMaster
              ? base.requirements.filter(
                  (r) => !(s.requirements || []).some((x) => x.id === r.id),
                )
              : []),
          ]
    ).map((r) => ({
      ...r,
      code: r.code || nextReqCode(),
      deploy: r.deploy || "云端",
    })),
    businessTargets: (
      needDevices
        ? base.businessTargets
        : (s.businessTargets || []).map((b): BusinessTarget => {
            /** 告警类别口径切换：老缓存里的旧分类名按映射改成新分类名 */
            const b2: BusinessTarget =
              needAlarmClassNorm &&
              b.alarm?.category &&
              LEGACY_ALARM_CLASS[b.alarm.category]
                ? {
                    ...b,
                    alarm: {
                      ...b.alarm,
                      category: LEGACY_ALARM_CLASS[b.alarm.category],
                    },
                  }
                : b;
            /**
             * 环境 / 区域类示例台账的旧口径迁移：改接区域巡检要求（区域气体按面积采样），
             * 否则这条演示台账还挂在旧的「装置区气体」要求上
             */
            if (
              b2.id === "BT-ENV-GAS" ||
              (b2.targetKind === "区域" && b2.requirementId === "REQ-GAS")
            )
              return {
                ...b2,
                requirementId: "REQ-GAS-AREA",
                algorithm: "区域气体浓度判读 v1.0",
              };
            return b2;
          })
      // 告警设置补齐（幂等）：schema 7 的老缓存缺告警名称 / 类型 / 开关 / 告警项
    ).map((b) => withAlarmSetting(alarmHost, b)),
    alarmClasses:
      needAlarmClasses || needAlarmClassNorm
        ? base.alarmClasses
        : needRecognizeFaultClass
          ? [
              ...s.alarmClasses.filter((c) => c.name !== "识别故障"),
              ...base.alarmClasses.filter((c) => c.name === "识别故障"),
            ]
          : s.alarmClasses,
    alarmPushStaff: needAlarmPush
      ? base.alarmPushStaff
      : (s.alarmPushStaff || []).map((p) => {
          if (!needPushScope) return p;
          const d = base.alarmPushStaff?.find((x) => x.id === p.id);
          return {
            ...p,
            areas: p.areas ?? d?.areas,
            devices: p.devices ?? d?.devices,
          };
        }),
    // 告警口径切换时整体换 seed：老缓存的告警缺机器人本体告警的 alarmClass 字段
    alarms:
      needAlarms || needAlarmClassNorm
        ? base.alarms
        : needRecognizeFaultAlarm
          ? s.alarms.map((a) => {
              const r = s.results?.find((x) => x.id === a.resultId);
              if (!r?.aiAbnormal || r.abnormal) return a;
              const task = s.tasks?.find((x) => x.id === a.taskId);
              return {
                ...a,
                category: "机器人" as const,
                alarmClass: "识别故障",
                // 采集链路的责任落到执行机器人：老缓存缺 robotId 时从任务补
                robotId: a.robotId || task?.robotId,
                // 名称老口径「… AI 识别异常」同步为「… 识别故障」
                name: a.name.replace(/\s*AI 识别异常\s*$/, " 识别故障"),
              };
            })
          : s.alarms,
    syncs: needSyncs ? base.syncs : s.syncs,
    robotPayloads: needPayloads
      ? base.robotPayloads
      : s.robotPayloads?.map((p) => {
          // 旧口径 { kind, actions } → 新口径 { abilities: [{ kind, actions }] }
          const legacy = p as { abilities?: unknown; kind?: string; actions?: string[] };
          return Array.isArray(p.abilities)
            ? p
            : {
                ...p,
                abilities: (legacy.kind
                  ? [{ kind: legacy.kind, actions: legacy.actions || [] }]
                  : []) as RobotPayloadAbility[],
              };
        }),
    algoConfigs: needAlgos
      ? base.algoConfigs
      : [
          ...(s.algoConfigs || []).map((a) => ({
            ...a,
            deploy: algoDeploys.includes(a.deploy) ? a.deploy : "本体",
            adapt: a.adapt.filter((x) => algoKinds.includes(x as AlgoKind)),
          })),
          // 只补 seed 里新增、缓存里还没有的算法（不覆盖后台已维护的条目）
          ...(needAlgoMaster
            ? base.algoConfigs.filter(
                (a) => !(s.algoConfigs || []).some((x) => x.id === a.id),
              )
            : []),
        ],
  };
  // 时间格式统一：老缓存里的 `2026/10/23 23:03:11`、带秒的写法一次性归一成 `YYYY-MM-DD HH:mm`
  unifyTimes(merged);
  // 状态派生：以合并后的机器版本 + 下发记录为准重算，避免老缓存里的旧状态
  return {
    ...merged,
    maps: merged.maps.map((m) => ({ ...m, state: publishStateOf(merged, m) })),
  };
}
/**
 * 递归把「整串就是一个时间」的字符串归一成 `YYYY-MM-DD HH:mm`
 * @description 只改形如 `2026/10/23 23:03:11` 的独立时间字段，描述文本里出现的时间不动，避免误伤文案
 */
const ONLY_TIME_RE =
  /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]\d{1,2}:\d{1,2}(?::\d{1,2})?)?$/;
function unifyTimes(v: unknown): unknown {
  if (typeof v === "string") {
    const t = v.trim();
    // ISO 串（notBefore / expires 等引擎内部用的绝对时间）不碰，只归一展示型写法
    return ONLY_TIME_RE.test(t) ? fmtDateTime(t) : v;
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) v[i] = unifyTimes(v[i]);
    return v;
  }
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    for (const k of Object.keys(obj)) obj[k] = unifyTimes(obj[k]);
    return v;
  }
  return v;
}
/**
 * 会话可用性：普通管理员的租户被停用时视为未登录（需要重新选择账号）
 * @returns 可用会话；无会话 / 会话失效返回 null
 */
function activeSession(): AuthAccount | null {
  const acc = loadSession();
  if (!acc) return null;
  if ((acc.level === "tenant" || acc.level === "user") && acc.tenantId) {
    const t = loadTenants().find((x) => x.id === acc.tenantId);
    if (!tenantEnabled(t)) {
      clearSession();
      return null;
    }
  }
  return acc;
}
/**
 * 登录落点租户：租户管理员固定所属租户；超级管理员沿用上次租户，失效则取第一个启用租户
 * @param acc 登录账号
 */
function entryTenantId(acc: AuthAccount): string {
  const tenants = loadTenants();
  // 客户管理员 / 普通用户：落点到有权限且启用的第一个厂区；超管沿用上次或首个启用
  const allowed = allowedTenantIds(acc, tenants);
  const enabled = tenants.filter((t) => allowed.includes(t.id) && t.status !== "停用");
  if (enabled.length) return enabled[0].id;
  // 无可见启用厂区（如全部停用）时仍给一个落点，避免白屏
  return allowed[0] || tenants[0]?.id || DEFAULT_TENANT;
}
function initial() {
  const acc = activeSession();
  const tid = acc ? entryTenantId(acc) : getTenant();
  try {
    const raw = migrate(JSON.parse(localStorage.getItem(keyOf(tid)) || "null")) as State | null;
    const s = withSeedDefaults(raw || seed(tid));
    // 租户清单是平台级数据：一律以独立存储为准（跨租户同一份），不跟随各租户缓存
    s.tenants = loadTenants();
    if (!s.tenantId) s.tenantId = tid;
    // 登录态以会话为准：避免沿用该租户缓存里上一次的角色
    if (acc) s.roleId = acc.roleId;
    return s;
  } catch {
    const s = seed(tid);
    s.tenants = loadTenants();
    if (acc) s.roleId = acc.roleId;
    return s;
  }
}
/**
 * 持久化当前状态到 localStorage
 * @description 以 file:// 直接打开（离线分发）时，部分浏览器会禁用本地存储并抛错，
 *              此处必须容错，否则一次写失败就会整页白屏；失败时降级为「仅内存」
 * @param n 待持久化的状态
 */
export function persist(n: State) {
  try {
    // 租户清单是平台级数据：单独一份，不随租户缓存（新增 / 停用后切租户仍可见）
    saveTenants(n.tenants || loadTenants());
    localStorage.setItem(keyOf(n.tenantId || DEFAULT_TENANT), JSON.stringify(n));
  } catch {
    /* 存储不可用：本次浏览改为纯内存态，刷新即回到初始演示数据 */
  }
}
/**
 * 删除某租户的业务缓存
 * @description 租户被删除时清理，避免重新开通后读到上一次的残留数据
 */
export function dropTenantCache(tid: string) {
  try {
    localStorage.removeItem(keyOf(tid));
  } catch {
    /* 存储不可用：没有缓存可清 */
  }
}
export function Store({ children }: { children: ReactNode }) {
  const [s, set] = useState<State>(initial),
    [message, msg] = useState(""),
    /** 反馈类型：error = 被校验拦下来的操作，App 用居中弹窗展示 */
    [messageTone, msgTone] = useState<MessageTone>("ok"),
    /** 登录会话：null = 未登录，App 渲染登录页 */
    [account, SETACCOUNT] = useState<AuthAccount | null>(activeSession),
    /** 超管视角：true = 平台管理（只看租户 / 账号），false = 进入某租户看业务（切厂区后） */
    [platformMode, SETPLATFORM] = useState(true);
  const latest = useRef(s);
  latest.current = s;
  useEffect(() => {
    const tab =
      globalThis.crypto?.randomUUID?.() ||
      `clock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith(BASE_KEY) && e.newValue) {
        try {
          const n = withSeedDefaults(migrate(JSON.parse(e.newValue)));
          if (n) {
            latest.current = n;
            set(n);
          }
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    const timer = setInterval(() => {
      // One browser tab owns the mock clock; other tabs consume storage updates.
      try {
        const lease = JSON.parse(
          localStorage.getItem("inspection-clock-owner") || "null",
        );
        if (lease && lease.id !== tab && lease.until > Date.now()) return;
        localStorage.setItem(
          "inspection-clock-owner",
          JSON.stringify({ id: tab, until: Date.now() + 2500 }),
        );
      } catch {}
      const n = advanceAutomation(latest.current);
      if (n !== latest.current) {
        latest.current = n;
        set(n);
        persist(n);
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
      try {
        const lease = JSON.parse(
          localStorage.getItem("inspection-clock-owner") || "null",
        );
        if (lease?.id === tab)
          localStorage.removeItem("inspection-clock-owner");
      } catch {}
    };
  }, []);
  /**
   * 统一反馈出口
   * @description `error` = 被校验拦下来的操作（如「至少需要一个已标注业务点位」），
   *              由 App 渲染成**居中弹窗**并等用户确认——底部轻提示一闪而过，用户常常没看见就继续点；
   *              `ok` = 操作成功 / 上下文切换，仍走底部轻提示，不打断连续操作
   */
  function say(text: string, tone: MessageTone = "ok") {
    msgTone(tone);
    msg(text);
  }
  function act(a: Action, onSuccess?: (s: State) => void) {
    try {
      const n = transition(latest.current, a);
      latest.current = n;
      set(n);
      persist(n);
      // 影响面优先：引擎把「这次操作伤到什么」写进 detail，确认后一句话交代清楚；
      // 没有实质描述的仍回落到对象编号，避免提示里出现 Mock 字样
      const log = n.logs[0];
      say(
        log?.detail && !log.detail.includes("操作成功（Mock）")
          ? log.detail
          : "操作成功 · " + (log?.object ?? ""),
      );
      setTimeout(() => msg(""), 4000);
      onSuccess?.(n);
      return true;
    } catch (e) {
      // 拦截类错误：不自动消失，必须由用户点「知道了」关掉
      say((e as Error).message, "error");
      return false;
    }
  }
  /**
   * 切换演示角色：仅改 roleId，不触发业务状态机
   * @param rid 角色 ID，见 roles.ts
   */
  function setRole(rid: string) {
    const n = { ...latest.current, roleId: rid };
    latest.current = n;
    set(n);
    persist(n);
    say(`已切换角色：${roleOf(rid).name}（${roleOf(rid).scope}）`);
    setTimeout(() => msg(""), 3000);
  }
  /**
   * 登录：校验账号密码 → 锁定租户 → 整份载入该租户数据 → 落会话
   * @description 租户管理员只能进入所属租户（租户停用则拒绝登录）；
   *              登录时把 `roleId` 强制设为账号的权限档位，不沿用该租户缓存里的旧角色
   * @param username 登录账号
   * @param password 密码
   * @returns 登录成功返回 true
   */
  function signIn(username: string, password: string, preferTenantId?: string) {
    const acc = authenticate(username, password);
    if (!acc) {
      // 登录页有就地错误行（.login-error），这里只标记类型，不弹全屏弹窗
      say("账号或密码不正确", "error");
      setTimeout(() => msg(""), 3000);
      return false;
    }
    const tenants = loadTenants();
    // 登录页可选厂区：账号有权限且该厂区启用时进入所选厂区，否则按账号权限走默认落点
    const allowed = allowedTenantIds(acc, tenants);
    const prefer =
      preferTenantId && allowed.includes(preferTenantId)
        ? tenants.find((t) => t.id === preferTenantId)
        : undefined;
    const tid = prefer && tenantEnabled(prefer) ? prefer.id : entryTenantId(acc);
    const tenant = tenants.find((t) => t.id === tid);
    if (!tenantEnabled(tenant)) {
      say(`租户「${tenant?.name || tid}」已停用，请联系平台管理员`, "error");
      setTimeout(() => msg(""), 4000);
      return false;
    }
    const n = withSeedDefaults(
      migrate(JSON.parse(localStorage.getItem(keyOf(tid)) || "null")) ||
        seed(tid, tenants),
    );
    n.tenants = tenants;
    n.tenantId = tid;
    n.roleId = acc.roleId;
    saveSession(acc);
    try {
      localStorage.setItem("inspection-tenant", tid);
    } catch {}
    latest.current = n;
    set(n);
    persist(n);
    SETACCOUNT(acc);
    // 超管登录先落在平台管理（租户管理）；其余账号按角色落地
    SETPLATFORM(true);
    say(`欢迎回来，${acc.name} · ${tenant!.name}`);
    setTimeout(() => msg(""), 3000);
    try {
      location.hash = isSuper(acc) ? "#/tenants" : "#/workbench";
    } catch {}
    return true;
  }
  /** 退出登录：清会话并回到登录页（业务数据保留在各租户缓存里） */
  function signOut() {
    clearSession();
    SETACCOUNT(null);
    SETPLATFORM(true);
    msg("");
    try {
      location.hash = "#/login";
    } catch {}
  }
  /**
   * 切换演示租户：整份换数据（不同缓存键），并回到当前角色落地页
   * @description 仅超级管理员可切；租户管理员锁定所属租户（顶栏已禁用，这里再挡一次）
   * @param tid 租户 ID，见 data/tenants.ts 的 TENANTS
   */
  function setTenant(tid: string) {
    const tenants = latest.current.tenants || loadTenants();
    // 超管可切任意厂区；其余只能切到被授权范围（客户管理员=本客户、厂区管理员=本厂、用户=被授权厂区）
    if (!isSuper(account) && !allowedTenantIds(account, tenants).includes(tid)) {
      say("当前账号无权访问该厂区", "error");
      return;
    }
    const tenant = tenants.find((t) => t.id === tid);
    // 停用校验：停用租户不可进入（切换器已禁用，这里再挡一次，避免直接调用）
    if (!tenantEnabled(tenant)) {
      say(`租户「${tenant?.name || tid}」已停用，请先在「系统设置 › 租户管理」启用`, "error");
      return;
    }
    // 超管切到某厂区 = 进入该厂区的业务视角（侧边栏恢复业务菜单）
    if (isSuper(account)) SETPLATFORM(false);
    try {
      localStorage.setItem("inspection-tenant", tid);
    } catch {}
    const n = withSeedDefaults(
      migrate(JSON.parse(localStorage.getItem(keyOf(tid)) || "null")) || seed(tid),
    );
    n.tenants = loadTenants();
    // 角色以登录账号为准：避免目标租户缓存里的旧角色覆盖当前会话档位
    if (account) n.roleId = account.roleId;
    latest.current = n;
    set(n);
    persist(n);
    say(`已切换租户：${n.tenants?.find((t) => t.id === tid)?.name || tid}`);
    setTimeout(() => msg(""), 3000);
    try {
      // 超管切厂区后直接落到业务工作台（平台管理入口在顶部切换器里可切回）
      location.hash = isSuper(account) ? "#/workbench" : "";
    } catch {}
  }
  /** 超管退出业务视角，回到平台管理（租户 / 账号） */
  function backToPlatform() {
    SETPLATFORM(true);
    try {
      location.hash = "#/tenants";
    } catch {}
  }
  return (
    <C.Provider
      value={{
        s,
        act,
        message,
        messageTone,
        clearMessage: () => msg(""),
        setRole,
        setTenant,
        account,
        platformMode,
        backToPlatform,
        signIn,
        signOut,
        reset: () => {
          const n = seed(latest.current.tenantId || DEFAULT_TENANT);
          latest.current = n;
          set(n);
          persist(n);
          say("演示数据已重置");
        },
      }}
    >
      {children}
    </C.Provider>
  );
}
export const useStore = () => useContext(C);
