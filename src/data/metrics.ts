/**
 * @file metrics.ts
 * @description 指标中心：全平台唯一的指标口径来源，驾驶舱 / 工作台 / 报表一律消费本文件，禁止页面内自行计算
 * @interaction 被 pages/MonitorCockpit.tsx、pages/DispatchCockpit.tsx、pages/Workbench.tsx 消费
 */
import type { State } from "./types";
import { terminal } from "./selectors";
import { deviceOf } from "./deviceMaster";

/** 口径配置：成本 / 人力换算系数（口径可配，配置中心可改） */
export const METRIC_CONFIG = {
  /** 每完成一个巡检任务的成本节省（万元） */
  costPerTask: 0.12,
  /** 每完成一个巡检任务的人力节省（人·班） */
  laborPerTask: 0.5,
  /** 即将超期阈值（分钟）：完成时限距当前不足该值时进入关注 */
  dueSoonMinutes: 15,
};
/** 即将超期阈值（毫秒），供工作台与指标中心共用，避免两处阈值不一致 */
export const DUE_SOON_MS = METRIC_CONFIG.dueSoonMinutes * 60 * 1000;

export interface MetricDef {
  key: string;
  name: string;
  /** 口径说明：必须与展示给用户的文字一致 */
  formula: string;
  unit: string;
  /** 目标值；无目标时为 undefined */
  target?: number;
  /** 是否正向指标（越大越好），决定趋势箭头与达标判断方向 */
  positive: boolean;
  /** 可下钻维度 */
  dims: string[];
  /** 可见角色 ID；"*" 表示全部角色可见 */
  roles: string[] | "*";
  calc: (s: State) => number;
}

/** 百分比计算，保留一位小数 */
const pct = (a: number, b: number) =>
  b > 0 ? Math.round((a / b) * 1000) / 10 : 0;
/**
 * 按数据范围裁剪状态视图
 * 驾驶舱厂区筛选、角色数据范围（分管厂区/责任设备）都通过它表达，
 * 指标计算函数因此不必内嵌筛选条件，保证口径唯一
 * @param s 全量状态
 * @param region 厂区；undefined 或「全部区域」表示不限
 * @returns 裁剪后的状态（浅拷贝，不修改原状态）
 */
export function scopedState(s: State, region?: string): State {
  if (!region || region === "全部区域") return s;
  const mapIds = s.maps.filter((m) => m.region === region).map((m) => m.id);
  const taskIds = new Set(
    s.tasks.filter((t) => mapIds.includes(t.mapId)).map((t) => t.id),
  );
  const alarmIds = new Set(
    s.alarms.filter((a) => taskIds.has(a.taskId)).map((a) => a.id),
  );
  return {
    ...s,
    robots: s.robots.filter((r) => r.region === region),
    tasks: s.tasks.filter((t) => mapIds.includes(t.mapId)),
    results: s.results.filter((r) => taskIds.has(r.taskId)),
    alarms: s.alarms.filter((a) => taskIds.has(a.taskId)),
    maps: s.maps.filter((m) => m.region === region),
    points: s.points.filter((p) => mapIds.includes(p.mapId)),
    // 设备清单同按厂区裁剪：覆盖率的分母必须与分子同一范围，否则厂区筛选后覆盖率会被拉低
    devices: s.devices?.filter((d) => !d.region || d.region === region),
    workOrders: s.workOrders.filter((w) => alarmIds.has(w.alarmId)),
    fieldOrders: s.fieldOrders.filter((f) =>
      s.robots.some((r) => r.id === f.robotId && r.region === region),
    ),
  };
}
/** 在线机器：非离线状态 */
const onlineCount = (s: State) => s.robots.filter((r) => r.state !== "离线").length;
/** 发生人工干预（接管 / 抢占）的对象集合 */
const intervened = (s: State) =>
  new Set(
    s.logs
      .filter((l) => /接管|抢占/.test(l.action))
      .map((l) => l.object),
  );
/** "HH:mm" 时间差（分钟） */
const minutesBetween = (a: string, b: string) => {
  const [h1, m1] = a.split(":").map(Number);
  const [h2, m2] = b.split(":").map(Number);
  return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1));
};

/** 指标定义清单：公式统一、口径统一、角色可见范围统一 */
export const metrics: MetricDef[] = [
  {
    key: "devices",
    name: "机器总数",
    formula: "本租户在册巡检机器总数（机器狗 + 四轮车 + 挂轨）",
    unit: "台",
    positive: true,
    dims: ["厂区", "机型"],
    roles: "*",
    calc: (s) => s.robots.length,
  },
  {
    key: "onlineCount",
    name: "在线机器数",
    formula: "状态不为「离线」的机器台数",
    unit: "台",
    positive: true,
    dims: ["厂区", "机型"],
    roles: "*",
    calc: onlineCount,
  },
  {
    key: "executing",
    name: "执行中任务",
    formula: "状态为「执行中」的任务条数",
    unit: "条",
    positive: true,
    dims: ["厂区", "机型", "计划"],
    roles: "*",
    calc: (s) => s.tasks.filter((t) => t.state === "执行中").length,
  },
  {
    key: "pendingDispatch",
    name: "待调度任务",
    formula: "状态为「待调度」的任务条数",
    unit: "条",
    target: 0,
    positive: false,
    dims: ["厂区", "机型", "计划"],
    roles: "*",
    calc: (s) => s.tasks.filter((t) => t.state === "待调度").length,
  },
  {
    key: "pendingExec",
    name: "待执行任务",
    formula: "状态为「已分配 / 下发中 / 待执行」的任务条数",
    unit: "条",
    positive: false,
    dims: ["厂区", "机型"],
    roles: "*",
    calc: (s) =>
      s.tasks.filter((t) =>
        ["已分配", "下发中", "待执行"].includes(t.state),
      ).length,
  },
  {
    key: "unconfirmedAlarms",
    name: "未确认告警",
    formula: "状态为「待确认」的告警条数",
    unit: "条",
    target: 0,
    positive: false,
    dims: ["厂区", "机型", "告警类型"],
    roles: "*",
    calc: (s) => s.alarms.filter((a) => a.state === "待确认").length,
  },
  {
    key: "lowBattery",
    name: "低电量机器",
    formula: "电量低于本机型最低派单电量的机器台数（机器狗 40% / 四轮车 25% / 挂轨 15%）",
    unit: "台",
    target: 0,
    positive: false,
    dims: ["厂区", "机型"],
    roles: "*",
    calc: (s) =>
      s.robots.filter((r) => r.battery < r.constraints.minBattery).length,
  },
  {
    key: "robotAttention",
    name: "机器待关注",
    formula:
      "离线、电量低于本机型门槛、或地图/点位版本不一致的机器台数（同一台机器只计一次）",
    unit: "台",
    target: 0,
    positive: false,
    dims: ["厂区", "机型"],
    roles: "*",
    calc: (s) =>
      s.robots.filter((r) => {
        if (r.state === "离线" || r.battery < r.constraints.minBattery)
          return true;
        const m = s.maps.find((x) => x.id === r.mapId);
        return !!m && (r.mapVersion !== m.version || r.pointSet !== m.pointSet);
      }).length,
  },
  {
    key: "dueSoonTasks",
    name: "即将超期任务",
    formula: `未终结任务中，完成时限距当前不足 ${METRIC_CONFIG.dueSoonMinutes} 分钟的条数`,
    unit: "条",
    target: 0,
    positive: false,
    dims: ["厂区", "机型", "计划"],
    roles: "*",
    calc: (s) =>
      s.tasks.filter(
        (t) =>
          t.deadline &&
          Date.parse(t.deadline) - Date.now() < DUE_SOON_MS &&
          !terminal.includes(t.state),
      ).length,
  },
  {
    key: "onlineRate",
    name: "在线率",
    formula: "在线机器数 / 机器总数 × 100%，离线状态不计入在线",
    unit: "%",
    target: 95,
    positive: true,
    dims: ["厂区", "机型"],
    roles: "*",
    calc: (s) => pct(onlineCount(s), s.robots.length),
  },
  {
    key: "coverage",
    name: "覆盖率",
    formula:
      "已落位并启用的检测目标数 / 设备清单中声明要巡检（「是否巡检」= 开）的检测目标数 × 100%；无设备清单时回落到「点位启用率」",
    unit: "%",
    target: 98,
    positive: true,
    dims: ["厂区", "机型", "装置"],
    roles: "*",
    calc: (s) => {
      // J′ 口径收敛：分母由「设备清单里声明要巡检的检测目标」决定，
      // 关闭「是否巡检」的目标不进分母；待审核 / 已驳回 / 已停用设备的清单不计入。
      // 这样"清单要求了但还没落位"才会体现为覆盖缺口（原来只统计点位自身启用率，看不出缺口）。
      const targets = (s.devices || [])
        .filter((d) => d.reviewState === "已通过" && d.state !== "停用")
        .flatMap((d) =>
          d.items
            .filter((it) => it.inspect)
            .map((it) => ({ device: d.id, target: it.target })),
        );
      // 兼容回退：旧缓存无设备清单时，按点位启用率计算
      if (!targets.length)
        return pct(
          s.points.filter((p) => p.state === "已启用").length,
          s.points.length,
        );
      const covered = targets.filter((t) =>
        s.points.some(
          (p) =>
            p.state === "已启用" &&
            p.object === t.target &&
            deviceOf(s, p.device)?.id === t.device,
        ),
      ).length;
      return pct(covered, targets.length);
    },
  },
  {
    key: "autoRate",
    name: "自动化率",
    formula: "(已完成任务数 − 发生人工接管或抢占的任务数) / 应执行任务数 × 100%，取消任务不计入分母",
    unit: "%",
    target: 85,
    positive: true,
    dims: ["厂区", "机型", "任务类型"],
    roles: "*",
    calc: (s) => {
      const base = s.tasks.filter((t) => t.state !== "取消");
      const intr = intervened(s);
      const done = base.filter(
        (t) => terminal.includes(t.state) && !intr.has(t.id),
      );
      return pct(done.length, base.length);
    },
  },
  {
    key: "aiAccuracy",
    name: "AI 准确率",
    formula: "(识别结果总数 − 误报数 − 漏报数) / 识别结果总数 × 100%，误报漏报来自复核标注反馈",
    unit: "%",
    target: 92,
    positive: true,
    dims: ["算法版本", "点位", "机型"],
    roles: "*",
    calc: (s) => {
      const fp = s.feedbacks.filter((f) => f.label === "误报").length;
      const fn = s.feedbacks.filter((f) => f.label === "漏报").length;
      const total = s.results.length + fn;
      return pct(total - fp - fn, total);
    },
  },
  {
    key: "falseRate",
    name: "误报率",
    formula: "被标注为误报的告警数 / 告警总数 × 100%",
    unit: "%",
    target: 8,
    positive: false,
    dims: ["机型", "点位", "算法版本"],
    roles: "*",
    calc: (s) =>
      pct(
        s.feedbacks.filter((f) => f.label === "误报").length,
        s.alarms.length,
      ),
  },
  {
    key: "closeRate",
    name: "异常闭环率",
    formula: "状态为「已关闭」的告警数 / 告警总数 × 100%",
    unit: "%",
    target: 95,
    positive: true,
    dims: ["厂区", "机型", "告警类型"],
    roles: "*",
    calc: (s) =>
      pct(s.alarms.filter((a) => a.state === "已关闭").length, s.alarms.length),
  },
  {
    key: "mttr",
    name: "MTTR",
    formula: "已闭环工单的平均处置时长（分钟），处置时长取工单责任链首末时间差",
    unit: "分钟",
    target: 120,
    positive: false,
    dims: ["厂区", "机型"],
    roles: "*",
    calc: (s) => {
      const closed = s.workOrders.filter(
        (w) => w.timeline.length > 1 && ["已验收", "已关闭"].includes(w.state),
      );
      if (!closed.length) return 0;
      const sum = closed.reduce(
        (a, w) =>
          a +
          minutesBetween(
            w.timeline[0].time,
            w.timeline[w.timeline.length - 1].time,
          ),
        0,
      );
      return Math.round(sum / closed.length);
    },
  },
  {
    key: "takeoverRate",
    name: "人工接管率",
    formula: "发生过远程接管或抢占的机器数 / 机器总数 × 100%",
    unit: "%",
    target: 10,
    positive: false,
    dims: ["厂区", "机型"],
    roles: "*",
    calc: (s) => {
      const used = new Set<string>([
        ...s.takeovers.map((t) => t.robotId),
        ...[...intervened(s)].filter((x) => s.robots.some((r) => r.id === x)),
      ]);
      return pct(used.size, s.robots.length);
    },
  },
  {
    key: "taskRate",
    name: "任务完成率",
    formula: "(完成 + 部分完成) 任务数 / 应执行任务数 × 100%，取消任务不计入分母",
    unit: "%",
    target: 90,
    positive: true,
    dims: ["厂区", "机型", "计划"],
    roles: "*",
    calc: (s) => {
      const base = s.tasks.filter((t) => t.state !== "取消");
      const done = base.filter((t) => ["完成", "部分完成"].includes(t.state));
      return pct(done.length, base.length);
    },
  },
  {
    key: "reviewBacklog",
    name: "复核积压量",
    formula: "状态为「待复核」的结果条数",
    unit: "条",
    target: 50,
    positive: false,
    dims: ["机型", "队列"],
    roles: "*",
    calc: (s) => s.results.filter((r) => r.status === "待复核").length,
  },
  {
    key: "scheduleRate",
    name: "排班执行率",
    formula: "资质校验通过的排班数 / 排班总数 × 100%，无证或证书过期视为不可执行",
    unit: "%",
    target: 95,
    positive: true,
    dims: ["班组", "人员", "班次"],
    roles: "*",
    calc: (s) => pct(s.shifts.filter((x) => x.certOk).length, s.shifts.length),
  },
  {
    key: "fieldDone",
    name: "现场保障量",
    formula: "已完成的现场保障工单数（换电 / 清洁 / 卡阻处理等）",
    unit: "单",
    positive: true,
    dims: ["人员", "类型", "机型"],
    roles: "*",
    calc: (s) => s.fieldOrders.filter((f) => f.state === "已完成").length,
  },
  {
    key: "fieldPending",
    name: "现场保障待处理",
    formula: "状态非「已完成」的现场保障工单数",
    unit: "单",
    target: 0,
    positive: false,
    dims: ["人员", "类型"],
    roles: "*",
    calc: (s) => s.fieldOrders.filter((f) => f.state !== "已完成").length,
  },
  {
    key: "costSaving",
    name: "成本节省",
    formula: `已完成任务数 × ${METRIC_CONFIG.costPerTask} 万元/任务（换算系数可在配置中心调整）`,
    unit: "万元",
    positive: true,
    dims: ["厂区", "月份"],
    // 经营口径指标仅管理员可见
    roles: ["admin"],
    calc: (s) =>
      Math.round(
        s.tasks.filter((t) => t.state === "完成").length *
          METRIC_CONFIG.costPerTask *
          100,
      ) / 100,
  },
  {
    key: "laborSaving",
    name: "人力节省",
    formula: `已完成任务数 × ${METRIC_CONFIG.laborPerTask} 人·班/任务（换算系数可在配置中心调整）`,
    unit: "人·班",
    positive: true,
    dims: ["厂区", "月份"],
    // 经营口径指标仅管理员可见
    roles: ["admin"],
    calc: (s) =>
      Math.round(
        s.tasks.filter((t) => t.state === "完成").length *
          METRIC_CONFIG.laborPerTask *
          10,
      ) / 10,
  },
  {
    key: "alarmTotal",
    name: "告警总数",
    formula: "统计周期内产生的告警条数（含已合并的重复告警）",
    unit: "条",
    positive: false,
    dims: ["厂区", "机型", "告警类型"],
    roles: "*",
    calc: (s) => s.alarms.length,
  },
  {
    key: "alarmValid",
    name: "有效告警数",
    formula: "告警总数 − 被标注为误报的告警数",
    unit: "条",
    positive: true,
    dims: ["厂区", "机型", "告警类型"],
    roles: "*",
    calc: (s) =>
      s.alarms.length - s.feedbacks.filter((f) => f.label === "误报").length,
  },
];

/**
 * 取值：按 key 计算指标
 * @param s 当前状态
 * @param key 指标 key
 * @returns 指标数值；未找到定义时返回 0
 */
export const metricValue = (s: State, key: string) =>
  metrics.find((m) => m.key === key)?.calc(s) ?? 0;

/**
 * 按角色过滤可见指标
 * @param roleId 角色 ID
 * @returns 该角色可见的指标定义列表
 */
export const metricsFor = (roleId: string) =>
  metrics.filter((m) => m.roles === "*" || m.roles.includes(roleId));

/**
 * 达标判断：正向指标看是否 ≥ 目标，反向指标看是否 ≤ 目标
 * @param m 指标定义
 * @param v 当前值
 * @returns true 表示达标；无目标时返回 true
 */
export const metricOk = (m: MetricDef, v: number) =>
  m.target === undefined ? true : m.positive ? v >= m.target : v <= m.target;
