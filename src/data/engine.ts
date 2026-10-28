import type {
  State,
  Area,
  Task,
  Robot,
  Point,
  Plan,
  Template,
  TaskType,
  AtomicAction,
  DeviceAsset,
  InspectItem,
  CandidateOrigin,
  MapAsset,
  MapSwitchPoint,
  BusinessTarget,
  JudgeType,
  Requirement,
  InspectSpec,
  Session,
  CaptureKind,
  DeviceType,
  AlgoDeploy,
  AlgoKind,
  RobotPayloadAbility,
  DeviceKind,
  PlanKind,
  PlanCycle,
  PlanUnit,
  MapPacket,
  Roadnet,
  AlarmClass,
  AlarmItem,
  AlarmPushStaff,
  RouteMode,
  RouteNode,
  Extra,
  Tenant,
} from "./types";
import {
  stages,
  atomicActionCapability,
  ALGO_LIBRARY,
  atomicActions,
  captureKinds,
  algoDeploys,
  algoKinds,
  deviceKinds,
  planCycles,
  planKinds,
  planUnits,
  planUnitMax,
  ALARM_CLASS_MAINS,
  ROOT_AREA_ID,
  ROOT_AREA_NAME,
  nextAreaCode,
  nextMapNo,
  fmtDate,
  now,
} from "./types";
import {
  rulesOf,
  evaluateRule,
  systemRulesOf,
  alarmText,
  type AlarmRule,
} from "./alarmRules";
import { applyAlarmSetting, checkAlarmItems } from "./alarmSettings";
import { normalizeScope, pushScopeLabel } from "./alarmPush";
import { roleOf } from "./roles";
import { TENANT_CODE } from "./tenants";
import { fieldCommand, releaseOutputs } from "./fieldControl";
import {
  ensureCalibration,
  targetsOf,
  mergeCalibrationPoints,
  type ParsedCalibrationPoint,
} from "./mapCalibration";
import { bindingReasons } from "./planSchedule";
import { mapSceneBlockedReason, runningTasksOf } from "./robotMaps";
import { profileOf, deviceTypes } from "./deviceProfile";
import {
  deviceOf,
  isInspected,
  defaultInspectItemName,
  defaultTargetKindOfTarget,
  defaultDeviceKindOfType,
  defaultCategoryOfTarget,
  actionsOfPoint,
  captureKindsOfPoint,
  robotCoversPoint,
  areaNameOf,
  areaOptions,
} from "./deviceMaster";
export interface Action {
  type: string;
  [key: string]: any;
}
const id = (p: string) =>
  p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
/**
 * 检测项构造（新增设备内联录入 / 新增检测项共用）
 * @description 界面只录「检测目标 + 类型 + 分类」，其余字段（采集方式 / 单位 / 巡检周期 / 优先级）
 *              统一落默认值；类型与分类留空时按检测目标推导（口径见 deviceMaster）
 */
function buildInspectItem(deviceId: string, raw: any): InspectItem {
  const target = String(raw?.target || "").trim();
  return {
    id: id(`II-${deviceId}-`),
    target,
    targetKind:
      (raw?.targetKind as InspectItem["targetKind"]) ||
      defaultTargetKindOfTarget(target),
    category:
      String(raw?.category || "").trim() || defaultCategoryOfTarget(target),
    kind: (raw?.kind as CaptureKind) || "可见光",
    unit: String(raw?.unit || "").trim(),
    inspect: raw?.inspect !== false,
    cycle: String(raw?.cycle || "每日").trim() || "每日",
    priority: (raw?.priority as InspectItem["priority"]) || "普通",
  };
}
/**
 * 检测目标 → 工厂树第三层仪表（id 与检测项同源）
 * @description 设备新增（带检测项）与「新增检测项」两处共用，
 *              保证设备清单 / 工厂树 / 巡检目标三处同口径
 */
function pushInstrumentOf(s: State, d: DeviceAsset, it: InspectItem) {
  if (!s.instruments || s.instruments.some((x) => x.id === it.id)) return;
  s.instruments.push({
    id: it.id,
    name: it.target,
    deviceId: d.id,
    capture: it.kind,
    unit: it.unit || undefined,
    locationDesc: d.locationDesc,
    state: "在用",
  });
}
/**
 * 下一个任务编号
 * @description 任务编号统一成 `T` + 三位序号（T045），接着现有最大值往后排；
 *              旧规则是时间戳+随机串（Tmvqqik3l1ei），列表里念不出来、没法口头对账，
 *              也和种子数据、计划编号（PL01）长得不一样
 * @param tasks 现有任务
 * @returns 未被占用的任务编号
 */
function nextTaskId(tasks: Task[]): string {
  let max = 0;
  const used = new Set(tasks.map((t) => t.id));
  tasks.forEach((t) => {
    const m = /^T(\d+)$/.exec(t.id);
    if (m) max = Math.max(max, Number(m[1]));
  });
  for (let i = max + 1; i <= max + 999; i++) {
    const v = `T${String(i).padStart(3, "0")}`;
    if (!used.has(v)) return v;
  }
  return id("T");
}
const must = (ok: unknown, msg: string) => {
  if (!ok) throw Error(msg);
};
/**
 * 取出表单提交的区域范围轮廓
 * @description 顶点为底图百分比坐标；不足 3 个顶点的「轮廓」画不出区域，
 *              视为没有范围（只存名称），避免存进半截草稿
 * @param a 动作参数（ADD_AREA / RENAME_AREA），polygon 为绘制中的顶点数组
 * @returns 合法轮廓的浅拷贝；不足 3 点返回 null
 */
function areaPolygon(a: Action): { x: number; y: number }[] | null {
  const pts = Array.isArray(a.polygon) ? a.polygon : [];
  return pts.length >= 3 ? pts.map((p) => ({ x: p.x, y: p.y })) : null;
}
/**
 * 解析父级区域（组合框提交：可能是 id、已有区域名称，或一个全新名称）
 * @description 解析顺序：空串 → 固定根「全厂区」（一级区域直属根）；
 *              命中 id/唯一名称 → 直接关联；
 *              都不命中 → 自动新建同名区域（直属全厂区）再关联（对应手填新父级）。
 *              编辑时（selfId 非空）沿目标父链上溯，禁止挂到自己或自己的下级（防环）。
 *              注意：调用方已 structuredClone，本函数内新建/报错都不会污染原状态。
 * @param areas 全部区域（允许被 push 新父级）
 * @param raw 表单值：parentText（名称/新名称）或旧 parentId
 * @param selfId 编辑中区域自身 id；新增传 undefined
 * @returns 合法父级 id
 */
function resolveParent(
  areas: Area[],
  raw: unknown,
  selfId?: string,
): string {
  const v = String(raw || "").trim();
  // 1) 留空 = 直属固定根「全厂区」
  if (!v) return ROOT_AREA_ID;
  // 2) 先按 id（兼容旧调用），再按名称唯一定位
  let hit = areas.find((x) => x.id === v);
  if (!hit) {
    const byName = areas.filter((x) => x.name === v);
    must(byName.length <= 1, `存在多个名为「${v}」的区域，请改名后再选择`);
    hit = byName[0];
  }
  // 3) 名称不存在：按手填内容自动创建区域（直属全厂区）作为父级
  if (!hit) {
    hit = {
      id: id("AREA"),
      code: nextAreaCode(areas),
      name: v,
      parentId: ROOT_AREA_ID,
      updatedAt: now(),
    };
    areas.push(hit);
  }
  // 4) 防环：目标父链上出现 selfId = 挂到了自己或自己后代
  let cur: { id: string; parentId?: string } | undefined = hit;
  while (cur) {
    must(cur.id !== selfId, "父级区域不能选自己或自己的下级区域");
    cur = cur.parentId ? areas.find((x) => x.id === cur!.parentId) : undefined;
  }
  return hit.id;
}
/**
 * 模拟机器人读数（原型：真实读数应由机器人 / AI 回传）
 * @description 按**该点位自己的判定规则**生成正常 / 异常读数，使模拟数据与阈值自洽：
 *              正常取量程中点，异常取"严格超上限"；无量纲（期望状态）按期望值 / 反值生成。
 *              规则未配置时给保守值（正常 0.65 / 异常 0.92）并交由复核判定。
 * @param rule 该点位的判定规则
 * @param abnormal 是否要求异常读数
 * @returns 读数字符串
 */
function mockReading(rule: AlarmRule | undefined, abnormal: boolean): string {
  if (!rule) return abnormal ? "0.92" : "0.65";
  if (rule.type === "期望状态")
    return abnormal
      ? rule.expected === "开启"
        ? "关闭"
        : "开启"
      : rule.expected || "开启";
  const min = Number.isFinite(rule.min) ? rule.min : 0;
  const max = Number.isFinite(rule.max) ? rule.max : 1;
  const round = (n: number) => String(Math.round(n * 100) / 100);
  if (!abnormal) return round((min + max) / 2);
  // 异常必须严格超出上限：上限 + 至少 1 个单位（或上限的 15%）
  return round(max + Math.max(1, Math.abs(max) * 0.15));
}
function continueQueue(s: State, r: Robot) {
  const next = s.tasks.find((t) => t.robotId === r.id && t.state === "待执行");
  if (!next || constraints(s, next, r, true).length) return;
  next.state = "执行中";
  next.startedAt ||= new Date().toISOString();
  r.current = next.id;
  r.state = "执行中";
}
/**
 * 写入一条地图版本日志（**最新在前**）
 * @description 同一版本重复定版（例如修订后又直接下发）只更新那一条，
 *              避免同一个 V{n} 在历史里堆成多条；新版本则插到最前
 * @param m 目标地图（可变）
 * @param note 该版本发生了什么
 */
function logVersion(m: MapAsset, note: string) {
  m.history ||= [];
  const at = m.updatedAt || now();
  const head = m.history[0];
  if (head && head.version === m.version) {
    head.note = note;
    head.at = at;
    return;
  }
  m.history.unshift({ version: m.version, note, at });
}
/**
 * 地图内容定版
 * @description 平台不区分"试验版 / 正式版"。定版只做两件事：校验原始资料（点云 / 视频）
 *              与至少一个业务点位齐备，并记一条版本日志；
 *              **「已同步 / 未同步」是派生状态**（见 `publishStateOf`），由
 *              "当前版本是否已下发给所有仍停留在旧版本的机器"决定，不由本动作改写。
 * @param s 状态
 * @param m 目标地图
 */
function publishMap(s: State, m: MapAsset) {
  must(m.cloud && m.video, "缺少原始点云或视频，禁止发布");
  must(
    // 判据 = 该图存在业务点位（已标注即可，不要求已启用；「停用」含未启用，不能作为排除项）
    s.points.some((p) => p.mapId === m.id),
    "至少需要一个已标注业务点位",
  );
  m.updatedAt = now();
  // 地图只有空间版本 V；巡检点标定数据带自己的版本 c，不写进地图历史
  logVersion(m, "定版发布（纯点云底图）");
}
/**
 * 下发前的内容校验：原始资料与业务点位齐备才允许下发
 * @description 只读校验，不改地图状态、不写版本历史（定版记录只由「定版 / 发布」动作产生）；
 *              同步状态由 `publishStateOf` 派生，下发动作本身不改状态
 * @param s 状态
 * @param m 目标地图
 */
function ensureContentReady(s: State, m: MapAsset) {
  must(m.cloud && m.video, "缺少原始点云或视频，禁止下发");
  must(
    // 判据 = 该图存在业务点位（已标注即可，不要求已启用；「停用」含未启用，不能作为排除项）
    s.points.some((p) => p.mapId === m.id),
    "至少需要一个已标注业务点位",
  );
}
/**
 * 地图同步状态（**派生值**，不手工维护）
 * @description 只回答一件事：当前版本是否已经下发到位
 *              · 更新场景：仍有机器停留在旧版本（`mapVersion < m.version`）且没收到当前版本的下发记录 → 未同步
 *              · 新建场景：本图还没有机器持有（没有旧版本可言），则以"当前版本是否下发过"为准，
 *                         从未下发 → 未同步
 *              其余情况为已同步；"下发"以登记记录为准，不要求对方已完成激活。
 * @param s 状态
 * @param m 目标地图
 */
export function publishStateOf(s: State, m: MapAsset): "已同步" | "未同步" {
  /** 当前版本已经发给了哪些机器（登记过下发记录即算） */
  const sent = new Set(
    (s.syncs || [])
      .filter((x) => x.mapId === m.id && x.mapVersion === m.version)
      .map((x) => x.robotId),
  );
  /** 仍停留在旧版本、需要更新的机器 */
  const lagging = s.robots.filter(
    (r) => r.mapId === m.id && r.mapVersion < m.version,
  );
  // 新图从未下发过 → 未同步
  if (!lagging.length && !sent.size) return "未同步";
  // 还有旧版本机器没收到当前版本 → 未同步
  return lagging.some((r) => !sent.has(r.id)) ? "未同步" : "已同步";
}
/**
 * 重算并写回全部地图状态
 * @description transition 收口时统一调用：任何改变"机器持有版本 / 下发记录"的动作
 *              （下发、激活回执、内容修订、导入新图）都会自动反映到状态上
 * @param s 状态
 */
function refreshMapStates(s: State) {
  s.maps.forEach((m) => {
    m.syncState = publishStateOf(s, m);
  });
}
/**
 * 巡检目标台账的「是否巡检」写穿到设备清单的巡检项
 * @description 过渡期约定：设备清单的 `InspectItem.inspect` 仍是任务生成的实际依据，
 *              同一仪表下**只要有一个业务目标开着**，该巡检项即为开——避免两处口径不一致
 * @param s 状态
 * @param instrumentId 仪表 id（与设备巡检项 id 同源）
 */
function syncInspectFlag(s: State, instrumentId: string) {
  const list = (s.businessTargets || []).filter(
    (b) => b.instrumentId === instrumentId,
  );
  if (!list.length) return;
  const item = s.devices
    ?.flatMap((d) => d.items)
    .find((it) => it.id === instrumentId);
  if (item) item.inspect = list.some((b) => b.inspect);
}
/**
 * 地图下发的逐台校验与登记（单台 SYNC 与批量 SYNC_BATCH 共用同一口径）
 * @description 只登记"传输中"记录；版本一致以机器人激活回执为准，不在此处改动机器人版本
 * @param s 状态
 * @param m 目标地图
 * @param r 目标机器人
 */
function pushSync(s: State, m: MapAsset, r: Robot) {
  // 启停闸：停用的图不再推给机器人（已经在传输中的记录不受影响）
  const gate = mapSceneBlockedReason(m, "地图下发");
  must(!gate, gate);
  // 地图不再按区域归属，下发只校验会话占用与任务冲突（区域一致性校验已下线）
  must(
    !s.sessions.some(
      (x) => x.robotId === r.id && !["已释放", "已超时"].includes(x.state),
    ),
    "人工控制会话占用",
  );
  s.syncs.unshift({
    id: id("SYNC"),
    mapId: m.id,
    robotId: r.id,
    mapVersion: m.version,
    state: "传输中",
    at: now(),
  });
}
/**
 * 停用落终态：标记了「停用中」的机器人，等任务结束后才真正停用
 * @description 点击停用只进入「停用执行态」；队列任务跑完这里才把 enabled 置 false
 * @param r 机器人
 */
function settleStopping(r: Robot) {
  if (!r.stopping) return;
  r.stopping = false;
  r.enabled = false;
  r.updatedAt = now();
}
/**
 * 地图停用落终态：标记了「停用中」的地图，等图上的任务全部结束才真正停用
 * @description 与机器人停用同一套防呆；由 transition 收口统一调用，
 *              任务完成 / 超期 / 取消后自动收敛，不需要在每个任务动作里各写一遍
 * @param s 状态
 */
function settleMapStopping(s: State) {
  s.maps.forEach((m) => {
    if (!m.stopping) return;
    if (runningTasksOf(s, m.id).length) return;
    m.stopping = false;
    m.status = "停用";
    m.updatedAt = now();
  });
}

export function constraints(
  s: State,
  t: Task,
  r: Robot,
  start = false,
  now = Date.now(),
): string[] {
  return [
    // 地图覆盖：机器人当前地图必须覆盖任务的全部巡检点
    ...(r.mapId !== t.mapId ||
    t.items.some((p) => {
      const q = s.points.find((x) => x.id === p.id);
      return !!q && q.mapId !== r.mapId;
    })
      ? ["机器人当前地图未覆盖任务全部巡检点"]
      : []),
    // 检测能力按"采集方式"判定（J′）：业务类型（仪表 / 阀门）不参与调度校验
    ...(t.items.some((p) => !robotCoversPoint(s, p, r)) ? ["检测能力不足"] : []),
    ...((t.atomicActions || []).some(
      (action) => !r.capabilities.includes(atomicActionCapability[action]),
    )
      ? ["原子动作能力不足"]
      : []),
    // 电量阈值按机型差异配置（机器狗 40% / 四轮车 25% / 挂轨 15%）
    ...(r.battery < r.constraints.minBattery
      ? [`电量低于 ${r.constraints.minBattery}%`]
      : []),
    // 挂轨专用：所在轨道区段被其他机器占用时不可派单
    ...(r.deviceType === "挂轨" &&
    r.constraints.railSectionId &&
    s.railSections.some(
      (x) =>
        x.id === r.constraints.railSectionId &&
        !!x.robotId &&
        x.robotId !== r.id,
    )
      ? ["轨道区段被占用"]
      : []),
    // 台账开关：已停用不参与派单；「停用中」只挡新派单（start），队列里的存量任务继续跑完
    ...(r.enabled === false ? ["机器人已停用"] : []),
    ...(start && r.stopping ? ["机器人停用中（待当前任务结束）"] : []),
    // 地图启停：与机器人同一套口径 —— 停用全挡；停用中只挡"开跑"，已在跑的放它跑完
    ...(s.maps.find((m) => m.id === t.mapId)?.status === "停用"
      ? ["任务所在地图已停用"]
      : []),
    ...(start && s.maps.find((m) => m.id === t.mapId)?.stopping
      ? ["任务所在地图停用中（待当前任务结束）"]
      : []),
    ...(["离线", "充电", "返航中", "故障", "维护"].includes(r.state)
      ? [r.state]
      : []),
    ...(s.sessions.some(
      (x) => x.robotId === r.id && !["已释放", "已超时"].includes(x.state),
    )
      ? ["人工控制会话占用"]
      : []),
    // 巡检点状态：设备台账与机器人上装无启停；点位「停用」只来自标注工作台待验证
    ...(t.items.some((p) => s.points.find((q) => q.id === p.id)?.state !== "已启用")
      ? ["点位未启用"]
      : []),
    ...(r.mapVersion !== t.mapVersion ? ["地图版本待同步"] : []),
    ...(start && t.notBefore && Date.parse(t.notBefore) > now
      ? ["尚未到计划执行时间"]
      : []),
    ...(start && r.current && r.current !== t.id ? ["当前任务尚未结束"] : []),
  ];
}
/**
 * 上装能力字段归一化 + 校验（新增 / 编辑共用）
 * @description 口径：一个上装可再定义多种采集方式，每个能力组内的「支持动作」必须与该组采集方式一致——
 *              动作归哪类采集由 `atomicActionCapability` 唯一决定（如「采集红外热像」属于红外），
 *              否则机器人能力与任务指令集会各自写一套说法。
 * @param a 动作参数（abilities / models）
 * @returns 归一化后的 abilities / models
 * @throws 能力组为空 / 采集方式非法 / 同采集方式重复 / 动作为空 / 动作不存在或与采集方式不一致 / 机型不存在
 */
function payloadFields(a: Action) {
  const raw = (a.abilities || []) as RobotPayloadAbility[];
  must(raw.length, "请至少配置一种采集能力（采集方式 + 支持动作）");
  const abilities = raw.map((ab) => {
    const kind = ab.kind as CaptureKind;
    must(
      captureKinds.includes(kind),
      `采集方式不合法（应为 ${captureKinds.join(" / ")}）`,
    );
    const actions = (ab.actions || []) as AtomicAction[];
    must(actions.length, `采集能力「${kind}」请至少选择一个支持动作`);
    actions.forEach((x) => {
      must(atomicActions.includes(x), `原子动作「${x}」不存在`);
      must(
        atomicActionCapability[x] === kind,
        `动作「${x}」属于 ${atomicActionCapability[x]} 采集，与所选采集方式「${kind}」不一致`,
      );
    });
    return { kind, actions };
  });
  const kinds = abilities.map((x) => x.kind);
  must(new Set(kinds).size === kinds.length, "同一种采集方式不能重复配置");
  const models = (a.models || []) as DeviceType[];
  models.forEach((m) => must(deviceTypes.includes(m), `机型「${m}」不存在`));
  return { abilities, models };
}
/**
 * 算法清单字段归一化 + 校验（新增 / 编辑共用）
 * @param a 动作参数（deploy / adapt）
 * @returns 归一化后的 deploy / adapt
 * @throws 部署位置不合法、检测类型不合法
 */
function algoFields(a: Action) {
  const deploy = a.deploy as AlgoDeploy;
  must(
    algoDeploys.includes(deploy),
    `部署位置不合法（应为 ${algoDeploys.join(" / ")}）`,
  );
  const adapt = (a.adapt || []) as AlgoKind[];
  adapt.forEach((k) => must(algoKinds.includes(k), `检测类型「${k}」不合法`));
  return { deploy, adapt };
}
/**
 * 租户字段归一化 + 校验（新增 / 编辑共用）
 * @description 名称与编码各自唯一：名称是界面识别口径，编码是数据名称前缀
 * @param s 状态
 * @param t 待保存租户（新增时 id 为空）
 * @returns 归一化后的租户字段
 * @throws 名称 / 编码缺失、格式非法或与现有租户重名 / 重码
 */
function tenantFields(s: State, t: Tenant): Tenant {
  const name = String(t?.name || "").trim();
  const code = String(t?.code || "").trim().toUpperCase();
  must(name, "请填写租户名称");
  must(code, "请填写租户编码");
  must(TENANT_CODE.test(code), "租户编码为 2–6 位大写字母或数字（如 HD / XB）");
  const list = s.tenants || [];
  must(
    !list.some((x) => x.name === name && x.id !== t.id),
    `已存在同名租户「${name}」`,
  );
  must(
    !list.some((x) => x.code === code && x.id !== t.id),
    `已存在相同编码的租户「${code}」`,
  );
  return { ...t, name, code, status: t.status === "停用" ? "停用" : "启用" };
}
/**
 * 补派任务的截止时间
 * @description 从**当前时刻**重新计时（计划允许等待 + 计划超时），不沿用原任务的 deadline ——
 *              原任务已经超期，沿用等于新任务一出生就又超期
 * @param s 状态
 * @param t 被补派的超期任务
 * @returns 新截止时间的毫秒数
 */
export function retryDeadlineOf(s: State, t: Task): number {
  const p = (s.plans || []).find((x) => x.id === t.planId);
  return Date.now() + ((p?.wait ?? 30) + (p?.timeout ?? 60)) * 60000;
}
export function transition(state: State, a: Action): State {
  const s = structuredClone(state);
  let object = a.id || a.robotId || a.mapId || "平台";
  let detail = a.reason || a.name || "";
  const map = () => {
    const m = s.maps.find((m) => m.id === (a.mapId || a.id));
    must(m, "地图不存在");
    return m!;
  };
  const task = () => {
    const t = s.tasks.find((t) => t.id === a.id);
    must(t, "任务不存在");
    return t!;
  };
  const robot = (rid?: string) => {
    const r = s.robots.find((r) => r.id === (rid || a.robotId || a.id));
    must(r, "机器人不存在");
    return r!;
  };
  function createTask(
    name: string,
    pids: string[],
    source: string,
    alarmId?: string,
    plan?: Plan,
    taskType: TaskType = "综合巡检任务",
    atomicActions?: AtomicAction[],
  ) {
    let items = pids
      .map((pid) => s.points.find((p) => p.id === pid))
      .filter(Boolean) as Point[];
    must(
      items.length && items.every((p) => p.state === "已启用"),
      "请选择已启用的点位",
    );
    // 「是否巡检」过滤：设备主数据里关闭的检测项不进任务指令集（阶段③ 开关的落地处）
    items = items.filter((p) => isInspected(s, p));
    must(
      items.length,
      "所选点位的检测项均已在设备主数据中关闭「是否巡检」",
    );
    must(
      new Set(items.map((p) => p.mapId)).size === 1,
      "一期任务使用同一地图版本",
    );
    const m = s.maps.find((m) => m.id === items[0].mapId)!;
    // 启停闸：停用的图不生成任务（人工临时 / 快速下发 / 计划到点生成共用本函数）
    const gate = mapSceneBlockedReason(m, "任务下发");
    must(!gate, gate);
    must(m.syncState === "已同步", "正式任务需要已同步的地图");
    // 任务指令集：由点位的「采集方式」（设备主数据里的巡检项 kind）推导原子动作，
    // 而不是由业务类型（仪表 / 阀门）推导；旧数据无主数据时回落 Point.kind。
    // 「怎么看」（PTZ / 补光 / 停留 / 避障）随点位快照一并带给执行端，与动作正交。
    const derivedActions = [
      ...new Set(items.flatMap((p) => actionsOfPoint(s, p))),
    ];
    // 完成时限统一派发（分钟）：固定 240 分钟
    const limitMinutes = 240;
    const due = new Date(Date.now() + limitMinutes * 60000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const t: Task = {
      id: nextTaskId(s.tasks),
      name,
      source,
      taskType,
      atomicActions: atomicActions?.length ? atomicActions : derivedActions,
      alarmId,
      planId: plan?.id,
      planVersion: plan?.version,
      state: "待调度",
      deadline: `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())} ${pad(due.getHours())}:${pad(due.getMinutes())}`,
      mapId: m.id,
      mapVersion: m.version,
      items: items.map((p) => ({
        ...p,
        mapVersion: m.version,
        // 到位动作快照：任务创建后即使设备主数据的采集方式被改，历史任务口径不变
        actions: actionsOfPoint(s, p),
      })),
      stage: 0,
      index: 0,
      done: [],
      skipped: [],
      retries: 0,
      created: now(),
    };
    // 统一坐标系：任务快照已含巡检点 world；缺失者回退底图坐标并提示
    const noWorld = items.filter((p) => !p.world).length;
    if (noWorld) detail += `（${noWorld} 个点位未写入统一坐标，已回退底图坐标）`;
    s.tasks.unshift(t);
    object = t.id;
    return t;
  }
  switch (a.type) {
    case "SAVE_SYSTEM_RULES": {
      must(s.roleId === "admin", "仅管理员可修改告警参数");
      const x = a.rules;
      must(
        [x.heartbeatSeconds, x.dispatchSeconds, x.lowBattery].every(
          (v) => Number.isFinite(v) && v > 0,
        ) && x.lowBattery <= 100,
        "请填写有效的秒数和电量百分比",
      );
      s.systemRules = { ...x, version: systemRulesOf(s).version + 1 };
      detail = "系统告警参数已更新";
      break;
    }
    case "SAVE_ALARM_RULE": {
      must(s.roleId === "admin", "仅管理员可修改告警配置");
      const rule = a.rule;
      must(
        rule.name?.trim() && s.points.some((p) => p.id === rule.pointId),
        "请填写规则名称与有效检测项",
      );
      must(
        rule.type === "期望状态"
          ? rule.expected?.trim()
          : Number.isFinite(rule.min) &&
              Number.isFinite(rule.max) &&
              rule.min <= rule.max,
        "请检查上下限或期望状态",
      );
      s.alarmRules = rulesOf(s);
      const old = s.alarmRules.find((r) => r.id === rule.id);
      const next = { ...rule, version: (old?.version || 0) + 1 };
      s.alarmRules = s.alarmRules.filter((r) => r.id !== rule.id).concat(next);
      object = rule.id;
      detail = "告警参数新版本已生效，历史结果保持原规则";
      break;
    }
    /**
     * 告警类别（告警管理 › 告警类别）：分类名称 + 告警大类 + 是否启用
     * @description 启用的分类是「告警设置 › 告警分类」下拉与「告警记录 › 分类筛选」的数据源，
     *              因此分类名在同库内唯一，避免台账指向两个同名分类
     */
    case "SAVE_ALARM_CLASS": {
      must(s.roleId === "admin", "仅管理员可维护告警类别");
      const c = a.category as AlarmClass;
      const name = String(c?.name || "").trim();
      must(name, "请填写分类名称");
      must(
        (ALARM_CLASS_MAINS as readonly string[]).includes(c?.main),
        "请选择告警大类",
      );
      const list = s.alarmClasses || [];
      must(
        !list.some((x) => x.name === name && x.id !== c.id),
        `已存在同名告警类别「${name}」`,
      );
      const next: AlarmClass = {
        ...c,
        id: c.id || id("AC-"),
        name,
        main: c.main,
        enabled: c.enabled !== false,
        updatedAt: now(),
      };
      s.alarmClasses = list.filter((x) => x.id !== next.id).concat(next);
      object = next.id;
      detail = `告警类别「${next.name}」已保存（${next.main} · ${
        next.enabled ? "启用" : "停用"
      }）`;
      break;
    }
    /**
     * 告警类别删除：被台账告警设置引用的分类不允许删除，
     * 否则台账的告警类型会指向一个不存在的分类（先改类型再删）
     */
    case "REMOVE_ALARM_CLASS": {
      must(s.roleId === "admin", "仅管理员可维护告警类别");
      const gone = (s.alarmClasses || []).find((x) => x.id === a.id);
      must(gone, "告警类别不存在");
      const used = (s.businessTargets || []).filter(
        (b) => b.alarm?.category === gone!.name,
      ).length;
      must(
        !used,
        `该分类已被 ${used} 个台账的告警设置引用，请先调整这些台账的告警类型`,
      );
      s.alarmClasses = (s.alarmClasses || []).filter((x) => x.id !== a.id);
      object = gone!.id;
      detail = `告警类别「${gone!.name}」已删除`;
      break;
    }
    /**
     * 租户新增（系统设置 › 租户管理）
     * @description 清单是平台级数据（跨租户同一份）；新租户默认启用，
     *              首次切换进入时由 seed 生成一份带编码前缀的演示数据
     */
    case "ADD_TENANT": {
      must(s.roleId === "admin", "仅管理员可维护租户");
      const t = tenantFields(s, a.tenant as Tenant);
      const next: Tenant = {
        ...t,
        id: id("T-"),
        updatedAt: now(),
      };
      s.tenants = (s.tenants || []).concat(next);
      object = next.id;
      detail = `租户「${next.name}」已创建（编码 ${next.code}）`;
      break;
    }
    /**
     * 租户修改（系统设置 › 租户管理）：名称 / 编码 / 启用停用
     * @description 停用校验两条硬约束：
     *              ① 当前正在使用的租户不能停用（否则当前会话的数据来源直接失效）；
     *              ② 至少保留一个启用租户（否则顶部切换器无项可选）；
     *              停用后的租户在顶部切换器中禁用，只能由管理员在此重新启用
     */
    case "UPDATE_TENANT": {
      must(s.roleId === "admin", "仅管理员可维护租户");
      const list = s.tenants || [];
      const old = list.find((x) => x.id === a.tenant?.id);
      must(old, "租户不存在");
      const t = tenantFields(s, a.tenant as Tenant);
      if (t.status === "停用") {
        must(
          old!.id !== s.tenantId,
          "当前正在使用的租户不能停用，请先切换到其他租户",
        );
        must(
          list.some((x) => x.id !== old!.id && x.status !== "停用"),
          "至少要保留一个启用状态的租户",
        );
      }
      const next: Tenant = {
        ...old!,
        ...t,
        updatedAt: now(),
      };
      s.tenants = list.map((x) => (x.id === next.id ? next : x));
      object = next.id;
      detail = `租户「${next.name}」已保存（${next.status} · 编码 ${next.code}）`;
      break;
    }
    /**
     * 租户删除（系统设置 › 租户管理）
     * @description 硬约束两条：
     *              ① 当前正在使用的租户不能删（先切到别的租户）；
     *              ② 至少保留一个租户，列表不能删空；
     *              该租户的管理员账号与业务缓存由页面在删除成功后一并清理
     *              （engine 只管清单，不碰登录账号与 localStorage）
     */
    case "DELETE_TENANT": {
      must(s.roleId === "admin", "仅管理员可维护租户");
      const list = s.tenants || [];
      const gone = list.find((x) => x.id === a.id);
      must(gone, "租户不存在");
      must(
        gone!.id !== s.tenantId,
        "当前正在使用的租户不能删除，请先切换到其他租户",
      );
      must(list.length > 1, "至少要保留一个租户");
      s.tenants = list.filter((x) => x.id !== gone!.id);
      object = gone!.id;
      detail = `租户「${gone!.name}」已删除（编码 ${gone!.code}）`;
      break;
    }
    /**
     * 告警设置（告警管理 › 告警设置）：保存一个台账的告警设置（开关 / 多条告警项）
     * @description 与巡检目标台账**同一份数据**：写回 `BusinessTarget.alarm`，
     *              并把台账的判定口径同步为第一条告警项（台账页保存走同一个函数）；
     *              告警分类与触发逻辑按告警项单独配（不再有台账级入口），
     *              台账级 `category / triggerMode` 由主项派生，见 applyAlarmSetting；
     *              告警名称不在告警设置里维护：名称统一由台账名称派生（alarmSettings.targetNameOf）
     */
    case "SAVE_ALARM_SETTING": {
      const t = s.businessTargets?.find((b) => b.id === a.targetId);
      must(t, "巡检目标台账不存在");
      const set = a.setting as {
        enabled: boolean;
        items: AlarmItem[];
        main?: "业务预警" | "机器人预警";
      };
      const bad = checkAlarmItems(set?.items || []);
      must(!bad, bad);
      s.businessTargets = (s.businessTargets || []).map((b) =>
        b.id === t!.id
          ? applyAlarmSetting(b, {
              enabled: set.enabled !== false,
              items: set.items,
              main: set.main,
            })
          : b,
      );
      object = t!.id;
      detail = `告警设置已保存（${set.items.length} 条告警项 · ${
        set.enabled !== false ? "启用" : "停用"
      }）`;
      break;
    }
    /**
     * 告警推送人员（告警管理 › 告警推送）：新增 / 修改一条推送名单
     * @description 登录名在同库内唯一（推送通道按登录名定位账号）；等级留空 = 接收全部等级
     */
    case "SAVE_ALARM_PUSH": {
      must(s.roleId === "admin", "仅管理员可维护告警推送");
      const p = a.staff as AlarmPushStaff;
      const name = String(p?.name || "").trim();
      const login = String(p?.login || "").trim();
      const phone = String(p?.phone || "").trim();
      must(name, "请填写姓名");
      must(login, "请填写用户登录名");
      must(phone, "请填写手机号");
      const list = s.alarmPushStaff || [];
      must(
        !list.some((x) => x.login === login && x.id !== p.id),
        `登录名「${login}」已存在`,
      );
      const next: AlarmPushStaff = {
        ...p,
        id: p.id || id("AP-"),
        name,
        login,
        phone,
        dept: String(p.dept || "").trim(),
        levels: (p.levels || []).slice(),
        // 绑定范围（区域 / 设备）：去空去重后落库；留空 = 不限该维度
        areas: normalizeScope(p.areas),
        devices: normalizeScope(p.devices),
        sms: p.sms !== false,
        updatedBy: roleOf(s.roleId).person,
        updatedAt: now(),
      };
      s.alarmPushStaff = list.filter((x) => x.id !== next.id).concat(next);
      object = next.id;
      detail = `推送人员「${next.name}」已保存（${
        next.levels.length ? next.levels.join(" / ") : "全部等级"
      } · ${pushScopeLabel(next)}）`;
      break;
    }
    /**
     * 告警推送人员删除：一人一条、无引用关系，按勾选直接删
     */
    case "REMOVE_ALARM_PUSH": {
      must(s.roleId === "admin", "仅管理员可维护告警推送");
      const gone = (s.alarmPushStaff || []).find((x) => x.id === a.id);
      must(gone, "推送人员不存在");
      s.alarmPushStaff = (s.alarmPushStaff || []).filter((x) => x.id !== a.id);
      object = gone!.id;
      detail = `推送人员「${gone!.name}」已删除`;
      break;
    }
    /**
     * 算法模板：平台「看什么、怎么判」的标准表达（后台管理 › 算法模板管理）
     * @description 巡检目标台账 = 仪表 / 区域 + 一条算法模板 + 算法 + 阈值 + 判定；
     *              本动作是该模板库的唯一维护入口，保存后新台账按目标类型与采集方式匹配到对应要求。
     *              被引用的台账不会改写（台账保存时按当时口径落库）
     */
    case "SAVE_REQUIREMENT": {
      must(s.roleId === "admin", "仅管理员可维护算法模板");
      const req = a.requirement as Requirement;
      must(req?.code?.trim(), "请填写算法模板编码");
      must(req?.name?.trim(), "请填写算法模板名称");
      must(req.kind, "请选择算法能力类型");
      must(req.targetKinds?.length, "请至少选择一个适用目标类型");
      must(req.capture, "请选择默认采集方式");
      must(req.algorithm?.trim(), "请填写算法");
      must(req.judge, "请选择判定方式");
      if (req.judge === "数值范围") {
        must(req.unit?.trim(), "数值范围判定需填写单位");
        must(
          req.min !== undefined &&
            req.max !== undefined &&
            req.max > req.min,
          "请填写有效的下限（含）与上限（含）（上限须大于下限）",
        );
      }
      if (req.judge === "期望状态") {
        must(req.expected?.trim(), "期望状态判定需填写期望状态");
      }
      const list = s.requirements || [];
      const old = list.find((x) => x.id === req.id);
      const code = String(req.code).trim();
      must(
        !list.some((x) => x.code === code && x.id !== req.id),
        `算法模板编码「${code}」已被占用`,
      );
      const next: Requirement = {
        ...req,
        id: req.id || id("REQ-"),
        code,
        name: req.name.trim(),
        description: (req.description || "").trim(),
        algorithm: (req.algorithm || "").trim(),
        deploy: req.deploy || "云端",
        unit: req.judge === "数值范围" ? (req.unit || "").trim() : req.unit,
        expected:
          req.judge === "期望状态"
            ? (req.expected || "").trim()
            : undefined,
        version: (old?.version || 0) + 1,
        updatedAt: now(),
      };
      s.requirements = list.filter((x) => x.id !== next.id).concat(next);
      object = next.id;
      detail = `算法模板「${next.name}」已保存为第 ${next.version} 版`;
      break;
    }
    case "FIELD_COMMAND": {
      fieldCommand(s, robot(), a.command, a.value, a.fail);
      detail = `现场控制 ${a.command} · ${s.fieldDevices![robot().id].status}`;
      break;
    }
    /**
     * 接收地图数据包（「新增地图」：在线机器人扫描回传）
     * @description 数据包**还不是地图**：只登记来源机器人、接收时间与点云预览，
     *              列表以卡片展示；用户点「编辑」命名 / 定区域后才走 IMPORT 落为正式地图
     */
    case "ADD_MAP_PACKET": {
      const rid = String(a.robotId || "").trim();
      const r = s.robots.find((x) => x.id === rid);
      must(r, "请选择采集机器人");
      must(r!.state !== "离线", `机器人「${r!.name}」已离线，无法扫描回传`);
      const packets = (s.mapPackets ??= []);
      const seq = packets.length + 1;
      const rec: MapPacket = {
        id: id("PKT"),
        // 未编辑前给占位名（编辑时才命名并转为地图）
        name:
          String(a.name || "").trim() ||
          `地图信息-${String(seq).padStart(2, "0")}-${r!.id}`,
        robotId: r!.id,
        at: now(),
        image: a.image,
        source: "机器人扫描回传",
      };
      packets.unshift(rec);
      object = rec.id;
      detail = `已接收地图数据包「${rec.name}」（来自 ${r!.name}）`;
      break;
    }
    case "DELETE_MAP_PACKET": {
      const packets = (s.mapPackets ??= []);
      const hit = packets.find((x) => x.id === a.id);
      must(hit, "未找到要删除的地图数据包");
      s.mapPackets = packets.filter((x) => x.id !== hit!.id);
      object = hit!.id;
      detail = `已删除地图数据包「${hit!.name}」`;
      break;
    }
    /** 重命名地图数据包（卡片「⋯ › 重命名」） */
    case "RENAME_MAP_PACKET": {
      const packets = (s.mapPackets ??= []);
      const hit = packets.find((x) => x.id === a.id);
      must(hit, "未找到要重命名的地图数据包");
      const name = String(a.name || "").trim();
      must(name, "请填写数据包名称");
      hit!.name = name;
      object = hit!.id;
      detail = `数据包已重命名为「${name}」`;
      break;
    }
    /**
     * 构建地图（卡片「⋯ › 构建地图」）：把地图数据包转成**可标定的 SLAM 地图**
     * @description 数据包只是扫描产物；构建后成为正式 `MapAsset`——可进标定工作台打点 / 连线，
     *              并按 `frames`（分辨率 + 原点）做「像素 → 局部米 → 全局坐标」换算；
     *              构建成功后移除该数据包
     */
    case "BUILD_MAP": {
      const packets = (s.mapPackets ??= []);
      const k = packets.find((x) => x.id === a.packetId);
      must(k, "未找到要构建的地图数据包");
      const name = String(a.name || "").trim() || k!.name;
      const m: MapAsset = {
        // 主键即地图编号：统一 MAP-XXX 格式，展示层不再二次换算
        id: nextMapNo(s.maps),
        name,
        // 地图不再归属区域（区域概念已从地图管理下线），留空仅作旧数据兼容字段
        region: "",
        version: 1,
        syncState: "未同步",
        // 新建地图默认启用，可在列表的启停开关里停用
        status: "启用",
        source: "机器人扫描构建",
        batch: k!.id,
        cloud: "scan-multimodal.pcd",
        video: "scan-video.mp4",
        file: `${k!.id}.map`,
        checksum: "demo-sha256:scan",
        image: k!.image,
        history: [
          {
            version: 1,
            note: `由数据包「${k!.name}」构建（待标定：像素 → 全局坐标换算）`,
            at: now(),
          },
        ],
        updatedAt: now(),
      };
      s.maps.push(m);
      s.mapPackets = packets.filter((x) => x.id !== k!.id);
      object = m.id;
      detail = `已由数据包「${k!.name}」构建地图「${name}」`;
      break;
    }
    /** 重命名地图 */
    case "RENAME_MAP": {
      const hit = s.maps.find((x) => x.id === a.id);
      must(hit, "未找到要重命名的地图");
      const name = String(a.name || "").trim();
      must(name, "请填写地图名称");
      hit!.name = name;
      hit!.updatedAt = now();
      object = hit!.id;
      detail = `地图已重命名为「${name}」`;
      break;
    }
    /** 删除地图：图下仍有巡检点时拒绝，避免留下悬空引用（同步清理标定数据与下发记录） */
    case "DELETE_MAP": {
      const hit = s.maps.find((x) => x.id === a.id);
      must(hit, "未找到要删除的地图");
      must(
        !s.points.some((p) => p.mapId === hit!.id),
        `地图「${hit!.name}」下仍有巡检点，请先处理后再删除`,
      );
      s.maps = s.maps.filter((x) => x.id !== hit!.id);
      s.mapCalibrations = (s.mapCalibrations || []).filter(
        (c) => c.mapId !== hit!.id,
      );
      s.syncs = (s.syncs || []).filter((x) => x.mapId !== hit!.id);
      object = hit!.id;
      detail = `已删除地图「${hit!.name}」`;
      break;
    }
    /**
     * 切换地图逻辑启停（启用 / 停用 / 停用中），原因随审计留痕
     * @description 与机器人启停同一套防呆：图上还有在跑任务时，默认只标「停用中」——
     *              不再派新任务、不再下发，等在跑任务结束由 `settleMapStopping` 落终态；
     *              传 `strategy = "立即"` 才硬中断（在跑任务置「取消」并写明原因）。
     *              `a.status` 显式给目标状态；缺省按当前状态取反（停用中 → 启用 = 取消停用）
     */
    case "TOGGLE_MAP_STATUS": {
      const hit = s.maps.find((x) => x.id === a.id);
      must(hit, "未找到地图");
      const reason = String(a.reason || "").trim();
      const tail = reason ? `（原因：${reason}）` : "";
      const target =
        a.status === "启用" || a.status === "停用"
          ? a.status
          : hit.status === "停用" || hit.stopping
            ? "启用"
            : "停用";
      if (target === "启用") {
        hit.status = "启用";
        hit.stopping = false;
        // 启用即清掉停用原因，详情页不再显示上一轮的停用说明
        hit.statusReason = undefined;
        hit.statusAt = now();
        detail = `地图「${hit.name}」已启用${tail}`;
      } else {
        const running = runningTasksOf(s, hit.id);
        hit.statusReason = reason || hit.statusReason;
        hit.statusAt = now();
        if (running.length && a.strategy !== "立即") {
          hit.stopping = true;
          detail = `地图「${hit.name}」已标记停用：${running.length} 个任务结束后生效，期间不再派新任务${tail}`;
        } else {
          // 立即停用：在跑任务中断并留原因，机器人释放当前任务；队列任务由调度约束挡住
          running.forEach((t) => {
            t.state = t.done.length ? "部分完成" : "取消";
            t.blockedReason = "地图被立即停用，任务中断";
            t.finishedAt = new Date().toISOString();
            const r = s.robots.find((x) => x.id === t.robotId);
            if (r && r.current === t.id) {
              r.current = undefined;
              r.state = "空闲";
            }
          });
          hit.status = "停用";
          hit.stopping = false;
          detail = `地图「${hit.name}」已停用${running.length ? `（中断 ${running.length} 个在跑任务）` : ""}${tail}`;
        }
      }
      object = hit.id;
      break;
    }
    /**
     * 保存路网（标定工作台）：只存线 / 弧
     * @description 「点」是定位点，打点时即时写入标定数据（`ADD_TARGET`），与现场采集共用同一份；
     *              这里只保存线 / 弧，两端用定位点 id 引用——保证**地图与点位一致**
     */
    case "SAVE_ROADNET": {
      const hit = s.maps.find((x) => x.id === a.mapId);
      must(hit, "未找到地图");
      const paths = (a.paths || []) as Roadnet["paths"];
      must(paths.length, "请先连线（直线 / 曲线）再保存路网");
      hit!.roadnet = { paths };
      hit!.updatedAt = now();
      object = hit!.id;
      detail = `路网已保存：${paths.length} 条线`;
      break;
    }
    case "IMPORT": {
      must(a.name && a.file, "请填写地图名称并选择地图图片");
      // 更新已有地图：重新上传 SLAM 点云底图（不含巡检点 / 业务信息），
      // 版本 +1、回退为「未同步」，等重新下发给仍停留在旧版本的机器
      if (a.id) {
        const m = s.maps.find((x) => x.id === a.id);
        must(m, "未找到要更新的地图");
        m.name = a.name;
        if (a.region) m.region = a.region;
        m.image = a.image || undefined;
        m.file = a.file;
        if (a.cloud) m.cloud = a.cloud;
        if (a.video) m.video = a.video;
        m.version++;
        m.syncState = "未同步";
        m.updatedAt = now();
        logVersion(m, "重新上传 SLAM 地图（点云底图更新）");
        object = m.id;
        detail = `已更新地图「${m.name}」至第 ${m.version} 版`;
        break;
      }
      const m = {
        // 主键即地图编号：统一 MAP-XXX 格式，展示层不再二次换算
        id: nextMapNo(s.maps),
        name: a.name,
        // 同上：地图不归属区域
        region: "",
        version: 1,
        syncState: "未同步" as const,
        // 新建地图默认启用，可在列表的启停开关里停用
        status: "启用" as const,
        source: a.source || "机器人实采",
        batch: id("B"),
        cloud: a.cloud || "",
        video: a.video || "",
        file: a.file,
        checksum: "demo-sha256:93b8…",
        // 底图：上传的图片（示例地图 / 用户本地图片）
        image: a.image || undefined,
        // 地图 = 纯点云：只登记建图产物，不带任何定位ID / 巡检点 / 业务信息；
        // 巡检点由同批采集的「巡检点标定文件」写入独立标定数据（见 mapCalibration.ts）
        history: [
          {
            version: 1,
            note: "导入纯点云地图（不含点位，待现场标定）",
            at: now(),
          },
        ],
        updatedAt: now(),
      };
      s.maps.unshift(m);
      object = m.id;
      detail = "已导入纯点云地图（不含巡检点与业务信息，请在巡检点管理中标定巡检点）";
      break;
    }
    case "ARCHIVE": {
      const m = map();
      must(a.cloud && a.video, "点云与原始视频必须同时登记");
      m.cloud = a.cloud;
      m.video = a.video;
      break;
    }
    // ── 「地图 → 巡检任务」链路 · 阶段①② 地图与坐标（只增不改） ──
    case "SET_MAP_IMAGE": {
      const m = map();
      // 清除时写空串而非 undefined：与"从未有过底图"区分，避免被老缓存补图逻辑回填
      m.image = a.image || "";
      detail = a.image ? "底图已上传（可在图上标注点位）" : "底图已清除";
      break;
    }
    case "CALIBRATE_FRAMES": {
      const m = map();
      m.frames = { ...(m.frames || {}), ...(a.frames || {}) };
      // 有分辨率与原点即视为已标定，仅其一为部分标定
      m.frames.calibState =
        m.frames.resolution && m.frames.origin
          ? "已标定"
          : m.frames.resolution || m.frames.origin
            ? "部分标定"
            : "未标定";
      detail = `坐标标定已保存（${m.frames.calibState}）`;
      break;
    }
    case "SET_MAP_LAYERS": {
      const m = map();
      m.layers = { ...(m.layers || {}), ...(a.layers || {}) };
      detail = "地图图层已更新";
      break;
    }
    // ── 空间管理：地图拓扑与跨图切换点 ──
    case "MAP_SWITCH_ADD": {
      const from = s.maps.find((x) => x.id === a.fromMapId);
      const to = s.maps.find((x) => x.id === a.toMapId);
      must(from && to, "切换点两端的来源地图与目标地图都必须存在");
      must(a.fromMapId !== a.toMapId, "跨图切换点两端不能是同一张地图");
      s.mapSwitchPoints ||= [];
      const sp: MapSwitchPoint = {
        id: id("SW"),
        name: String(a.name || "").trim() || `${from!.name} → ${to!.name}`,
        fromMapId: a.fromMapId,
        toMapId: a.toMapId,
        from: { x: Number(a.fromX) || 0, y: Number(a.fromY) || 0 },
        to: { x: Number(a.toX) || 0, y: Number(a.toY) || 0 },
        state: "启用",
      };
      s.mapSwitchPoints.push(sp);
      object = sp.id;
      detail = `新增跨图切换点：${sp.name}`;
      break;
    }
    case "MAP_SWITCH_REMOVE": {
      must(
        s.mapSwitchPoints?.some((x) => x.id === a.id),
        "切换点不存在",
      );
      s.mapSwitchPoints = (s.mapSwitchPoints || []).filter(
        (x) => x.id !== a.id,
      );
      detail = "删除跨图切换点";
      break;
    }
    case "MAP_SWITCH_STATE": {
      const sp = s.mapSwitchPoints?.find((x) => x.id === a.id);
      must(sp, "切换点不存在");
      sp!.state = sp!.state === "启用" ? "停用" : "启用";
      object = sp!.id;
      detail = `跨图切换点已${sp!.state}`;
      break;
    }
    // ── 阶段③ 设备主数据：导入 → 启停 / 是否巡检 ──
    case "IMPORT_DEVICES": {
      const rows = (a.devices || []) as Partial<DeviceAsset>[];
      must(rows.length, "请提供要导入的设备清单");
      must(rows.length <= 200, "单次最多导入 200 台设备，请拆分批次");
      const incoming = new Map<string, Partial<DeviceAsset>>();
      rows.forEach((r) => {
        const code = String(r.id || "").trim();
        must(code, "设备编码不能为空（编码是设备身份的唯一依据）");
        must(
          /^[A-Za-z0-9_-]{2,32}$/.test(code),
          `设备编码「${code}」格式不合法（仅字母 / 数字 / 下划线 / 中划线）`,
        );
        must(String(r.name || "").trim(), `设备「${code}」缺少设备名称`);
        const items = (r.items || []) as InspectItem[];
        items.forEach((it) => {
          must(
            it.id && it.target,
            `设备「${code}」存在缺少编码或检测目标的巡检项`,
          );
          // 采集方式 / 单位不再由导入（与检测项页）填写：缺失或非法值统一落默认
          if (!captureKinds.includes(it.kind)) it.kind = "可见光";
          it.targetKind = it.targetKind || defaultTargetKindOfTarget(it.target);
          // 导入模板不含分类列：缺省按检测目标推导（可在检测项页改成任意分类）
          it.category = String(it.category || "").trim() || defaultCategoryOfTarget(it.target);
          it.unit = String(it.unit || "").trim();
        });
        // 模板允许同一设备编码占多行（一行一个检测项）：此处合并为该设备的多个检测项
        const exist = incoming.get(code);
        if (!exist) {
          incoming.set(code, { ...r, items });
          return;
        }
        const merged = [...(exist.items || []), ...items];
        exist.items = merged.filter(
          (it, i) => merged.findIndex((x) => x.target === it.target) === i,
        );
        if (!String(exist.name || "").trim()) exist.name = r.name;
      });
      const devs = (s.devices ??= []);
      let added = 0;
      let updated = 0;
      incoming.forEach((r, code) => {
        const cur = devs.find((d) => d.id === code);
        const rec: DeviceAsset = {
          id: code,
          name: String(r.name),
          type: r.type || "未分类",
          // 设备形态：导入列优先（非法值不落库），缺省按设备类型推导
          deviceKind: (
            deviceKinds.includes(r.deviceKind as DeviceKind)
              ? r.deviceKind
              : defaultDeviceKindOfType(String(r.type || ""))
          ) as DeviceKind,
          regionCode: r.regionCode || "",
          // 所属区域：导入列显式给出时优先（未给出则按安装位置推导）
          region: String(r.region || "").trim() || undefined,
          locationDesc: r.locationDesc || "",
          coord: r.coord,
          coordSys: r.coordSys,
          height: r.height,
          parts: r.parts,
          items: (r.items || []) as InspectItem[],
          photo: cur?.photo,
          remark: r.remark,
          // 导入即刷新「更新时间」（台账列表展示）
          updatedAt: now(),
        };
        if (cur) {
          devs[devs.indexOf(cur)] = rec;
          updated++;
        } else {
          devs.push(rec);
          added++;
        }
      });
      // 设备清单版本：与地图版本并列，供机器人同步比对（阶段⑧）
      s.maps.forEach(
        (m) => (m.deviceListVersion = (m.deviceListVersion || 1) + 1),
      );
      object =
        incoming.size === 1 ? [...incoming.keys()][0] : `${incoming.size} 台设备`;
      detail = `设备清单已导入（新增 ${added} 台 / 更新 ${updated} 台）`;
      break;
    }
    case "SET_INSPECT_FLAG": {
      const d = deviceOf(s, a.deviceId);
      must(d, "设备不存在");
      const it = d!.items.find((x) => x.id === a.itemId);
      must(it, "巡检项不存在");
      it!.inspect = a.inspect !== false;
      // 同一仪表的巡检目标台账一起跟随（两处开关必须同口径）
      (s.businessTargets || [])
        .filter((b) => b.instrumentId === it!.id)
        .forEach((b) => (b.inspect = it!.inspect));
      object = d!.id;
      detail = `${d!.name} · ${it!.target}「是否巡检」已${it!.inspect ? "开启" : "关闭"}`;
      break;
    }
    // 检测项增删改：设备清单是唯一维护入口，改动同步仪表 / 巡检目标台账 / 逻辑点，保证三处同口径
    case "ADD_DEVICE_ITEM": {
      const d = deviceOf(s, a.deviceId);
      must(d, "设备不存在");
      const target = String(a.target || "").trim();
      must(target, "请填写检测目标");
      must(
        !d!.items.some((x) => x.target === target),
        `检测目标「${target}」已存在`,
      );
      // 类型（界面口径：实体 / 虚拟）与分类，缺省均按检测目标推导（见 buildInspectItem）
      const item = buildInspectItem(d!.id, a);
      d!.items.push(item);
      // 检测项变动即刷新设备「更新时间」（设备台账列表展示）
      d!.updatedAt = now();
      // 检测目标即工厂树第三层的仪表（id 同源），一并新增
      pushInstrumentOf(s, d!, item);
      object = d!.id;
      detail = `${d!.name} 新增检测项「${item.target}」`;
      break;
    }
    case "UPDATE_DEVICE_ITEM": {
      const d = deviceOf(s, a.deviceId);
      must(d, "设备不存在");
      const it = d!.items.find((x) => x.id === a.itemId);
      must(it, "检测项不存在");
      const target = String(a.target ?? it!.target).trim();
      must(target, "请填写检测目标");
      must(
        !d!.items.some((x) => x.id !== it!.id && x.target === target),
        `检测目标「${target}」已存在`,
      );
      it!.target = target;
      if (a.kind) it!.kind = a.kind as CaptureKind;
      if (a.targetKind) it!.targetKind = a.targetKind as InspectItem["targetKind"];
      if (a.category !== undefined)
        it!.category = String(a.category).trim() || it!.category;
      it!.unit = String(a.unit ?? it!.unit).trim();
      it!.cycle = String(a.cycle ?? it!.cycle).trim() || it!.cycle;
      if (a.priority) it!.priority = a.priority as InspectItem["priority"];
      // 同口径同步：仪表（工厂树）与巡检目标台账（分类影响台账的设备形态归类）
      const ins = s.instruments?.find((x) => x.id === it!.id);
      if (ins) {
        ins.name = it!.target;
        ins.capture = it!.kind;
        ins.unit = it!.unit || undefined;
      }
      (s.businessTargets || [])
        .filter((b) => b.instrumentId === it!.id)
        .forEach((b) => {
          b.targetKind = it!.targetKind || "仪表";
          b.unit = it!.unit || undefined;
          b.cycle = it!.cycle;
          b.priority = it!.priority;
        });
      d!.updatedAt = now();
      object = d!.id;
      detail = `${d!.name} 检测项「${it!.target}」已更新`;
      break;
    }
    case "DELETE_DEVICE_ITEM": {
      const d = deviceOf(s, a.deviceId);
      must(d, "设备不存在");
      const idx = d!.items.findIndex((x) => x.id === a.itemId);
      must(idx >= 0, "检测项不存在");
      const [removed] = d!.items.splice(idx, 1);
      // 解绑引用：仪表 / 巡检目标台账 / 逻辑点覆盖的巡检项，避免留下悬空引用
      if (s.instruments)
        s.instruments = s.instruments.filter((x) => x.id !== removed.id);
      if (s.businessTargets)
        s.businessTargets = s.businessTargets.filter(
          (b) => b.instrumentId !== removed.id,
        );
      (s.logicalPoints || []).forEach((lp) => {
        lp.itemIds = lp.itemIds.filter((x) => x !== removed.id);
      });
      d!.updatedAt = now();
      object = d!.id;
      detail = `${d!.name} 检测项「${removed.target}」已删除`;
      break;
    }
    // ── 巡检目标台账：仪表 + 算法模板 + 算法 + 阈值 + 判断标准 ──
    case "ADD_BUSINESS_TARGET": {
      /**
       * TGT-01：目标分两类 ——
       * ① 仪表类（默认）：必须关联设备台账中的仪表；
       * ② 环境 / 区域类：可不关联设备台账（如罐区气体、区域声纹、区域红外、AI 不安全行为）。
       * 区域类目标必须提供参照物锚点（TGT-02），否则泄漏 / 异常无法归因。
       */
      const targetKind: "仪表" | "环境" | "区域" =
        a.targetKind || (a.instrumentId ? "仪表" : "环境");
      const ins = s.instruments?.find((x) => x.id === a.instrumentId);
      if (targetKind === "仪表") {
        must(ins, "仪表不存在，请先在设备主数据中维护检测目标");
        must(
          ins!.state !== "停用",
          `仪表「${ins!.name}」已停用，暂不能新增巡检目标台账`,
        );
      } else if (targetKind === "区域")
        // 环境 / 区域类不再手填「业务目标」：goal 由引擎按锚点 + 算法模板自动生成
        must(String(a.anchor || "").trim(), "区域类目标必须填写参照物锚点（TGT-02）");
      const req = s.requirements?.find((r) => r.id === a.requirementId);
      must(req, "算法模板不存在");
      must(
        String(a.algorithm || "").trim(),
        `请为「${req!.name}」指定算法（AI 表达方式）`,
      );
      const judge: JudgeType = a.judge || req!.judge;
      if (judge === "数值范围")
        must(
          Number.isFinite(a.min) && Number.isFinite(a.max) && a.min <= a.max,
          "数值范围判定需要有效上下限（下限不大于上限）",
        );
      if (judge === "期望状态")
        must(String(a.expected || "").trim(), "期望状态判定需要填写期望值");
      // 告警项都是手填：连续确认至少要 2 次（1 次等于识别即触发，配置无意义）
      if (a.alarm?.triggerMode === "连续确认")
        must((a.alarm?.consecutive || 0) >= 2, "「连续确认」至少要填 2 次");
      const rec: BusinessTarget = {
        id: id("BT"),
        // 台账名称：留空时按仪表名 / 锚点派生（列表与告警名称都取这里）
        name: String(a.name || "").trim() || undefined,
        targetKind,
        instrumentId: ins?.id,
        anchor: String(a.anchor || "").trim() || undefined,
        // 锚点范围：抽屉里画的多边形（可空），坐标与区域配置同口径
        anchorPolygon: Array.isArray(a.anchorPolygon)
          ? a.anchorPolygon
          : undefined,
        requirementId: req!.id,
        // 业务目标与业务要求：留空时按"仪表 / 区域 + 判定方式"和算法模板说明自动生成
        goal:
          String(a.goal || "").trim() ||
          (ins
            ? `确认${ins.name}${judge === "期望状态" ? "状态符合要求" : "读数在正常范围内"}`
            : `${a.anchor ? a.anchor + " " : ""}${req!.name}`),
        require: String(a.require || "").trim() || req!.description,
        algorithm: String(a.algorithm).trim(),
        judge,
        unit: judge === "数值范围" ? a.unit || ins?.unit : undefined,
        min: judge === "数值范围" ? Number(a.min) : undefined,
        max: judge === "数值范围" ? Number(a.max) : undefined,
        expected: judge === "期望状态" ? String(a.expected).trim() : undefined,
        criteria: a.criteria || req!.description,
        // 告警设置：新建默认二级；**调整入口只有「巡检目标台账」**
        alarm: a.alarm || {
          level: "二级",
          trigger: "单次异常即告警",
          notify: ["设备岗"],
        },
        needPhoto: !!a.needPhoto,
        needVideo: !!a.needVideo,
        needReview: !!a.needReview,
        cycle: a.cycle || req!.cycle || "每日",
        priority: a.priority || "普通",
        inspect: a.inspect !== false,
        createdAt: now(),
      };
      s.businessTargets = [rec, ...(s.businessTargets || [])];
      if (ins) syncInspectFlag(s, ins.id);
      object = rec.id;
      detail = ins
        ? `已为「${s.devices?.find((d) => d.id === ins.deviceId)?.name || ins.deviceId} · ${ins.name}」新增巡检目标台账：${req!.name}（${rec.algorithm}）`
        : `已新增${targetKind}类巡检目标台账：${rec.goal}（${rec.algorithm}）`;
      break;
    }
    case "UPDATE_BUSINESS_TARGET": {
      const b = s.businessTargets?.find((x) => x.id === a.id);
      must(b, "巡检目标台账不存在");
      // 台账名称：留空 = 回到派生口径（清空自定义名）
      if (a.name !== undefined) b!.name = String(a.name).trim() || undefined;
      // 区域 / 环境类目标的锚点与锚点范围（之前编辑时锚点没落库，这里一并补上）
      if (a.anchor !== undefined)
        b!.anchor = String(a.anchor).trim() || undefined;
      if (a.anchorPolygon !== undefined)
        b!.anchorPolygon = Array.isArray(a.anchorPolygon) && a.anchorPolygon.length
          ? a.anchorPolygon
          : undefined;
      if (a.algorithm !== undefined) {
        must(String(a.algorithm).trim(), "算法不能为空");
        b!.algorithm = String(a.algorithm).trim();
      }
      if (a.judge !== undefined) b!.judge = a.judge;
      if (a.unit !== undefined) b!.unit = a.unit;
      if (a.min !== undefined) b!.min = Number(a.min);
      if (a.max !== undefined) b!.max = Number(a.max);
      if (b!.judge === "数值范围")
        must(
          Number.isFinite(b!.min) &&
            Number.isFinite(b!.max) &&
            (b!.min as number) <= (b!.max as number),
          "数值范围判定需要有效上下限（下限不大于上限）",
        );
      if (a.expected !== undefined) b!.expected = a.expected;
      if (a.criteria !== undefined) b!.criteria = a.criteria;
      if (a.goal !== undefined) b!.goal = a.goal;
      if (a.require !== undefined) b!.require = a.require;
      // 告警设置：按字段合并更新（平台唯一的告警配置入口）
      if (a.alarm !== undefined)
        b!.alarm = {
          ...(b!.alarm || { level: "二级" as const }),
          ...a.alarm,
        };
      // 告警项都是手填：连续确认至少要 2 次
      if (b!.alarm.triggerMode === "连续确认")
        must((b!.alarm.consecutive || 0) >= 2, "「连续确认」至少要填 2 次");
      if (a.needPhoto !== undefined) b!.needPhoto = !!a.needPhoto;
      if (a.needVideo !== undefined) b!.needVideo = !!a.needVideo;
      if (a.needReview !== undefined) b!.needReview = !!a.needReview;
      if (a.cycle !== undefined) b!.cycle = a.cycle;
      if (a.priority !== undefined) b!.priority = a.priority;
      if (a.inspect !== undefined) b!.inspect = !!a.inspect;
      syncInspectFlag(s, b!.instrumentId);
      object = b!.id;
      detail = `巡检目标台账已更新（是否巡检：${b!.inspect ? "开" : "关"}）`;
      break;
    }
    /**
     * 批量删除巡检目标台账（列表多选删除）
     * @description 仍被巡检点巡检项引用的台账不允许删除：
     *              删了会让巡检项的「检什么、怎么判」悬空（巡检点保存时也会校验引用存在）
     */
    case "DELETE_BUSINESS_TARGETS": {
      const ids: string[] = Array.isArray(a.ids) ? a.ids.map(String) : [];
      must(ids.length, "请先选择要删除的巡检目标台账");
      const list = s.businessTargets ?? [];
      const nameOf = (bid: string) => {
        const b = list.find((x) => x.id === bid);
        return b?.name || b?.goal || bid;
      };
      const blocked = ids
        .map((bid) => ({
          bid,
          points: (s.points || []).filter((p) =>
            (p.inspectItems || []).some((it) => it.targetId === bid),
          ),
        }))
        .filter((x) => x.points.length);
      must(
        !blocked.length,
        `以下台账已被巡检点引用，需先解绑：${blocked
          .map(
            (x) => `${nameOf(x.bid)}（${x.points.map((p) => p.name).join(" / ")}）`,
          )
          .join("；")}`,
      );
      s.businessTargets = list.filter((b) => !ids.includes(b.id));
      object = ids.join(",");
      detail = `已删除 ${ids.length} 个巡检目标台账：${ids.map(nameOf).join("、")}`;
      break;
    }
    // ── 巡检点管理：巡检点 = 名称 + 地图 + 标定点 + 多个巡检项 ──
    // ── 巡检点管理：巡检点 = 名称 + 地图 + 标定点 + 多个巡检项 ──
    case "SAVE_POINT": {
      const m = map();
      must(String(a.name || "").trim(), "请填写巡检点名称");
      // 巡检点来自**独立标定数据**（与地图分开放），不在 MapAsset 上
      const cal = ensureCalibration(s, m.id);
      const target = cal.targets.find((t) => t.id === a.targetId);
      must(target, "请选择已标定的巡检点（定位ID）");
      must(
        target!.externalId,
        "所选巡检点缺少定位ID；请先到「巡检点标定」补录定位ID",
      );
      const specs = (a.inspectItems || []) as InspectSpec[];
      must(specs.length, "请至少添加一个巡检项（名称 + 业务目标 + 机器操作内容）");
      const btOf = (sid: string) => s.businessTargets?.find((b) => b.id === sid);
      const insOf = (sid: string) => {
        const bt = btOf(sid);
        must(bt, "巡检项的业务目标不存在，请先维护巡检目标台账");
        const ins = s.instruments?.find((x) => x.id === bt!.instrumentId);
        must(ins, "业务目标关联的仪表不存在");
        return ins!;
      };
      specs.forEach((sp, i) => {
        must(String(sp.name || "").trim(), `第 ${i + 1} 个巡检项缺少名称`);
        const ins = insOf(sp.targetId);
        must(ins.state !== "停用", `巡检项「${sp.name}」的仪表已停用`);
        must(
          (sp.actions || []).length,
          `巡检项「${sp.name}」请至少选择一个原子动作`,
        );
        must(sp.pose, `巡检项「${sp.name}」缺少机器操作参数（云台 / 视角）`);
      });
      const firstIns = insOf(specs[0].targetId);
      const firstDev = s.devices?.find((d) => d.id === firstIns.deviceId);
      must(firstDev, "仪表所属设备不存在");
      const old = s.points.find((p) => p.id === a.pointId);
      // 一对一校验：一个定位ID点只能绑一个巡检点
      if (target!.pointId && target!.pointId !== old?.id) {
        const owner = s.points.find((p) => p.id === target!.pointId);
        throw Error(
          `该标定点已被巡检点「${owner?.name || target!.pointId}」占用，请另选定位ID点`,
        );
      }
      // 改绑巡检点时释放旧点位占用，避免一个定位ID挂两个巡检点
      if (old && old.targetId !== target!.id) {
        const prev = cal.targets.find((t) => t.id === old.targetId);
        if (prev && prev.pointId === old.id) {
          prev.pointId = undefined;
          prev.state = "待确认";
        }
      }
      const pid = old?.id || id("P");
      // 巡检项 → 逻辑点（内部对象、不暴露给用户）；重复保存保持幂等
      const kept = (s.logicalPoints || []).filter(
        (x) => x.physicalPointId !== pid,
      );
      const created = specs.map((sp) => {
        const ins = insOf(sp.targetId);
        return {
          id: id("LP"),
          deviceId: ins.deviceId,
          itemIds: [ins.id],
          region: m.region,
          locateState: "已落位" as const,
          physicalPointId: pid,
          locateOrigin: "人工新增" as const,
        };
      });
      s.logicalPoints = [...kept, ...created];
      const normalized: InspectSpec[] = specs.map((sp) => ({
        ...sp,
        id: sp.id || id("IP"),
        actions: [...new Set(sp.actions)],
      }));
      const p: Point = {
        id: pid,
        name: String(a.name).trim(),
        targetId: target!.id,
        mapId: m.id,
        // 以下 5 个字段是"首个巡检项"的派生视图，仅为兼容旧页面与旧链接
        device: firstDev!.name,
        object: firstIns.name,
        item: normalized[0].name,
        unit: firstIns.unit || "",
        kind: firstIns.capture,
        requirement:
          btOf(normalized[0].targetId)?.criteria || normalized[0].name,
        // 现场采集 / 巡检点管理新增：坐标与巡检项一次配齐，直接可用
        state: "已启用",
        x: target!.x,
        y: target!.y,
        // DATA-01：统一坐标系权威定位（保留原值，首次创建时按地图相对坐标初始化，后续由标定更新）
        world: old?.world || { x: target!.x, y: target!.y, z: 0 },
        // PT-02：位姿可由「从机器人获取」上行抓取并微调后传入；未传时沿用旧值 / 按地图坐标初始化
        pose: a.pose || old?.pose || { x: target!.x, y: target!.y, yaw: 0 },
        calibrateRobot: a.calibrateRobot ?? old?.calibrateRobot,
        actionPlan: normalized[0].pose,
        inspectItems: normalized,
        logicalIds: created.map((x) => x.id),
        taught: a.taught ?? old?.taught,
      };
      if (old) s.points = s.points.map((q) => (q.id === old.id ? p : q));
      else s.points.push(p);
      target!.state = "已确认";
      target!.pointId = p.id;
      cal.updatedAt = now();
      object = p.id;
      detail = `已保存巡检点（${normalized.length} 个巡检项 · 覆盖 ${new Set(created.map((c) => c.deviceId)).size} 台设备）`;
      break;
    }
    /**
     * 删除巡检点
     * @description 与「删除路线前先解计划引用」同一口径：被任一巡检路线引用时不允许删，
     *              先解引用；删除后它占用的定位ID自动释放（占用态由 points 派生的）
     */
    case "DELETE_POINT": {
      const p = s.points.find((q) => q.id === a.id);
      must(p, "巡检点不存在或已删除");
      const used = s.templates.filter((t) => t.points.includes(a.id));
      must(
        used.length === 0,
        `该巡检点已被巡检路线「${used[0]?.name || ""}」引用，请先解除引用再删除`,
      );
      s.points = s.points.filter((q) => q.id !== a.id);
      break;
    }
    /**
     * 现场采集（跑图）新增巡检点：**只落一条带定位ID的标定点**，不产生平台巡检点。
     * 定位ID由页面按现有 O 序列自增后传入（同一地图内唯一）；坐标取机器人停稳时的实时位置。
     * 与 ADD_TARGET 的区别：来源固定为「平台新增 / 现场踩点」，且必须带定位ID（可被巡检点绑定）。
     */
    case "CAPTURE_ONSITE_POINT": {
      const m = map();
      const r = robot(a.robotId);
      must(r.state !== "离线", `机器人「${r.name}」离线，未收到定位回执`);
      must(
        Number.isFinite(a.x) && Number.isFinite(a.y),
        "未获取到机器人当前位置，请等机器人停稳后重新采集",
      );
      const externalId = String(a.externalId || "").trim();
      must(externalId, "未分配到定位ID，请重新采集");
      const cal = ensureCalibration(s, m.id);
      must(
        !cal.targets.some((t) => t.externalId === externalId),
        `定位ID ${externalId} 已存在，请重新采集`,
      );
      // 标定点主键与定位ID取同一值：与「地图导入」的点位口径一致，底图标记可读
      cal.targets.push({
        id: externalId,
        externalId,
        source: "平台新增",
        origin: "现场踩点",
        inputRef: r.id,
        kind: a.kind || "可见光",
        x: Number(a.x),
        y: Number(a.y),
        world: { x: Number(a.x), y: Number(a.y), z: 0 },
        state: "待确认",
      });
      cal.updatedAt = now();
      object = cal.id;
      detail = `已采集现场点位 ${externalId}（底图投影 ${Math.round(a.x)}, ${Math.round(a.y)} · 采集机器人 ${r.id}）`;
      break;
    }
    /**
     * 现场采集（跑图）：按方向移动机器人一格，用于演示"地图上的实时位置"。
     * @description 与遥控 `CONTROL` 解耦——现场采集不依赖人工接管会话。
     */
    case "ONSITE_MOVE": {
      const r = robot(a.robotId);
      must(r.state !== "离线", `机器人「${r.name}」离线，无法下发移动指令`);
      /** 步长由现场页档位决定（1-9，默认 3） */
      const step = Math.max(1, Math.min(9, Number(a.step) || 3));
      if (a.command === "左移") r.x = Math.max(2, r.x - step);
      if (a.command === "右移") r.x = Math.min(98, r.x + step);
      if (a.command === "前进") r.y = Math.max(2, r.y - step);
      if (a.command === "后退") r.y = Math.min(98, r.y + step);
      detail = `${r.id} ${a.command} · 当前位置 ${Math.round(r.x)}, ${Math.round(r.y)}`;
      break;
    }
    case "SURVEY_CAPTURE": {
      const m = map();
      must(a.pointType, "请选择踩点点位类型");
      const rec = {
        id: id("SS"),
        mapId: m.id,
        offline: !!a.offline,
        synced: !a.offline,
        pointType: a.pointType,
        deviceCode: a.deviceCode,
        target: a.target,
        viewDir: a.viewDir,
        ptzPreset: a.ptzPreset,
        photo: a.photo,
        remark: a.remark,
        x: Number.isFinite(a.x) ? a.x : 50,
        y: Number.isFinite(a.y) ? a.y : 50,
      };
      s.siteSurveys = [rec, ...(s.siteSurveys || [])];
      object = rec.id;
      detail = `现场踩点已记录（${a.pointType}${a.offline ? " · 离线待同步" : ""}）`;
      break;
    }
    case "SURVEY_SYNC": {
      const pending = (s.siteSurveys || []).filter((x) => x.offline && !x.synced);
      must(pending.length, "没有待同步的离线踩点记录");
      pending.forEach((x) => (x.synced = true));
      detail = `已同步 ${pending.length} 条离线踩点记录`;
      break;
    }
    case "TRACK_RECORD": {
      const m = map();
      const samples = s.trackSamples || [];
      const seq = samples.filter((x) => x.mapId === m.id).length + 1;
      const sample = {
        id: id("TS"),
        mapId: m.id,
        x: Number.isFinite(a.x) ? a.x : 50,
        y: Number.isFinite(a.y) ? a.y : 50,
        kind: a.kind || "停靠点",
        seq,
      };
      s.trackSamples = [...samples, sample];
      // 轨迹属于地图内容：推进空间版本 → 同步状态派生为「未同步」，等重新下发给旧版本机器
      m.version++;
      m.updatedAt = now();
      logVersion(m, `轨迹记录（${sample.kind} · 第 ${seq} 点）`);
      object = sample.id;
      detail = `轨迹已记录（${sample.kind} · 第 ${seq} 点）`;
      break;
    }
    case "ANNOTATE": {
      const m = map();
      must(
        a.name && a.device && a.requirement,
        "请完整填写点位名称、所属设备与采集要求",
      );
      // v3：设备与检测对象只能来自设备主数据（标注页可「＋快速新建」即时落库），不再手工输入设备名
      const dev = deviceOf(s, a.device);
      must(dev, "所选设备不在设备主数据中，请选择设备或先快速新建");
      // 「看什么」多选：一次停靠可覆盖多个检测对象（一个停靠位覆盖多设备/多目标的落地处）
      const objects: string[] = (
        a.objects?.length ? a.objects : [a.object]
      ).filter((x: string) => dev!.items.some((it) => it.target === x));
      must(
        objects.length,
        `请至少选择一个检测对象（来自设备「${dev!.name}」的清单）`,
      );
      const old = s.points.find((p) => p.id === a.pointId);
      // 巡检点来自独立标定数据（与地图分开放）
      const cal = ensureCalibration(s, m.id);
      const target = cal.targets.find((t) => t.id === a.targetId);
      must(target, "请选择已标定的巡检点或人工新增巡检点");
      const pid = old?.id || id("P");
      // 逻辑点（阶段④）：不暴露给用户，按「一次停靠覆盖 N 个检测对象」自动派生；
      // 重建前先清掉本点位旧记录，保证重复标注幂等
      const kept = (s.logicalPoints || []).filter(
        (x) => x.physicalPointId !== pid,
      );
      const created = objects.map((obj) => ({
        id: id("LP"),
        deviceId: dev!.id,
        itemIds: [dev!.items.find((it) => it.target === obj)!.id],
        region: m.region,
        locateState: "已落位" as const,
        physicalPointId: pid,
        locateOrigin: (a.origin || "人工新增") as CandidateOrigin,
      }));
      s.logicalPoints = [...kept, ...created];
      const primary = dev!.items.find((it) => it.target === objects[0])!;
      const p: Point = {
        id: pid,
        name: a.name,
        device: dev!.name,
        object: objects[0],
        item: a.item || defaultInspectItemName(objects[0]),
        unit: a.unit ?? primary.unit,
        kind: target!.kind,
        requirement: a.requirement,
        mapId: m.id,
        targetId: target!.id,
        x: target!.x,
        y: target!.y,
        // 标注工作台打点：需自主验证通过后才转「已启用」
        state: "停用",
        // 「怎么看」与标注同一入口保存（不再另开"动作编排"页面）
        actionPlan: a.actionPlan || old?.actionPlan,
        pose: a.pose || old?.pose || { x: target!.x, y: target!.y, yaw: 0 },
        taught: a.taught ?? old?.taught,
        logicalIds: created.map((x) => x.id),
      };
      if (old) s.points = s.points.map((q) => (q.id === old.id ? p : q));
      else s.points.push(p);
      target!.state = "已确认";
      target!.pointId = p.id;
      cal.updatedAt = now();
      object = p.id;
      detail = `已标注点位（一次停靠覆盖 ${created.length} 个检测对象）`;
      break;
    }
    case "ADD_TARGET": {
      const m = map();
      const cal = ensureCalibration(s, m.id);
      // 现场新增的巡检点：来源标记为"平台新增"，与随地图文件带入的定位ID区分开
      cal.targets.push({
        id: id("O"),
        source: "平台新增",
        externalId: a.externalId,
        kind: a.kind || "仪表",
        x: a.x || 50,
        y: a.y || 48,
        state: "待确认",
        // 标定工作台的点参数（点类型 / 楼层 / 楼层连接点）
        pointType: a.pointType || "停靠点",
        floor: Number(a.floor ?? 0),
        floorLink: Number(a.floorLink ?? 0),
      });
      cal.updatedAt = now();
      object = cal.id;
      detail = `已新增巡检点`;
      break;
    }
    /**
     * 修改定位点的标定参数（标定工作台侧边参数面板）
     * @description 只动点类型 / 楼层 / 楼层连接点，不改坐标与业务绑定
     */
    case "UPDATE_TARGET": {
      const m = map();
      const t = targetsOf(s, m.id).find((x) => x.id === a.targetId);
      must(t, "定位点不存在");
      if (a.pointType !== undefined) t!.pointType = String(a.pointType);
      if (a.floor !== undefined) t!.floor = Number(a.floor) || 0;
      if (a.floorLink !== undefined) t!.floorLink = Number(a.floorLink) || 0;
      object = t!.id;
      detail = `定位点「${t!.externalId || t!.id}」参数已更新`;
      break;
    }
    case "UPLOAD_REFERENCE": {
      const m = map();
      const target = targetsOf(s, m.id).find((t) => t.id === a.targetId);
      must(target && target.state !== "已剔除", "请先选择有效目标");
      must(typeof a.dataUrl === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(a.dataUrl), "请选择 PNG、JPG 或 WebP 图片");
      must(a.dataUrl.length <= 700000, "图片过大，请选择 500 KB 以内的图片");
      // 参考图像存储占用按**全部标定数据**统计（参考图挂在标定点上，不在地图上）
      const used = (s.mapCalibrations || [])
        .flatMap((c) => c.targets)
        .filter((t) => t !== target)
        .reduce((total, t) => total + (t.referenceImage?.dataUrl.length || 0), 0);
      must(used + a.dataUrl.length <= 2000000, "演示环境图片存储空间不足，请压缩图片后再上传");
      target!.referenceImage = { name: a.name, dataUrl: a.dataUrl, uploadedAt: new Date().toISOString() };
      object = target!.id;
      detail = `人工上传参考图像：${a.name}`;
      break;
    }
    case "DISCARD_TARGET": {
      const m = map();
      const cal = ensureCalibration(s, m.id);
      const t = cal.targets.find((t) => t.id === a.targetId)!;
      must(t, "巡检点不存在");
      must(!t.pointId, "已关联业务点位的巡检点请先维护点位");
      t.state = "已剔除";
      cal.updatedAt = now();
      // 同步清理本图路网中对该定位点的引用，避免父线出现悬空节点
      const keptPaths =
        m.roadnet?.paths
          .map((v) => ({ ...v, pointIds: v.pointIds.filter((pid) => pid !== a.targetId) }))
          .filter((v) => v.pointIds.length >= 2) || [];
      m.roadnet = { paths: keptPaths };
      object = a.targetId;
      detail = `定位点「${t.externalId || t.id}」已删除，并清理关联父线`;
      break;
    }
    /**
     * 巡检点标定保存（**独立标定模块**，与地图分开放）：
     * 整表替换该地图的巡检点集合，并把坐标变更同步到已绑定业务点位。
     * @description 不改变地图空间版本、也不把地图打回「未同步」——点位与地图解耦。
     */
    case "SAVE_MAP_CALIBRATION": {
      const m = map();
      must(Array.isArray(a.targets), "巡检点标定数据格式错误");
      const cal = ensureCalibration(s, m.id);
      cal.targets = a.targets;
      cal.updatedAt = now();
      s.points
        .filter((p) => p.mapId === m.id)
        .forEach((p) => {
          const t = cal.targets.find((t) => t.id === p.targetId);
          if (t) {
            p.x = t.x;
            p.y = t.y;
            if (t.world) p.world = t.world;
          }
        });
      object = cal.id;
      detail = `已保存 ${cal.targets.length} 个巡检点（与地图分开存储）`;
      break;
    }
    /**
     * 导入「巡检点标定文件」（同一次现场采集产出的第二件）：
     * 解析出的定位点按**定位 ID** 合并进目标地图的标定数据；
     * 地图尚未就绪时可**暂存**，待地图上传后再绑定（MAP-02 修改要点 4）。
     */
    case "IMPORT_POINT_CALIBRATION": {
      const rows = (a.points || []) as ParsedCalibrationPoint[];
      must(rows.length, "标定文件里没有解析到定位点");
      const at = now();
      if (!a.mapId || a.pending) {
        s.pendingCalibration = {
          file: a.file || "巡检点标定文件",
          // 来源机器人（机器狗）：上传前必填，仅作数据归属记录
          robotId: a.robotId || undefined,
          points: rows,
          at,
        };
        object = a.file || "待绑定标定文件";
        detail = `标定文件已暂存（${rows.length} 个定位点），待点云地图就绪后再绑定`;
        break;
      }
      const m = map();
      const cal = ensureCalibration(s, m.id);
      const { added, rebound } = mergeCalibrationPoints(cal, rows);
      cal.file = a.file || cal.file;
      // 来源机器人只作归属记录，不改变标定数据的定位语义
      cal.robotId = a.robotId || cal.robotId;
      cal.importedAt = at;
      cal.updatedAt = at;
      object = cal.id;
      detail = `已导入巡检点标定文件（新增 ${added} · 按定位ID重绑 ${rebound}），与地图分开存储`;
      break;
    }
    /** 把暂存的标定文件绑定到某张已上传的点云地图 */
    case "BIND_PENDING_CALIBRATION": {
      const pending = s.pendingCalibration;
      must(pending && pending.points.length, "没有待绑定的标定文件");
      const m = map();
      const cal = ensureCalibration(s, m.id);
      const { added, rebound } = mergeCalibrationPoints(cal, pending.points);
      cal.file = pending.file;
      // 绑定暂存文件时，把来源机器人一并落到标定数据上
      cal.robotId = pending.robotId ?? cal.robotId;
      cal.importedAt = pending.at;
      cal.updatedAt = now();
      s.pendingCalibration = undefined;
      object = cal.id;
      detail = `标定文件已绑定到「${m.name}」（新增 ${added} · 按定位ID重绑 ${rebound}）`;
      break;
    }
    /** 放弃暂存的标定文件 */
    case "DISCARD_PENDING_CALIBRATION": {
      must(s.pendingCalibration, "没有待绑定的标定文件");
      s.pendingCalibration = undefined;
      object = "待绑定标定文件";
      detail = "已放弃待绑定的标定文件";
      break;
    }
    case "PUBLISH": {
      const m = map();
      // 单级发布：平台不区分"试验版 / 正式版"，定版即当前内容
      publishMap(s, m);
      object = m.id;
      detail = "当前地图内容已定版发布";
      break;
    }
    case "SYNC": {
      const m = map();
      ensureContentReady(s, m);
      pushSync(s, m, robot());
      detail = `已下发「${m.name}」地图第 ${m.version} 版`;
      break;
    }
    case "SYNC_BATCH": {
      const m = map();
      const ids: string[] = a.robotIds || [];
      must(ids.length, "请至少选择一台设备");
      // 先逐台校验再统一定版：避免"定版成功但下发被拒"的半截状态
      const targets = ids.map((rid) => {
        const r = s.robots.find((x) => x.id === rid);
        must(r, `设备 ${rid} 不存在`);
        return r!;
      });
      ensureContentReady(s, m);
      targets.forEach((r) => pushSync(s, m, r));
      object = m.id;
      detail = `已向 ${targets.length} 台设备下发「${m.name}」地图第 ${m.version} 版`;
      break;
    }
    case "SYNC_STEP": {
      const sy = s.syncs.find((x) => x.id === a.id)!;
      const r = robot(sy.robotId);
      must(
        s.syncs.find((x) => x.robotId === r.id)?.id === sy.id,
        "旧同步回执已失效",
      );
      if (a.fail) {
        sy.state = "失败";
        sy.reason = "模拟网络中断，机器人保留原激活版本";
        break;
      }
      if (sy.state === "失败") {
        sy.state = "传输中";
        sy.reason = "";
        break;
      }
      if (sy.state === "传输中") sy.state = "校验中";
      else if (sy.state === "校验中") sy.state = "待激活";
      else if (sy.state === "待激活") {
        must(
          !r.current && r.state === "空闲",
          "机器人任务或维护窗口冲突，结束任务后再激活",
        );
        sy.state = "已同步";
        r.region = s.maps.find((mm) => mm.id === sy.mapId)?.region || r.region;
        r.mapId = sy.mapId;
        r.mapVersion = sy.mapVersion;
      }
      break;
    }
    case "VALIDATE": {
      const p = s.points.find((p) => p.id === a.id)!;
      const m = s.maps.find((m) => m.id === p.mapId)!;
      const r = robot();
      must(r.state === "空闲", "验证机器人必须空闲");
      must(
        r.mapId === m.id && r.mapVersion === m.version,
        "请先将当前地图同步并激活",
      );
      const need = captureKindsOfPoint(s, p);
      must(
        need.every((k) => r.capabilities.includes(k)),
        `验证机器人不具备该点位的采集方式（需要 ${need.join(" / ")}）`,
      );
      if (a.fail) {
        p.validated = undefined;
        p.state = "停用";
        p.validationFailure = `${r.id} / 地图第 ${m.version} 版：目标身份未确认（模拟失败），请修正标注后重新验证`;
        break;
      }
      p.validationFailure = undefined;
      p.state = "已启用";
      p.validated = `${r.id} / 能力第 2 版 / 地图第 ${m.version} 版 / 目标身份与采集质量通过（模拟）`;
      break;
    }
    case "CHANGE_ADD":
      s.changes.unshift({
        id: id("CH"),
        mapId: a.mapId,
        pointId: a.pointId,
        type: a.kind,
        source: "人工登记",
        note: a.reason,
        state: "待确认",
      });
      break;
    case "CHANGE_CONFIRM": {
      const c = s.changes.find((c) => c.id === a.id)!;
      must(c.state === "待确认", "仅待确认变化可受理");
      c.state = "维护中";
      break;
    }
    case "CHANGE_REVISION": {
      const c = s.changes.find((c) => c.id === a.id)!;
      must(c.state === "维护中", "请先确认变化");
      must(a.file || c.type === "仅业务属性变更", "空间变化须导入修订地图文件");
      const m = s.maps.find((m) => m.id === c.mapId)!;
      m.version++;
      m.syncState = "未同步";
      m.updatedAt = now();
      if (a.file) m.file = a.file;
      logVersion(m, `修订来源：${c.id}，原始资料保持归档`);
      c.version = m.version;
      c.state = "待同步";
      break;
    }
    case "CHANGE_CLOSE": {
      const c = s.changes.find((c) => c.id === a.id)!;
      const m = s.maps.find((m) => m.id === c.mapId)!;
      must(
        c.state === "待同步" && m.syncState === "已同步",
        "请完成修订、验证与正式发布",
      );
      must(
        s.robots
          .filter((r) => r.mapId === m.id)
          .every((r) => r.mapVersion === m.version),
        "已绑定该地图的机器人尚未全部同步",
      );
      c.state = "已完成";
      break;
    }
    case "SAVE_TEMPLATE": {
      must(a.name && a.points?.length, "请输入巡检路线名称并选择巡检点");
      // 路线只是一个巡检点序列，不绑定地图（地图只用于把点位与线路画出来）：
      // 这里只校验点位本身存在，跨图点位照常保存；
      // 「一台机器人一次只跑一张图」是执行侧的口径，由 createTask 在生成任务时把关
      const routePoints = (a.points as string[])
        .map((pid) => s.points.find((x) => x.id === pid))
        .filter(Boolean) as Point[];
      must(routePoints.length === a.points.length, "所选巡检点不存在或已删除");
      const old = s.templates.find((t) => t.id === a.id);
      /** 路线方式：缺省预设路线（老数据与「新建路线」默认） */
      const mode: RouteMode = (a.mode as RouteMode) || old?.mode || "预设路线";
      const path = mode === "自建路线" ? ((a.path as RouteNode[]) || []) : undefined;
      must(
        mode !== "自建路线" || (path as RouteNode[]).length >= 2,
        "自建路线至少需要两个路径点（请在预览图上依次点选巡检点）",
      );
      /**
       * 自建线路是否变动
       * @description 线路没动（例如只改名称）时保留既有验证结论；线路一变就必须重跑导航验证，
       *              否则「停用 → 导航验证 → 启用」这道门槛形同虚设
       */
      const pathChanged =
        mode === "自建路线" &&
        JSON.stringify(path) !== JSON.stringify(old?.path || undefined);
      /** 预设路线走的是已验证路网，视为已通过；自建路线按验证结论落库 */
      const verified =
        mode !== "自建路线" ? true : pathChanged ? false : !!old?.verified;
      const t: Template = {
        id: old?.id || id("TMP"),
        name: a.name,
        points: a.points,
        end: a.end || "返航",
        // 自建路线不走预设路线路网，保存后一律落「停用」：须经机器导航验证可行后由用户启用
        state: mode === "自建路线" ? "停用" : a.state || old?.state || "启用",
        version: (old?.version || 0) + 1,
        mode,
        path,
        verified,
        verifiedBy: pathChanged ? undefined : old?.verifiedBy,
        verifiedAt: pathChanged ? undefined : old?.verifiedAt,
        // 每次保存都刷新「更新时间」（路线列表展示）
        updatedAt: now(),
      };
      s.templates = old
        ? s.templates.map((x) => (x.id === old.id ? t : x))
        : [t, ...s.templates];
      object = t.id;
      break;
    }
    case "TOGGLE_TEMPLATE_STATE": {
      const t = s.templates.find((x) => x.id === a.id);
      must(t, "巡检路线不存在或已删除");
      if (t.state === "启用") {
        const used = s.plans.filter(
          (p) => p.templateId === a.id && p.state === "启用",
        );
        must(used.length === 0, "该巡检路线仍有启用的计划引用，请先停用相关计划");
      } else {
        // 自建路线不走预设路线路网，启用前必须完成导航验证（可行才允许投用）
        must(
          t.mode !== "自建路线" || t.verified,
          "自建路线须先完成导航验证（路线列表 › 导航）",
        );
      }
      t.state = t.state === "启用" ? "停用" : "启用";
      object = t.id;
      detail =
        t.state === "停用"
          ? `巡检路线「${t.name}」已停用，不再用于生成新任务`
          : `巡检路线「${t.name}」已启用`;
      break;
    }
    case "VERIFY_ROUTE": {
      const t = s.templates.find((x) => x.id === a.id);
      must(t, "巡检路线不存在或已删除");
      must(t.mode === "自建路线", "仅自建路线需要导航验证");
      const robot = s.robots.find((r) => r.id === a.robotId);
      must(robot, "请选择执行验证的机器人设备");
      t.verified = true;
      t.verifiedBy = robot.id;
      t.verifiedAt =
        a.at || new Date().toISOString().slice(0, 16).replace("T", " ");
      break;
    }
    case "DELETE_TEMPLATE": {
      const t = s.templates.find((x) => x.id === a.id);
      must(t, "巡检路线不存在或已删除");
      const used = s.plans.filter((p) => p.templateId === a.id);
      must(used.length === 0, "该巡检路线已被巡检计划引用，请先解除引用再删除");
      s.templates = s.templates.filter((x) => x.id !== a.id);
      break;
    }
    case "SAVE_PLAN": {
      const bound = s.robots.find((r) => r.id === a.robotId);
      must(bound, "请选择执行机器人");
      must(
        !bindingReasons(s, a.templateId, bound!).length,
        bindingReasons(s, a.templateId, bound!).join("；"),
      );
      must(
        /^\d{2}:\d{2}$/.test(a.time) &&
          Number(a.time.slice(0, 2)) < 24 &&
          Number(a.time.slice(3)) < 60,
        "请填写有效执行时间",
      );
      must(
        [a.advance, a.timeout, a.wait].every(
          (v) => Number.isFinite(+v) && +v >= 0,
        ),
        "时间参数必须为非负数",
      );
      // 执行方式：周期任务（区间内按周期循环）/ 定时任务（指定日期执行一次）
      const kind: PlanKind = planKinds.includes(a.kind as PlanKind)
        ? (a.kind as PlanKind)
        : "周期任务";
      // 执行周期：只认 月 / 天 / 时 三档，缺失或越界按「每天」兜底
      const cycle: PlanCycle = planCycles.includes(a.cycle as PlanCycle)
        ? (a.cycle as PlanCycle)
        : "每天";
      /**
       * 新口径：周期任务按「间隔单位 + 执行间隔 + 每日时段」排程
       * @description 单位缺失即走老口径（月 / 天 / 时），兼容历史计划
       */
      const unit: PlanUnit | undefined =
        kind === "周期任务" && planUnits.includes(a.unit as PlanUnit)
          ? (a.unit as PlanUnit)
          : undefined;
      if (unit) {
        const max = planUnitMax[unit];
        must(
          Number.isInteger(+a.interval) &&
            +a.interval >= 1 &&
            +a.interval <= max,
          `执行间隔需在 1-${max} ${unit}之间`,
        );
        must(
          /^\d{2}:\d{2}$/.test(String(a.fromTime || "")) &&
            /^\d{2}:\d{2}$/.test(String(a.toTime || "")) &&
            String(a.fromTime) < String(a.toTime),
          "结束时间需晚于开始时间",
        );
      }
      must(
        kind !== "定时任务" || /^\d{4}-\d{2}-\d{2}$/.test(String(a.start || "")),
        "请选择定时任务的执行日期",
      );
      // 定时任务的「执行日期」是唯一有效日：有效期首尾取同一天，避免"区间内只跑一次"的歧义
      const start = String(a.start || "");
      const end = kind === "定时任务" ? start : String(a.end || "");
      must(
        a.name && a.templateId && start && end && start <= end,
        "请填写计划、巡检路线及有效日期",
      );
      const old = s.plans.find((p) => p.id === a.id);
      const p: Plan = {
        id: old?.id || id("PL"),
        name: a.name,
        kind,
        templateId: a.templateId,
        robotId: a.robotId,
        cycle,
        ...(unit
          ? {
              unit,
              interval: +a.interval,
              fromTime: String(a.fromTime),
              toTime: String(a.toTime),
            }
          : {}),
        start,
        end,
        // 新口径下 time 取时段起点，老口径仍用「执行时间」
        time: unit ? String(a.fromTime) : a.time,
        advance: +a.advance,
        timeout: +a.timeout,
        wait: +a.wait,
        state: "启用",
        version: (old?.version || 0) + 1,
      };
      s.plans = old
        ? s.plans.map((x) => (x.id === old.id ? p : x))
        : [p, ...s.plans];
      object = p.id;
      break;
    }
    case "GENERATE": {
      const p = s.plans.find((p) => p.id === a.id)!;
      must(p?.state === "启用", "计划未启用（已停用）");
      const r = s.robots.find((r) => r.id === p.robotId);
      must(r, "旧计划待绑定机器人，请编辑后启用自动执行");
      const now = a.now ?? Date.now();
      const slot = a.scheduledAt || new Date(now).toISOString();
      const key = a.scheduledAt
        ? String(Date.parse(slot))
        : new Date(now).toISOString().slice(0, 10) + p.time;
      must(
        !s.tasks.some((t) => t.planId === p.id && t.scheduleKey === key),
        "该计划时段已生成任务，请勿重复生成",
      );
      const template = s.templates.find((t) => t.id === p.templateId)!;
      must(template?.state === "启用", "巡检路线已停用");
      const t = createTask(
        p.name,
        template.points,
        "计划生成",
        undefined,
        p,
      );
      Object.assign(t, {
        robotId: r!.id,
        state: "已分配",
        scheduleKey: key,
        notBefore: slot,
        allowedWait: p.wait,
        autoRun: true,
        expectedAt: slot,
        deadline: new Date(
          Date.parse(slot) + (p.wait + p.timeout) * 60000,
        ).toISOString(),
      });
      t.blockedReason = constraints(s, t, r!).join("；") || undefined;
      p.lastGenerated = key;
      p.generationError = undefined;
      detail = `计划自动生成，绑定 ${r!.id}；${fmtDate(new Date(slot))} 起执行`;
      break;
    }
    case "STOP_PLAN": {
      const p = s.plans.find((x) => x.id === a.id);
      must(p, "计划不存在或已删除");
      must(p.state !== "停用", "该计划已停用");
      p.state = "停用";
      detail = `巡检计划 ${p.id} · ${p.name} 已停用，停止后续自动生成任务`;
      object = p.id;
      break;
    }
    case "START_PLAN": {
      const p = s.plans.find((x) => x.id === a.id);
      must(p, "计划不存在或已删除");
      must(p.state !== "启用", "该计划已在执行中");
      p.state = "启用";
      detail = `巡检计划 ${p.id} · ${p.name} 已恢复执行，按时自动生成任务`;
      object = p.id;
      break;
    }
    case "AUTO_EXPIRE": {
      const t = task();
      t.state = "超期";
      t.blockedReason = "超过计划允许等待时间，请人工处理或重建任务";
      break;
    }
    /**
     * 超期补派
     * @description 超期是留档的终点，**不复活原任务**：基于它的快照新建一条任务，
     *              截止时间从当前时刻重新计时，并与原任务双向记录溯源
     */
    case "RETRY_TASK": {
      const old = task();
      must(old.state === "超期", "只有超期任务可以重新派单");
      must(!old.retriedBy, `该任务已补派为 ${old.retriedBy}`);
      const due = new Date(retryDeadlineOf(s, old));
      const pad = (n: number) => String(n).padStart(2, "0");
      const nt: Task = {
        ...structuredClone(old),
        id: nextTaskId(s.tasks),
        // 名字带「（补派）」，否则新旧两条同名，列表里根本分不清哪条是这一次
        name: old.name.replace(/（补派）$/, "") + "（补派）",
        source: "超期补派",
        state: "待调度",
        retryOf: old.id,
        retriedBy: undefined,
        created: now(),
        deadline: `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())} ${pad(due.getHours())}:${pad(due.getMinutes())}`,
        // 以下都是「这一次执行」留下的痕迹，补派是全新一次跑，全部清空
        scheduleKey: undefined,
        expectedAt: undefined,
        notBefore: undefined,
        startedAt: undefined,
        finishedAt: undefined,
        dispatchId: undefined,
        blockedReason: undefined,
        preemptedTaskId: undefined,
        failure: undefined,
        nextReportAt: undefined,
        stage: 0,
        index: 0,
        done: [],
        skipped: [],
        retries: 0,
      };
      // 原机器人此刻能接就自动绑定，接不了就退回未分配、进「待安排」等人改派
      const r = s.robots.find((x) => x.id === old.robotId);
      if (r) {
        // 与 ASSIGN 同口径：地图版本待同步可在下发后同步，不作为拦截项
        const reasons = constraints(s, nt, r).filter(
          (x) => x !== "地图版本待同步",
        );
        if (!reasons.length) {
          nt.robotId = r.id;
          nt.state = "已分配";
        } else {
          nt.robotId = undefined;
          nt.blockedReason = reasons.join("；");
        }
      }
      s.tasks.unshift(nt);
      old.retriedBy = nt.id;
      object = nt.id;
      detail = `${old.id} 已留档，补派为 ${nt.id}（${nt.robotId || "待分配"}）`;
      break;
    }
    case "CREATE_TASK":
      createTask(
        a.name,
        a.points,
        "人工临时",
        undefined,
        undefined,
        a.taskType,
        a.atomicActions,
      );
      break;
    case "QUICK_DISPATCH": {
      must(a.atomicActions?.length, "请至少选择一个原子动作");
      const t = createTask(
          a.name,
          a.points,
          "执行监控临时下发",
          undefined,
          undefined,
          a.taskType,
          a.atomicActions,
        ),
        r = robot();
      const reasons = constraints(s, t, r);
      must(!reasons.length, reasons.join("；"));
      t.robotId = r.id;
      t.dispatchId = id("DSP");
      t.state = "待执行";
      detail = `${t.taskType} · ${t.atomicActions.join(" / ")}；${r.id} 已接收并进入待执行队列`;
      break;
    }
    case "ASSIGN": {
      const t = task(),
        r = robot();
      must(
        // 超期是留档终点，不再参与派单：要继续干请走 RETRY_TASK 生成补派任务
        ["待调度", "已分配"].includes(t.state),
        t.state === "超期"
          ? "超期任务已留档，请用「重新派单」生成补派任务"
          : "已接收任务须先确认撤回后再改派",
      );
      const reasons = constraints(s, t, r).filter(
        (x) => x !== "地图版本待同步",
      );
      must(!reasons.length, reasons.join("；"));
      t.robotId = r.id;
      t.state = "已分配";
      break;
    }
    case "DISPATCH": {
      const t = task(),
        r = robot(t.robotId);
      must(t.state === "已分配", "请先排队分配");
      must(
        !constraints(s, t, r, false, a.now ?? Date.now()).length,
        constraints(s, t, r, false, a.now ?? Date.now()).join("；"),
      );
      t.dispatchId = id("DSP");
      t.state = "下发中";
      break;
    }
    case "RECEIPT": {
      const t = task();
      must(t.state === "下发中", "当前没有待确认下发");
      t.state = "待执行";
      break;
    }
    case "ENQUEUE": {
      // 加入队列：一次性把待派单任务分配并下发至机器人预执行队列，机器人空闲则直接开跑
      const t = task(),
        r = robot();
      must(
        // 超期已留档，必须走「重新派单」生成补派任务
        ["待调度", "已分配"].includes(t.state),
        t.state === "超期"
          ? "超期任务已留档，请用「重新派单」生成补派任务"
          : "任务不是待派单状态",
      );
      const reasons = constraints(s, t, r);
      must(!reasons.length, reasons.join("；"));
      t.robotId = r.id;
      t.dispatchId = id("DSP");
      t.state = "待执行";
      if (
        !r.current &&
        (!t.notBefore || Date.parse(t.notBefore) <= (a.now ?? Date.now()))
      ) {
        must(
          !constraints(s, t, r, true).length,
          constraints(s, t, r, true).join("；"),
        );
        t.state = "执行中";
        t.startedAt ||= new Date().toISOString();
        r.current = t.id;
        r.state = "执行中";
        detail = `${t.id} 已加入 ${r.id} 队列并立即执行`;
      } else {
        detail = `${t.id} 已加入 ${r.id} 队列，等待当前任务结束后执行`;
      }
      break;
    }
    case "DISPATCH_NOW": {
      // 立即执行：与「加入队列」同一原子链路，仅语义强调即时下发（机器人忙碌时同样回落为排队）
      const t = task(),
        r = robot();
      must(
        ["待调度", "已分配"].includes(t.state),
        t.state === "超期"
          ? "超期任务已留档，请用「重新派单」生成补派任务"
          : "任务不是待派单状态",
      );
      const reasons = constraints(s, t, r);
      must(!reasons.length, reasons.join("；"));
      t.robotId = r.id;
      t.dispatchId = id("DSP");
      t.state = "待执行";
      if (
        !r.current &&
        (!t.notBefore || Date.parse(t.notBefore) <= (a.now ?? Date.now()))
      ) {
        must(
          !constraints(s, t, r, true).length,
          constraints(s, t, r, true).join("；"),
        );
        t.state = "执行中";
        t.startedAt ||= new Date().toISOString();
        r.current = t.id;
        r.state = "执行中";
        detail = `${t.id} 已立即下发并由 ${r.id} 执行`;
      } else {
        detail = `${t.id} 已下发至 ${r.id}，当前任务结束后续执行`;
      }
      break;
    }
    case "WITHDRAW": {
      const t = task();
      must(
        ["已分配", "待执行"].includes(t.state),
        "下发中的任务请等机器人回执后再撤回；执行中的任务请用「终止」",
      );
      must(a.confirmed, "必须确认机器人未执行且已撤回");
      t.state = "待调度";
      t.robotId = undefined;
      t.dispatchId = undefined;
      break;
    }
    case "REASSIGN": {
      const t = task(),
        r = robot();
      must(
        ["已分配", "待执行"].includes(t.state),
        "下发中的任务请等机器人回执后再改派；执行中的任务请用「终止」",
      );
      must(a.confirmed, "须先确认撤回");
      const reasons = constraints(s, t, r).filter(
        (x) => x !== "地图版本待同步",
      );
      must(!reasons.length, reasons.join("；"));
      detail = `${t.robotId} 撤回已确认，改派至 ${r.id}`;
      t.robotId = r.id;
      t.dispatchId = undefined;
      t.state = "已分配";
      break;
    }
    case "REORDER": {
      const t = task();
      must(["已分配", "待执行"].includes(t.state), "只能调整未执行队列");
      const i = s.tasks.indexOf(t);
      s.tasks.splice(i, 1);
      if (a.beforeId) {
        const before = s.tasks.find((x) => x.id === a.beforeId);
        must(
          before &&
            before.robotId === t.robotId &&
            ["已分配", "待执行"].includes(before.state),
          "只能在同一机器人预排队列中调序",
        );
        s.tasks.splice(s.tasks.indexOf(before!), 0, t);
      } else s.tasks.unshift(t);
      detail = "机器人队列顺序已确认调整，后续任务按新顺序执行";
      break;
    }
    case "PREEMPT": {
      const t = task(),
        r = robot();
      must(!constraints(s, t, r).length, constraints(s, t, r).join("；"));
      const old = s.tasks.find((x) => x.id === r.current);
      must(old?.state === "执行中", "没有可抢占的执行任务");
      old!.state = "暂停";
      r.current = undefined;
      r.state = "空闲";
      t.robotId = r.id;
      t.preemptedTaskId = old!.id;
      t.state = "已分配";
      detail = `已确认暂停 ${old!.id}，保留断点；新任务等待下发`;
      break;
    }
    case "START": {
      const t = task(),
        r = robot(t.robotId);
      // TKO-04：被接管的任务需显式「恢复任务」回到执行中
      must(
        ["待执行", "暂停", "已被接管"].includes(t.state),
        "任务尚未接收或不在可恢复状态",
      );
      must(
        !constraints(s, t, r, true, a.now ?? Date.now()).length,
        constraints(s, t, r, true, a.now ?? Date.now()).join("；"),
      );
      const releasedSession = s.sessions.find(x => x.taskId === t.id && x.robotId === r.id);
      if (["暂停", "已被接管"].includes(t.state) && releasedSession?.state === "已释放" && !releasedSession.resumedAt)
        releasedSession.resumedAt = new Date(a.now ?? Date.now()).toISOString();
      t.state = "执行中";
      t.startedAt ||= new Date(a.now ?? Date.now()).toISOString();
      t.nextReportAt = (a.now ?? Date.now()) + 3500;
      r.current = t.id;
      r.state = "执行中";
      break;
    }
    case "PAUSE": {
      const t = task();
      must(t.state === "执行中", "任务未在执行");
      t.state = "暂停";
      robot(t.robotId).state = "暂停";
      break;
    }
    case "CANCEL": {
      // 取消：只作用于还没绑机器人的任务，直接落终态，不产生任何机器人指令
      const t = task();
      must(t.state === "待调度", "只有待调度任务可以取消；已绑机器人请用「撤回」");
      t.state = "取消";
      break;
    }
    case "STOP": {
      // 终止：只作用于执行阶段（执行中 / 暂停 / 已被接管），已产生的点位与告警保留不回撤
      const t = task();
      must(
        ["执行中", "暂停", "已被接管"].includes(t.state),
        "只有执行中 / 暂停 / 已被接管的任务可以终止；未执行请用取消或撤回",
      );
      t.stopReason = String(a.reason || "").trim() || undefined;
      t.state = t.done.length ? "部分完成" : "取消";
      if (t.robotId) {
        const r = robot(t.robotId);
        if (r.current === t.id) {
          r.current = undefined;
          r.state = "空闲";
        }
      }
      break;
    }
    case "DELETE_TASK": {
      const t = task();
      must(t.state !== "执行中", "执行中任务不可删除，请先暂停");
      // 解绑机器人当前任务引用，避免删除后残留悬空任务 ID
      s.robots.forEach((r) => {
        if (r.current === t.id) {
          r.current = undefined;
          r.state = "空闲";
        }
      });
      s.tasks = s.tasks.filter((x) => x.id !== t.id);
      object = t.id;
      detail = `已删除任务 ${t.id} · ${t.name}`;
      break;
    }
    case "TASK_FINISHED": {
      const t = task();
      must(t.state === "执行中", "任务不在执行中");
      t.items
        .filter((p) => !t.done.includes(p.id) && !t.skipped.includes(p.id))
        .forEach((p) => t.skipped.push(p.id));
      t.state =
        t.done.length === t.items.length
          ? "完成"
          : t.done.length
            ? "部分完成"
            : "失败";
      t.finishedAt = new Date().toISOString();
      const r = robot(t.robotId);
      r.current = undefined;
      r.state = "空闲";
      settleStopping(r);
      continueQueue(s, r);
      detail = `TASK_FINISHED 已收到；有效检测项 ${t.done.length}/${t.items.length}，平台判定 ${t.state}`;
      break;
    }
    case "FAIL": {
      const t = task();
      must(t.state === "执行中", "任务未执行");
      t.failure = a.reason || "目标歧义";
      break;
    }
    case "RETRY": {
      const t = task();
      must(t.failure && t.retries < 2, "重试已耗尽，请接管或跳过");
      t.retries++;
      t.failure = undefined;
      t.stage = 1;
      break;
    }
    case "TICK":
    case "SKIP": {
      const t = task(),
        r = robot(t.robotId);
      must(t.state === "执行中" && r.state === "执行中", "机器人未在自主执行");
      must(
        !constraints(s, t, r, true, a.now ?? Date.now()).length,
        constraints(s, t, r, true, a.now ?? Date.now()).join("；"),
      );
      t.nextReportAt = (a.now ?? Date.now()) + 3500;
      if (a.type === "TICK") {
        must(!t.failure, "请先处理执行异常");
        if (t.stage < stages.length - 1) {
          t.stage++;
          r.x = Math.min(85, r.x + 2);
          detail = stages[t.stage];
          break;
        }
      }
      const p = t.items[t.index];
      /** 触发逻辑未达门槛时的说明（附在动作详情里，便于在日志中追溯） */
      let triggerNote = "";
      if (a.type === "SKIP") {
        t.skipped.push(p.id);
        t.failure = undefined;
      } else {
        let abnormal = !!a.abnormal;
        const rule = rulesOf(s).find((r) => r.pointId === p.id);
        // 模拟读数由该点位自己的判定规则驱动（J′）：不再按 Point.kind 硬编码，
        // 保证"采到的数"与"它自己的标准"自洽（温度点不会再读出 0.92℃）
        const value =
          a.value !== undefined ? String(a.value) : mockReading(rule, abnormal);
        const evaluation = evaluateRule(rule, value);
        abnormal = evaluation.abnormal;
        // AI 状态：识别未给出可用结论（结果为空 / 无有效读数 / 规则未配置）即 AI 状态异常，
        // 与风险信息正交——两者任一异常才触发告警，都正常则只有检测记录、没有告警
        const aiAbnormal = !evaluation.valid;
        const res = {
          ruleSnapshot: rule ? structuredClone(rule) : undefined,
          id: id("RES"),
          taskId: t.id,
          pointId: p.id,
          item: p.item,
          raw: value,
          recognized: value,
          final: value,
          unit: p.unit,
          abnormal,
          aiAbnormal,
          // 无人工复核环节：AI / 规则判定即结论，异常直接触发告警
          status: "已识别",
          triggerReason: evaluation.valid ? undefined : evaluation.reason,
          source: "机器人自主采集 / AI v1.2（模拟）",
          confidence: 0.97,
          time: now(),
        };
        s.results.unshift(res);
        t.done.push(p.id);
        if (abnormal || aiAbnormal) {
          /**
           * 触发逻辑（由台账告警设置下发到这里）：
           * 「连续确认」= 该点位最近 N 条结果全部异常才算触发，用于抑制工况抖动造成的误报；
           * 默认识别即触发；AI 状态异常固定识别即触发（识别不出结论必须让人看到）
           */
          const need =
            abnormal && rule?.triggerMode === "连续确认"
              ? Math.max(2, rule.consecutive || 2)
              : 1;
          /** 该点位的检测结果（最新在前）：连续确认按同一类异常计数（风险异常 / AI 状态异常各自成链） */
          const recent = s.results.filter((x) => x.pointId === p.id);
          const isHit = (x: { abnormal?: boolean; aiAbnormal?: boolean }) =>
            abnormal ? !!x.abnormal : !!x.aiAbnormal;
          const confirmed =
            recent.length >= need && recent.slice(0, need).every(isHit);
          if (!confirmed) {
            // 未达连续确认次数：只留检测结果，不生成也不追加告警
            triggerNote = `（触发逻辑「连续 ${need} 次确认」，本次为第 ${recent.length} 次超限，暂不触发告警）`;
          } else {
            // 告警等级：风险信息异常按该检测项的风险等级（一级 / 二级 / 三级）；
            // AI 状态异常（识别不出结论）固定为三级告警
            const level = abnormal ? rule?.level || "二级" : "三级";
            const existing = s.alarms.find(
              (x) =>
                x.pointId === p.id && x.state !== "已关闭",
            );
            if (existing)
              existing.notes.push(
                `${abnormal ? "重复风险异常" : "重复 AI 状态异常"}结果 ${res.id}；${evaluation.reason}`,
              );
            else
              s.alarms.unshift({
                id: id("AL"),
                /**
                 * 识别失败（照片模糊 / 算法调用失败 / 传感器无数据）是采集链路问题，归
                 * 「机器人预警 › 识别故障」——不进台账告警配置，但保留任务 / 点位 / 结果用于追溯；
                 * 风险信息异常才是业务预警（台账 × 告警项）。
                 */
                category: abnormal ? "业务" : "机器人",
                alarmClass: abnormal ? undefined : "识别故障",
                robotId: abnormal ? undefined : t.robotId,
                resultId: res.id,
                taskId: t.id,
                pointId: p.id,
                name: p.name + (abnormal ? " 风险异常" : " 识别故障"),
                level,
                state: "待确认",
                notes: [
                  abnormal
                    ? `规则 ${rule?.id || "无"} 第 ${rule?.version || 0} 版：${evaluation.reason}`
                    : `AI 状态异常（三级）：${evaluation.reason}`,
                  // 告警规则口径随告警留痕（触发逻辑 + 声光报警），处置页据此展示
                  ...(rule
                    ? [
                        `告警规则：${rule.triggerMode || "识别即触发"}` +
                          (rule.alarmSeconds
                            ? ` · ${alarmText(rule.alarmSeconds)}`
                            : ""),
                      ]
                    : []),
                  // 通知对象来自巡检目标台账的「告警设置」，随告警记录带出
                  ...(rule?.notify?.length
                    ? [`通知 ${rule.notify.join("、")}`]
                    : []),
                ],
                time: res.time,
              });
          }
        }
      }
      detail = `${p.id} · ${p.item} · ${a.type === "SKIP" ? "跳过记未完成" : "采集结果已生成"}${triggerNote}`;
      t.index++;
      t.stage = 0;
      t.retries = 0;
      if (t.index >= t.items.length) {
        t.finishedAt = new Date().toISOString();
        t.state = t.skipped.length
          ? t.done.length
            ? "部分完成"
            : "失败"
          : "完成";
        r.current = undefined;
        r.state = "空闲";
        settleStopping(r);
        continueQueue(s, r);
      }
      break;
    }
    case "TAKEOVER": {
      const r = robot();
      must(r.state !== "离线", "机器人离线");
      must(
        !s.sessions.some(
          (x) => x.robotId === r.id && !["已释放", "已超时"].includes(x.state),
        ),
        "机器人已有独占会话",
      );
      s.sessions.unshift({
        id: id("SESSION"),
        startedAt: new Date().toISOString(),
        robotId: r.id,
        taskId: r.current,
        state: "待暂停确认",
        expires: Date.now() + 300000,
        seq: 0,
        pan: 0,
        tilt: 0,
      });
      object = s.sessions[0].id;
      detail = `${r.id} 已建立接管会话`;
      break;
    }
    case "CONTROL_ACK": {
      const x = s.sessions.find((x) => x.id === a.id)!;
      must(x.state === "待暂停确认", "会话状态不符");
      const r = robot(x.robotId);
      const t = s.tasks.find((t) => t.id === x.taskId);
      // TKO-03/04：接管＝借调，原任务进入「已被接管」，释放后需显式恢复
      if (t) t.state = "已被接管";
      r.state = "人工接管";
      x.state = "已接管";
      break;
    }
    /**
     * TKO-01：机器人「申请人工接管」。
     * 机器人拍到 / 定位不到、自主处理超时后，可主动申请人来接管（或默认跳过该动作继续巡检）。
     * 本动作建立一条 origin="机器人申请" 的待暂停确认会话，由人从异常入口进入接管，而非人主动切入。
     */
    case "ROBOT_TAKEOVER_REQ": {
      const r = robot(a.robotId);
      must(r.state !== "离线", "机器人离线，无法申请接管");
      must(
        !s.sessions.some(
          (x) =>
            x.robotId === r.id && !["已释放", "已超时"].includes(x.state),
        ),
        "该机器人已有进行中的接管会话",
      );
      const t = s.tasks.find((x) => x.id === r.current);
      s.sessions.unshift({
        id: id("S"),
        robotId: r.id,
        taskId: t?.id,
        origin: "机器人申请",
        state: "待暂停确认",
        startedAt: new Date().toISOString(),
        expires: Date.now() + 300000,
        seq: 1,
        pan: 0,
        tilt: 0,
      } as Session);
      detail = `${r.id} 申请人工接管（等待时间窗 5 分钟，可跳过）`;
      break;
    }
    /** TKO-01：机器人「跳过」当前动作，不打断任务状态机，继续自主巡检 */
    case "ROBOT_TAKEOVER_SKIP": {
      const r = robot(a.robotId);
      s.sessions = s.sessions.filter(
        (x) => !(x.robotId === r.id && x.origin === "机器人申请"),
      );
      detail = `${r.id} 已跳过该动作，继续自主巡检`;
      break;
    }
    case "CONTROL": {
      const x = s.sessions.find((x) => x.id === a.id)!;
      must(
        x.state === "已接管" && x.expires > Date.now(),
        "会话无效或到期，指令被拒绝",
      );
      const r = robot(x.robotId);
      must(r.state !== "离线", "机器人离线，未收到执行回执");
      x.seq++;
      /** 位移步长由驾驶舱速度档位决定（1-9，默认 3），避免速度控制成为死控件 */
      const step = Math.max(1, Math.min(9, Number(a.step) || 3));
      if (a.command === "左移") r.x = Math.max(4, r.x - step);
      if (a.command === "右移") r.x = Math.min(96, r.x + step);
      if (a.command === "前进") r.y = Math.max(4, r.y - step);
      if (a.command === "后退") r.y = Math.min(96, r.y + step);
      if (a.command === "云台左转") x.pan -= 10;
      if (a.command === "云台右转") x.pan += 10;
      if (a.command === "云台抬头") x.tilt += 5;
      if (a.command === "采集照片") {
        const t = s.tasks.find((t) => t.id === x.taskId);
        const p =
          t?.items[Math.min(t.index, t.items.length - 1)] ||
          s.points.find((p) => p.mapId === r.mapId);
        if (p)
          s.results.unshift({
            id: id("RES"),
            taskId: t?.id || "人工调试",
            pointId: p.id,
            item: p.item,
            // 遥控采集的图像需回传后由 AI 识别，前端不编造读数
            raw: "待回传",
            recognized: "待识别",
            final: "无有效读数",
            unit: p.unit,
            abnormal: false,
            // 人工遥控采集暂未回传识别结论 → AI 状态异常（三级告警），不编造读数
            aiAbnormal: true,
            status: "已识别",
            triggerReason: "人工遥控采集：图像待回传识别，暂无有效读数",
            source: "人工遥控采集 / " + x.id,
            confidence: 0,
            time: now(),
          });
      }
      detail = `${x.id} #${x.seq} ${a.command} · 模拟执行回执已确认${a.command === "采集照片" ? "；人工证据已留档，不覆盖自主结果" : ""}`;
      break;
    }
    case "CONTROL_EXIT": {
      const x = s.sessions.find((x) => x.id === a.id)!;
      must(x.state === "已接管", "当前不在接管中");
      x.state = "退出核对中";
      robot(x.robotId).state = "暂停";
      break;
    }
    case "CONTROL_RELEASE": {
      const x = s.sessions.find((x) => x.id === a.id)!;
      must(
        x.state === "退出核对中" && a.checked,
        "请核对版本、任务与已完成检测项",
      );
      x.state = "已释放";
      x.releasedAt = new Date().toISOString();
      const r = robot(x.robotId);
      r.state = x.taskId ? "暂停" : "空闲";
      break;
    }
    /**
     * 告警处理（ALM-05）：记录「处理时间 / 处理结果（受理·忽略）/ 是否误报 / 处理说明」，
     * 已处理告警不允许二次编辑（口径进报警准确率，覆盖会污染统计）；
     * **受理** = 转现场处置；**忽略** = 记录后不处置。
     */
    case "ALARM_LABEL": {
      const al = s.alarms.find((x) => x.id === a.id)!;
      must(al, "告警不存在");
      must(!al.handledAt, "该告警已处理，处理结果不可二次编辑");
      must(
        a.result === "受理" || a.result === "忽略",
        "请选择处理结果（受理 / 忽略）",
      );
      must(typeof a.falsePositive === "boolean", "请判定是否误报");
      must(a.reason, "请填写处理说明 / 依据");
      al.handledAt = now();
      al.handleResult = a.result;
      al.handleNote = a.reason;
      al.falsePositive = a.falsePositive;
      // 三态：忽略 / 误报直接结案；受理转「处理中」，由 ALARM_CLOSE 标记结束
      al.state = a.result === "忽略" ? "已关闭" : "处理中";
      al.notes.push(`处理：${a.result}${a.falsePositive ? "（误报）" : ""}`);
      al.notes.push("处理说明：" + a.reason);
      // 判定为误报时同步写入反馈队列：供"误报漏报分析 / 模型迭代"消费，
      // 一次判定即同时喂给「误报率」与「报警准确率」，避免两处口径分叉
      if (a.falsePositive) {
        const res = s.results.find((r) => r.id === al.resultId);
        const robotId = res
          ? s.tasks.find((t) => t.id === res.taskId)?.robotId
          : al.robotId;
        s.feedbacks.unshift({
          id: id("FB"),
          resultId: al.resultId,
          deviceType:
            s.robots.find((r) => r.id === robotId)?.deviceType || "机器狗",
          pointId: al.pointId,
          algorithm: res?.source || "未标注算法",
          label: "误报",
          reviewer: a.actor || "调度台",
          consumed: false,
          time: al.handledAt,
        });
      }
      detail = `告警 ${al.id} 已处理为「${a.result}」`;
      break;
    }
    /**
     * 标记结束（ALM-06）：受理后现场处置完成，由「处理中」转「已关闭」。
     * 只改状态，不改处理结果与处理说明（结论一次提交后锁定）。
     */
    case "ALARM_CLOSE": {
      const al = s.alarms.find((x) => x.id === a.id)!;
      must(al, "告警不存在");
      must(al.state === "处理中", "仅「处理中」的告警可标记结束");
      al.state = "已关闭";
      al.notes.push(`标记结束：${now()}`);
      detail = `告警 ${al.id} 已标记结束`;
      break;
    }
    case "EXTRA_SAVE": {
      must(a.name, "名称不能为空");
      const old = s.extras.find((x) => x.id === a.id);
      const type: Extra["type"] =
        a.paramType === "数据字典" ? "数据字典" : "业务参数";
      // 数据字典：枚举项即「配置值」，列表详情统一由枚举项拼出，避免两处口径不一致
      const values = Array.isArray(a.values)
        ? (a.values as { key: string; value: string }[]).filter(
            (v) => String(v.key || "").trim(),
          )
        : [];
      // 编号：新增时可手填，必须全表唯一；编辑沿用原编号
      const wantId = String(a.id || "").trim();
      must(
        !wantId || !!old || !s.extras.some((x) => x.id === wantId),
        `编号 ${wantId} 已存在`,
      );
      const x: Extra = {
        id: old?.id || wantId || id("CFG"),
        category: a.category,
        name: a.name,
        detail:
          type === "数据字典"
            ? values.map((v) => v.value || v.key).join(", ") || "—"
            : a.detail || "",
        type,
        values,
      };
      s.extras = old
        ? s.extras.map((y) => (y.id === old.id ? x : y))
        : [x, ...s.extras];
      break;
    }
    case "EMERGENCY_STOP": {
      // 急停为最高优先级安全动作：暂停全部执行中任务、机器人进入安全待机、强制释放遥控会话
      const running = s.tasks.filter((t) => t.state === "执行中");
      running.forEach((t) => {
        t.state = "暂停";
        const r = s.robots.find((x) => x.id === t.robotId);
        if (r) r.state = "暂停";
      });
      s.sessions
        .filter((x) => !["已释放", "已超时"].includes(x.state))
        .forEach((x) => {
          x.state = "已超时";
          const r = s.robots.find((y) => y.id === x.robotId);
          if (r && r.state === "人工接管") r.state = "暂停";
        });
      detail = `急停已触发：${running.length} 个执行中任务已暂停，遥控会话已强制释放`;
      break;
    }
    case "RECHARGE": {
      const r = robot();
      must(r.state !== "离线", "机器人离线，无法下发回充指令");
      must(!r.current, "机器人存在执行中任务，请先暂停或结束");
      must(
        !["故障", "维护"].includes(r.state),
        "机器人故障或维护中，暂不可回充",
      );
      must(
        !s.sessions.some(
          (x) => x.robotId === r.id && !["已释放", "已超时"].includes(x.state),
        ),
        "请先释放人工接管会话",
      );
      r.state = "返航中";
      detail = `${r.id} 已下发自动回充，等待到位回报`;
      break;
    }
    case "RETURN_HOME": {
      // 一键返航：终止当前任务并直接下发回充，合并为单次状态迁移避免两次操作竞争
      const r = robot();
      must(r.state !== "离线", "机器人离线，无法下发返航指令");
      const cur = s.tasks.find((x) => x.id === r.current);
      if (cur && !["完成", "失败", "部分完成", "取消"].includes(cur.state)) {
        cur.state = cur.done.length ? "部分完成" : "取消";
      }
      r.current = undefined;
      s.sessions
        .filter(
          (x) => x.robotId === r.id && !["已释放", "已超时"].includes(x.state),
        )
        .forEach((x) => {
          x.state = "已释放";
      x.releasedAt = new Date().toISOString();
        });
      r.state = "返航中";
      detail = `${r.id} 已释放遥控并返航，等待到位回报`;
      break;
    }
    case "RETURN_ARRIVED": {
      const r = robot();
      must(r.state === "返航中", "机器人不在返航中");
      r.state = "充电";
      detail = `${r.id} 到位回报已确认，开始充电`;
      break;
    }
    case "POSTURE": {
      const r = robot();
      must(
        !["离线", "故障"].includes(r.state),
        "机器人离线或故障，无法调整姿态",
      );
      r.posture = a.posture || "站立";
      detail = `${r.id} 姿态动作：${r.posture}`;
      break;
    }
    // ── 机器人管理：新增机器人（编码唯一；区域取自区域配置，地图在首次下发时归属） ──
    case "ADD_ROBOT": {
      const rid = String(a.id || "").trim();
      must(rid, "请填写机器人编码");
      must(!s.robots.some((r) => r.id === rid), `机器人编码 ${rid} 已存在`);
      must(String(a.name || "").trim(), "请填写机器人名称");
      // 硬件序列号（SN）：可选填，填了就必须全局唯一
      const sn = String(a.sn || "").trim();
      must(
        !sn || !s.robots.some((r) => r.sn === sn),
        `机器人编号（SN）${sn} 已存在`,
      );
      // 区域下拉与校验同一份口径（areaOptions：区域配置 ∪ 设备实际归属），不在清单里的区域一律拒绝
      const region = String(a.region || "").trim();
      must(
        !region || areaOptions(s).includes(region),
        `区域「${region}」不在区域配置中，请先在「后台管理 › 区域配置」维护`,
      );
      const deviceType = (a.deviceType || "四轮车") as Robot["deviceType"];
      // 地图可选：传了 mapId 就按该图归属，否则留空，待首次「地图下发」自动绑定
      const map = a.mapId ? s.maps.find((m) => m.id === a.mapId) : undefined;
      const capabilities: string[] = a.capabilities?.length
        ? a.capabilities
        : ["可见光"];
      const constraints: Robot["constraints"] = {
        minBattery: Number.isFinite(a.minBattery)
          ? Number(a.minBattery)
          : profileOf(deviceType).constraints.minBattery,
        needChargingPlan: a.needChargingPlan !== false,
      };
      if (deviceType === "四轮车")
        constraints.maxSpeed = Number.isFinite(a.maxSpeed)
          ? Number(a.maxSpeed)
          : 1.5;
      if (deviceType === "挂轨" && a.railSectionId)
        constraints.railSectionId = String(a.railSectionId);
      const robot: Robot = {
        id: rid,
        name: String(a.name).trim(),
        region: region || String(map?.region || "").trim(),
        battery: 100,
        capabilities,
        state: "空闲",
        mapId: map?.id || "",
        mapVersion: map?.version ?? 0,
        x: 50,
        y: 50,
        deviceType,
        constraints,
        health: 100,
        firmware: String(a.firmware || "").trim() || "v1.0.0",
        sn: sn || undefined,
      };
      s.robots.unshift(robot);
      object = robot.id;
      detail = `新增机器人 ${robot.name}（${robot.deviceType}${robot.region ? " · " + robot.region : " · 待归属区域"}）已接入台账`;
      break;
    }
    // ── 机器人管理：编辑主数据（名称 / SN / 机型 / 固件 / 约束 / 采集能力），并刷新更新时间 ──
    case "UPDATE_ROBOT": {
      const r = s.robots.find((x) => x.id === a.id);
      must(r, "机器人不存在");
      const name = String(a.name ?? r.name).trim();
      must(name, "请填写机器人名称");
      const capabilities = Array.isArray(a.capabilities) && a.capabilities.length
        ? (a.capabilities as Robot["capabilities"])
        : r.capabilities;
      const sn = String(a.sn ?? r.sn ?? "").trim();
      must(
        !sn || !s.robots.some((x) => x.id !== r.id && x.sn === sn),
        `机器人编号（SN）${sn} 已存在`,
      );
      const region = String(a.region ?? r.region).trim();
      must(
        !region || areaOptions(s).includes(region),
        `区域「${region}」不在区域配置中`,
      );
      const deviceType = (a.deviceType || r.deviceType) as Robot["deviceType"];
      const constraints: Robot["constraints"] = {
        minBattery: Number.isFinite(a.minBattery)
          ? Number(a.minBattery)
          : r.constraints.minBattery,
        needChargingPlan:
          a.needChargingPlan ?? r.constraints.needChargingPlan,
      };
      if (deviceType === "四轮车")
        constraints.maxSpeed = Number.isFinite(a.maxSpeed)
          ? Number(a.maxSpeed)
          : r.constraints.maxSpeed;
      if (deviceType === "挂轨" && a.railSectionId)
        constraints.railSectionId = String(a.railSectionId);
      Object.assign(r, {
        name,
        capabilities,
        sn: sn || undefined,
        deviceType,
        region,
        firmware: String(a.firmware ?? r.firmware).trim(),
        constraints,
        updatedAt: now(),
      });
      object = r.id;
      detail = `已更新机器人 ${r.name} 的主数据`;
      break;
    }
    /**
     * 机器人管理：启用 / 停用切换
     * @description 防呆：停用不硬中断作业 —— 有任务在跑时只标 `stopping`（停用中），
     *              期间不再接新任务、队列存量任务跑完，任务结束落停用终态（见 settleStopping）。
     *              `a.enabled` 显式给目标状态，缺省取反当前值。
     */
    case "TOGGLE_ROBOT": {
      const r = s.robots.find((x) => x.id === a.id);
      must(r, "机器人不存在");
      const target =
        typeof a.enabled === "boolean" ? a.enabled : r.enabled === false;
      if (target) {
        r.enabled = true;
        r.stopping = false;
        // 重新启用：停用期间被卡住的队列任务接着跑
        continueQueue(s, r);
        detail = `机器人 ${r.id} 已启用`;
      } else {
        const busy =
          !!r.current || ["执行中", "暂停", "返航中"].includes(r.state);
        if (busy) {
          r.stopping = true;
          detail = `机器人 ${r.id} 已标记停用：当前队列任务结束后生效，期间不再接新任务`;
        } else {
          r.enabled = false;
          detail = `机器人 ${r.id} 已停用`;
        }
      }
      r.updatedAt = now();
      object = r.id;
      break;
    }
    // ── 后台管理：工厂已有基础数据（区域 / 设备 / 仪表）增删改 ──
    case "ADD_AREA": {
      const name = String(a.name || "").trim();
      must(name, "请填写区域名称");
      const areas = (s.areas ??= []);
      // 先解析父级：手填的新父级名称会在此自动建为根区域，
      // 必须放在重名校验之前，才能拦住「子区域与新父级同名」
      const polygon = areaPolygon(a);
      const parentId = resolveParent(
        areas,
        a.parentText ?? a.parentId,
        undefined,
      );
      must(!areas.some((x) => x.name === name), `区域「${name}」已存在`);
      areas.push({
        id: id("AREA"),
        // 编码由系统顺延分配，前端只做只读展示
        code: nextAreaCode(areas),
        name,
        ...(parentId ? { parentId } : {}),
        ...(String(a.owner || "").trim() ? { owner: String(a.owner).trim() } : {}),
        ...(String(a.department || "").trim()
          ? { department: String(a.department).trim() }
          : {}),
        ...(polygon ? { polygon } : {}),
        updatedAt: now(),
      });
      object = name;
      detail = `已新增区域「${name}」`;
      break;
    }
    case "RENAME_AREA": {
      const name = String(a.name || "").trim();
      must(name, "请填写区域名称");
      const areas = (s.areas ??= []);
      const hit = areas.find((x) => x.id === a.id);
      must(hit, "未找到要编辑的区域");
      must(
        hit!.id !== ROOT_AREA_ID,
        `「${ROOT_AREA_NAME}」是固定根区域，不能编辑`,
      );
      // 先解析父级（手填新名称会自动建父级），再做重名校验，避免与新建父级撞名
      const parentId = resolveParent(
        areas,
        a.parentText ?? a.parentId,
        hit!.id,
      );
      must(
        !areas.some((x) => x.name === name && x.id !== hit!.id),
        `区域「${name}」已存在`,
      );
      const old = hit!.name;
      hit!.name = name;
      hit!.parentId = parentId;
      // 负责人 / 管理部门跟随表单更新（非必填，清空即视为不设）
      hit!.owner = String(a.owner || "").trim() || undefined;
      hit!.department = String(a.department || "").trim() || undefined;
      // 范围轮廓跟随表单更新：未闭合即视为清掉范围，只保留名称
      hit!.polygon = areaPolygon(a) || undefined;
      hit!.updatedAt = now();
      // 设备按安装位置前缀归属：区域改名后同步前缀，避免设备掉落「未分区」
      (s.devices || []).forEach((d) => {
        if (d.region === old) d.region = name;
        if (d.locationDesc.startsWith(old))
          d.locationDesc = name + d.locationDesc.slice(old.length);
      });
      // 地图 / 机器人上的区域名同步，保证跨模块口径一致
      (s.maps || []).forEach((m) => {
        if (m.region === old) m.region = name;
      });
      (s.robots || []).forEach((r) => {
        if (r.region === old) r.region = name;
      });
      object = name;
      detail = `区域「${old}」已重命名为「${name}」`;
      break;
    }
    case "DELETE_AREA": {
      const areas = (s.areas ??= []);
      const hit = areas.find((x) => x.id === a.id);
      must(hit, "未找到要删除的区域");
      must(
        hit!.id !== ROOT_AREA_ID,
        `「${ROOT_AREA_NAME}」是固定根区域，不能删除`,
      );
      must(
        !(s.devices || []).some((d) => areaNameOf(s, d) === hit!.name),
        `区域「${hit!.name}」下仍有设备，请先调整设备归属`,
      );
      // 下级区域上移到它的上级；没有上级（理论上不会）则挂回固定根
      const upId = hit!.parentId || ROOT_AREA_ID;
      areas.forEach((x) => {
        if (x.parentId === hit!.id) x.parentId = upId;
      });
      s.areas = areas.filter((x) => x.id !== a.id);
      object = hit!.name;
      detail = `已删除区域「${hit!.name}」`;
      break;
    }
    case "ADD_DEVICE": {
      const did = String(a.id || "").trim();
      const name = String(a.name || "").trim();
      must(did && name, "请填写设备编码与设备名称");
      const devs = (s.devices ??= []);
      must(!devs.some((d) => d.id === did), `设备编码「${did}」已存在`);
      // 设备形态：显式值必须合法；未指定时按设备类型推导
      const deviceKind = String(a.deviceKind || "").trim();
      must(
        !deviceKind || deviceKinds.includes(deviceKind as DeviceKind),
        `设备形态「${deviceKind}」不合法（应为 ${deviceKinds.join(" / ")}）`,
      );
      const deviceType = String(a.deviceType || "").trim() || "未分类";
      // 建档时一并录入的检测项：与「新增检测项」同一口径（同设备内检测目标不可重复）
      const items: InspectItem[] = [];
      (Array.isArray(a.items) ? (a.items as any[]) : []).forEach((raw) => {
        const it = buildInspectItem(did, raw);
        if (!it.target) return;
        must(
          !items.some((x) => x.target === it.target),
          `检测目标「${it.target}」重复`,
        );
        items.push(it);
      });
      const dev: DeviceAsset = {
        id: did,
        name,
        // 注意：动作名是 a.type，设备类型必须用独立字段 a.deviceType
        type: deviceType,
        deviceKind:
          (deviceKind as DeviceKind) || defaultDeviceKindOfType(deviceType),
        regionCode: String(a.regionCode || "").trim(),
        region: String(a.region || "").trim() || undefined,
        locationDesc: String(a.locationDesc || "").trim(),
        coord: String(a.coord || "").trim() || undefined,
        coordSys: String(a.coordSys || "").trim() || undefined,
        items,
        // 建档时间 = 「更新时间」的起点（台账列表展示，编辑 / 导入 / 检测项变动时刷新）
        updatedAt: now(),
      };
      devs.unshift(dev);
      // 检测目标即工厂树第三层的仪表（id 同源），一并新增
      items.forEach((it) => pushInstrumentOf(s, dev, it));
      object = did;
      detail = items.length
        ? `已新增设备「${name}」（含 ${items.length} 个检测项）`
        : `已新增设备「${name}」`;
      break;
    }
    case "UPDATE_DEVICE": {
      const devs = (s.devices ??= []);
      const hit = devs.find((d) => d.id === a.id);
      must(hit, "未找到要编辑的设备");
      const name = String(a.name || "").trim();
      must(name, "请填写设备名称");
      // 设备名是点位的归属键（Point.device ↔ DeviceAsset.name 同名对齐）：改名必须同步点位，
      // 否则该设备的点位会整体认不到设备（台账 / 档案 / 任务生成都会落空）
      if (hit!.name !== name)
        s.points.forEach((p) => {
          if (p.device === hit!.name) p.device = name;
        });
      hit!.name = name;
      hit!.type = String(a.deviceType || "").trim() || hit!.type;
      // 设备形态：显式值必须合法；未指定时保持原值（缺字段时按类型推导）
      const kind = String(a.deviceKind || "").trim();
      must(
        !kind || deviceKinds.includes(kind as DeviceKind),
        `设备形态「${kind}」不合法（应为 ${deviceKinds.join(" / ")}）`,
      );
      if (kind) hit!.deviceKind = kind as DeviceKind;
      else hit!.deviceKind = hit!.deviceKind || defaultDeviceKindOfType(hit!.type);
      hit!.region = String(a.region || "").trim() || undefined;
      hit!.locationDesc =
        String(a.locationDesc ?? "").trim() || hit!.locationDesc;
      hit!.updatedAt = now();
      object = hit!.id;
      detail = `已更新设备「${name}」`;
      break;
    }
    case "DELETE_DEVICE": {
      const devs = (s.devices ??= []);
      const hit = devs.find((d) => d.id === a.id);
      must(hit, "未找到要删除的设备");
      must(
        !s.points.some((p) => p.device === hit!.name),
        `设备「${hit!.name}」已关联巡检点位，请先解除关联`,
      );
      s.devices = devs.filter((d) => d.id !== a.id);
      // 仪表单归属设备：设备删除后其仪表一并移除
      s.instruments = (s.instruments || []).filter((i) => i.deviceId !== hit!.id);
      object = hit!.id;
      detail = `已删除设备「${hit!.name}」`;
      break;
    }
    case "DELETE_DEVICES": {
      // 批量删除：与单台删除同一校验口径——先整体校验再落库，避免删一半留一半
      const devs = (s.devices ??= []);
      const ids = (Array.isArray(a.ids) ? (a.ids as unknown[]) : []).map((x) =>
        String(x),
      );
      must(ids.length, "请选择要删除的设备");
      const rows = devs.filter((d) => ids.includes(d.id));
      must(rows.length, "未找到要删除的设备");
      const linked = rows.filter((d) => s.points.some((p) => p.device === d.name));
      must(
        !linked.length,
        `设备「${linked.map((d) => d.name).join("、")}」已关联巡检点位，请先解除关联`,
      );
      s.devices = devs.filter((d) => !ids.includes(d.id));
      // 仪表单归属设备：设备删除后其仪表一并移除
      s.instruments = (s.instruments || []).filter(
        (i) => !ids.includes(i.deviceId),
      );
      object = ids.join(" / ");
      detail = `已删除 ${rows.length} 台设备`;
      break;
    }
    case "ADD_INSTRUMENT": {
      const name = String(a.name || "").trim();
      must(name, "请填写仪表名称");
      must(a.deviceId, "请选择所属设备");
      const list = (s.instruments ??= []);
      list.unshift({
        id: String(a.id || id("INS")),
        name,
        deviceId: String(a.deviceId),
        capture: (a.capture || "可见光") as CaptureKind,
        unit: String(a.unit || "").trim() || undefined,
      });
      object = name;
      detail = `已新增仪表「${name}」`;
      break;
    }
    case "UPDATE_INSTRUMENT": {
      const list = (s.instruments ??= []);
      const hit = list.find((x) => x.id === a.id);
      must(hit, "未找到要编辑的仪表");
      const name = String(a.name || "").trim();
      must(name, "请填写仪表名称");
      hit!.name = name;
      hit!.capture = (a.capture || hit!.capture) as CaptureKind;
      hit!.unit = String(a.unit || "").trim() || undefined;
      object = hit!.name;
      detail = `已更新仪表「${name}」`;
      break;
    }
    case "DELETE_INSTRUMENT": {
      const list = (s.instruments ??= []);
      const hit = list.find((x) => x.id === a.id);
      must(hit, "未找到要删除的仪表");
      s.instruments = list.filter((x) => x.id !== a.id);
      object = hit!.name;
      detail = `已删除仪表「${hit!.name}」`;
      break;
    }
    // ── 后台管理：机器人上装能力（上装 → 采集方式 → 原子动作） ──
    case "ADD_ROBOT_PAYLOAD": {
      const pid = String(a.id || "").trim();
      const name = String(a.name || "").trim();
      must(pid && name, "请填写上装编码与上装名称");
      must(
        /^[A-Za-z0-9_-]{2,32}$/.test(pid),
        `上装编码「${pid}」格式不合法（仅字母 / 数字 / 下划线 / 中划线）`,
      );
      const list = (s.robotPayloads ??= []);
      must(!list.some((p) => p.id === pid), `上装编码「${pid}」已存在`);
      list.unshift({
        id: pid,
        name,
        // 上装型号台账口径：版本 + 厂家（采购 / 售后按这两个字段对账）
        version: String(a.version || "").trim() || undefined,
        vendor: String(a.vendor || "").trim() || undefined,
        ...payloadFields(a),
      });
      object = pid;
      detail = `已新增上装「${name}」`;
      break;
    }
    case "UPDATE_ROBOT_PAYLOAD": {
      const list = (s.robotPayloads ??= []);
      const hit = list.find((p) => p.id === a.id);
      must(hit, "未找到要编辑的上装");
      const name = String(a.name || "").trim();
      must(name, "请填写上装名称");
      Object.assign(hit!, {
        name,
        version: String(a.version || "").trim() || undefined,
        vendor: String(a.vendor || "").trim() || undefined,
        ...payloadFields(a),
      });
      object = hit!.id;
      detail = `已更新上装「${name}」`;
      break;
    }
    // ── 算法（后台管理 › 算法）：厂区**不手写算法**，只从平台算法库勾选启用 ──
    case "ENABLE_ALGOS": {
      const ids: string[] = Array.isArray(a.ids) ? a.ids.map(String) : [];
      must(ids.length, "请先勾选要启用的算法");
      const list = (s.algoConfigs ??= []);
      const added: string[] = [];
      ids.forEach((aid) => {
        const hit = ALGO_LIBRARY.find((x) => x.id === aid);
        if (!hit || list.some((x) => x.id === aid)) return;
        list.push({ ...hit });
        added.push(hit.name);
      });
      must(added.length, "所选算法都已在厂区启用");
      object = ids.join(",");
      detail = `已从算法库启用 ${added.length} 个算法：${added.join("、")}`;
      break;
    }
    case "DELETE_ROBOT_PAYLOAD": {
      const list = (s.robotPayloads ??= []);
      const hit = list.find((p) => p.id === a.id);
      must(hit, "未找到要删除的上装");
      s.robotPayloads = list.filter((p) => p.id !== a.id);
      object = hit!.id;
      detail = `已删除上装「${hit!.name}」`;
      break;
    }
    // ── 后台管理：算法配置（后台管理 › 算法配置，目标台账按名称引用） ──
    case "ADD_ALGO_CONFIG": {
      const aid = String(a.id || "").trim();
      const name = String(a.name || "").trim();
      must(aid && name, "请填写算法编码与算法名称");
      must(
        /^[A-Za-z0-9_-]{2,32}$/.test(aid),
        `算法编码「${aid}」格式不合法（仅字母 / 数字 / 下划线 / 中划线）`,
      );
      const list = (s.algoConfigs ??= []);
      must(!list.some((x) => x.id === aid), `算法编码「${aid}」已存在`);
      must(!list.some((x) => x.name === name), `算法名称「${name}」已存在`);
      list.unshift({
        id: aid,
        name,
        ...algoFields(a),
        updatedAt: now(),
        state: "启用",
      });
      object = aid;
      detail = `已新增算法「${name}」`;
      break;
    }
    case "UPDATE_ALGO_CONFIG": {
      const list = (s.algoConfigs ??= []);
      const hit = list.find((x) => x.id === a.id);
      must(hit, "未找到要编辑的算法");
      const name = String(a.name || "").trim();
      must(name, "请填写算法名称");
      must(
        !list.some((x) => x.id !== a.id && x.name === name),
        `算法名称「${name}」已存在`,
      );
      Object.assign(hit!, { name, ...algoFields(a) });
      hit!.updatedAt = now();
      object = hit!.id;
      detail = `已更新算法「${name}」`;
      break;
    }
    case "SET_ALGO_STATE": {
      const list = (s.algoConfigs ??= []);
      const hit = list.find((x) => x.id === a.id);
      must(hit, "未找到该算法");
      hit!.state = a.state === "停用" ? "停用" : "启用";
      object = hit!.id;
      detail = `算法「${hit!.name}」已${hit!.state === "停用" ? "停用" : "启用"}`;
      break;
    }
    case "DELETE_ALGO_CONFIG": {
      const list = (s.algoConfigs ??= []);
      const hit = list.find((x) => x.id === a.id);
      must(hit, "未找到要删除的算法");
      s.algoConfigs = list.filter((x) => x.id !== a.id);
      object = hit!.id;
      detail = `已删除算法「${hit!.name}」`;
      break;
    }
    default:
      throw Error("未知操作 " + a.type);
  }
  s.logs.unshift({
    id: id("LOG"),
    time: now(),
    action: a.type,
    object,
    detail: detail || "张工 · 操作成功（Mock）",
  });
  // 状态收口：按"机器持有版本 + 下发记录"重算每张图的状态（派生值，任何动作后都保持一致）
  refreshMapStates(s);
  // 「停用中」的地图：图上任务全部结束后落「停用」终态
  settleMapStopping(s);
  releaseOutputs(s);
  return s;
}
