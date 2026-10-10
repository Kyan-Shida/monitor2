/**
 * @file alarmTemplates.ts
 * @description 告警模板与平台标准规则库（后台管理 › 告警模板管理，平台唯一维护入口）：
 *              · 模板：把常用的告警判定沉淀为「名称 + 触发条件 + 处理流程」，供各点位 / 规则引用，
 *                避免每个页面各写一套阈值、各写一套处置步骤；
 *              · 规则库：平台级标准告警规则（名称 / 级别 / 类型 / 阈值 / 触发条件），
 *                在点位规则的编辑弹窗里可一键套用，套用即生成该点位规则的新版本。
 *              引用关系（其他页面如何消费本文件的数据）：
 *                ① 点位判定规则（alarmRules.rulesOf）：点位没有绑巡检目标台账时，
 *                   按检测类型匹配**启用**模板，取模板的触发条件与告警等级；
 *                ② 结果快照（Result.ruleSnapshot）：采集时写入 templateId，
 *                   告警处置页据此展示「引用模板的处理流程」；
 *                ③ 「采集结果与告警规则」页：只读展示模板与规则库（引用方）；
 *                ④ 告警规则编辑弹窗：可套用模板 / 规则库条目。
 * @interaction types.ts（State.alarmTemplates / State.alarmRuleLib）、alarmRules.ts、
 *              engine.ts（SAVE_ALARM_TEMPLATE / SAVE_ALARM_RULE_LIB）、
 *              pages/AlarmTemplates.tsx、pages/AlarmConfiguration.tsx、pages/Results.tsx
 */
import type { AlarmLevel, State } from "./types";

/**
 * 触发条件：模板与规则库共用同一套结构化口径（与点位判定规则 AlarmRule 的判定口径一致）
 * @property type 判定类型：数值范围（区间） / 期望状态（等于某状态）
 * @property unit 单位（数值范围用）
 * @property min 下限（含）
 * @property max 上限（含）
 * @property expected 期望状态（期望状态用）
 * @property mode 触发逻辑：单次即触发 / 连续确认
 * @property consecutive 连续确认次数（mode = 连续确认 时生效，至少 2）
 */
export interface AlarmTrigger {
  type: "数值范围" | "期望状态";
  unit: string;
  min: number;
  max: number;
  expected: string;
  mode: "单次即触发" | "连续确认";
  consecutive: number;
}

/** 告警模板：可复用的「名称 + 触发条件 + 处理流程」 */
export interface AlarmTemplate {
  id: string;
  name: string;
  /** 适用检测类型：与点位的检测项 / 单位换算出的类型匹配（见 kindOfUnit） */
  kinds: ApplyKind[];
  trigger: AlarmTrigger;
  /** 默认告警等级：点位规则引用模板时带出 */
  level: AlarmLevel;
  /** 处理流程：处置步骤（按顺序执行，告警处置页按此清单展示） */
  flow: string[];
  /**
   * 声光报警持续时长（秒）
   * @description 0 = 不启动声光报警；随告警一起下发到执行端 / 现场控制器，
   *              处置页与告警记录都按此口径展示（机器人本体事件由本体配置决定）
   */
  alarmSeconds: number;
  enabled: boolean;
  version: number;
  /** 最近修改时间 */
  updatedAt: string;
}

/** 检测类型：模板 / 规则的适用范围（由点位单位换算，或由巡检要求显式声明） */
export const APPLY_KINDS = [
  "压力",
  "温度",
  "气体浓度",
  "阀门状态",
  "位移",
  "液位",
  "声纹",
  "不安全行为",
  "外观",
] as const;
export type ApplyKind = (typeof APPLY_KINDS)[number];

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

/**
 * 台账 / 点位的检测类型（匹配告警模板的统一口径）
 * @description 优先用**巡检要求的显式声明**（声纹 / AI 行为 / 外观这类没有量纲的环境类目标，
 *              按单位换算会误判成"阀门状态"），没有声明才按单位换算
 * @param s 全局状态
 * @param requirementId 巡检要求 id（台账 `requirementId`）
 * @param unit 台账 / 点位单位（兜底口径）
 * @returns 检测类型
 */
export function kindOfTarget(
  s: State,
  requirementId?: string,
  unit?: string,
): ApplyKind {
  const req = (s.requirements || []).find((r) => r.id === requirementId);
  return req?.detectKind || kindOfUnit(unit || "");
}

/** 全部告警模板（未初始化时为空数组，页面读不到 undefined） */
export const templatesOf = (s: State): AlarmTemplate[] => s.alarmTemplates || [];
/**
 * 模板被多少个巡检目标台账引用（按 `BusinessAlarm.templateId` 统计）
 * @description 「告警模板」与「告警规则库」已合并为一套模板，页面按"谁在引用"展示影响面：
 *              台账数在此统计；点位规则数由页面配合 `rulesOf` 一起算
 *              （本文件被 alarmRules 引用，故不反向依赖它，避免循环）
 * @param s 全局状态
 * @param id 模板 ID
 * @returns 引用该模板的台账条数
 */
export const templateRefCountOf = (s: State, id: string): number =>
  (s.businessTargets || []).filter((b) => b.alarm?.templateId === id).length;

/**
 * 取生效模板
 * @description 先认**巡检目标台账显式关联**的模板（`BusinessAlarm.templateId`），
 *              再按**检测类型**自动匹配启用模板（检测类型由 kindOfTarget 给出）；
 *              同类型有多个模板时，优先取触发条件单位与目标单位一致的那个；
 *              台账关联的模板被停用 / 删除时回落到类型匹配，不会让点位突然"没有判定口径"
 * @param s 全局状态
 * @param kind 检测类型（台账：kindOfTarget；无台账点位：kindOfUnit）
 * @param unit 目标单位（同类型多模板时的优先依据）
 * @param preferredId 台账关联的模板 ID（可选）
 * @returns 命中的模板；无命中时返回 undefined（调用方回落台账 / 默认量程）
 */
export function templateFor(
  s: State,
  kind: ApplyKind,
  unit?: string,
  preferredId?: string,
): AlarmTemplate | undefined {
  const list = templatesOf(s).filter((t) => t.enabled);
  const preferred = preferredId
    ? list.find((t) => t.id === preferredId)
    : undefined;
  if (preferred) return preferred;
  const same = list.filter((t) => t.kinds.includes(kind));
  return (
    (unit && same.find((t) => t.trigger.unit && t.trigger.unit === unit)) ||
    same[0]
  );
}

/**
 * 触发条件文案（列表、引用处、快照说明共用同一套措辞）
 * @param t 触发条件
 * @returns 如「低于 0.2 或高于 0.8 MPa」「不等于 开启」
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

/**
 * 规则的处理流程：优先取引用模板的（模板是流程的唯一维护点）
 * @param s 全局状态
 * @param templateId 规则引用的模板 ID
 * @returns 处置步骤；未引用模板或模板已删除时返回空数组
 */
export const flowOf = (s: State, templateId?: string): string[] =>
  (templateId && templatesOf(s).find((t) => t.id === templateId)?.flow) || [];
