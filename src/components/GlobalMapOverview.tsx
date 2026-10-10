/**
 * @file GlobalMapOverview.tsx
 * @description 全局地图总览：把**所有巡检点**按**统一坐标系**汇总到同一张画布上可视。
 *              多张分区地图各自使用本地相对坐标系，无法直接叠加——本组件以 DATA-01 的
 *              `Point.world`（全厂统一 XYZ）为**权威定位**把各分区统一到一个坐标系后汇总；
 *              尚未写入 `world` 的巡检点回退用其地图本地坐标（`x / y`），并以**虚线描边 + 图例计数**
 *              标记，提醒补齐统一坐标。**地图 ID 仅作参考键**（决定分组与配色），不参与定位计算。
 * @interaction 被「巡检点管理」（pages/InspectionPoints.tsx）的「全局地图总览」面板消费；
 *              点击点位跳转内置页 point-edit 编辑该巡检点
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Note } from "./UI";
import { targetsOf } from "../data/mapCalibration";
import type { Point } from "../data/types";

/** 画布尺寸（viewBox 单位，等比缩放到容器宽度） */
const VW = 1000;
const VH = 620;
/** 画布四周留白：避免点位标签贴边被裁切 */
const PAD = 54;
/** 分区地图配色（按地图在 s.maps 中的顺序稳定取色，超出后循环） */
const MAP_COLORS = ["#1f67b5", "#2ba471", "#d39a3c", "#8a74d6", "#c96f6a", "#3aa7c9"];

/** 画布上的一个巡检点（已换算到统一坐标系） */
interface OverviewItem {
  /** 巡检点本体 */
  p: Point;
  /** 统一坐标系下的平面位置（world 优先，缺省回退地图本地 x/y） */
  ux: number;
  uy: number;
  /** 是否已写入统一坐标（world）；false = 回退本地坐标 */
  unified: boolean;
  /** 定位 ID（来源绑定键；无则空） */
  externalId?: string;
  /** 所属地图名称（地图缺失时回退地图 ID） */
  mapName: string;
  /** 所属地图是否在「地图管理」中缺失（仅被巡检点引用） */
  mapMissing: boolean;
  /** 该地图配色 */
  color: string;
}

/**
 * 全局地图总览
 * @param points 待汇总展示的巡检点（父页传入全厂巡检点：画布是"全厂一张图"口径，不随列表筛选收敛）
 * @returns 统一坐标系画布 + 分区图例；无点位时给出空态提示
 */
export function GlobalMapOverview({ points }: { points: Point[] }) {
  const { s } = useStore();
  /** 悬浮高亮的巡检点 ID（联动显示坐标气泡） */
  const [hover, SETHOVER] = useState<string | null>(null);

  /** 地图 id → 稳定配色（未在地图列表中的地图用兜底色循环） */
  const mapOrder = new Map(s.maps.map((m, i) => [m.id, i]));
  const colorOfMap = (mapId: string, fallbackIdx: number) =>
    MAP_COLORS[(mapOrder.get(mapId) ?? fallbackIdx) % MAP_COLORS.length];

  // 把每个巡检点换算到统一坐标系：world（权威）优先，缺省回退地图本地坐标
  const items: OverviewItem[] = points.map((p, i) => {
    const map = s.maps.find((m) => m.id === p.mapId);
    const w = p.world;
    const target = targetsOf(s, p.mapId).find((t) => t.id === p.targetId);
    return {
      p,
      ux: w ? w.x : p.x,
      uy: w ? w.y : p.y,
      unified: !!w,
      externalId: target?.externalId,
      mapName: map?.name || p.mapId,
      mapMissing: !map,
      color: colorOfMap(p.mapId, i),
    };
  });

  if (!items.length) {
    return <Note>尚无巡检点，先「巡检点导入」绑定点位。</Note>;
  }

  // 归一化：把统一坐标铺满画布（统一坐标是同一坐标系，故各分区点位保持相对关系）
  const xs = items.map((it) => it.ux);
  const ys = items.map((it) => it.uy);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const spanX = maxX - minX,
    spanY = maxY - minY;
  /** 统一坐标 → 画布 X（单点时居中，避免除零） */
  const px = (x: number) =>
    spanX < 1e-6 ? VW / 2 : PAD + ((x - minX) / spanX) * (VW - PAD * 2);
  /** 统一坐标 → 画布 Y（单点时居中，避免除零） */
  const py = (y: number) =>
    spanY < 1e-6 ? VH / 2 : PAD + ((y - minY) / spanY) * (VH - PAD * 2);

  // 图例分组：按地图聚合点位数量
  const groups = new Map<
    string,
    { id: string; name: string; color: string; n: number; missing: boolean }
  >();
  items.forEach((it) => {
    const g =
      groups.get(it.p.mapId) ||
      { id: it.p.mapId, name: it.mapName, color: it.color, n: 0, missing: it.mapMissing };
    g.n += 1;
    groups.set(it.p.mapId, g);
  });
  const unifiedCount = items.filter((it) => it.unified).length;
  const fallbackCount = items.length - unifiedCount;

  return (
    <div className="gmo-wrap">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="gmo-svg"
        role="img"
        aria-label="全局地图总览：统一坐标系下的全部巡检点"
      >
        {/* 背景 + 参考网格（示意坐标系，不代表真实大地坐标刻度） */}
        <rect x="0" y="0" width={VW} height={VH} rx="8" className="gmo-bg" />
        {Array.from({ length: 11 }, (_, i) => {
          const x = PAD + (i * (VW - PAD * 2)) / 10;
          return (
            <line key={"gx" + i} x1={x} y1={PAD} x2={x} y2={VH - PAD} className="gmo-grid" />
          );
        })}
        {Array.from({ length: 7 }, (_, i) => {
          const y = PAD + (i * (VH - PAD * 2)) / 6;
          return (
            <line key={"gy" + i} x1={PAD} y1={y} x2={VW - PAD} y2={y} className="gmo-grid" />
          );
        })}
        <text x={PAD} y={VH - 18} className="gmo-axis">
          统一坐标系 X →
        </text>
        <text x={16} y={VH - PAD} className="gmo-axis" transform={`rotate(-90 16 ${VH - PAD})`}>
          统一坐标系 Y →
        </text>

        {/* 巡检点：world 已统一=实线描边；回退本地坐标=虚线描边 */}
        {items.map((it) => {
          const cx = px(it.ux);
          const cy = py(it.uy);
          const label = it.externalId || it.p.id;
          const tipX = Math.min(cx + 12, VW - 220);
          const tipY = Math.max(cy - 66, 8);
          return (
            <g
              key={it.p.id}
              role="button"
              tabIndex={0}
              aria-label={`${it.p.name}（${label}）`}
              className="gmo-point"
              onMouseEnter={() => SETHOVER(it.p.id)}
              onMouseLeave={() => SETHOVER(null)}
              onClick={() => go("point-edit", it.p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") go("point-edit", it.p.id);
              }}
            >
              {/* 透明命中区：小圆点也便于点击 */}
              <circle cx={cx} cy={cy} r="15" fill="transparent" />
              <circle
                cx={cx}
                cy={cy}
                r="7"
                fill={it.color}
                stroke={it.unified ? "#ffffff" : "#c96f6a"}
                strokeWidth="2"
                strokeDasharray={it.unified ? undefined : "3 2"}
              />
              <text x={cx + 11} y={cy - 6} className="gmo-label">
                {label}
              </text>
              {hover === it.p.id && (
                <g transform={`translate(${tipX} ${tipY})`} className="gmo-tip">
                  <rect x="0" y="0" width="210" height="66" rx="4" />
                  <text x="8" y="16">
                    <tspan className="gmo-tip-name">{it.p.name}</tspan>
                  </text>
                  <text x="8" y="32">
                    地图：{it.mapName}
                    {it.mapMissing ? "（地图缺失）" : ""}
                  </text>
                  <text x="8" y="47">
                    定位ID：{it.externalId || "—"} · 状态：{it.p.state}
                  </text>
                  <text x="8" y="61">
                    坐标来源：{it.unified ? "统一坐标 world" : "回退地图本地坐标"}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      {fallbackCount > 0 && (
        <small className="gmo-hint">
          多地图统一坐标系尚未完全落地：{fallbackCount} 个巡检点未写入 <b>world</b> 统一坐标，
          暂按其地图本地坐标回退展示（虚线描边）。补齐统一坐标后即可跨地图精确叠加。
        </small>
      )}
    </div>
  );
}
