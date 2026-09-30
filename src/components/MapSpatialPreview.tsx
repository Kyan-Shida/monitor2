import { useState } from "react";
import type { MapAsset, Point, Route } from "../data/types";
import { MapCanvas } from "./MapCanvas";
import { Badge } from "./UI";

/** 空间预览通用项（业务点位 / 巡航点共用，仅巡航点带 externalId / source） */
type SPItem = {
  id: string;
  externalId?: string;
  x: number;
  y: number;
  name?: string;
  state?: string;
  source?: string;
};

/**
 * 生成「蛇形正交路网」：把全部点按 y 轴行聚类后逐行正交连线
 * @description 评审参考样式要求**所有点都在线上**——行内相邻点用 L 形（先水平后垂直）
 *              正交段连接，点的坐标精确作为折线顶点，因此每个点必然落在路网上；
 *              行与行之间在行末用正交段衔接，整体呈蛇形往复，类似现场道路网。
 * @param items 全部点（巡航点或业务点位，地图百分比坐标）
 * @returns 正交折线段集合（每段为一串顶点）
 */
function buildRoadNetwork(items: SPItem[]): { x: number; y: number }[][] {
  if (items.length < 2) return [];
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  /** 按 y 轴聚类成行（带宽 7%，约一行设备的分布密度） */
  const BAND = 7;
  const rows: SPItem[][] = [];
  let rowStartY = sorted[0].y;
  let cur: SPItem[] = [];
  for (const it of sorted) {
    if (it.y - rowStartY <= BAND) cur.push(it);
    else {
      rows.push(cur);
      cur = [it];
      rowStartY = it.y;
    }
  }
  if (cur.length) rows.push(cur);
  const lines: { x: number; y: number }[][] = [];
  rows.forEach((band, i) => {
    // 蛇形：偶数行从左到右，奇数行从右到左
    const ordered = [...band].sort((a, b) => (i % 2 ? b.x - a.x : a.x - b.x));
    const line: { x: number; y: number }[] = [{ x: ordered[0].x, y: ordered[0].y }];
    ordered.forEach((p, j) => {
      if (j === 0) return;
      const prev = ordered[j - 1];
      // L 形正交连接：先水平走到目标点 x，再垂直走到目标点 y（点即顶点，必然在线上）
      line.push({ x: p.x, y: prev.y });
      line.push({ x: p.x, y: p.y });
    });
    lines.push(line);
    // 行间衔接：本行末点 → 下一行首点（同为正交 L 形）
    const nextBand = rows[i + 1];
    if (nextBand) {
      const nextFirst = [...nextBand].sort((a, b) =>
        i % 2 ? b.x - a.x : a.x - b.x,
      )[0];
      const last = line[line.length - 1];
      lines.push([
        { x: last.x, y: last.y },
        { x: nextFirst.x, y: last.y },
        { x: nextFirst.x, y: nextFirst.y },
      ]);
    }
  });
  return lines;
}

export function MapSpatialPreview({
  map,
  points,
  onSelect,
  /**
   * 巡航点模式（地图详情页）：三维/二维都只渲染地图携带的「巡航点」（带 ID 的定位标记），
   * 业务点位（巡检点管理绑定后生成）不在此展示——业务配置见巡检目标台账。
   */
  cruiseOnly = false,
  /** 本地图的巡检路线：途经点顺序由 route.nodeIds 给出，换算为巡航点坐标后连线展示 */
  routes = [],
}: {
  map: MapAsset;
  points: Point[];
  onSelect?: (id: string) => void;
  cruiseOnly?: boolean;
  routes?: Route[];
}) {
  const [mode, M] = useState("二维业务图"),
    [angle, A] = useState(25),
    [picked, P] = useState(""),
    /** 三维视图下悬浮高亮的巡航点 ID */
    [hoverId, SETHOVER] = useState("");
  const project = (x: number, y: number, z = 0) => {
    const a = (angle * Math.PI) / 180;
    return [
      250 + (x - 50) * Math.cos(a) * 4 - (y - 50) * Math.sin(a) * 4,
      190 + (x - 50) * Math.sin(a) * 1.6 + (y - 50) * Math.cos(a) * 1.6 - z,
    ];
  };
  /** 三维视图渲染项：巡航点模式用 map.targets，否则用业务点位 */
  const items: SPItem[] = cruiseOnly
    ? (map.targets as unknown as SPItem[])
    : (points as unknown as SPItem[]);
  /**
   * 巡检路线 → 途经巡航点坐标序列
   * @description route.nodeIds 引用业务点位（Point），经其 targetId 回查地图巡航点坐标；
   *              少于 2 个可连点的路线不绘制
   */
  const routePaths = routes
    .map((rt) => ({
      id: rt.id,
      name: rt.name,
      pts: rt.nodeIds
        .map((nid) => {
          const pt = points.find((p) => p.id === nid);
          const t = pt ? map.targets.find((x) => x.id === pt.targetId) : undefined;
          return t ? { x: t.x, y: t.y } : undefined;
        })
        .filter((x): x is { x: number; y: number } => !!x),
    }))
    .filter((rt) => rt.pts.length > 1);
  const labelOf = (it: SPItem) => it.externalId || it.id;
  /** 自动巡检路网：覆盖全部渲染点（评审定稿样式——所有点都在线上） */
  const network = buildRoadNetwork(items);
  const colorOf = (it: SPItem) =>
    cruiseOnly
      ? it.state === "已剔除"
        ? "#9aa1a8"
        : it.source === "平台新增"
          ? "#51d5d0"
          : it.state === "待确认"
            ? "#e0a23b"
            : "#51d5d0"
      : picked === it.id
        ? "#ffcb5a"
        : "#51d5d0";

  return (
    <div className="spatial-preview">
      <div className="spatial-toolbar">
        <div className="segmented">
          {["二维业务图", "三维点云示意"].map((m) => (
            <button
              key={m}
              className={mode === m ? "active" : ""}
              onClick={() => M(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <Badge>
          m{map.version}/p{map.pointSet}
        </Badge>
      </div>
      {mode === "二维业务图" ? (
        <MapCanvas
          points={cruiseOnly ? [] : points}
          targets={map.targets}
          cruiseOnly={cruiseOnly}
          routePaths={routePaths}
          network={network}
          onSelect={(id) => {
            P(id);
            onSelect?.(id);
          }}
        />
      ) : (
        <>
          <svg viewBox="0 0 500 300" aria-label="三维点云示意图">
            <rect width="500" height="300" fill="#102b42" />
            {Array.from({ length: 20 }, (_, i) => {
              const a = project(i * 5, 0),
                b = project(i * 5, 100),
                c = project(0, i * 5),
                d = project(100, i * 5);
              return (
                <g key={i} stroke="#275066" strokeWidth=".5">
                  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
                  <line x1={c[0]} y1={c[1]} x2={d[0]} y2={d[1]} />
                </g>
              );
            })}
            {[
              [25, 30],
              [70, 30],
              [25, 70],
              [70, 70],
            ].map(([x, y], idx) => (
              <g key={idx}>
                {Array.from({ length: 144 }, (_, i) => {
                  const a = ((i % 24) / 24) * Math.PI * 2;
                  const p = project(
                    x + Math.cos(a) * 10,
                    y + Math.sin(a) * 10,
                    Math.floor(i / 24) * 10,
                  );
                  return (
                    <circle
                      key={i}
                      cx={p[0]}
                      cy={p[1]}
                      r="1.3"
                      fill="#6bbbcf"
                    />
                  );
                })}
              </g>
            ))}
            {/* 自动巡检路网：橙色实线，覆盖全部点（点标记绘制其上） */}
            {network.map((line, i) => (
              <polyline
                key={"net" + i}
                points={line
                  .map((p) => project(p.x, p.y, 35))
                  .map((q) => q.join(" "))
                  .join(" ")}
                fill="none"
                stroke="#e8862a"
                strokeWidth="4"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.92"
              />
            ))}
            {/* 巡检路线：途经巡航点顺序连线（绿色虚线，悬浮显示路线名） */}
            {routePaths.map((rt) => (
              <polyline
                key={rt.id}
                points={rt.pts
                  .map((p) => project(p.x, p.y, 35))
                  .map((q) => q.join(" "))
                  .join(" ")}
                fill="none"
                stroke="#4ade80"
                strokeWidth="2.5"
                strokeDasharray="8 5"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.95"
              >
                <title>{`${rt.name}（途经 ${rt.pts.length} 个巡航点）`}</title>
              </polyline>
            ))}
            {items.map((it) => {
              const q = project(it.x, it.y, 35);
              const cid = labelOf(it);
              const hovered = hoverId === it.id;
              return (
                <g
                  key={it.id}
                  role="button"
                  tabIndex={0}
                  aria-label={cid}
                  onMouseEnter={() => SETHOVER(it.id)}
                  onMouseLeave={() => SETHOVER("")}
                  onClick={() => P(it.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") P(it.id);
                  }}
                >
                  <circle cx={q[0]} cy={q[1]} r="6" fill={colorOf(it)} />
                  <text x={q[0] + 9} y={q[1] - 5} fill="white" fontSize="10">
                    {cid}
                  </text>
                  {hovered && (
                    <g transform={`translate(${q[0] + 9} ${q[1] - 24})`}>
                      <rect
                        x="-2"
                        y="0"
                        width="92"
                        height="18"
                        rx="3"
                        fill="#0f172a"
                        opacity="0.9"
                      />
                      <text x="4" y="13" fontSize="10" fill="white">
                        {`(${it.x}, ${it.y})`}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
            <text x="14" y="24" fill="#94b5c8" fontSize="12">
              {cruiseOnly
                ? `巡航点 · 巡检路网（橙线，所有点都在线上）${
                    routePaths.length ? " · 巡检路线（绿虚线）" : ""
                  } · 非真实地图解析`
                : `模拟点云 · 巡检路网（橙线）${
                    routePaths.length ? " · 巡检路线（绿虚线）" : ""
                  } · 非真实地图文件解析`}
            </text>
          </svg>
          <label>
            观察角度
            <input
              type="range"
              min="-60"
              max="60"
              value={angle}
              onChange={(e) => A(+e.target.value)}
            />
          </label>
        </>
      )}
      <small>
        {cruiseOnly
          ? "巡航点为地图携带的定位标记（带ID），坐标待厂商解析接入。"
          : points.find((p) => p.id === picked)?.name ||
            "两种视图共享业务点位身份与地图版本。实际坐标与格式待厂商接入。"}
      </small>
    </div>
  );
}
