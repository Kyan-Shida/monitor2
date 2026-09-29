import type { Plan, Robot, State } from "./types";
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
 * 模板所需的检测能力（kind）去重集合
 * @description 口径唯一：绑定校验与计划绑定页的能力对照共用本函数
 * @param s 全局状态
 * @param templateId 模板 ID
 * @returns 所需检测能力列表；模板不存在时返回空数组
 */
export function requiredKinds(s: State, templateId: string): string[] {
  const template = s.templates.find((t) => t.id === templateId);
  if (!template) return [];
  return [
    ...new Set(
      s.points.filter((p) => template.points.includes(p.id)).map((p) => p.kind),
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
    ...(points.some((p) => !r.capabilities.includes(p.kind))
      ? ["检测能力不足"]
      : []),
  ];
}
