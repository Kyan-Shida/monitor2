/**
 * @file robotCapabilities.ts
 * @description 机器人能力 / 组件可用性口径：机器人管理页「能力、组件与业务影响」与计划绑定机器人共用。
 *              采集类能力行**关联后台「上装主数据」**（后台管理 › 机器人上装能力）：
 *              行 = 启用的上装覆盖到、且适用该机型的采集方式；可用性看机器人自身是否具备该采集能力，
 *              「配备上装」给出提供该能力的具体上装名称。
 *              系统组件行（导航 / 电池 / 通信）与上装无关，固定输出。
 * @interaction Operations.tsx（机器人管理页能力表）、PlanRobotBinding.tsx（计划绑定机器人能力对照）
 */
import type { CaptureKind, Robot, State } from "./types";

/** 能力项可用性：正常 / 未接入 / 低电量 */
export type CapabilityAvailability = "正常" | "未接入" | "低电量";

export interface CapabilityItem {
  /** 能力 / 组件名称，如 视觉、红外、气体 */
  key: string;
  availability: CapabilityAvailability;
  /** 配备上装：提供该采集能力的启用上装名称（按后台「上装主数据」反查）；未配备或系统组件行为空串 */
  payload: string;
  /** 业务影响：该项不可用时对巡检任务的影响说明 */
  impact: string;
}

/** 采集方式 → 能力表展示名（可见光对外称「视觉」） */
const KIND_LABEL: Record<CaptureKind, string> = {
  可见光: "视觉",
  红外: "红外",
  气体: "气体",
  声音: "声音",
};

/** 采集类能力行的固定展示顺序 */
const KIND_ORDER: CaptureKind[] = ["可见光", "红外", "气体", "声音"];

/**
 * 生成机器人能力 / 组件可用性矩阵
 * @description 口径唯一：机器人管理页与计划绑定机器人页必须调用本函数，不得各自判断。
 *              采集类能力行由后台「上装主数据」驱动，可用性由机器人 `capabilities` 决定，
 *              因此后台停用某类上装、或机器人未装该类能力，能力表都会如实反映。
 * @param s 状态（取上装主数据）
 * @param r 机器人
 * @returns 能力项列表（上装覆盖到的采集方式 + 导航 / 电池 / 通信）
 */
export function capabilityMatrix(s: State, r: Robot): CapabilityItem[] {
  // 关联后台上装主数据：启用 + 适用该机型（机型无关的上装恒适用）的上装清单
  const payloads = (s.robotPayloads || []).filter(
    (p) =>
      p.state === "启用" &&
      (!p.models.length || p.models.includes(r.deviceType)),
  );
  // 采集类能力行 = 上装覆盖到的采集方式；上装主数据为空时退回全部采集方式，避免只剩系统组件行
  const fromMaster = new Set<CaptureKind>(
    payloads.flatMap((p) => p.abilities.map((ab) => ab.kind)),
  );
  const kinds = fromMaster.size ? fromMaster : new Set(KIND_ORDER);
  /**
   * 提供某采集方式的启用上装名称（多个用「 / 」连接）
   * @param k 采集方式
   * @returns 上装名称串；无匹配上装时为空串
   */
  const payloadsOf = (k: CaptureKind) =>
    payloads
      .filter((p) => p.abilities.some((ab) => ab.kind === k))
      .map((p) => p.name)
      .join(" / ");
  const captureRows: CapabilityItem[] = KIND_ORDER.filter((k) =>
    kinds.has(k),
  ).map((k) => {
    const has = r.capabilities.includes(k);
    return {
      key: KIND_LABEL[k],
      availability: has ? "正常" : "未接入",
      // 只有机器人真正具备该能力才算「配备」，未接入不给上装名，避免误读为已装载
      payload: has ? payloadsOf(k) : "",
      impact: has ? "调度按机器人实际能力校验" : "机器人未配置该采集能力",
    };
  });
  return [
    ...captureRows,
    {
      key: "导航",
      availability: "正常",
      payload: "",
      impact: "调度按机器人实际能力校验",
    },
    {
      key: "电池",
      availability: r.battery < 25 ? "低电量" : "正常",
      payload: "",
      impact: "低于 25% 阻止执行",
    },
    {
      key: "通信",
      availability: "正常",
      payload: "",
      impact: "调度按机器人实际能力校验",
    },
  ];
}
