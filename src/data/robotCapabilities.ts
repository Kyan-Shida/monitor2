/**
 * @file robotCapabilities.ts
 * @description 机器人能力 / 组件可用性口径：机器人管理页「能力、组件与业务影响」与计划绑定机器人共用
 * @interaction Operations.tsx（机器人管理页能力表）、PlanRobotBinding.tsx（计划绑定机器人能力对照）
 */
import type { Robot } from "./types";

/** 能力项可用性：正常 / 未接入 / 低电量 */
export type CapabilityAvailability = "正常" | "未接入" | "低电量";

export interface CapabilityItem {
  /** 能力 / 组件名称，如 视觉、红外、气体 */
  key: string;
  availability: CapabilityAvailability;
  /** 业务影响：该项不可用时对巡检任务的影响说明 */
  impact: string;
}

/**
 * 生成机器人能力 / 组件可用性矩阵
 * @description 口径唯一：机器人管理页与计划绑定机器人页必须调用本函数，不得各自判断
 * @param r 机器人
 * @returns 能力项列表（视觉 / 红外 / 气体 / 声音 / 导航 / 电池 / 通信）
 */
export function capabilityMatrix(r: Robot): CapabilityItem[] {
  return ["视觉", "红外", "气体", "声音", "导航", "电池", "通信"].map((c) => ({
    key: c,
    // 声音：一期未配置该检测项，恒为未接入；气体：机器人载荷未含气体检测时为未接入
    availability:
      c === "声音" || (c === "气体" && !r.capabilities.includes("气体"))
        ? "未接入"
        : c === "电池" && r.battery < 25
          ? "低电量"
          : "正常",
    impact:
      c === "声音"
        ? "一期未配置声音检测项"
        : c === "电池"
          ? "低于 25% 阻止执行"
          : "调度按机器人实际能力校验",
  }));
}
