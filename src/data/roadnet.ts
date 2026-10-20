/**
 * @file roadnet.ts
 * @description 父线路网上的寻路：把「地图上的定位点 + 线 / 弧」当作一张无向图，
 *              求任意两个定位点之间**沿路网**的最短路径
 * @interaction RoutePreview.tsx（预览子线时按父线走向连线，而不是两点直连）
 *
 * 为什么需要它：机器狗是沿父线（道路）行驶到各巡检点的，
 * 所以预览图里相邻两个停靠点之间也必须沿路网画，直连会「穿墙」。
 */
import type { RoadnetPath } from "./types";

/** 路网上的定位点坐标（底图百分比） */
export type RoadPoint = { x: number; y: number };

/** 图中一条边 */
type Edge = { id: string; w: number };

/**
 * 由路径集合构建邻接表
 * @description 每条线 / 弧的**相邻两点**之间连一条无向边，权重取图上欧氏距离；
 *              多条线共享同一批定位点即自然形成分叉与环
 * @param paths 父线（线 / 弧）
 * @param at 定位点坐标查询（查不到的定位点不参与建图）
 * @returns 邻接表
 */
export function roadnetGraph(
  paths: RoadnetPath[],
  at: (id: string) => RoadPoint | undefined,
): Map<string, Edge[]> {
  const g = new Map<string, Edge[]>();
  const link = (a: string, b: string) => {
    const pa = at(a);
    const pb = at(b);
    if (!pa || !pb) return;
    const w = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    if (!g.has(a)) g.set(a, []);
    if (!g.has(b)) g.set(b, []);
    g.get(a)!.push({ id: b, w });
    g.get(b)!.push({ id: a, w });
  };
  for (const p of paths)
    for (let i = 1; i < p.pointIds.length; i++)
      link(p.pointIds[i - 1], p.pointIds[i]);
  return g;
}

/**
 * 沿父线路网的最短路径
 * @description 定位点数量级很小（一张图几十个），朴素 Dijkstra 足够，无需堆优化
 * @param paths 父线（线 / 弧）
 * @param at 定位点坐标查询
 * @param from 起点定位点 id
 * @param to 终点定位点 id
 * @returns 途经的定位点 id 序列（含首尾）；两点不在同一段路网时返回 null
 */
export function shortestRoadPath(
  paths: RoadnetPath[],
  at: (id: string) => RoadPoint | undefined,
  from: string,
  to: string,
): string[] | null {
  if (from === to) return [from];
  const g = roadnetGraph(paths, at);
  if (!g.has(from) || !g.has(to)) return null;
  /** 已知最短距离（未确定的节点持续松弛） */
  const dist = new Map<string, number>([[from, 0]]);
  /** 最短路径上的前驱，用于回溯 */
  const prev = new Map<string, string>();
  const done = new Set<string>();
  for (;;) {
    let cur: string | undefined;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!done.has(id) && d < best) {
        best = d;
        cur = id;
      }
    }
    if (!cur) return null;
    if (cur === to) break;
    done.add(cur);
    for (const e of g.get(cur) || []) {
      const nd = best + e.w;
      if (nd < (dist.get(e.id) ?? Infinity)) {
        dist.set(e.id, nd);
        prev.set(e.id, cur);
      }
    }
  }
  const out = [to];
  while (out[0] !== from) {
    const p = prev.get(out[0]);
    if (!p) return null;
    out.unshift(p);
  }
  return out;
}

/** 就近路网节点（点位没被标进路网时，找最近的已标定位点接入） */
function nearestNode(
  paths: RoadnetPath[],
  at: (id: string) => RoadPoint | undefined,
  id: string,
): { node: string; dist: number } | null {
  const p = at(id);
  if (!p) return null;
  let best: { node: string; dist: number } | null = null;
  for (const path of paths)
    for (const nid of path.pointIds) {
      if (nid === id) continue;
      const q = at(nid);
      if (!q) continue;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (!best || d < best.dist) best = { node: nid, dist: d };
    }
  return best;
}

/**
 * 沿路网的行驶路径（端点可不在路网上）
 * @description 预设路线要求「按路网走」：点位自身没被标进路网（标定只连了路网节点、
 *              没把该巡检点的定位点连进去）时，先就近接入路网节点，再沿路网走完，
 *              末端再短接回点位——而不是两点直接连线穿墙。
 *              只有「接入距离超阈值」或「两端分别落在两个不连通的路网块」时才返回 null（调用方回退直连）。
 * @param paths 父线（线 / 弧）
 * @param at 定位点坐标查询
 * @param from 起点定位点 id
 * @param to 终点定位点 id
 * @param snapR 就近接入的最大距离（百分比坐标，默认 12）
 * @returns 途经的定位点 id 序列（含首尾）；接不上路网时返回 null
 */
export function routeAlongRoad(
  paths: RoadnetPath[],
  at: (id: string) => RoadPoint | undefined,
  from: string,
  to: string,
  snapR = 12,
): string[] | null {
  const direct = shortestRoadPath(paths, at, from, to);
  if (direct) return direct;
  if (!at(from) || !at(to)) return null;
  /** 该定位点本身是否已被标进路网 */
  const inNet = (id: string) =>
    !!at(id) && paths.some((p) => p.pointIds.includes(id));
  /** 在网内的端点原样用；不在网的就近接入，接不上（超阈值）则放弃 */
  const attach = (id: string): string | null => {
    if (inNet(id)) return id;
    const n = nearestNode(paths, at, id);
    return n && n.dist <= snapR ? n.node : null;
  };
  const head = attach(from);
  const tail = attach(to);
  if (!head || !tail) return null;
  // 两端落在互不连通的路网块：不硬接，交给调用方回退直连
  const core = shortestRoadPath(paths, at, head, tail);
  if (!core) return null;
  const out = [from, ...core, to];
  return out.filter((id, i) => i === 0 || id !== out[i - 1]);
}
