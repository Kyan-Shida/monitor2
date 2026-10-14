/**
 * @file pointOrder.ts
 * @description 已选巡检点的**最优排序**：让机器狗沿父线走、不走回头路。
 *   做法：把父线（地图路网 `map.roadnet.paths`）还原成一条**节点链**，让每个巡检点落到链上的位次 ——
 *   ① 巡检点绑定了父线节点（`Point.targetId` 命中链上节点）→ 直接用该节点位次；
 *   ② 没绑定 / 对不上 → **投影到最近的父线节点**（按坐标算最近），保证一定能排序；
 *   再按位次排序。**方向**：已选点集中在链的后半段时从链尾进入（倒序），少跑空路。
 *   父线不可用（没有路网）时退化为**最近邻贪心**。
 * @interaction pages/Planning.tsx（路线编辑）、components/QuickTaskDrawer.tsx（临时任务）
 */
import type { Point, State } from "./types";
import { targetsOf } from "./mapCalibration";

/** 巡检点在图上的坐标（优先统一坐标，缺省回落到图面坐标） */
const xyOf = (p: Point) => ({ x: p.world?.x ?? p.x, y: p.world?.y ?? p.y });

/**
 * 最优排序
 * @param s 状态
 * @param ids 已选巡检点 id（当前顺序）
 * @param mapId 父线地图 id；缺省取第一个已选点所属地图
 * @returns 重排后的巡检点 id（机器狗按该顺序跑子线）
 */
export function optimizePointOrder(
  s: State,
  ids: string[],
  mapId?: string,
): string[] {
  const points = (s.points || []).filter((p) => ids.includes(p.id));
  // 一两个点谈不上走回头路：原样返回，避免无谓跳动
  if (points.length < 3) return ids;
  const lineMapId = mapId || points[0].mapId;
  /** 父线节点链：把路网每条线的经过点依次拼成一条链（重复节点取首次出现） */
  const chain: string[] = [];
  (s.maps.find((m) => m.id === lineMapId)?.roadnet?.paths || []).forEach(
    (path) =>
      path.pointIds.forEach((node) => {
        if (!chain.includes(node)) chain.push(node);
      }),
  );
  /** 父线节点坐标（标定 / 定位点） */
  const nodes = targetsOf(s, lineMapId);
  const xyOfNode = (nodeId: string) => {
    const n = nodes.find((x) => x.id === nodeId);
    return n ? { x: n.world?.x ?? n.x, y: n.world?.y ?? n.y } : undefined;
  };
  /**
   * 巡检点在父线上的位次
   * @description 绑定了父线节点直接用；否则投影到**最近的父线节点**（路网与点位各自维护过，
   *              id 对不上时也要能排），实在没有可用节点返回 -1
   */
  const rankOf = (p: Point) => {
    const direct = chain.indexOf(p.targetId);
    if (direct >= 0) return direct;
    const my = xyOf(p);
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    chain.forEach((nodeId, i) => {
      const c = xyOfNode(nodeId);
      if (!c) return;
      const d = (c.x - my.x) ** 2 + (c.y - my.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  const ranked = points.map((p) => ({ p, r: rankOf(p) }));
  const known = ranked.filter((x) => x.r >= 0);
  const unknown = ranked.filter((x) => x.r < 0);

  // 父线可用：按位次排；已选点集中在后半段时从链尾进入（倒序），少跑空路
  if (known.length >= 2) {
    const min = Math.min(...known.map((x) => x.r));
    const max = Math.max(...known.map((x) => x.r));
    const backward = chain.length - max + min < max - min;
    known.sort((a, b) => (backward ? b.r - a.r : a.r - b.r));
    return [...known, ...unknown].map((x) => x.p.id);
  }

  // 退化：最近邻贪心（起点取最靠左上的点，之后每次取离当前最近的点）
  const rest = [...points];
  const out: Point[] = [];
  let cur = rest
    .slice()
    .sort((a, b) => xyOf(a).x + xyOf(a).y - (xyOf(b).x + xyOf(b).y))[0];
  const dist = (a: Point, b: Point) => {
    const x = xyOf(a);
    const y = xyOf(b);
    return (x.x - y.x) ** 2 + (x.y - y.y) ** 2;
  };
  while (rest.length) {
    const i = rest.indexOf(cur);
    if (i >= 0) rest.splice(i, 1);
    out.push(cur);
    if (!rest.length) break;
    cur = rest.reduce(
      (best, p) => (dist(cur, p) < dist(cur, best) ? p : best),
      rest[0],
    );
  }
  return out.map((p) => p.id);
}
