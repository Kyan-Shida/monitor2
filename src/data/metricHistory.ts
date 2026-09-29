/**
 * @file metricHistory.ts
 * @description 指标历史快照：为管理驾驶舱提供趋势折线与环比所需的历史观测值
 *              仅记录真实观测（每次进入驾驶舱采样一次），不插值、不补造历史数据
 * @interaction 被 pages/MonitorCockpit.tsx 消费
 */

/** 本地存储键 */
const KEY = "metric-history-v1";
/** 每个指标保留的最大采样点数 */
const MAX_POINTS = 30;

export interface MetricPoint {
  /** 采样日期（YYYY-MM-DD），同一天只保留最后一次采样 */
  d: string;
  /** 指标值 */
  v: number;
}

export type MetricHistory = Record<string, MetricPoint[]>;

/**
 * 读取历史快照
 * @returns 指标 key → 采样序列；无记录时返回空对象
 */
export function readHistory(): MetricHistory {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return raw && typeof raw === "object" ? (raw as MetricHistory) : {};
  } catch {
    return {};
  }
}

/**
 * 记录一次采样：同一天只保留最新值，避免频繁刷新产生冗余点
 * @param values 指标 key → 当前值
 * @returns 采样后的历史，供本次渲染直接使用，无需二次读取
 */
export function pushSnapshot(values: Record<string, number>): MetricHistory {
  const history = readHistory();
  const day = new Date().toISOString().slice(0, 10);
  Object.entries(values).forEach(([key, value]) => {
    const list = history[key] || [];
    const last = list[list.length - 1];
    if (last && last.d === day) last.v = value;
    else list.push({ d: day, v: value });
    history[key] = list.slice(-MAX_POINTS);
  });
  try {
    localStorage.setItem(KEY, JSON.stringify(history));
  } catch {
    // 存储不可用时仅影响历史趋势，不影响当前值展示
  }
  return history;
}

/**
 * 环比：最近两次采样的相对变化
 * @param list 指标采样序列
 * @returns 变化百分比；采样不足两次时返回 undefined（页面显示"—"）
 */
export function deltaOf(list?: MetricPoint[]): number | undefined {
  if (!list || list.length < 2) return undefined;
  const prev = list[list.length - 2].v;
  const cur = list[list.length - 1].v;
  if (!prev) return undefined;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}
