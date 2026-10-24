/**
 * @file robotMaps.ts
 * @description 「机器人 ↔ 地图」绑定的唯一口径：机器人可以持有历史下发过的多张地图，
 *              但同一时刻只跑当前持有那张（`Robot.mapId`，任务校验用的也是它）。
 *              现场采集进页面之前只能从**该机器人已绑定的地图**里挑，不列全量地图，
 *              避免拿一张这台机器根本没持有的图去采坐标。
 * @interaction pages/PointEdit.tsx、components/OnsiteSetupModal.tsx
 */
import type { MapAsset, Robot, State } from "./types";

/**
 * 机器人已绑定的地图
 * @description 下发记录（`syncs`）里出现过的地图 ∪ 当前持有的地图，按地图台账顺序返回
 * @param s 状态（只用到地图台账与下发记录）
 * @param r 目标机器人；缺省返回空数组
 */
export function boundMapsOf(
  s: Pick<State, "maps" | "syncs">,
  r?: Robot,
): MapAsset[] {
  if (!r) return [];
  const ids = new Set(
    (s.syncs || []).filter((x) => x.robotId === r.id).map((x) => x.mapId),
  );
  if (r.mapId) ids.add(r.mapId);
  return s.maps.filter((m) => ids.has(m.id));
}

/**
 * 机器人不可用于现场采集的原因（空串 = 可用）
 * @description 离线 / 故障 / 维护的机器不能跟着人跑图采点
 */
export function robotBlockedReason(r?: Robot): string {
  if (!r) return "请选择执行机器人";
  return r.state === "离线" || r.state === "故障" || r.state === "维护"
    ? `当前${r.state}，不可执行`
    : "";
}

/**
 * 地图不可用于现场采集的原因（空串 = 可用）
 * @description 停用图不能采；机器人手里的图落后于台账版本时，采到的坐标是按旧版底图标定的，
 *              与现版底图会错位，所以同样拦下（与引擎 VALIDATE 的「先同步并激活」口径一致）
 */
export function mapBlockedReason(r: Robot, m?: MapAsset): string {
  if (!m) return "该机器人尚未绑定地图";
  if (m.status === "停用") return "地图已停用";
  if (r.mapId === m.id && r.mapVersion < m.version)
    return `机器人地图版本落后（V${r.mapVersion} / 地图 V${m.version}），请先下发`;
  return "";
}
