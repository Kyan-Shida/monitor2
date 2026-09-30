import { useId, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type {
  Point,
  Candidate,
  Robot,
  Charger,
  RailSection,
  MapFrames,
} from "../data/types";
import { robotColors } from "../data/selectors";

/** mulberry32：确定性伪随机（同一 seed 每次生成的点云完全一致，避免刷新闪动） */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 在 w×h 区域内生成点云（配合 clipPath 裁剪出储罐 / 平台轮廓），冷灰点阵模拟激光扫描点 */
function cloudDots(
  seed: number,
  n: number,
  w: number,
  h: number,
): ReactElement[] {
  const rand = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const g = 110 + Math.floor(rand() * 120);
    return (
      <circle
        key={i}
        cx={rand() * w}
        cy={rand() * h}
        r={0.8 + rand() * 1.1}
        fill={`rgb(${g},${g + 5},${g + 11})`}
        opacity={0.3 + rand() * 0.6}
      />
    );
  });
}

/** 沿折线生成管道表面的点云（y 上提落在管顶高光处） */
function pipeDots(pts: [number, number][], seed: number): ReactElement[] {
  const rand = rng(seed);
  const dots: ReactElement[] = [];
  let k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.floor(len / 30);
    for (let j = 0; j < n; j++) {
      const t = j / n;
      const g = 120 + Math.floor(rand() * 110);
      dots.push(
        <circle
          key={`${seed}-${k++}`}
          cx={x1 + (x2 - x1) * t}
          cy={y1 + (y2 - y1) * t - 4 - rand() * 3}
          r={0.8 + rand()}
          fill={`rgb(${g},${g + 5},${g + 11})`}
          opacity={0.35 + rand() * 0.5}
        />,
      );
    }
  }
  return dots;
}

/** 折线转 path d */
const line = (pts: [number, number][]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join("");

/** 管廊走向（与旧版道路走向一致）：左环 / 右环 / 联络横管 */
const PIPE_L: [number, number][] = [
  [78, 90],
  [120, 90],
  [120, 375],
  [338, 375],
  [338, 90],
  [380, 90],
];
const PIPE_R: [number, number][] = [
  [542, 90],
  [585, 90],
  [585, 375],
  [767, 375],
  [767, 90],
  [815, 90],
];
const PIPE_X: [number, number][] = [
  [338, 375],
  [585, 375],
];
/** 管廊支墩：竖柱 + 底座 */
const PIPERACKS: [number, number][] = [
  [120, 160],
  [120, 250],
  [338, 160],
  [338, 250],
  [585, 160],
  [585, 250],
  [767, 160],
  [767, 250],
];

/** 等轴测储罐：柱身 + 顶盖 + 表面点云，模拟三维点云扫描的罐体 */
function Tank({
  x,
  y,
  label,
  seed,
  uid,
}: {
  x: number;
  y: number;
  label: string;
  seed: number;
  uid: string;
}) {
  const R = 59;
  const RY = 25;
  const H = 54;
  const side = `M${x - R} ${y - H} L${x - R} ${y} A${R} ${RY} 0 0 0 ${x + R} ${y} L${x + R} ${y - H} A${R} ${RY} 0 0 0 ${x - R} ${y - H} Z`;
  return (
    <g>
      <defs>
        <clipPath id={`${uid}ts${seed}`}>
          <path d={side} />
        </clipPath>
        <clipPath id={`${uid}tt${seed}`}>
          <ellipse cx={x} cy={y - H} rx={R} ry={RY} />
        </clipPath>
      </defs>
      {/* 柱身底色（左右渐变模拟受光）+ 表面点云 */}
      <path d={side} fill={`url(#${uid}grad)`} />
      <g clipPath={`url(#${uid}ts${seed})`}>
        <g transform={`translate(${x - R} ${y - H})`}>
          {cloudDots(seed, 150, R * 2, H + RY)}
        </g>
      </g>
      <path d={side} fill="none" stroke="#8f979e" strokeWidth="1.2" />
      {/* 顶盖 + 表面点云 */}
      <ellipse
        cx={x}
        cy={y - H}
        rx={R}
        ry={RY}
        fill="#565d63"
        stroke="#9aa1a8"
        strokeWidth="1.2"
      />
      <g clipPath={`url(#${uid}tt${seed})`}>
        <g transform={`translate(${x - R} ${y - H - RY})`}>
          {cloudDots(seed + 7, 55, R * 2, RY * 2)}
        </g>
      </g>
      {/* 顶部呼吸阀 */}
      <line
        x1={x}
        y1={y - H - RY * 0.4}
        x2={x}
        y2={y - H - RY * 0.4 - 12}
        stroke="#9aa1a8"
        strokeWidth="2.4"
      />
      <circle cx={x} cy={y - H - RY * 0.4 - 14} r="3" fill="#aeb6bd" />
      <text x={x} y={y + 42} textAnchor="middle" fill="#cfd8de" fontSize="15">
        {label}
      </text>
    </g>
  );
}

export function MapCanvas({
  points = [],
  targets = [],
  robots = [],
  chargers = [],
  rails = [],
  /** 巡检路径：按点位顺序连接的轨迹虚线（执行回溯的导航地图） */
  path = [],
  selected,
  onSelect,
  onAdd,
  onRobot,
  /** 高亮凸显的机器（列表点击 / 地图点击联动）：加光环并淡化其余机器 */
  selectedRobot,
  /** 全部机器同时高亮（设备池「全选」）：不淡化任何机器 */
  highlightAll = false,
  pointStates = {},
  fit = "xMidYMid meet",
  /** 坐标拾取（阶段②）：开启后鼠标移动实时显示地图 / 世界坐标（只读） */
  pickCoords = false,
  /** 坐标标定（阶段②）：坐标拾取换算世界坐标用；缺省按 0.05 米/像素估算 */
  frames,
  /**
   * 巡航点模式（地图详情页专用）：只渲染地图携带的「巡航点」——带 ID 的定位标记，
   * 并支持悬浮查看坐标（x,y）；不渲染业务点位（业务在巡检目标台账 / 巡检点管理中配置）。
   */
  cruiseOnly = false,
  /**
   * 巡检路线图层（地图百分比坐标）：按途经巡航点顺序连成虚线，
   * 由调用方从 s.routes 的 nodeIds 换算成坐标序列后传入。
   */
  routePaths = [],
  /**
   * 自动巡检路网（地图百分比坐标）：由调用方按「所有点都在线上」生成的正交路网，
   * 橙色实线渲染（评审参考样式）；点标记绘制其上，视觉上全部落在路网中。
   */
  network = [],
}: {
  points?: Point[];
  targets?: Candidate[];
  robots?: Robot[];
  /** 充电桩图层：四轮车 / 机器狗的返充依赖 */
  chargers?: Charger[];
  /** 轨道区段图层：挂轨的占用与防碰撞依赖 */
  rails?: RailSection[];
  path?: { x: number; y: number }[];
  selected?: string;
  onSelect?: (id: string) => void;
  onAdd?: (x: number, y: number) => void;
  onRobot?: (id: string) => void;
  selectedRobot?: string;
  highlightAll?: boolean;
  pointStates?: Record<string, string>;
  /** SVG 视口适配方式：驾驶舱传 slice 填满容器，其余场景保持 meet 以完整显示地图 */
  fit?: string;
  /** 坐标拾取开关（阶段②） */
  pickCoords?: boolean;
  /** 坐标标定（阶段②） */
  frames?: MapFrames;
  /** 巡航点模式：只展示地图携带的巡航点（带 ID），悬浮显示坐标 */
  cruiseOnly?: boolean;
  /** 巡检路线图层：途经点坐标序列（地图百分比坐标） */
  routePaths?: { id: string; name: string; pts: { x: number; y: number }[] }[];
  /** 自动巡检路网：正交折线段集合（地图百分比坐标），橙色实线 */
  network?: { x: number; y: number }[][];
}) {
  const [zoom, Z] = useState(1);
  /** clipPath / 渐变的唯一前缀：同页多实例不冲突 */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  /** 地面点云：静态一次生成 */
  const groundDots = useMemo(() => cloudDots(99, 260, 900, 520), []);
  const pipeDotsAll = useMemo(
    () => [...pipeDots(PIPE_L, 41), ...pipeDots(PIPE_R, 43), ...pipeDots(PIPE_X, 47)],
    [],
  );
  /** 坐标拾取读数：鼠标位置的地图百分比坐标 */
  const [pick, SETPICK] = useState<{ x: number; y: number } | null>(null);
  /** 巡航点模式下，悬浮高亮的巡航点 ID（用于显示坐标气泡） */
  const [hoverTid, SETHOVER] = useState<string | null>(null);
  /**
   * 屏幕坐标 → 地图百分比坐标（与双击加点同一套换算）
   * @param svg SVG 根节点
   * @param clientX 视口 X
   * @param clientY 视口 Y
   * @returns 地图百分比坐标
   */
  const toMap = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const cursor = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return {
      x: (cursor.x - (450 - 450 * zoom)) / zoom / 9,
      y: (cursor.y - (260 - 260 * zoom)) / zoom / 5.2,
    };
  };
  /**
   * 地图百分比坐标 → 世界坐标（米，示意）
   * @description 原型把 SVG 视口 900×520 视为像素底图，按标定分辨率与原点换算；
   *              真实实现应由后端坐标转换 API 完成（含旋转与云台外参）。
   * @param p 地图百分比坐标
   * @returns 世界坐标（米）
   */
  const world = (p: { x: number; y: number }) => {
    const res = frames?.resolution ?? 0.05;
    const o = frames?.origin ?? { x: 0, y: 0, yaw: 0 };
    return { x: o.x + (p.x / 100) * 900 * res, y: o.y + (p.y / 100) * 520 * res };
  };
  return (
    <div
      className={
        "map-canvas" +
        (selectedRobot || highlightAll ? " has-active-robot" : "")
      }
    >
      <div className="map-tools">
        <span>三维激光点云示意 · Mock</span>
        {pickCoords && (
          <span className="map-pick" aria-live="polite">
            {pick
              ? `地图 ${pick.x.toFixed(1)}% / ${pick.y.toFixed(1)}% · 世界 ${world(pick).x.toFixed(2)}, ${world(pick).y.toFixed(2)} m`
              : "移动鼠标拾取坐标"}
          </span>
        )}
        <button onClick={() => Z(Math.min(1.6, zoom + 0.15))}>＋</button>
        <button onClick={() => Z(Math.max(0.7, zoom - 0.15))}>−</button>
        <button onClick={() => Z(1)}>复位</button>
      </div>
      <svg
        viewBox="0 0 900 520"
        preserveAspectRatio={fit}
        role="img"
        aria-label="一期罐区三维点云地图与业务目标"
        className={pickCoords ? "picking" : undefined}
        onDoubleClick={(e) => {
          if (!onAdd) return;
          const p = toMap(e.currentTarget, e.clientX, e.clientY);
          if (p && p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100) onAdd(p.x, p.y);
        }}
        onMouseMove={
          pickCoords
            ? (e) => {
                const p = toMap(e.currentTarget, e.clientX, e.clientY);
                if (p) SETPICK({ x: Math.max(0, Math.min(100, p.x)), y: Math.max(0, Math.min(100, p.y)) });
              }
            : undefined
        }
        onMouseLeave={pickCoords ? () => SETPICK(null) : undefined}
      >
        <defs>
          <pattern
            id="grid"
            width="26"
            height="26"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M26 0H0V26"
              fill="none"
              stroke="rgba(255,255,255,.05)"
              strokeWidth=".7"
            />
          </pattern>
          {/* 储罐柱身受光渐变 */}
          <linearGradient id={`${uid}grad`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#5d646b" />
            <stop offset="0.28" stopColor="#9aa2a9" />
            <stop offset="0.55" stopColor="#b6bdc4" />
            <stop offset="1" stopColor="#6f767d" />
          </linearGradient>
        </defs>
        {/* 点云场景底：暗灰地面 + 扫描点 */}
        <rect width="900" height="520" fill="#41464b" />
        <rect width="900" height="520" fill="url(#grid)" />
        <g opacity="0.55">{groundDots}</g>
        <g
          transform={`translate(${450 - 450 * zoom} ${260 - 260 * zoom}) scale(${zoom})`}
        >
          {/* 巡检道路（地面标线） */}
          <path
            d="M65 415H835M80 240H805M450 55V465"
            stroke="#4b5157"
            strokeWidth="40"
          />
          <path
            d="M65 415H835M80 240H805M450 55V465"
            stroke="#6d757c"
            strokeWidth="2"
            strokeDasharray="8 7"
          />
          {/* 钢结构平台（罐区围栏 + 门形架） */}
          {[
            [230, 137],
            [650, 137],
            [230, 330],
            [650, 330],
          ].map(([x, y], i) => (
            <g key={i}>
              <defs>
                <clipPath id={`${uid}pf${i}`}>
                  <rect
                    x={x - 109}
                    y={y - 74}
                    width="218"
                    height="147"
                    rx="6"
                  />
                </clipPath>
              </defs>
              <rect
                x={x - 109}
                y={y - 74}
                width="218"
                height="147"
                rx="6"
                fill="#4a5055"
                stroke="#6d757c"
              />
              <g clipPath={`url(#${uid}pf${i})`}>
                <g transform={`translate(${x - 109} ${y - 74})`}>
                  {cloudDots(31 + i, 60, 218, 147)}
                </g>
              </g>
              {/* 门形架：立柱 + 横梁 + 斜撑 */}
              <line
                x1={x - 95}
                y1={y - 40}
                x2={x - 95}
                y2={y - 84}
                stroke="#788088"
                strokeWidth="4"
              />
              <line
                x1={x + 95}
                y1={y - 40}
                x2={x + 95}
                y2={y - 84}
                stroke="#788088"
                strokeWidth="4"
              />
              <line
                x1={x - 95}
                y1={y - 84}
                x2={x + 95}
                y2={y - 84}
                stroke="#858d94"
                strokeWidth="3.5"
              />
              <line
                x1={x - 95}
                y1={y - 40}
                x2={x - 60}
                y2={y - 84}
                stroke="#6d757c"
                strokeWidth="1.6"
              />
              <line
                x1={x + 95}
                y1={y - 40}
                x2={x + 60}
                y2={y - 84}
                stroke="#6d757c"
                strokeWidth="1.6"
              />
            </g>
          ))}
          {/* 管廊支墩 */}
          {PIPERACKS.map(([x, y], i) => (
            <g key={i}>
              <line
                x1={x}
                y1={y - 6}
                x2={x}
                y2={y + 26}
                stroke="#5f666d"
                strokeWidth="4"
              />
              <line
                x1={x - 12}
                y1={y + 26}
                x2={x + 12}
                y2={y + 26}
                stroke="#565c62"
                strokeWidth="3"
              />
            </g>
          ))}
          {/* 管廊：管底 / 管身 / 高光三层描边 + 表面点云 */}
          <path
            d={`${line(PIPE_L)}${line(PIPE_R)}${line(PIPE_X)}`}
            stroke="#4d5359"
            strokeWidth="14"
            fill="none"
          />
          <path
            d={`${line(PIPE_L)}${line(PIPE_R)}${line(PIPE_X)}`}
            stroke="#83898e"
            strokeWidth="9"
            fill="none"
          />
          <path
            d={`${line(PIPE_L)}${line(PIPE_R)}${line(PIPE_X)}`}
            stroke="#b9bfc4"
            strokeWidth="2.4"
            fill="none"
            opacity="0.8"
            transform="translate(0 -3)"
          />
          {pipeDotsAll}
          {/* 储罐（等轴测点云圆柱） */}
          <Tank x={230} y={137} label="V001 储罐" seed={1} uid={uid} />
          <Tank x={650} y={137} label="V002 储罐" seed={2} uid={uid} />
          <Tank x={230} y={330} label="V003 储罐" seed={3} uid={uid} />
          <Tank x={650} y={330} label="V004 储罐" seed={4} uid={uid} />
          {/* 巡检路径轨迹：按点位顺序连成虚线，便于回看行走路线 */}
          {path.length > 1 && (
            <polyline
              points={path.map((p) => `${p.x * 9} ${p.y * 5.2}`).join(" ")}
              fill="none"
              stroke="#4f9cf5"
              strokeWidth="2.5"
              strokeDasharray="8 6"
              strokeLinejoin="round"
              opacity="0.9"
            />
          )}
          {/* 自动巡检路网：橙色实线（点标记绘制其上，形成"所有点都在线上"的评审参考样式） */}
          {network.map((line, i) =>
            line.length > 1 ? (
              <polyline
                key={"net" + i}
                points={line.map((p) => `${p.x * 9} ${p.y * 5.2}`).join(" ")}
                fill="none"
                stroke="#e8862a"
                strokeWidth="4"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.92"
              />
            ) : null,
          )}
          {/* 巡检路线图层：一条路线一条绿色虚线（与执行轨迹蓝色区分） */}
          {routePaths.map((rt) =>
            rt.pts.length > 1 ? (
              <polyline
                key={rt.id}
                points={rt.pts.map((p) => `${p.x * 9} ${p.y * 5.2}`).join(" ")}
                fill="none"
                stroke="#4ade80"
                strokeWidth="2.5"
                strokeDasharray="10 7"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.9"
              >
                <title>{rt.name}</title>
              </polyline>
            ) : null,
          )}
          {!cruiseOnly &&
            targets
              .filter((t) => t.state === "待确认")
              .map((t) => (
                <g
                  key={t.id}
                  className="map-point"
                  onClick={() => onSelect?.(t.id)}
                  transform={`translate(${t.x * 9} ${t.y * 5.2})`}
                >
                  <rect
                    x="-10"
                    y="-10"
                    width="20"
                    height="20"
                    transform="rotate(45)"
                    fill="#d49631"
                    stroke="white"
                    strokeWidth="3"
                  />
                  <text x="16" y="-13" fill="#ecc985" fontSize="14">
                    候选{t.kind}
                  </text>
                </g>
              ))}

          {cruiseOnly &&
            targets.map((t) => {
              const cid = t.externalId || t.id;
              const cx = t.x * 9;
              const cy = t.y * 5.2;
              const fill =
                t.state === "已剔除"
                  ? "#9aa1a8"
                  : t.source === "平台新增"
                    ? "#31957f"
                    : t.state === "待确认"
                      ? "#d49631"
                      : "#2379ce";
              return (
                <g
                  key={t.id}
                  className="map-point"
                  onMouseEnter={() => SETHOVER(t.id)}
                  onMouseLeave={() => SETHOVER(null)}
                  transform={`translate(${cx} ${cy})`}
                >
                  <circle r="9" fill={fill} stroke="white" strokeWidth="3" />
                  <text x="13" y="-8" fontSize="13" fill="#e8eef3">
                    {cid}
                  </text>
                  {hoverTid === t.id && (
                    <g transform="translate(13 -6)">
                      <rect
                        x="-2"
                        y="2"
                        width="116"
                        height="22"
                        rx="4"
                        fill="#0f172a"
                        opacity="0.92"
                      />
                      <text x="6" y="17" fontSize="12" fill="#e8eef3">
                        {`坐标 (${t.x}, ${t.y})`}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          {!cruiseOnly &&
            points.map((p) => (
              <g
                key={p.id}
                className="map-point"
                onClick={() => onSelect?.(p.targetId)}
                transform={`translate(${p.x * 9} ${p.y * 5.2})`}
              >
                {selected === p.targetId && (
                  <circle r="22" fill="#2d74dc33" stroke="#6ea8ef" />
                )}
                <circle
                  r="9"
                  fill={
                    p.targetId === selected
                      ? "#2379ce"
                      : pointStates[p.id] === "异常"
                        ? "#c85d50"
                        : pointStates[p.id] === "失败"
                          ? "#8d5666"
                          : pointStates[p.id] === "已完成"
                            ? "#31957f"
                            : pointStates[p.id] === "待执行"
                              ? "#9daaba"
                              : p.state === "已启用"
                                ? "#2379ce"
                                : "#d49631"
                  }
                  stroke="white"
                  strokeWidth="3"
                />
                <text x="15" y="-13" fontSize="14" fill="#e8eef3">
                  {p.name}
                </text>
              </g>
            ))}
          {/* 轨道区段图层：占用 / 空闲 / 检修三态，占用时标注归属机器 */}
          {rails.map((x) => (
            <g key={x.id} transform={`translate(${x.x * 9} ${x.y * 5.2})`}>
              <path
                d={`M-${x.length / 2} 0H${x.length / 2}`}
                stroke={
                  x.state === "占用"
                    ? "#c58e32"
                    : x.state === "检修"
                      ? "#bf5b53"
                      : "#7f93a5"
                }
                strokeWidth="10"
                strokeLinecap="round"
                opacity="0.75"
              />
              <text x={x.length / 2 + 8} y="5" fontSize="13" fill="#c4cdd5">
                {x.name} · {x.state}
                {x.robotId ? ` · ${x.robotId}` : ""}
              </text>
            </g>
          ))}
          {/* 充电桩图层：空闲 / 占用 / 故障三态 */}
          {chargers.map((c) => (
            <g key={c.id} transform={`translate(${c.x * 9} ${c.y * 5.2})`}>
              <rect
                x="-11"
                y="-11"
                width="22"
                height="22"
                rx="4"
                fill={
                  c.state === "占用"
                    ? "#c58e32"
                    : c.state === "故障"
                      ? "#bf5b53"
                      : "#31957f"
                }
                stroke="white"
                strokeWidth="2.5"
              />
              <path
                d="M-3 -7L2 -1L-1 -1L3 6"
                stroke="white"
                strokeWidth="2"
                fill="none"
              />
              <text x="15" y="5" fontSize="13" fill="#c4cdd5">
                {c.name}
                {c.robotId ? ` · ${c.robotId}` : ""}
              </text>
            </g>
          ))}
          {robots.map((r) => {
            const active = highlightAll || selectedRobot === r.id;
            return (
              <g
                key={r.id}
                className={"map-robot" + (active ? " active" : "")}
                onClick={() => onRobot?.(r.id)}
                transform={`translate(${r.x * 9} ${r.y * 5.2})`}
              >
                <circle r="26" fill="#24aa9b22" />
                {/* 高亮凸显：单台选中加脉冲光环；全选时仅静态高亮环，避免整屏闪动 */}
                {active && (
                  <>
                    {selectedRobot === r.id && (
                      <circle
                        className="robot-halo"
                        r="30"
                        fill="none"
                        stroke="#ffb020"
                        strokeWidth="3"
                      />
                    )}
                    <circle
                      r="30"
                      fill="#ffb0201f"
                      stroke="#ffb020"
                      strokeWidth="2"
                    />
                  </>
                )}
                {/* 三类机型使用不同图元，便于在驾驶舱一眼区分 */}
                {r.deviceType === "机器狗" ? (
                  <>
                    <rect
                      x="-12"
                      y="-9"
                      width="24"
                      height="18"
                      rx="5"
                      fill={robotColors[r.state]}
                      stroke="white"
                      strokeWidth="2"
                    />
                    <path
                      d="M-6 -13L0 -20L6 -13"
                      fill={robotColors[r.state]}
                    />
                  </>
                ) : r.deviceType === "四轮车" ? (
                  <>
                    <rect
                      x="-13"
                      y="-9"
                      width="26"
                      height="18"
                      rx="9"
                      fill={robotColors[r.state]}
                      stroke="white"
                      strokeWidth="2"
                    />
                    <circle cx="-6" cy="10" r="3.4" fill="#2c3a47" />
                    <circle cx="6" cy="10" r="3.4" fill="#2c3a47" />
                  </>
                ) : (
                  <>
                    <rect
                      x="-6"
                      y="-18"
                      width="12"
                      height="6"
                      rx="2"
                      fill="#8d99a3"
                    />
                    <path d="M0 -12V-6" stroke="#8d99a3" strokeWidth="3" />
                    <rect
                      x="-13"
                      y="-6"
                      width="26"
                      height="14"
                      rx="3"
                      fill={robotColors[r.state]}
                      stroke="white"
                      strokeWidth="2"
                    />
                  </>
                )}
                <text
                  x="18"
                  y="26"
                  fontSize="14"
                  fill={active ? "#ffd98a" : "#c9e8e4"}
                  fontWeight={active ? 700 : 400}
                >
                  {r.id} · {r.deviceType} · {r.state}
                </text>
              </g>
            );
          })}
        </g>
        <text x="844" y="45" fontSize="20" fill="#9fb0bd">
          N ↑
        </text>
      </svg>
      <div className="map-legend">
        <span>
          <i className="dot blue" />
          {cruiseOnly ? "巡航点（地图自带）" : "业务点位"}
        </span>
        <span>
          <i className="dot amber" />
          {cruiseOnly ? "待确认巡航点" : "待确认目标"}
        </span>
        <span>
          <i className="dot teal" />
          巡检机器
        </span>
        {rails.length > 0 && <span>轨道区段</span>}
        {chargers.length > 0 && <span>充电桩</span>}
        {routePaths.some((rt) => rt.pts.length > 1) && (
          <span>
            <i className="dot green" />
            巡检路线
          </span>
        )}
        {network.length > 0 && (
          <span>
            <i className="dot orange" />
            巡检路网
          </span>
        )}
        <span>三维点云示意</span>
      </div>
    </div>
  );
}
