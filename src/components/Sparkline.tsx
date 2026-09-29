/**
 * @file Sparkline.tsx
 * @description 迷你趋势折线：展示指标的历史采样序列；采样不足时明确提示，不绘制伪造曲线
 * @interaction 被 pages/MonitorCockpit.tsx 的趋势区消费
 */
import type { MetricPoint } from "../data/metricHistory";

export function Sparkline({
  list,
  ok = true,
}: {
  /** 指标采样序列（按时间升序） */
  list: MetricPoint[];
  /** 是否达标：不达标时折线转为告警色 */
  ok?: boolean;
}) {
  if (list.length < 2)
    return (
      <div className="spark-empty">
        历史采样不足（每次进入驾驶舱记录 1 个采样点，不插值补造）
      </div>
    );
  const values = list.map((x) => x.v);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = list
    .map(
      (x, i) =>
        `${(i * 100) / (list.length - 1)},${
          30 - ((x.v - min) / (max - min || 1)) * 26
        }`,
    )
    .join(" ");
  return (
    <svg
      className="spark"
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      role="img"
      aria-label="指标趋势折线"
    >
      <polyline
        points={points}
        fill="none"
        stroke={ok ? "#2775c1" : "#bf5b53"}
        strokeWidth="1.6"
      />
    </svg>
  );
}
