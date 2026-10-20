/**
 * @file routeMaps.ts
 * @description 路线与地图的关系口径：路线只是一个巡检点序列，**不绑定地图**。
 *              地图只负责把点位与线路画出来，所以「用哪张图」一律按巡检点反推，
 *              而不是从路线上读——地图换版 / 新增地图都不会改动路线本身。
 */
import type { Point, State } from "./types";

/** 按点位顺序去重出地图 id（只保留能在点位主数据里落到的地图） */
function mapIdsOf(points: Point[], pointIds: string[]): string[] {
  const ids = pointIds
    .map((id) => points.find((p) => p.id === id)?.mapId)
    .filter((id): id is string => !!id);
  return [...new Set(ids)];
}

/**
 * 路线涉及的地图（按点位顺序去重）
 * @param s 全局状态（只用到点位主数据）
 * @param pointIds 路线的巡检点序列
 * @returns 地图 id 列表；点位不存在时跳过
 */
export function routeMapIds(
  s: Pick<State, "points">,
  pointIds: string[],
): string[] {
  return mapIdsOf(s.points || [], pointIds);
}

/**
 * 路线的预览底图：取首个能落到地图上的巡检点
 * @returns 地图 id；点位都落不到地图时返回空串
 */
export function routeRenderMapId(
  s: Pick<State, "points">,
  pointIds: string[],
): string {
  return routeMapIds(s, pointIds)[0] || "";
}
