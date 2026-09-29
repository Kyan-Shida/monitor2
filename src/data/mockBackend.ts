/**
 * @file mockBackend.ts
 * @description 「地图 → 巡检任务」链路的**集中 Mock 出口**：统一产出
 *              坐标反推（CAD/BIM 落点）、AI 推荐（停靠点/观察方向/云台角度）、
 *              机器人试采回执（画面内/角度/距离/位姿误差）等后端能力的结果。
 *              原型阶段以此代替真实后端，形状与真实接口一致，日后可整体替换。
 * @interaction 被 data/engine.ts 的新 action（GEN_CANDIDATE_BY_COORD / BY_AI / TRIAL_RECEIPT）消费
 */
import type { PTZ, TrialReceipt } from "./types";

/** 位姿误差阈值（cm）：超过则标记「待校准」（与阶段⑤⑧ 一致） */
export const POSE_ERROR_THRESHOLD_CM = 10;

/**
 * 稳定的字符串哈希 → 0..1 伪随机
 * @description 用确定性伪随机代替 Math.random()，保证同一 id 每次渲染/重算结果一致，
 *              否则原型里候选点坐标与试采回执会"每次都变"。
 * @param s 输入字符串（通常由 id 拼成）
 * @returns 0..1 之间的伪随机数
 */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** 取 8%~92% 的地图百分比坐标（留出边缘留白，避免贴在画布边界） */
function pct(seed: number): number {
  return 8 + Math.round(seed * 84);
}

/**
 * 坐标反推候选停靠位（阶段⑤ · 模式 B）
 * @description 真实实现应由 CAD/BIM/图纸坐标经坐标转换落点并反推停靠位；
 *              原型按下发 key 生成稳定坐标。
 * @param key 依据键（如 `${mapId}:${deviceCode}`）
 * @returns 候选停靠位的地图百分比坐标
 */
export function mockCandidateFromCoord(key: string): { x: number; y: number } {
  return { x: pct(hash01("coord-x-" + key)), y: pct(hash01("coord-y-" + key)) };
}

/**
 * AI 推荐停靠点 + 观察方向 + 云台角度（阶段⑤ · 模式 C）
 * @description 真实实现应基于点云/BIM/语义地图推理；原型按 key 生成稳定结果。
 * @param key 依据键（如 `${mapId}:${deviceCode}`）
 * @returns 停靠位坐标、观察方向与推荐云台角度
 */
export function mockAiRecommend(key: string): {
  x: number;
  y: number;
  viewDir: string;
  ptz: PTZ;
} {
  const rx = hash01("ai-x-" + key);
  const ry = hash01("ai-y-" + key);
  const rp = hash01("ai-ptz-" + key);
  const dirs = ["正对", "左前", "右前", "俯视", "仰视"];
  return {
    x: pct(rx),
    y: pct(ry),
    viewDir: dirs[Math.floor(rp * dirs.length) % dirs.length],
    ptz: {
      pan: Math.round(rp * 360 - 180), // -180 ~ 180
      tilt: Math.round(rx * 60 - 30), // -30 ~ 30
      zoom: 1 + Math.round(ry * 4), // 1 ~ 5
    },
  };
}

/**
 * 机器人试采回执（阶段⑤ 后半）
 * @description 真实实现由机器人运行任务回传；原型按 pointId+robotId 生成稳定回执。
 *              位姿误差超过 {@link POSE_ERROR_THRESHOLD_CM} 时由调用方置「待校准」。
 * @param pointId 候选/物理点 id
 * @param robotId 试采机器人 id
 * @returns 试采回执（画面内 / 角度 / 距离 / 位姿误差 / 时间）
 */
export function mockTrialReceipt(pointId: string, robotId: string): TrialReceipt {
  const key = pointId + "@" + robotId;
  return {
    pointId,
    robotId,
    // 约 85% 目标在画面内、80% 角度合适，便于演示"通过 / 需调整"两种分支
    inFrame: hash01("frame-" + key) > 0.15,
    angleOk: hash01("angle-" + key) > 0.2,
    distance: Math.round((1 + hash01("dist-" + key) * 9) * 10) / 10,
    poseErrorCm: Math.round(hash01("pose-" + key) * 30),
    at: new Date().toLocaleString("zh-CN"),
  };
}

/**
 * 判定试采是否通过
 * @param r 试采回执
 * @returns 目标在画面内、角度合适且位姿误差未超阈值时为 true
 */
export function trialPassed(r: TrialReceipt): boolean {
  return r.inFrame && r.angleOk && r.poseErrorCm <= POSE_ERROR_THRESHOLD_CM;
}
