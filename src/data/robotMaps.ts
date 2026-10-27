/**
 * @file robotMaps.ts
 * @description 「机器人 ↔ 地图」绑定的唯一口径：机器人可以持有历史下发过的多张地图，
 *              但同一时刻只跑当前持有那张（`Robot.mapId`，任务校验用的也是它）。
 *              现场采集进页面之前只能从**该机器人已绑定的地图**里挑，不列全量地图，
 *              避免拿一张这台机器根本没持有的图去采坐标。
 * @interaction pages/PointEdit.tsx、components/OnsiteSetupModal.tsx
 */
import type { MapAsset, Robot, State, Task } from "./types";

/**
 * 真正在机器上跑的任务状态
 * @description 只含执行中的几种：「待执行 / 已分配」是排队等待，地图停用后本来就会被冻结，
 *              算进来会让「停用中」永远等不到终态
 */
const RUNNING_TASK_STATES: string[] = ["执行中", "暂停", "已被接管"];

/**
 * 地图上还没结束的任务
 * @description 「停用中 → 停用」的唯一判据；引擎收口与页面提示共用，避免两处口径不一
 * @param s 状态（只用到任务集合）
 * @param mapId 地图 id
 */
export function runningTasksOf(
  s: Pick<State, "tasks">,
  mapId: string,
): Task[] {
  return (s.tasks || []).filter(
    (t) => t.mapId === mapId && RUNNING_TASK_STATES.includes(t.state),
  );
}

/**
 * 地图展示态（三态）
 * @description 落库只有「启用 / 停用」两态，停用中是过渡标记；
 *              列表开关、状态标签、筛选一律走这里，保证三处说法一致
 * @param m 地图；缺省按启用处理
 */
export const mapLifecycleOf = (m?: MapAsset): "启用" | "停用中" | "停用" =>
  m?.status === "停用" ? "停用" : m?.stopping ? "停用中" : "启用";

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

/**
 * 使用地图的场景
 * @description 所有"要动这张图"的入口在此登记，保证启停拦截只有一套口径：
 *              人工派任务 / 计划到点生成 / 地图下发 / 导航 / 现场采集
 */
export type MapScene = "任务下发" | "地图下发" | "导航" | "现场采集";

/**
 * 地图在该场景下不可用的原因（空串 = 可用）
 * @description **启停是全链路第一个闸**：停用的图不允许派任务、不允许下发、不允许导航与采集，
 *              文案统一带下一步（去哪启用），避免各入口各说一句；
 *              同步状态与版本新旧仍由调用方结合机器人补充判断，不在此处重复
 * @param m 目标地图；缺省视为不存在
 * @param _scene 场景（保留参数：后续停用中 / 只读场景按场景区分放行）
 */
export function mapSceneBlockedReason(
  m: MapAsset | undefined,
  _scene: MapScene,
): string {
  if (!m) return "地图不存在";
  if (m.status === "停用")
    return `地图「${m.name}」已停用，请先在「地图管理」中启用`;
  // 停用中：不再接新活，但已在跑的任务放它跑完
  if (m.stopping) return `地图「${m.name}」停用中，待当前任务结束后生效`;
  return "";
}
