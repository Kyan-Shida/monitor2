/**
 * @file geo.ts
 * @description 坐标转换纯函数层：单张碎片地图的「局部坐标系（米）」↔「厂区全局坐标系（米）」。
 *              这是「地图管理（纯 SLAM 地图）+ 巡检点管理（业务逻辑）」在机器狗上协同的地基：
 *              地图提供局部坐标系，巡检点以 `world`（厂区 XYZ）为权威坐标，
 *              任务下发时按目标地图把全局坐标换算为该图的局部坐标，机器狗再做局部定位与导航。
 * @interaction 被 pages/SpaceManage.tsx（空间管理页的坐标换算 / 拓扑 / 版本校验）消费；
 *              与 data/mapCalibration.ts 的标定数据、data/types.ts 的 Point.world 同口径
 */
import type { MapFrames } from "./types";

/** 三维坐标（米）：厂区全局坐标系与地图局部坐标系共用同一结构，语义由所处语境决定 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * 地图的刚性变换参数：平移为地图原点在厂区全局坐标系中的位置，旋转为地图相对全局正北的夹角
 * @description 平移取 `frames.origin`（地图原点在全局坐标系中的位姿），旋转取 `rotateDeg`；
 *              两者都缺省（未标定）时按恒等变换处理——此时局部坐标与全局坐标数值相同，
 *              仅表示**尚未配准**，不代表画到同一张底图上就一定重合。
 */
export interface MapPose {
  x: number;
  y: number;
  /** 旋转角（度） */
  deg: number;
}

/**
 * 取某张地图的刚性变换参数
 * @param f 地图坐标系标定点（frames）
 * @returns 平移 + 旋转（度）；未标定图返回全 0 的恒等变换
 */
export function poseOf(f?: MapFrames): MapPose {
  return {
    x: Number.isFinite(f?.origin?.x) ? (f!.origin!.x as number) : 0,
    y: Number.isFinite(f?.origin?.y) ? (f!.origin!.y as number) : 0,
    deg: Number.isFinite(f?.rotateDeg) ? (f!.rotateDeg as number) : 0,
  };
}

/**
 * 该地图是否已完成配准（可以把全局坐标换算到局部坐标）
 * @description 只有平移 + 旋转都可用才算配准完成；仅填了分辨率（米/像素）不算，
 *              因为分辨率只服务「底图投影」这类展示换算，不承担全局↔局部变换。
 * @param f 地图坐标系标定点（frames）
 * @returns 已配准返回 true
 */
export function isRegistered(f?: MapFrames): boolean {
  return Number.isFinite(f?.origin?.x) && Number.isFinite(f?.origin?.y);
}

/**
 * 局部坐标 → 厂区全局坐标
 * @param local 地图局部坐标系下的坐标（米）
 * @param f 该地图的坐标系标定点
 * @returns 厂区全局坐标系下的坐标（米）
 */
export function localToWorld(local: Vec3, f?: MapFrames): Vec3 {
  const p = poseOf(f);
  const a = (p.deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    x: round(p.x + local.x * cos - local.y * sin),
    y: round(p.y + local.x * sin + local.y * cos),
    z: round(local.z),
  };
}

/**
 * 厂区全局坐标 → 局部坐标（任务下发时的换算口径）
 * @description 与 `localToWorld` 互为逆变换：机器人按目标地图拿到的是局部坐标，
 *              但平台存储的权威坐标始终是 `Point.world`，下发前必须按目标地图换算。
 * @param world 厂区全局坐标系下的坐标（米）
 * @param f 该地图的坐标系标定点
 * @returns 该地图局部坐标系下的坐标（米）
 */
export function worldToLocal(world: Vec3, f?: MapFrames): Vec3 {
  const p = poseOf(f);
  const a = (p.deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = world.x - p.x;
  const dy = world.y - p.y;
  return {
    x: round(dx * cos + dy * sin),
    y: round(-dx * sin + dy * cos),
    z: round(world.z),
  };
}

/**
 * 两点在厂区全局坐标系下的平面距离（米）
 * @param a 坐标 A
 * @param b 坐标 B
 * @returns 距离（米，保留 2 位小数）
 */
export function distanceOf(a: Vec3, b: Vec3): number {
  return round(Math.hypot(a.x - b.x, a.y - b.y));
}

/**
 * 坐标文案：XYZ 三个轴的取值
 * @param v 坐标；缺省返回占位符
 * @returns `X xx.x / Y xx.x / Z xx.x` 形式的文案
 */
export const coordText = (v?: Vec3): string =>
  v
    ? `X ${fmt(v.x)} / Y ${fmt(v.y)} / Z ${fmt(v.z)}`
    : "—";

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString();
const round = (n: number): number => Math.round(n * 100) / 100;
