/**
 * @file Charts.tsx
 * @description 驾驶舱图表：甜甜圈（多值占比）与环形进度（单值百分比），纯 SVG 实现，无第三方依赖
 * @interaction 被 pages/MonitorCockpit.tsx 消费
 */
import { useState } from "react";

/** 图表数据项 */
export interface Slice {
  label: string;
  value: number;
  color: string;
}

/**
 * 甜甜圈图：按数值占比分段绘制，中心可显示总数
 * @description 鼠标悬浮某一段时，该段加粗、其余段淡出，并在中心显示该段对应内容（名称 + 次数 + 占比）
 * @param data 分段数据
 * @param size 画布边长（px）
 * @param thickness 圆环粗细（px）
 * @param center 中心文字（无悬浮时显示）；不传则不显示
 */
export function Donut({
  data,
  size = 136,
  thickness = 20,
  center,
  onHover,
}: {
  data: Slice[];
  size?: number;
  thickness?: number;
  center?: string;
  /** 悬浮分段回调（用于与外部列表联动高亮）；移出时回调 null */
  onHover?: (index: number | null) => void;
}) {
  /** 当前悬浮的分段索引：用于高亮该段并在中心展示明细 */
  const [hover, SETHOVER] = useState<number | null>(null);
  const total = data.reduce((a, x) => a + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const active = hover === null ? null : data[hover];
  let offset = 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="占比环形图"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(127,180,215,.26)"
        strokeWidth={thickness}
      />
      {total > 0 &&
        data.map((x, i) => {
          const len = (x.value / total) * c;
          const node = (
            <circle
              key={x.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={x.color}
              strokeWidth={hover === i ? thickness + 4 : thickness}
              opacity={hover === null || hover === i ? 1 : 0.3}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ cursor: "pointer", transition: "opacity .15s" }}
              onMouseEnter={() => {
                SETHOVER(i);
                onHover?.(i);
              }}
              onMouseLeave={() => {
                SETHOVER(null);
                onHover?.(null);
              }}
            >
              <title>{`${x.label} · ${x.value} 次 · ${Math.round(
                (x.value / total) * 100,
              )}%`}</title>
            </circle>
          );
          offset += len;
          return node;
        })}
      {active && total > 0 ? (
        <>
          <text
            x={size / 2}
            y={size / 2 - 4}
            textAnchor="middle"
            fontSize="11"
            fill="#a9bfd4"
          >
            {active.label.length > 9
              ? active.label.slice(0, 9) + "…"
              : active.label}
          </text>
          <text
            x={size / 2}
            y={size / 2 + 16}
            textAnchor="middle"
            fontSize="16"
            fill="#dff2ff"
          >
            {active.value} 次 · {Math.round((active.value / total) * 100)}%
          </text>
        </>
      ) : (
        center && (
          <text
            x={size / 2}
            y={size / 2 + 6}
            textAnchor="middle"
            fontSize="18"
            fill="#dff2ff"
          >
            {center}
          </text>
        )
      )}
    </svg>
  );
}

/**
 * 环形进度：单值百分比 + 中心百分比文字
 * @param value 百分比（0-100）
 * @param label 环下标签
 * @param size 画布边长（px）
 * @param thickness 圆环粗细（px）
 * @param tone 进度色
 */
export function Ring({
  value,
  label,
  size = 58,
  thickness = 6,
  tone = "#35d0e0",
}: {
  value: number;
  label: string;
  size?: number;
  thickness?: number;
  tone?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const on = (v / 100) * c;
  return (
    <div className="ring">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label} ${v}%`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(127,180,215,.3)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${on} ${c - on}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x={size / 2}
          y={size / 2 + 4}
          textAnchor="middle"
          fontSize="12"
          fill="#dff2ff"
        >
          {v}%
        </text>
      </svg>
      <small>{label}</small>
    </div>
  );
}
