/**
 * @file deviceMaster.ts
 * @description 设备主数据（阶段③）访问与判定的**唯一出口**：设备查找、停用拦截、
 *              「是否巡检」过滤、导入校验都收敛到这里，避免引擎与页面各写一套口径。
 *              设计约束（v3 定案）：设备是「巡检什么」的唯一来源，**禁止由点位反推设备**。
 * @interaction 被 engine.ts（任务生成 / 派单拦截）、Annotation.tsx（标注页选设备）、
 *              DeviceMaster 页（导入与审核）消费
 */
import type {
  State,
  DeviceAsset,
  Point,
  InspectItem,
  CaptureKind,
  AtomicAction,
  Robot,
  Instrument,
} from "./types";
import { captureAction } from "./types";

/** 设备编码：取设备名首段（与 `selectors.deviceCode` 同口径） */
export const codeOfDeviceName = (name: string) => name.split(" ")[0];

/**
 * 按设备编码 / 名称 / 编码派生值查设备主数据
 * @param s 状态
 * @param key 设备名（`V001 原料储罐`）、主数据 id（`DEV-V001`）、或编码（`V001`）
 * @returns 命中的设备；未命中返回 undefined
 */
export function deviceOf(s: State, key: string): DeviceAsset | undefined {
  if (!key) return undefined;
  return s.devices?.find(
    (d) =>
      d.name === key ||
      d.id === key ||
      d.id === "DEV-" + key ||
      codeOfDeviceName(d.name) === key,
  );
}

/**
 * 点位所属设备
 * @description 关联依据：`Point.device` ↔ `DeviceAsset.name`（同名对齐）
 * @param s 状态
 * @param p 物理点位
 * @returns 命中的设备；未登记主数据时返回 undefined
 */
export const deviceOfPoint = (s: State, p: Point) =>
  deviceOf(s, p.device);

/**
 * 点位对应的巡检项
 * @description 关联依据：`Point.object` ↔ `InspectItem.target`（同名对齐）
 * @param s 状态
 * @param p 物理点位
 * @returns 命中的巡检项；未命中返回 undefined
 */
/**
 * 巡检点覆盖的设备（由各巡检项的业务目标 → 仪表 → 设备推导，去重）
 * @param s 状态
 * @param p 巡检点
 * @returns 设备列表；无巡检项时回落到点上派生的所属设备
 */
export function devicesOfPoint(s: State, p: Point): DeviceAsset[] {
  const list = (p.inspectItems || []).flatMap((sp) => {
    const bt = s.businessTargets?.find((b) => b.id === sp.targetId);
    const ins = s.instruments?.find((x) => x.id === bt?.instrumentId);
    const dev = s.devices?.find((d) => d.id === ins?.deviceId);
    return dev ? [dev] : [];
  });
  if (list.length) return [...new Map(list.map((d) => [d.id, d])).values()];
  const d = deviceOfPoint(s, p);
  return d ? [d] : [];
}

export const inspectItemOfPoint = (
  s: State,
  p: Point,
): InspectItem | undefined =>
  deviceOfPoint(s, p)?.items.find((it) => it.target === p.object);

/**
 * 点位所属设备是否已停用
 * @description 未登记主数据的旧点位视为"在用"，避免历史数据被整体误拦
 * @param s 状态
 * @param p 物理点位
 * @returns 已停用返回 true
 */
export const isDeviceStopped = (s: State, p: Point) =>
  deviceOfPoint(s, p)?.state === "停用";

/**
 * 点位是否参与巡检（「是否巡检」开关）
 * @description 未登记主数据、或该设备下找不到对应巡检项时，按"参与"处理
 * @param s 状态
 * @param p 物理点位
 * @returns 参与巡检返回 true
 */
export const isInspected = (s: State, p: Point) => {
  const it = inspectItemOfPoint(s, p);
  return it ? it.inspect : true;
};

/** 旧口径回落：`Point.kind` 把业务类型（仪表/阀门）与采集方式混用，这里只取其中真正的采集方式 */
const LEGACY_CAPTURE: Record<string, CaptureKind> = {
  可见光: "可见光",
  红外: "红外",
  气体: "气体",
  声音: "声音",
};

/**
 * 点位的采集方式
 * @description 新口径取设备主数据巡检项的 `kind`（可见光 / 红外 / 气体 / 声音）；
 *              未登记主数据的旧点位回落到 `Point.kind`，业务类型（仪表 / 阀门）一律视为可见光。
 *              任务的原子动作由此推导——**不由业务类型推导**。
 * @param s 状态
 * @param p 物理点位
 * @returns 采集方式
 */
export const captureKindOfPoint = (s: State, p: Point): CaptureKind =>
  inspectItemOfPoint(s, p)?.kind || LEGACY_CAPTURE[p.kind] || "可见光";

/**
 * 点位覆盖的全部采集方式
 * @description 一个停靠位可覆盖多个检测目标（`Point.logicalIds` → 逻辑点 `itemIds` → 巡检项 `kind`），
 *              因此采集方式可能是多种（如同时可见光拍表盘 + 红外拍罐壁）；去重返回。
 *              逻辑点缺失时回落到单目标口径 `captureKindOfPoint`。
 * @param s 状态
 * @param p 物理点位
 * @returns 采集方式列表（至少一项）
 */
export function captureKindsOfPoint(s: State, p: Point): CaptureKind[] {
  // 巡检项配置优先：采集方式来自"巡检项绑定的业务目标 → 仪表 → 采集方式"。
  // 单一来源是**设备清单里的检测目标**（仪表 id 与清单巡检项 id 同源），
  // `Instrument.capture` 只是同值副本，避免两处改动导致口径漂移。
  const fromSpecs = (p.inspectItems || []).flatMap((sp) => {
    const bt = s.businessTargets?.find((b) => b.id === sp.targetId);
    if (!bt) return [];
    const listed = s.devices
      ?.flatMap((d) => d.items)
      .find((it) => it.id === bt.instrumentId);
    const kind =
      listed?.kind || s.instruments?.find((x) => x.id === bt.instrumentId)?.capture;
    return kind ? [kind] : [];
  });
  if (fromSpecs.length) return [...new Set(fromSpecs)];
  const d = deviceOfPoint(s, p);
  const kinds = (p.logicalIds || [])
    .flatMap((lid) => s.logicalPoints?.find((x) => x.id === lid)?.itemIds || [])
    .map((iid) => d?.items.find((it) => it.id === iid)?.kind)
    .filter(Boolean) as CaptureKind[];
  return kinds.length ? [...new Set(kinds)] : [captureKindOfPoint(s, p)];
}

/**
 * 点位的到位原子动作列表
 * @description 任务指令集的最小单元：由采集方式推导（可见光→拍照、红外→采集红外热像、
 *              气体→采集气体、声音→录制声音）
 * @param s 状态
 * @param p 物理点位
 * @returns 原子动作列表（去重，至少一项）
 */
export const actionsOfPoint = (s: State, p: Point): AtomicAction[] => {
  // 机器操作内容**以巡检项里显式配置的原子动作为准**（巡检点里配了什么就下发什么）
  const configured = (p.inspectItems || []).flatMap((sp) => sp.actions || []);
  if (configured.length) return [...new Set(configured)];
  return [...new Set(captureKindsOfPoint(s, p).map((k) => captureAction[k]))];
};

/**
 * 机器人是否具备该点位所需的全部采集方式
 * @description **能力口径唯一出口**：机器人 `capabilities` 只表达采集方式（可见光 / 红外 / 气体 / 声音），
 *              业务类型（仪表 / 阀门）不再参与调度校验。引擎 `constraints`、计划绑定 `bindingReasons`、
 *              调度校验清单 `selectors.checks` 三处必须共用本函数，不得各自判断。
 * @param s 状态
 * @param p 物理点位（点位级快照同样适用）
 * @param r 机器人
 * @returns 全部具备返回 true
 */
export const robotCoversPoint = (s: State, p: Point, r: Robot) =>
  captureKindsOfPoint(s, p).every((k) => r.capabilities.includes(k));

/**
 * 仪表 → 默认巡检要求（模板库 id）
 * @description 「仪表只是资产，不能直接巡检」：采集方式与单位决定"看什么"——
 *              气体→看浓度、红外→看高温、有量纲→读表、无量纲的阀类→看阀位、其余→看外观。
 *              种子派生与页面"新增业务巡检目标"的默认选中都调用它，保证同一口径。
 * @param ins 仪表
 * @returns 巡检要求 id（REQ-*）
 */
export const defaultRequirementOfInstrument = (ins: Instrument) => {
  if (ins.capture === "气体") return "REQ-GAS";
  if (ins.capture === "声音") return "REQ-SOUND";
  if (ins.capture === "红外") return "REQ-HOT";
  if (ins.unit) return "REQ-READ";
  return /阀|位/.test(ins.name) ? "REQ-STATE" : "REQ-APPEAR";
};

/**
 * 设备巡检档案（archive）的路由 id
 * @description 优先用主数据 id（全局唯一）；旧缓存无主数据时回落到"设备名首段"的旧口径，
 *              避免同前缀设备（如两段装置区管廊）在档案页撞成同一台
 * @param s 状态
 * @param deviceName 设备名
 * @returns 档案路由 id
 */
export const archiveIdOf = (s: State, deviceName: string) =>
  deviceOf(s, deviceName)?.id || codeOfDeviceName(deviceName);

/** 「检测目标 → 默认检测项名称」对照：仅用于标注时的默认填充，可被用户改写 */
const DEFAULT_ITEM_NAMES: [RegExp, string][] = [
  [/压力|压表/, "压力读数"],
  [/阀/, "阀门状态"],
  [/罐壁|罐体|壁/, "表面温度"],
  [/气体|探头/, "气体浓度"],
  [/液位|液面/, "液位读数"],
  [/泵|机/, "运行状态"],
];

/**
 * 检测目标 → 默认检测项名称
 * @description 检测项（读什么数）最终仍由点位与规则承载；这里只给标注页一个默认值，
 *              避免为了填一个名称来回跳页。用户可随时改写。
 * @param target 检测目标（如 出口压力表 / 罐壁 / 可燃气体探头）
 * @returns 默认检测项名称；无法识别时原样返回检测目标
 */
export const defaultInspectItemName = (target: string) =>
  DEFAULT_ITEM_NAMES.find(([re]) => re.test(target))?.[1] || target;

/** 设备统计：台账页顶部 KPI 用 */
export function deviceStats(s: State) {
  const ds = s.devices || [];
  return {
    total: ds.length,
    inUse: ds.filter((d) => d.reviewState === "已通过" && d.state !== "停用")
      .length,
    stopped: ds.filter((d) => d.state === "停用").length,
    pending: ds.filter((d) => d.reviewState === "待审核").length,
    rejected: ds.filter((d) => d.reviewState === "已驳回").length,
    itemTotal: ds.reduce((n, d) => n + d.items.length, 0),
    itemOff: ds.reduce(
      (n, d) => n + d.items.filter((it) => !it.inspect).length,
      0,
    ),
  };
}
