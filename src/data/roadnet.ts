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
