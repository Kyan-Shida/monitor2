import type { Plan, Robot, State } from "./types";
import { captureKindsOfPoint, robotCoversPoint } from "./deviceMaster";
export const businessDate = (ms: number) =>
  new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
export function planOccurrences(p: Plan, now: number): number[] {
  const day = businessDate(now);
  const dates = [-1, 0, 1].map((d) =>
    businessDate(Date.parse(day + "T00:00:00+08:00") + d * 86400000),
  );
  return dates
    .filter((d) => d >= p.start && d <= p.end)
    .flatMap((d) => {
      const anchor = Date.parse(d + "T" + p.time + ":00+08:00");
      if (
        p.cycle === "每周" &&
        new Date(d).getUTCDay() !== new Date(p.start).getUTCDay()
      )
        return [];
      return p.cycle === "每班"
        ? [anchor, anchor + 8 * 3600000, anchor + 16 * 3600000].filter(
            (x) => businessDate(x) <= p.end,
          )
        : [anchor];
    })
    .filter((x) => Number.isFinite(x));
}
/**
 * 模板所需的检测能力（采集方式）去重集合
 * @description 口径唯一：绑定校验与计划绑定页的能力对照共用本函数。
 *              J′ 口径收敛：返回**采集方式**（可见光 / 红外 / 气体 / 声音），
 *              不再返回"仪表 / 阀门"这类业务类型——业务类型属设备主数据。
 * @param s 全局状态
 * @param templateId 模板 ID
 * @returns 所需采集方式列表；模板不存在时返回空数组
 */
export function requiredKinds(s: State, templateId: string): string[] {
  const template = s.templates.find((t) => t.id === templateId);
  if (!template) return [];
  return [
    ...new Set(
      s.points
        .filter((p) => template.points.includes(p.id))
        .flatMap((p) => captureKindsOfPoint(s, p)),
    ),
  ];
}
export function bindingReasons(
  s: State,
  templateId: string,
  r: Robot,
): string[] {
  const template = s.templates.find((t) => t.id === templateId);
  if (!template || template.state !== "启用") return ["模板不存在或已停用"];
  const points = s.points.filter((p) => template.points.includes(p.id));
  return [
    ...(points.some(
      (p) => s.maps.find((m) => m.id === p.mapId)?.region !== r.region,
    )
      ? ["服务区域不匹配"]
      : []),
    // 采集方式口径：与引擎 constraints / 调度校验清单同源
    ...(points.some((p) => !robotCoversPoint(s, p, r))
      ? ["检测能力不足"]
      : []),
  ];
}
