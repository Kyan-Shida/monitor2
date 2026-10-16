import type { AlarmLevel, ApplyKind, Point, State } from "./types";

/**
 * 触发条件：台账 / 告警项判定口径的结构化表达
 * @description 列表与详情页的「触发条件 / 触发逻辑 / 声光报警」文案都由它派生（见本文件底部三个文案函数）
 * @property type 判定类型：数值范围（区间） / 期望状态（等于某状态）
 * @property unit 单位（数值范围用）
 * @property min 下限（含）
 * @property max 上限（含）
 * @property expected 期望状态（期望状态用）
 * @property mode 触发逻辑：识别即触发 / 连续确认
 * @property consecutive 连续确认次数（mode = 连续确认 时生效，至少 2）
 */
export interface AlarmTrigger {
  type: "数值范围" | "期望状态";
  unit: string;
  min: number;
  max: number;
  expected: string;
  mode: "识别即触发" | "连续确认";
  consecutive: number;
}

/**
 * 检测类型：由单位换算（仪表类目标有量纲，单位即业务语义）
 * @param unit 单位（MPa / ℃ / %LEL / ppm / m…）；无量纲（阀位 / 状态类）归入阀门状态
 * @returns 检测类型
 */
export function kindOfUnit(unit: string): ApplyKind {
  if (unit === "MPa") return "压力";
  if (unit === "℃") return "温度";
  if (unit === "%LEL" || unit === "ppm") return "气体浓度";
  if (unit === "m") return "位移";
  return "阀门状态";
}

export interface AlarmRule {
  id: string;
  name: string;
  pointId: string;
  type: "数值范围" | "期望状态";
  unit: string;
  min: number;
  max: number;
  expected: string;
  /** 风险等级：一级 / 二级 / 三级 */
  level: AlarmLevel;
  enabled: boolean;
  /** 通知对象（来自巡检目标台账的告警设置），随告警记录带出 */
  notify?: string[];
  /** 触发逻辑：识别即触发 / 连续确认（连续 N 次超限才触发，抑制抖动误报） */
  triggerMode?: "识别即触发" | "连续确认";
  /** 连续确认次数：triggerMode = 连续确认 时生效（至少 2） */
  consecutive?: number;
  /** 声光报警持续时长（秒），0 = 不启动 */
  alarmSeconds?: number;
  /**
   * 处置流程步骤
   * @description 随结果快照带出；配置侧已无填写入口，老数据 / 快照里已有的步骤仍照常展示
   */
  flow?: string[];
  version: number;
}
/**
 * 默认判定阈值：按**单位**给量程，而不是按业务类型（`Point.kind`）
 * @description J′ 口径收敛的一部分：业务类型（仪表 / 阀门）只用于展示与设备主数据关联，
 *              判定标准必须由"检测项 + 单位"决定（如 压力 MPa 量程 0.2–0.8、温度 ℃ 上限 60、气体 %LEL 上限 20）
 */
const DEFAULT_RANGE: Record<string, { min: number; max: number }> = {
  MPa: { min: 0.2, max: 0.8 },
  "℃": { min: 0, max: 60 },
  "%LEL": { min: 0, max: 20 },
  m: { min: 0, max: 5 },
};

/**
 * 按单位取默认量程
 * @description 唯一口径：点位判定规则与巡检目标台账的默认阈值都调用它，避免两处量程不一致
 * @param unit 单位（MPa / ℃ / %LEL / m …）
 * @returns 量程；无单位（无量纲项）返回 undefined
 */
export const defaultRangeOfUnit = (unit?: string) =>
  unit ? DEFAULT_RANGE[unit] || { min: 0, max: 1 } : undefined;

/**
 * 巡检点绑定的巡检目标台账（取其第一个巡检项所绑的）
 * @param s 全局状态
 * @param p 巡检点
 * @returns 巡检目标台账；无巡检项或目标已被删除时返回 undefined
 */
export const targetOfPoint = (s: State, p: Point) =>
  (p.inspectItems || [])
    .map((sp) => s.businessTargets?.find((b) => b.id === sp.targetId))
    .find(Boolean);

/**
 * 各点位的判定规则
 * @description **默认来源 = 该巡检点绑定的巡检目标台账**：判定方式 / 阈值 / 告警等级 /
 *              是否告警全部取自「巡检目标台账 › 配业务逻辑与算法」——与「告警管理 › 告警设置」
 *              是同一份数据（告警项第一条即台账判定口径）；巡检点、点位都不提供告警配置。
 *              已存规则（`s.alarmRules`，历史版本）优先于业务目标，保证"规则版本 + 结果快照"语义；
 *              两者都没有时按"检测项单位"生成兜底规则
 * @param s 全局状态
 * @returns 与 `s.points` 一一对应的规则列表
 */
export function rulesOf(s: State): AlarmRule[] {
  return s.points.map((p) => {
    const stored = s.alarmRules?.find((r) => r.pointId === p.id);
    if (stored) {
      /**
       * 已存规则优先，但**告警开关以台账侧为准**：「告警管理 › 告警设置」停用后，
       * 该点位即使存过规则也不再判定（开关是平台唯一的告警总闸）
       */
      const bt0 = targetOfPoint(s, p);
      const on = !bt0 || (bt0.inspect !== false && bt0.alarm?.enabled !== false);
      return on ? stored : { ...stored, enabled: false };
    }
    const bt = targetOfPoint(s, p);
    if (bt) {
      const range = bt.judge === "数值范围";
      return {
        id: "RULE-" + p.id,
        name: (bt.goal || p.name) + " 标准",
        pointId: p.id,
        type: range ? "数值范围" : "期望状态",
        unit: bt.unit || p.unit,
        min: range ? (bt.min ?? 0) : 0,
        max: range ? (bt.max ?? 0) : 0,
        expected: bt.expected || "开启",
        // 等级：台账「告警设置」显式设置（无设置按二级）
        level: bt.alarm?.level || "二级",
        // 告警开关（「告警管理 › 告警设置」的状态）：停用后该台账只记录结果、不做异常判定；
        // 与「是否巡检」是两个独立开关（后者控制是否进入任务指令集）
        enabled: bt.inspect !== false && bt.alarm?.enabled !== false,
        notify: bt.alarm?.notify,
        triggerMode: bt.alarm?.triggerMode || "识别即触发",
        consecutive: bt.alarm?.consecutive || 1,
        alarmSeconds: bt.alarm?.alarmSeconds ?? 0,
        flow: bt.alarm?.flow || [],
        version: 1,
      };
    }
    /**
     * 兜底分支：点位没有绑巡检目标台账时，按"检测项单位"给量程（无单位 = 无量纲项，按期望状态判定）
     * @description 平台不再有"按检测类型自动套用模板"的口径：没有台账就没有业务判定依据，
     *              只给一个与单位自洽的量程兜底
     */
    const range = defaultRangeOfUnit(p.unit);
    return {
      id: "RULE-" + p.id,
      name: p.name + "标准",
      pointId: p.id,
      type: range ? "数值范围" : "期望状态",
      unit: p.unit,
      min: range?.min ?? 0,
      max: range?.max ?? 0,
      expected: "开启",
      level: "二级",
      enabled: ["P001", "P002", "P003"].includes(p.id),
      triggerMode: "识别即触发",
      consecutive: 1,
      alarmSeconds: 0,
      flow: [],
      version: 1,
    };
  });
}
export function evaluateRule(rule: AlarmRule | undefined, value: string) {
  if (!rule || !rule.enabled)
    return {
      abnormal: false,
      reason: "规则未配置或停用，本次仅记录结果，不做判定",
      valid: false,
    };
  if (!value.trim())
    return {
      abnormal: false,
      reason: "识别结果为空，本次不做判定",
      valid: false,
    };
  if (
    rule.type === "数值范围" &&
    (!value.trim() || !Number.isFinite(Number(value)))
  )
    return { abnormal: false, reason: "无有效数值，本次不做判定", valid: false };
  const abnormal =
    rule.type === "期望状态"
      ? value !== rule.expected
      : Number(value) < rule.min || Number(value) > rule.max;
  return {
    abnormal,
    valid: true,
    reason:
      rule.type === "期望状态"
        ? `期望 ${rule.expected}；实测 ${value}`
        : `正常范围 ${rule.min}–${rule.max} ${rule.unit}；实测 ${value}`,
  };
}

export interface SystemRules {
  heartbeatSeconds: number;
  dispatchSeconds: number;
  lowBattery: number;
  version: number;
}
export const systemRulesOf = (s: State): SystemRules =>
  s.systemRules || {
    heartbeatSeconds: 30,
    dispatchSeconds: 15,
    lowBattery: 20,
    version: 1,
  };

/**
 * 触发条件文案（列表、详情、快照说明共用同一套措辞）
 * @param t 触发条件
 * @returns 如「低于 0.2 或高于 0.8 MPa」「不等于「开启」」
 */
export function triggerText(t: AlarmTrigger): string {
  return t.type === "期望状态"
    ? `不等于「${t.expected}」`
    : `低于 ${t.min} 或高于 ${t.max}${t.unit ? " " + t.unit : ""}`;
}

/**
 * 触发逻辑文案
 * @description 触发逻辑 = 判定命中后**什么时候**生成告警，按条件类型分别说清楚：
 *              · 数值范围：识别超限即触发（单次）/ 连续 N 次识别超限确认
 *              · 期望状态：识别不符即触发（单次）/ 连续 N 次识别不符确认
 * @param t 触发条件
 * @returns 如「识别超限即触发」「连续 2 次识别不符确认」
 */
export function logicText(t: AlarmTrigger): string {
  const hit = t.type === "期望状态" ? "识别不符" : "识别超限";
  return t.mode === "连续确认"
    ? `连续 ${Math.max(2, t.consecutive)} 次${hit}确认`
    : `${hit}即触发`;
}

/**
 * 声光报警文案（列表、处置页、告警留痕共用同一套措辞）
 * @param seconds 声光报警持续时长（秒）
 * @returns 如「声光报警 10 秒」；0 或未配置时返回「不启用声光报警」
 */
export const alarmText = (seconds?: number): string =>
  seconds ? `声光报警 ${seconds} 秒` : "不启用声光报警";
