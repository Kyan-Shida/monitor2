/**
 * @file alarmSettings.ts
 * @description 告警设置（告警管理 › 告警设置）与巡检目标台账「3、告警规则」的共用口径：
 *              · 一个台账只有一个告警设置（就是 `BusinessTarget.alarm`），两个入口读写同一份数据 = 天然同步；
 *              · 告警项字段与台账告警规则一致，**第一条（主告警项）与台账的判定口径同源**
 *                （judge / min / max / expected / level / 声光报警），改任一处另一处同步；
 *              · `enabled` 是平台唯一的「告警开关」：停用后该台账只记录结果、不做异常判定；
 *              · 告警类别的启用状态决定可选「告警类型」与告警记录的分类筛选项。
 * @interaction types.ts（AlarmClass / AlarmItem / BusinessAlarm）、alarmRules.ts（判定口径）、
 *              engine.ts（SAVE_ALARM_SETTING / SAVE_ALARM_CLASS / REMOVE_ALARM_CLASS）、
 *              pages/AlarmClasses.tsx、pages/AlarmSettings.tsx、pages/BusinessTargets.tsx、pages/Results.tsx
 */
import {
  ALARM_CLASS_MAINS,
  ALARM_ITEM_KINDS,
  ALARM_MAIN_OF_CATEGORY,
  type Alarm,
  type AlarmClass,
  type AlarmClassMain,
  type AlarmItem,
  type AlarmItemKind,
  type BusinessAlarm,
  type BusinessTarget,
  type Point,
  type State,
} from "./types";
import type { AlarmTrigger } from "./alarmTemplates";

/**
 * 告警设置所需的最小上下文
 * @description 页面（State）与种子数据都能直接传入：只需告警类别 + 仪表名（补齐缺省值）、
 *              点位与台账（把「告警 → 台账 → 告警类别」串起来）
 */
export interface AlarmSettingHost {
  alarmClasses?: AlarmClass[];
  instruments?: { id: string; name?: string }[];
  points?: Point[];
  businessTargets?: BusinessTarget[];
  /** 巡检要求（台账没挂仪表时，用要求名兜底台账派生名：如区域 / 环境类目标） */
  requirements?: { id: string; name: string }[];
}

/** 环境识别分类候选：环境 / 区域类告警项的识别细分（仪表类不适用） */
export const ENV_RECOGNIZE_KINDS = [
  "气体浓度",
  "红外测温",
  "声纹",
  "不安全行为",
  "外观识别",
] as const;

/** 全部告警类别（未初始化时为空数组，页面读不到 undefined） */
export const alarmClassesOf = (s: AlarmSettingHost): AlarmClass[] =>
  s.alarmClasses || [];

/** 启用中的告警类别：告警设置「告警类型」下拉与告警记录分类筛选的数据源 */
export const enabledAlarmClassesOf = (s: AlarmSettingHost): AlarmClass[] =>
  alarmClassesOf(s).filter((c) => c.enabled);

/**
 * 告警记录可选的分类筛选项（按告警大类去重）
 * @description 选项取自「告警类别」里启用分类的大类，全部停用该大类后该项不再出现
 * @param s 状态上下文
 * @returns 告警大类清单（顺序与 ALARM_CLASS_MAINS 一致）
 */
export function alarmMainOptionsOf(s: AlarmSettingHost): AlarmClassMain[] {
  const set = new Set(enabledAlarmClassesOf(s).map((c) => c.main));
  return ALARM_CLASS_MAINS.filter((m) => set.has(m));
}

/** 告警事件的告警大类（告警事件分类「业务 / 机器人」→ 大类的唯一映射） */
export const mainOfAlarm = (category: string): AlarmClassMain =>
  ALARM_MAIN_OF_CATEGORY[category] || "业务预警";

/** 告警事件所属的巡检目标台账（经点位绑定关系反查；机器人本体告警没有业务点位则为空） */
export function targetOfAlarm(
  s: AlarmSettingHost,
  a: Alarm,
): BusinessTarget | undefined {
  const p = s.points?.find((x) => x.id === a.pointId);
  return (p?.inspectItems || [])
    .map((it) => s.businessTargets?.find((b) => b.id === it.targetId))
    .find(Boolean);
}

/**
 * 告警事件的告警类别（分类名称）
 * @description 口径唯一来源 = 告警所属台账的告警设置（`BusinessTarget.alarm.category`），
 *              也就是「告警管理 › 告警设置」里配的告警类型；机器人本体告警没有业务台账，
 *              类别在告警上显式指定；台账缺失时按告警大类取首个启用分类
 * @param s 状态上下文
 * @param a 告警事件
 * @returns 分类名称；完全没有可用分类时返回「未分类」
 */
export function alarmClassOfAlarm(s: AlarmSettingHost, a: Alarm): string {
  if (a.alarmClass) return a.alarmClass;
  const fromSetting = targetOfAlarm(s, a)?.alarm?.category;
  if (fromSetting) return fromSetting;
  const main = mainOfAlarm(a.category);
  return (
    alarmClassesOf(s).find((c) => c.enabled && c.main === main)?.name ||
    "未分类"
  );
}

/**
 * 台账的基础名（不含自定义名与算法）：仪表名 / 区域锚点 / 业务目标，都取不到时回落到台账 ID
 * @description 异常名称等"说的是哪个对象"的场景用它
 * @param s 状态上下文
 * @param t 巡检目标台账
 */
const baseNameOf = (s: AlarmSettingHost, t: BusinessTarget): string => {
  const ins = s.instruments?.find((x) => x.id === t.instrumentId);
  // 仪表名 → 区域锚点 → 巡检要求名（区域 / 环境类没仪表、锚点也还没填时的兜底）→ 业务目标 → 台账 ID
  const req = s.requirements?.find((r) => r.id === t.requirementId);
  return (
    ins?.name ||
    t.anchor ||
    req?.name ||
    (t.goal || "").replace(/^确认/, "") ||
    t.id
  );
};

/**
 * 台账名称的派生值（不含自定义名）：基础名 + 算法
 * @description 表单预填与 targetNameOf 共用同一规则，避免两处口径漂移；
 *              带上算法是为了让同一台仪表下的多条台账（如出口压力表的"读数识别"与"阀位判别"）自然区分开
 * @param s 状态上下文
 * @param t 台账，或台账表单草稿（至少含 instrumentId / anchor / algorithm）
 * @returns 派生名；基础名取不到时回落到台账 ID（不再拼算法）
 */
export function derivedTargetNameOf(
  s: AlarmSettingHost,
  t: Pick<BusinessTarget, "instrumentId" | "anchor" | "algorithm"> & {
    id?: string;
    goal?: string;
    requirementId?: string;
  },
): string {
  const base = baseNameOf(s, t as BusinessTarget);
  return base && base !== t.id && t.algorithm ? `${base} · ${t.algorithm}` : base;
}

/**
 * 台账的展示名：自定义台账名称优先，留空时用派生值（见 derivedTargetNameOf）
 * @description 列表「名称」列、告警名称与异常名称的默认值都取这里
 * @param s 状态上下文
 * @param t 巡检目标台账
 * @returns 展示名；自定名与派生值都取不到时回落到台账 ID
 */
export function targetNameOf(s: AlarmSettingHost, t: BusinessTarget): string {
  return t.name || derivedTargetNameOf(s, t);
}

/**
 * 默认告警类型：按目标类型挑一个可用的启用分类
 * @description 业务台账都归「业务预警」：仪表类判读数 / 阀位 → 生产运行；
 *              环境 / 区域类判识别结果 → 环境安全（人员与作业类无自动来源，在告警设置里选）
 * @param s 状态上下文
 * @param t 巡检目标台账
 * @returns 分类名称；无任何告警类别时返回空串
 */
export function defaultAlarmClassOf(
  s: AlarmSettingHost,
  t: BusinessTarget,
): string {
  const want = t.targetKind === "仪表" ? "生产运行" : "环境安全";
  const list = alarmClassesOf(s);
  const biz = list.filter((c) => c.main === "业务预警");
  return (
    biz.find((c) => c.name === want)?.name ||
    biz.find((c) => c.enabled)?.name ||
    list.find((c) => c.enabled)?.name ||
    list[0]?.name ||
    ""
  );
}

/**
 * 告警项的告警分类（按目标类型带出默认值）
 * @description 仪表类目标判的是数值 / 状态 → 普通预警；环境 / 区域类判的是识别结果 → 环境预警
 * @param t 巡检目标台账
 * @returns 告警分类
 */
export const itemKindOfTarget = (
  t: Pick<BusinessTarget, "targetKind">,
): AlarmItemKind => (t.targetKind === "仪表" ? "普通预警" : "环境预警");

/**
 * 归一化告警项的告警分类
 * @description 老口径（schema 9 及以前）该字段放的是「告警类别名称」，统一按目标类型回落两档枚举
 * @param t 巡检目标台账
 * @param it 告警项
 * @returns 合法的告警分类
 */
export const itemKindOfItem = (
  t: Pick<BusinessTarget, "targetKind">,
  it: AlarmItem,
): AlarmItemKind =>
  (ALARM_ITEM_KINDS as readonly string[]).includes(it.category)
    ? (it.category as AlarmItemKind)
    : itemKindOfTarget(t);

/** 环境识别分类：只有环境 / 区域类目标有识别细分（仪表类返回 undefined） */
export const envKindOfTarget = (
  t: BusinessTarget,
  detectKind?: string,
): string | undefined => (t.targetKind === "仪表" ? undefined : detectKind);

/**
 * 由台账现有字段派生**主告警项**（台账新增时的默认项 / 老缓存补齐）
 * @param s 状态上下文
 * @param t 巡检目标台账
 * @param detectKind 巡检要求声明的检测类型（环境 / 区域类的识别分类来源）
 * @returns 与台账判定口径完全一致的第一条告警项
 */
export function mainItemOf(
  s: AlarmSettingHost,
  t: BusinessTarget,
  detectKind?: string,
): AlarmItem {
  const range = t.judge === "数值范围";
  return {
    id: "AI-" + t.id,
    // 告警分类 = 告警项自己的两档枚举（与台账「告警类型」是两个字段）
    category: itemKindOfTarget(t),
    // 主项与台账判定口径同源：台账关联了模板就记在第一条上（表格里可换成别的模板或手填）
    templateId: t.alarm?.templateId,
    envKind: t.alarm?.items?.[0]?.envKind ?? envKindOfTarget(t, detectKind),
    level: t.alarm?.level || "二级",
    judge: t.judge,
    value: range ? undefined : t.expected || "开启",
    from: range ? (t.min ?? 0) : undefined,
    to: range ? (t.max ?? 0) : undefined,
    unit: t.unit,
    // 异常名称只说「哪个对象异常」：自定义台账名优先，不带算法（算法是判定方式，不是对象）
    abnormalName: `${t.name || baseNameOf(s, t)} · 异常`,
    alarmSeconds: t.alarm?.alarmSeconds ?? 10,
  };
}

/**
 * 台账的告警设置（缺省口径：类型按目标类型带、开关缺省启用、告警项至少主项）
 * @description 告警名称不在此返回：名称统一由台账名称派生（targetNameOf），避免同一对象两个名字
 * @param s 状态上下文
 * @param t 巡检目标台账
 * @returns 完整可渲染的告警设置；不修改入参
 */
export function settingOf(
  s: AlarmSettingHost,
  t: BusinessTarget,
): Required<Pick<BusinessAlarm, "category" | "enabled" | "items">> {
  const items = t.alarm?.items?.length ? t.alarm.items : [mainItemOf(s, t)];
  return {
    category: t.alarm?.category || defaultAlarmClassOf(s, t),
    enabled: t.alarm?.enabled !== false,
    items: items.map((it, i) => ({
      ...it,
      // 告警分类按两档枚举归一化后回显（老缓存里存的是告警类别名称）
      category: itemKindOfItem(t, it),
      // 主项 = 台账判定口径：老缓存里告警项没有模板引用时，按台账关联的模板回落
      ...(i === 0 && !it.templateId && t.alarm?.templateId
        ? { templateId: t.alarm.templateId }
        : {}),
      // 主项缺单位 / 异常名称时按台账补齐（老缓存打开即空着，这里预填）
      ...(i === 0 && !it.unit && t.unit ? { unit: t.unit } : {}),
      ...(i === 0 && !it.abnormalName?.trim()
        ? { abnormalName: `${t.name || baseNameOf(s, t)} · 异常` }
        : {}),
    })),
  };
}

/**
 * 老缓存补齐（幂等）：写入告警类型 / 开关 / 告警项，只补缺、不覆盖已有值
 * @description 同时清掉已废弃的告警名称字段，避免老缓存继续用旧名回显
 * @param s 状态上下文
 * @param t 巡检目标台账
 * @returns 补齐后的台账（已齐备时原样返回）
 */
export function withAlarmSetting(s: AlarmSettingHost, t: BusinessTarget): BusinessTarget {
  if (
    t.alarm?.items?.length &&
    t.alarm.name === undefined &&
    t.alarm.category &&
    t.alarm.enabled !== undefined &&
    // 告警分类必须是两档枚举（老缓存存的是告警类别名称，需要重写）
    t.alarm.items.every((it) =>
      (ALARM_ITEM_KINDS as readonly string[]).includes(it.category),
    )
  )
    return t;
  const set = settingOf(s, t);
  return {
    ...t,
    alarm: {
      level: "二级",
      ...t.alarm,
      // 告警名称已废弃：名称统一由台账名称派生，老缓存里的残留值一并清掉
      name: undefined,
      category: set.category,
      enabled: t.alarm?.enabled !== false,
      items: set.items,
    },
  };
}

/** 用主告警项替换列表第一条（保留其余扩展项）；没有列表时只留主项 */
export const withMainAlarmItem = (
  items: AlarmItem[] | undefined,
  main: AlarmItem,
): AlarmItem[] => (items?.length ? [main, ...items.slice(1)] : [main]);

/**
 * 应用一条告警设置：写回台账的 alarm，并把台账判定口径同步为第一条告警项
 * @description 「台账 ↔ 告警设置」双向同步的落点：告警设置页与台账页保存时都走这里
 * @param t 巡检目标台账
 * @param set 告警设置（类型 / 开关 / 告警项）
 * @returns 更新后的台账（新对象）
 */
export function applyAlarmSetting(
  t: BusinessTarget,
  set: { category: string; enabled: boolean; items: AlarmItem[] },
): BusinessTarget {
  const main = set.items[0];
  const range = main.judge === "数值范围";
  const templateId = main.templateId;
  const alarm: BusinessAlarm = {
    ...(t.alarm || { level: main.level }),
    level: main.level,
    // 声光报警随主告警项同步（模板来源的规则在采集时按模板下发）
    alarmSeconds: main.alarmSeconds,
    /**
     * 台账的「告警规则来源」由主告警项决定：主项引用了模板 = 模板来源（引擎按模板判定），
     * 否则为手填；每条的模板引用只影响该条自身，其余扩展项不参与台账判定
     */
    source: templateId ? "模板" : "手动",
    templateId,
    // 告警名称已废弃（由台账名称派生）：写回时清掉残留值
    name: undefined,
    category: set.category,
    enabled: set.enabled,
    items: set.items,
  };
  return {
    ...t,
    judge: main.judge,
    unit: range ? main.unit ?? t.unit : undefined,
    min: range ? (main.from ?? 0) : undefined,
    max: range ? (main.to ?? 0) : undefined,
    expected: range ? undefined : main.value || "开启",
    alarm,
  };
}

/**
 * 告警项校验
 * @param items 告警项清单
 * @returns 错误文案；通过时返回空串
 */
export function checkAlarmItems(items: AlarmItem[]): string {
  if (!items.length) return "请至少添加一条告警项";
  for (const it of items) {
    if (!(ALARM_ITEM_KINDS as readonly string[]).includes(it.category))
      return "请为每条告警项选择告警分类（普通预警 / 环境预警）";
    if (!it.abnormalName?.trim()) return "请填写异常名称";
    if (it.judge === "数值范围") {
      if (
        !Number.isFinite(it.from) ||
        !Number.isFinite(it.to) ||
        (it.from as number) > (it.to as number)
      )
        return "数值范围的起始值需不大于结束值";
    } else if (!it.value?.trim()) return "期望状态需填写判断值";
    if (!Number.isFinite(it.alarmSeconds) || it.alarmSeconds < 0)
      return "声光报警需为不小于 0 的秒数";
  }
  return "";
}

/** 新建一条空白告警项（「+ 告警等级配置」用） */
export function newAlarmItem(
  category: AlarmItemKind,
  level: AlarmItem["level"] = "二级",
  /** 异常名称缺省值（按台账名预填，用户可改；不再留空） */
  abnormalName = "",
): AlarmItem {
  return {
    id: "AI-" + Math.random().toString(36).slice(2, 8),
    category,
    level,
    judge: "数值范围",
    from: 0,
    to: 0,
    abnormalName,
    alarmSeconds: 10,
  };
}

/**
 * 用告警模板填充一条告警项（「告警模板」下拉选中即带出内容字段）
 * @description 只覆盖模板负责的字段（判断类型 / 阈值 / 单位 / 等级 / 声光报警）；
 *              告警分类 / 环境识别分类 / 异常名称 / ID 保持该行原值，选中后仍可手改
 * @param base 该告警项当前值
 * @param tpl 告警模板（触发条件 / 等级 / 声光报警）
 * @returns 填充后的告警项（新对象）；模板不适用时由调用方回落手填
 */
export function itemFromTemplate(
  base: AlarmItem,
  tpl: {
    id: string;
    level: AlarmItem["level"];
    trigger: AlarmTrigger;
    alarmSeconds: number;
  },
): AlarmItem {
  const range = tpl.trigger.type === "数值范围";
  return {
    ...base,
    templateId: tpl.id,
    level: tpl.level,
    judge: tpl.trigger.type,
    value: range ? undefined : tpl.trigger.expected,
    from: range ? tpl.trigger.min : undefined,
    to: range ? tpl.trigger.max : undefined,
    unit: range ? tpl.trigger.unit || base.unit : undefined,
    alarmSeconds: tpl.alarmSeconds,
  };
}
