/**
 * @file deviceProfile.ts
 * @description 三类巡检机器（机器狗 / 四轮车 / 挂轨）的差异配置唯一来源
 * @interaction 被设备台账、设备详情、地图图层、操控台、告警类型、驾驶舱 KPI 卡片消费
 */
import type { DeviceType, DeviceConstraints, MobilityCapability } from "./types";

/** 机型差异配置：页面禁止写 if (deviceType === ...)，一律读取本表 */
export interface DeviceProfile {
  /** 机型显示名 */
  label: string;
  /** 机型简述，用于卡片与帮助中心 */
  summary: string;
  /** 移动能力标签 */
  mobility: MobilityCapability[];
  /** 默认约束（最低电量等） */
  constraints: DeviceConstraints;
  /** 设备详情差异 Tab */
  detailTabs: string[];
  /** 地图图层 */
  mapLayers: string[];
  /** 操控面板控件 */
  controlPanel: string[];
  /** 告警类型 */
  alarmTypes: string[];
  /** 任务约束说明 */
  taskConstraints: string[];
  /** 驾驶舱卡片重点 */
  kpiCards: string[];
  /** 状态列表关注项（调度指挥驾驶舱左侧） */
  focusItems: string[];
}

export const deviceProfile: Record<DeviceType, DeviceProfile> = {
  机器狗: {
    label: "机器狗",
    summary: "爬楼越障、复杂地形，续航短、接管要求高",
    mobility: ["爬楼", "越障", "跨楼层"],
    constraints: { minBattery: 40, needChargingPlan: true },
    detailTabs: ["步态", "楼梯", "跌倒恢复", "续航"],
    mapLayers: ["楼梯", "障碍", "楼层", "跌倒点"],
    controlPanel: ["步态控制", "跌倒恢复", "低延迟接管"],
    alarmTypes: ["跌倒", "卡楼梯", "接管超时"],
    taskConstraints: ["续航阈值", "楼梯点位限定"],
    kpiCards: ["跌倒次数", "步态异常", "续航"],
    focusItems: ["跌倒", "楼梯", "接管"],
  },
  四轮车: {
    label: "四轮车",
    summary: "速度快、负载大，依赖导航与道路条件",
    mobility: ["高速", "大负载", "道路行驶"],
    constraints: { minBattery: 25, needChargingPlan: true, maxSpeed: 1.5 },
    detailTabs: ["路径", "避障", "充电", "道路条件"],
    mapLayers: ["道路", "路径", "充电桩", "路权冲突"],
    controlPanel: ["路径规划", "避障", "返航", "充电"],
    alarmTypes: ["避障失败", "交通冲突", "充电排队"],
    taskConstraints: ["道路通行条件", "充电桩可用"],
    kpiCards: ["速度", "负载", "避障", "充电"],
    focusItems: ["避障", "道路", "充电"],
  },
  挂轨: {
    label: "挂轨",
    summary: "沿固定轨道长期在线，受区段与检修周期约束",
    mobility: ["固定轨道", "长时在线"],
    constraints: { minBattery: 15, needChargingPlan: false },
    detailTabs: ["轨道区段", "防碰撞", "轨道维护"],
    mapLayers: ["轨道", "区段", "防碰撞", "检修到期"],
    controlPanel: ["轨道任务编排", "防碰撞", "区段锁定"],
    alarmTypes: ["卡轨", "轨道冲突", "检修到期"],
    taskConstraints: ["轨道占用", "区段互斥"],
    kpiCards: ["在线率", "卡轨", "轨道占用"],
    focusItems: ["轨道占用", "卡轨", "防碰撞"],
  },
};

/** 全部机型列表，供筛选与配置页使用 */
export const deviceTypes: DeviceType[] = ["机器狗", "四轮车", "挂轨"];

/**
 * 判断机器人是否具备任务所需的全部移动能力
 * @param robotMobility 机器人移动能力标签
 * @param required 任务要求的移动能力
 * @returns 全部满足返回 true
 */
export const hasMobility = (
  robotMobility: MobilityCapability[],
  required: MobilityCapability[] = [],
) => required.every((x) => robotMobility.includes(x));

/**
 * 按机型取差异配置
 * @param type 机型
 * @returns 对应差异配置
 */
export const profileOf = (type: DeviceType): DeviceProfile => deviceProfile[type];
