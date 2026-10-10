/**
 * @file deviceMaster.ts
 * @description 设备主数据（阶段③）访问与判定的**唯一出口**：设备查找、停用拦截、
 *              「是否巡检」过滤、导入校验都收敛到这里，避免引擎与页面各写一套口径。
 *              设计约束（v3 定案）：设备是「巡检什么」的唯一来源，**禁止由点位反推设备**。
 * @interaction 被 engine.ts（任务生成 / 派单拦截）、Annotation.tsx（标注页选设备）、
 *              DeviceMaster 页（设备台账）消费
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
 *              种子派生与页面"新增巡检目标台账"的默认选中都调用它，保证同一口径。
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

/**
 * 检测目标 → 默认检测项分类
 * @description 检测项分两类：**仪表**（有形表计，可读数 / 有量纲）与**区域**（空间范围，
 *              如罐壁 / 管廊 / 地面）。这里只给表单一个默认值，用户可随时在下拉里改写；
 *              缺省口径与巡检目标台账的 `targetKind` 一致。
 * @param target 检测目标（如 出口压力表 / 罐壁）
 * @returns 检测项分类
 */
export const defaultTargetKindOfTarget = (target: string): "仪表" | "区域" =>
  /罐壁|罐体|罐区|管廊|管线|地面|平台|围堰|池|区域|空间/.test(target)
    ? "区域"
    : "仪表";

/**
 * 采集方式 → 默认单位
 * @description 检测项表单选采集方式时自动匹配单位，避免"数值类漏填单位"：
 *              红外→℃、气体→%LEL 是采集方式自带的量纲；可见光 / 声音本身无量纲
 *              （可见光拍表盘时单位随表计，如 MPa），留空由人工按表计填。
 * @param kind 采集方式
 * @returns 默认单位（可能为空串）
 */
export const defaultUnitOfCapture: Record<CaptureKind, string> = {
  可见光: "",
  红外: "℃",
  气体: "%LEL",
  声音: "",
};

/** 设备统计：台账页顶部 KPI 用 */
export function deviceStats(s: State) {
  const ds = s.devices || [];
  return {
    total: ds.length,
    inUse: ds.filter((d) => d.state !== "停用").length,
    stopped: ds.filter((d) => d.state === "停用").length,
    itemTotal: ds.reduce((n, d) => n + d.items.length, 0),
    itemOff: ds.reduce(
      (n, d) => n + d.items.filter((it) => !it.inspect).length,
      0,
    ),
  };
}

/* ── 区域主数据（工厂树第一层）────────────────────────────────────────
   区域是**可维护的主数据**（后台管理里增删改），设备按安装位置前缀归属；
   设备树分组、地图/设备的"区域"下拉都从这里取，保证同一份口径。 */

/**
 * 设备归属的区域
 * @description 优先取设备主数据的厂区字段（后台管理里显式指定）；未指定时按
 *              区域清单里的名称对安装位置做前缀匹配（如"一期罐区北侧"→"一期罐区"）。
 * @param s 状态
 * @param d 设备
 * @returns 区域名称；无法归属时返回「未分区」
 */
export function areaNameOf(s: State, d: DeviceAsset): string {
  if (d.region) return d.region;
  const hit = (s.areas || []).find(
    (a) => a.name && d.locationDesc.startsWith(a.name),
  );
  if (hit) return hit.name;
  // 旧缓存没有区域主数据时的兼容回落（与历史设备树的硬编码口径一致）
  if (d.locationDesc.startsWith("一期罐区")) return "一期罐区";
  if (d.locationDesc.startsWith("装置区")) return "装置区";
  return "未分区";
}

/**
 * 区域下拉 / 设备树可用的区域清单
 * @description 区域主数据 ∪ 设备实际归属（去重、剔除「未分区」），
 *              老缓存里区域主数据缺失时也能从设备安装位置兜底出可选项。
 * @param s 状态
 * @returns 区域名称列表（保持主数据顺序，新出现的归属追加在后）
 */
export function areaOptions(s: State): string[] {
  const names = (s.areas || []).map((a) => a.name).filter(Boolean);
  const derived = (s.devices || []).map((d) => areaNameOf(s, d));
  return [...new Set([...names, ...derived])].filter(
    (x) => x && x !== "未分区",
  );
}
