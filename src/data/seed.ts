/**
 * @file seed.ts
 * @description 全部演示种子数据（点位/地图/机器人/巡检路线/计划/任务/结果/告警/日志…），
 *              含「地图 → 巡检任务」链路新增集合（devices/logicalPoints/routes/siteSurveys/trackSamples/trialReceipts）
 * @interaction 由 store.tsx 注入 Context；engine/metrics/selectors 消费
 */
import type {
  State,
  Tenant,
  Point,
  Task,
  Result,
  Log,
  DeviceAsset,
  LogicalPoint,
  Area,
  Instrument,
  Requirement,
  BusinessTarget,
  RobotPayload,
  AlgoConfig,
  CaptureKind,
  AlarmClass,
  AlarmItem,
} from "./types";
import { defaultRangeOfUnit } from "./alarmRules";
import { DEFAULT_TENANT, TENANTS, loadTenants } from "./tenants";
import {
  defaultRequirementOfInstrument,
  defaultCategoryOfTarget,
} from "./deviceMaster";
import { captureAction, DEMO_AREA_POLYGONS } from "./types";
import { SAMPLE_MAP_IMAGE } from "./sampleMap";
import { withAlarmSetting, type AlarmSettingHost } from "./alarmSettings";
import { TASK_STATUSES } from "./taskStatus";
import type { AlarmPushStaff } from "./types";
const points: Point[] = [
  {
    id: "P001",
    name: "V001 出口压力表",
    targetId: "O101",
    mapId: "MAP-A03",
    device: "V001 原料储罐",
    object: "出口压力表",
    item: "压力读数",
    unit: "MPa",
    kind: "仪表",
    requirement: "身份唯一，表盘清晰，压力正常范围 0.2–0.8 MPa",
    state: "已启用",
    x: 36,
    y: 33,
    validated: "R01 / 能力第 2 版 / 地图第 3 版",
    pose: { x: 36, y: 33, yaw: 90 },
    logicalIds: ["LP001"],
    actionPlan: {
      ptz: { pan: 12, tilt: -6, zoom: 3 },
      lift: 0,
      light: 40,
      dwellSec: 6,
      avoidPolicy: "绕行优先",
      viewDir: "正对表盘",
      preset: "预置位 1",
    },
  },
  {
    id: "P002",
    name: "V001 出口阀门",
    targetId: "O102",
    mapId: "MAP-A03",
    device: "V001 原料储罐",
    object: "出口阀门",
    item: "阀门状态",
    unit: "",
    kind: "阀门",
    requirement: "目标身份唯一，完整采集阀位，期望状态：开启",
    state: "已启用",
    x: 62,
    y: 60,
    validated: "R01 / 能力第 2 版 / 地图第 3 版",
    logicalIds: ["LP002"],
    calibrate: "待校准",
    pose: { x: 62, y: 60, yaw: 0 },
  },
  {
    id: "P003",
    name: "V002 表面温度",
    targetId: "O103",
    mapId: "MAP-A03",
    device: "V002 缓冲罐",
    object: "罐壁",
    item: "表面温度",
    unit: "℃",
    kind: "红外",
    requirement: "完整热像，温度低于 60℃",
    state: "已启用",
    x: 74,
    y: 29,
    validated: "R01 / 能力第 2 版 / 地图第 3 版",
  },
  // ── 演示用：扩充点位，支撑告警事件与告警排行 TOP10 的数据量 ──
  {
    id: "P004",
    name: "V003 出口压力表",
    targetId: "O104",
    mapId: "MAP-A03",
    device: "V003 原料储罐",
    object: "出口压力表",
    item: "压力读数",
    unit: "MPa",
    kind: "仪表",
    requirement: "身份唯一，表盘清晰，压力正常范围 0.2–0.8 MPa",
    state: "已启用",
    x: 45,
    y: 20,
    validated: "R01 / 能力第 2 版 / 地图第 3 版",
  },
  {
    id: "P005",
    name: "V003 出口阀门",
    targetId: "O105",
    mapId: "MAP-A03",
    device: "V003 原料储罐",
    object: "出口阀门",
    item: "阀门状态",
    unit: "",
    kind: "阀门",
    requirement: "目标身份唯一，完整采集阀位，期望状态：开启",
    state: "已启用",
    x: 12,
    y: 48,
    validated: "R01 / 能力第 2 版 / 地图第 3 版",
  },
  {
    id: "P006",
    name: "V004 罐壁温度",
    targetId: "O106",
    mapId: "MAP-A03",
    device: "V004 缓冲罐",
    object: "罐壁",
    item: "表面温度",
    unit: "℃",
    kind: "红外",
    requirement: "完整热像，温度低于 60℃",
    state: "已启用",
    x: 78,
    y: 48,
    validated: "R01 / 能力第 2 版 / 地图第 3 版",
  },
  {
    id: "P007",
    name: "装置区 A 段管廊气体浓度",
    targetId: "O107",
    // 装置区的点必须挂装置区地图（R03 / 装置区轨道都绑 MAP-B01），否则跨区无法生成任务
    mapId: "MAP-B01",
    device: "装置区 A 段管廊",
    object: "可燃气体探头",
    item: "气体浓度",
    unit: "%LEL",
    kind: "气体",
    requirement: "探头完好、无遮挡，浓度低于 20 %LEL",
    state: "已启用",
    x: 88,
    y: 14,
    validated: "R03 / 能力第 3 版 / 地图第 1 版",
  },
  {
    id: "P008",
    name: "V004 出口压力表",
    targetId: "O108",
    mapId: "MAP-A03",
    device: "V004 缓冲罐",
    object: "出口压力表",
    item: "压力读数",
    unit: "MPa",
    kind: "仪表",
    requirement: "身份唯一，表盘清晰，压力正常范围 0.2–0.8 MPa",
    state: "已启用",
    x: 66,
    y: 68,
    validated: "R01 / 能力第 2 版 / 地图第 3 版",
  },
  {
    id: "P009",
    name: "V003 罐壁温度",
    targetId: "O109",
    mapId: "MAP-A03",
    device: "V003 原料储罐",
    object: "罐壁",
    item: "表面温度",
    unit: "℃",
    kind: "红外",
    requirement: "完整热像，温度低于 60℃",
    state: "已启用",
    x: 20,
    y: 32,
    validated: "R01 / 能力第 2 版 / 地图第 3 版",
  },
  {
    id: "P010",
    name: "装置区 B 段管廊气体浓度",
    targetId: "O110",
    mapId: "MAP-B01",
    device: "装置区 B 段管廊",
    object: "可燃气体探头",
    item: "气体浓度",
    unit: "%LEL",
    kind: "气体",
    requirement: "探头完好、无遮挡，浓度低于 20 %LEL",
    state: "已启用",
    x: 86,
    y: 42,
    validated: "R03 / 能力第 3 版 / 地图第 1 版",
  },
  {
    id: "P011",
    name: "V004 出口阀门",
    targetId: "O111",
    mapId: "MAP-A03",
    device: "V004 缓冲罐",
    object: "出口阀门",
    item: "阀门状态",
    unit: "",
    kind: "阀门",
    requirement: "目标身份唯一，完整采集阀位，期望状态：开启",
    state: "已启用",
    x: 42,
    y: 62,
    validated: "R01 / 能力第 2 版 / 地图第 3 版",
  },
];
/**
 * 相对当前时间生成任务完成时限
 * 演示数据不写死绝对时间，避免多日后打开时所有任务的时限均已过期
 * @param minutes 距当前时间的分钟数
 * @returns 形如 2026-09-23 10:30 的本地时间字符串
 */
const dueIn = (minutes: number) => {
  const d = new Date(Date.now() + minutes * 60000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** 取相对当前时间的「YYYY-MM-DD」，用于驾驶舱今日 / 本月筛选 */
const dayIn = (minutes: number) => dueIn(minutes).slice(0, 10);
/** 取相对当前时间的「HH:mm」，用于责任链时间线 */
const hhmmIn = (minutes: number) => dueIn(minutes).slice(11);
/**
 * 生成一张"现场证据照片"占位图（离线 SVG data URI，无需联网）
 * 用于执行事件与证据时间轴展示采集到的图片证据
 */
const photo = (label: string, hue: number) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='hsl(${hue},58%,52%)'/>
      <stop offset='1' stop-color='hsl(${hue + 28},52%,32%)'/>
    </linearGradient></defs>
    <rect width='100%' height='100%' fill='url(#g)'/>
    <circle cx='158' cy='88' r='44' fill='rgba(255,255,255,.16)'/>
    <rect x='14' y='14' width='42' height='7' rx='3' fill='rgba(255,255,255,.5)'/>
    <text x='16' y='184' font-family='sans-serif' font-size='13' fill='rgba(255,255,255,.92)'>${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};
const task = (
  id: string,
  name: string,
  state: Task["state"],
  robotId?: string,
): Task => ({
  id,
  name,
  source: "计划生成",
  taskType: "综合巡检任务",
  atomicActions: ["拍照", "采集红外热像"],
  state,
  robotId,
  mapId: "MAP-A03",
  mapVersion: 3,
  items: points.slice(0, 3).map((p) => ({ ...p, mapVersion: 3 })),
  stage: 0,
  index: 0,
  done: [],
  skipped: [],
  retries: 0,
  /** 演示数据统一按「相对当前时间」生成，避免多日后打开时今日 / 本月统计为空 */
  created: dueIn(-75),
});
// ── 平台标准规则与告警类别（告警管理）──────────────────
/**
 * 演示用告警类别（告警管理 › 告警类别）：二级口径 = 分类名称 + 告警大类 + 是否启用
 * @description 启用的分类是「告警设置 › 告警类型」下拉与「告警记录 › 分类筛选」的数据源；
 *              业务预警按**判定对象**分环境安全 / 生产运行 / 人员与作业，
 *              机器人预警按**故障部位**分下装（底盘 / 行走 / 通信 / 电池）与上装（采集载荷 / 传感器）
 */
const ALARM_CLASSES: AlarmClass[] = [
  {
    id: "AC-01",
    name: "下装",
    main: "机器人预警",
    enabled: true,
    hint: "底盘 · 行走 · 定位 · 通信 · 电池",
  },
  {
    id: "AC-02",
    name: "上装",
    main: "机器人预警",
    enabled: true,
    hint: "采集载荷 · 传感器",
  },
  // 识别失败（照片模糊 / 算法调用失败 / 传感器无数据）不是告警项触发，归机器人预警下的独立分类
  {
    id: "AC-06",
    name: "识别故障",
    main: "机器人预警",
    enabled: true,
    hint: "照片模糊 · 算法调用失败 · 传感器无数据",
  },
  { id: "AC-03", name: "环境安全", main: "业务预警", enabled: true },
  { id: "AC-04", name: "生产运行", main: "业务预警", enabled: true },
  { id: "AC-05", name: "人员与作业", main: "业务预警", enabled: true },
];
/**
 * 演示用告警推送人员（告警管理 › 告警推送）
 * @description 三条演示各绑定一个维度：等级留空 = 全部等级；区域 / 设备留空 = 不限该维度，
 *              维度之间同时成立（见 alarmPush.pushStaffOfAlarm）
 */
const ALARM_PUSH_STAFF: AlarmPushStaff[] = [
  {
    id: "AP-01",
    name: "王海峰",
    phone: "13800000001",
    login: "wanghaifeng",
    dept: "生产运行部",
    levels: ["一级"],
    // 按区域绑定：只要是一期罐区的告警
    areas: ["一期罐区"],
    sms: true,
    updatedBy: "Admin",
    updatedAt: "2026-10-14 09:12:30",
  },
  {
    id: "AP-02",
    name: "周敏",
    phone: "13800000002",
    login: "zhoumin",
    dept: "设备管理部",
    levels: ["一级", "二级"],
    // 按区域绑定：装置区的设备告警
    areas: ["装置区"],
    sms: true,
    updatedBy: "Admin",
    updatedAt: "2026-10-14 09:12:30",
  },
  {
    id: "AP-03",
    name: "李建国",
    phone: "13800000003",
    login: "lijianguo",
    dept: "安全环保部",
    levels: [],
    // 按设备绑定：这两台罐体的全部等级告警
    devices: ["V001 原料储罐", "V002 缓冲罐"],
    sms: false,
    updatedBy: "Admin",
    updatedAt: "2026-10-14 09:12:30",
  },
];
/**
 * 生成一条巡检检测结果（演示种子数据）
 * @description 原始采集值即外部 AI 识别输入，识别值默认等于原始值；
 *              异常结果都会有一条对应的告警事件（异常即告警），不再有人工复核环节
 * @param id 结果 ID
 * @param taskId 所属任务 ID
 * @param point 关联巡检点位（提供检测项 / 单位）
 * @param raw 原始采集值
 * @param final 最终值
 * @param abnormal 业务判断是否异常
 * @param status 结果状态（已识别 / 已确认 / 无效）
 * @param minutes 采集时间，相对当前时间的分钟数（负数表示过去）
 * @param confidence 外部 AI 识别置信度，默认 0.92
 * @param triggerReason 未做判定的原因（规则未配置 / 识别无效时填写）
 * @returns 规范化后的检测结果
 */
const result = (
  id: string,
  taskId: string,
  point: Point,
  raw: string,
  final: string,
  abnormal: boolean,
  status: string,
  minutes: number,
  confidence = 0.92,
  triggerReason?: string,
): Result => ({
  id,
  taskId,
  pointId: point.id,
  item: point.item,
  /**
   * 判定规则快照（与采集时一致的口径）：告警列表的「告警阈值 / 风险原因」据此展示，
   * 不用当前规则倒推历史判定
   */
  ruleSnapshot: (() => {
    // 与引擎 alarmRules.rulesOf 的兜底分支同源：按"检测项单位"给量程
    const range = defaultRangeOfUnit(point.unit);
    return {
      id: "RULE-" + point.id,
      name: point.name + "标准",
      pointId: point.id,
      type: range ? ("数值范围" as const) : ("期望状态" as const),
      unit: point.unit,
      min: range?.min ?? 0,
      max: range?.max ?? 0,
      expected: "开启",
      level: "二级" as const,
      enabled: ["P001", "P002", "P003"].includes(point.id),
      triggerMode: "识别即触发" as const,
      consecutive: 1,
      version: 1,
    };
  })(),
  raw,
  recognized: raw,
  final,
  unit: point.unit,
  abnormal,
  status,
  triggerReason,
  // 带未判定原因 = AI 未给出可用结论 → AI 状态异常（三级告警），触发告警的判定与引擎同源
  aiAbnormal: !!triggerReason,
  source: "机器人采集 / 外部 AI 识别 v1.2",
  confidence,
  time: dueIn(minutes),
});
/**
 * 生成一个已结束任务的执行事件（下发 → 开始 → 逐项采集回执 → 结束）
 * @description 供「过程回放 / 执行回溯」时间轴展示；采集回执按传入读数生成，时间在开始与结束之间均匀铺开
 * @param id 任务 ID
 * @param name 任务名称
 * @param robotId 执行机器人 ID
 * @param start 开始时间（相对当前时间的分钟数，负数表示过去）
 * @param end 结束时间（相对当前时间的分钟数）
 * @param readings 各检测项采集回执：`[点位说明, 读数文案, 配图色相]`
 * @param finishDetail 结束回执文案；缺省为正常结束
 * @returns 该任务按时间先后排列的事件列表
 */
const taskLogs = (
  id: string,
  name: string,
  robotId: string,
  start: number,
  end: number,
  readings: [string, string, number][],
  finishDetail = "全部检测项完成，任务正常结束",
): Log[] => {
  /** 把第 i（0 起）个采集回执均匀落在开始与结束之间 */
  const at = (i: number, n: number) =>
    Math.round(start + ((end - start) * (i + 1)) / (n + 1));
  const logs: Log[] = [
    {
      id: `${id}-D`,
      time: dueIn(start),
      action: "DISPATCH",
      object: id,
      detail: `${id} 下发至 ${robotId}，已核对 m3 / p7`,
    },
    {
      id: `${id}-S`,
      time: dueIn(start + 1),
      action: "START",
      object: id,
      detail: `${robotId} 开始执行${name}`,
    },
  ];
  readings.forEach(([label, reading, hue], i) =>
    logs.push({
      id: `${id}-T${i + 1}`,
      time: dueIn(at(i, readings.length)),
      action: "TICK",
      object: id,
      detail: `完成${label}采集`,
      reading,
      image: photo(`${label} ${reading}`, hue),
    }),
  );
  logs.push({
    id: `${id}-F`,
    time: dueIn(end),
    action: "TASK_FINISHED",
    object: id,
    detail: finishDetail,
  });
  return logs;
};
// ── 机器人能力（后台管理 › 机器人能力）：能力类型 → 能力参数 ──────────
/**
 * 机器人能力清单：**两级** —— 能力类型（父）→ 能力参数（子）。
 * @description 巡检项的「能力项」从能力参数里选；能力参数 → 原子动作见
 *              `atomicActionOfAbility`，能力特有配置项见 `abilityFields`。
 */
const robotAbilities = [
  {
    id: "RA-COMMON",
    name: "常用能力",
    params: [
      { id: "RA-COMMON-VIS", name: "可见光实况识别" },
      { id: "RA-COMMON-HD", name: "高清识别" },
    ],
  },
  {
    id: "RA-ARM",
    name: "机械臂能力",
    params: [
      { id: "RA-ARM-PRESS", name: "按钮按压" },
      { id: "RA-ARM-KNOB", name: "旋钮操作" },
      { id: "RA-ARM-GRAB", name: "夹取作业" },
    ],
  },
  {
    id: "RA-CHASSIS",
    name: "底盘控制能力",
    params: [
      { id: "RA-CHASSIS-MOVE", name: "底盘移动" },
      { id: "RA-CHASSIS-DOCK", name: "定点停靠" },
    ],
  },
  {
    id: "RA-METER",
    name: "表计识别能力",
    params: [
      { id: "RA-METER-V30", name: "视频片段识别(30s)" },
      { id: "RA-METER-V4", name: "视频片段识别(4s)" },
      { id: "RA-METER-V15", name: "视频片段识别(15s)" },
      { id: "RA-METER-IR", name: "红外识别" },
      { id: "RA-METER-HD", name: "高清识别" },
    ],
  },
  {
    id: "RA-GIMBAL",
    name: "云台能力",
    params: [
      { id: "RA-GIMBAL-TURN", name: "云台转向" },
      { id: "RA-GIMBAL-LIFT", name: "云台升降" },
      { id: "RA-GIMBAL-PRESET", name: "预置位调用" },
    ],
  },
  {
    id: "RA-NAV",
    name: "导航能力",
    params: [
      { id: "RA-NAV-AUTO", name: "自主导航" },
      { id: "RA-NAV-TRACK", name: "循迹导航" },
    ],
  },
  {
    id: "RA-CHARGE-ROOM",
    name: "充电房能力",
    params: [
      { id: "RA-CR-DOOR-CLOSE", name: "关闭联动门" },
      { id: "RA-CR-DOOR-OPEN", name: "开启联动门" },
      { id: "RA-CR-HEAT-OFF", name: "关加热器" },
      { id: "RA-CR-HEAT-ON", name: "开加热器" },
      { id: "RA-CR-AC-OFF", name: "关空调" },
      { id: "RA-CR-AC-ON", name: "开空调" },
      { id: "RA-CR-PILE-ON", name: "充电桩上电" },
      { id: "RA-CR-PILE-OFF", name: "充电桩断电" },
      { id: "RA-CR-DOOR", name: "开门" },
    ],
  },
  {
    id: "RA-NOISE",
    name: "噪音识别能力",
    params: [{ id: "RA-NOISE-VOICE", name: "声纹采集" }],
  },
  {
    id: "RA-ANOMALY",
    name: "异常识别能力",
    params: [
      { id: "RA-ANOMALY-SOUND", name: "异常声音识别" },
      { id: "RA-ANOMALY-VIB", name: "异常振动识别" },
    ],
  },
  {
    id: "RA-CHARGE",
    name: "充电能力",
    params: [
      { id: "RA-CHARGE-AUTO", name: "自动充电" },
      { id: "RA-CHARGE-MANUAL", name: "手动充电" },
    ],
  },
  {
    id: "RA-LEAK",
    name: "跑冒滴漏识别能力",
    params: [{ id: "RA-LEAK-DETECT", name: "跑冒滴漏识别" }],
  },
  {
    id: "RA-ENV",
    name: "环境识别能力",
    params: [{ id: "RA-ENV-PD", name: "局部放电检测" }],
  },
  {
    id: "RA-GAS",
    name: "气体识别能力",
    params: [
      { id: "RA-GAS-ACOUSTIC", name: "声学成像泄漏检测" },
      { id: "RA-GAS-CH4", name: "甲烷遥测" },
    ],
  },
];

// ── 机器人上装能力（后台管理 › 机器人上装能力）────────────────
/**
 * 上装能力主数据：与上装分组常量同源（4 类采集方式），改为后台可维护的清单。
 * @description 采集方式决定可用原子动作（见 `atomicActionCapability`），
 *              机器人能力 / 任务指令集 / 派单校验都从这里反查，不再各处写死 4 类。
 */
const robotPayloads: RobotPayload[] = [
  {
    id: "PL-VIS",
    name: "可见光相机",
    version: "V3.2",
    vendor: "海康机器人",
    abilities: [{ kind: "可见光", actions: ["拍照", "录像片段", "分析不安全行为"] }],
    models: ["机器狗", "四轮车", "挂轨"],
  },
  {
    id: "PL-IR",
    name: "红外热像仪",
    version: "V2.1",
    vendor: "大立科技",
    abilities: [{ kind: "红外", actions: ["采集红外热像"] }],
    models: ["机器狗", "四轮车", "挂轨"],
  },
  {
    id: "PL-GAS",
    name: "泵吸式气体检测",
    version: "V1.4",
    vendor: "汉威科技",
    abilities: [{ kind: "气体", actions: ["采集气体"] }],
    models: ["机器狗", "四轮车"],
  },
  {
    id: "PL-SND",
    name: "声纹采集阵",
    version: "V1.0",
    vendor: "科大讯飞",
    abilities: [{ kind: "声音", actions: ["录制声音"] }],
    models: ["机器狗"],
  },
];

// ── 算法（AI 能力）清单（后台管理 › 算法配置）──────────────────
/**
 * 算法清单：**与巡检要求 / 目标台账里出现的算法名称一一对应**（按名称引用），
 * 覆盖 REQ-* 各条巡检要求默认算法 + 目标台账里手工指定的算法。
 * @description 只登记名称与适配信息，算法本体在平台侧；`adapt` 为空表示待配置检测类型适配。
 */
const algoConfigs: AlgoConfig[] = [
  {
    id: "ALG-01",
    name: "表计读数识别 v1.2",
    deploy: "云端",
    state: "启用",
    adapt: ["读数识别"],
    updatedAt: "2026-01-27 22:42:05",
  },
  {
    id: "ALG-02",
    name: "红外热像温升分析 v1.3",
    deploy: "本体",
    state: "启用",
    adapt: ["红外测温"],
    updatedAt: "2026-01-20 10:15:32",
  },
  {
    id: "ALG-03",
    name: "红外热像区域测温",
    deploy: "本体",
    state: "启用",
    adapt: ["红外测温"],
    updatedAt: "2026-02-03 09:08:41",
  },
  {
    id: "ALG-04",
    name: "气体浓度判读 v1.1",
    deploy: "云端",
    state: "启用",
    adapt: ["气体检测"],
    updatedAt: "2026-01-18 16:20:07",
  },
  {
    id: "ALG-05",
    name: "阀位 / 开关状态判别 v1.4",
    deploy: "云端",
    state: "启用",
    adapt: ["缺陷识别"],
    updatedAt: "2026-01-25 11:36:58",
  },
  {
    id: "ALG-06",
    name: "液滴 / 油渍分割 v2",
    deploy: "云端",
    state: "启用",
    adapt: ["缺陷识别"],
    updatedAt: "2026-02-01 14:02:19",
  },
  {
    id: "ALG-07",
    name: "外观缺陷检测 v1.0",
    deploy: "云端",
    state: "启用",
    adapt: ["缺陷识别"],
    updatedAt: "2025-12-28 09:45:11",
  },
  {
    id: "ALG-08",
    name: "设备异响识别 v0.9",
    deploy: "本体",
    state: "启用",
    adapt: ["声纹识别"],
    updatedAt: "2026-01-12 15:57:23",
  },
  {
    // 未适配检测类型的算法：界面显示「待配置」，可用于验证新算法接入流程
    id: "ALG-09",
    name: "多模态算法",
    deploy: "云端",
    state: "启用",
    adapt: [],
    updatedAt: "2026-01-27 22:42:05",
  },
  // 环境 / 区域类（TGT-01）：气体泵吸、AI 行为、环境拍照各自的算法
  {
    id: "ALG-10",
    name: "区域气体浓度判读 v1.0",
    deploy: "本体",
    state: "启用",
    adapt: ["气体检测"],
    updatedAt: "2026-02-05 10:12:36",
  },
  {
    id: "ALG-11",
    name: "AI 不安全行为识别 v1.0",
    deploy: "云端",
    state: "启用",
    adapt: ["行为识别"],
    updatedAt: "2026-02-06 14:26:03",
  },
  {
    id: "ALG-12",
    name: "可见光图像比对 v1.0",
    deploy: "云端",
    state: "启用",
    adapt: ["缺陷识别"],
    updatedAt: "2026-02-06 14:31:48",
  },
];

// ── 设备主数据（阶段③：清单导入 → 生效）────────────────────────
/**
 * 设备主数据（来源：业主设备清单）
 * @description `items[].target` 与 `Point.object` **同名对齐**，是「点位 ↔ 设备主数据」的关联依据；
 *              具体检测项（`Point.item`）与判定阈值仍由点位规则承载，不在此重复定义。
 *              设备是「巡检什么」的唯一来源，禁止由点位反推设备（避免第二套口径）。
 */
const devices: DeviceAsset[] = [
  {
    id: "DEV-V001",
    name: "V001 原料储罐",
    type: "储罐",
    deviceKind: "实体设备",
    regionCode: "R-A03",
    locationDesc: "一期罐区北侧",
    coord: "120.3, 45.6",
    coordSys: "厂区局部坐标",
    height: 1.2,
    items: [
      {
        id: "II-V001-P",
        target: "出口压力表",
        kind: "可见光",
        unit: "MPa",
        inspect: true,
        cycle: "每日",
        priority: "普通",
      },
      {
        id: "II-V001-V",
        target: "出口阀门",
        kind: "可见光",
        unit: "",
        inspect: true,
        cycle: "每日",
        priority: "普通",
      },
      {
        // 清单要求巡检但尚未落位：用于演示"覆盖率"的缺口（去标注页落位后覆盖率上升）
        id: "II-V001-B",
        target: "罐顶呼吸阀",
        kind: "可见光",
        unit: "",
        inspect: true,
        cycle: "每周",
        priority: "普通",
      },
    ],
  },
  {
    id: "DEV-V002",
    name: "V002 缓冲罐",
    type: "储罐",
    deviceKind: "实体设备",
    regionCode: "R-A03",
    locationDesc: "一期罐区南侧",
    height: 1.4,
    items: [
      {
        id: "II-V002-T",
        target: "罐壁",
        targetKind: "区域",
        kind: "红外",
        unit: "℃",
        inspect: true,
        cycle: "每日",
        priority: "高",
      },
    ],
  },
  {
    id: "DEV-V003",
    name: "V003 原料储罐",
    type: "储罐",
    deviceKind: "实体设备",
    regionCode: "R-A03",
    locationDesc: "一期罐区西侧",
    coord: "84.1, 96.2",
    coordSys: "厂区局部坐标",
    height: 1.2,
    items: [
      {
        id: "II-V003-P",
        target: "出口压力表",
        kind: "可见光",
        unit: "MPa",
        inspect: true,
        cycle: "每日",
        priority: "普通",
      },
      {
        id: "II-V003-V",
        target: "出口阀门",
        kind: "可见光",
        unit: "",
        inspect: true,
        cycle: "每日",
        priority: "普通",
      },
      {
        id: "II-V003-T",
        target: "罐壁",
        targetKind: "区域",
        kind: "红外",
        unit: "℃",
        inspect: true,
        cycle: "每日",
        priority: "高",
      },
    ],
  },
  {
    id: "DEV-V004",
    name: "V004 缓冲罐",
    type: "储罐",
    deviceKind: "实体设备",
    regionCode: "R-A03",
    locationDesc: "一期罐区东侧",
    height: 1.4,
    items: [
      {
        id: "II-V004-T",
        target: "罐壁",
        targetKind: "区域",
        kind: "红外",
        unit: "℃",
        inspect: true,
        cycle: "每日",
        priority: "高",
      },
      {
        id: "II-V004-P",
        target: "出口压力表",
        kind: "可见光",
        unit: "MPa",
        inspect: true,
        cycle: "每日",
        priority: "普通",
      },
      {
        id: "II-V004-V",
        target: "出口阀门",
        kind: "可见光",
        unit: "",
        inspect: true,
        cycle: "每日",
        priority: "普通",
      },
    ],
  },
  {
    id: "DEV-PLA",
    name: "装置区 A 段管廊",
    type: "管廊",
    deviceKind: "虚拟设备",
    regionCode: "R-A03",
    locationDesc: "装置区 A 段",
    items: [
      {
        id: "II-PLA-G",
        target: "可燃气体探头",
        kind: "气体",
        unit: "%LEL",
        inspect: true,
        cycle: "每日",
        priority: "紧急",
      },
    ],
  },
  {
    id: "DEV-PLB",
    name: "装置区 B 段管廊",
    type: "管廊",
    deviceKind: "虚拟设备",
    regionCode: "R-A03",
    locationDesc: "装置区 B 段",
    items: [
      {
        id: "II-PLB-G",
        target: "可燃气体探头",
        kind: "气体",
        unit: "%LEL",
        inspect: true,
        cycle: "每日",
        priority: "紧急",
      },
    ],
  },
  // ── 备用设备：闲置罐区，无关联点位 ──
  {
    id: "DEV-V009",
    name: "V009 备用储罐",
    type: "储罐",
    deviceKind: "实体设备",
    regionCode: "R-A03",
    locationDesc: "一期罐区闲置区",
    height: 1.2,
    items: [
      {
        id: "II-V009-P",
        target: "出口压力表",
        kind: "可见光",
        unit: "MPa",
        inspect: false,
        cycle: "每日",
        priority: "普通",
      },
    ],
    /** 闲置备用罐：无关联点位 */
  },
];
/**
 * 设备「更新时间」与检测项「分类」（Mock）
 * @description 真实项目里更新时间由建档 / 编辑 / 清单导入 / 检测项增删改刷新；
 *              种子按设备给一组演示时间，检测项分类按检测目标名推导（口径见 deviceMaster.defaultCategoryOfTarget）
 */
const deviceUpdatedAt: Record<string, string> = {
  "DEV-V001": "2026-10-14 09:12:00",
  "DEV-V002": "2026-10-13 16:40:00",
  "DEV-V003": "2026-10-15 08:05:00",
  "DEV-V004": "2026-10-11 14:22:00",
  "DEV-PLA": "2026-10-10 10:31:00",
  "DEV-PLB": "2026-10-09 17:08:00",
  "DEV-V009": "2026-09-28 11:47:00",
};
devices.forEach((d) => {
  if (!d.updatedAt) d.updatedAt = deviceUpdatedAt[d.id] || "2026-10-01 09:00:00";
  d.items.forEach((it) => {
    // 分类缺省按检测目标名推导（与新增 / 编辑检测项、老缓存回填同口径）
    if (!it.category) it.category = defaultCategoryOfTarget(it.target);
  });
});
/**
 * 地图自带的**空闲定位ID点**（Mock）：随地图文件导入、尚未绑定巡检点
 * @description 「添加 / 编辑巡检点」的「选择地图中带有定位ID的点」从这里选。
 *              真实项目里这些 ID 由现场建图/踩点带上来；此处 Mock 出一批，
 *              让"一个定位ID点只绑一个巡检点"这条一对一规则可被真实验证。
 *              坐标与 `Point` 同为百分比（相对底图 1000×620）。
 */
const idleMapPoints: { id: string; x: number; y: number; kind: CaptureKind }[] = [
  { id: "O201", x: 16, y: 26, kind: "可见光" },
  { id: "O202", x: 28, y: 20, kind: "可见光" },
  { id: "O203", x: 42, y: 30, kind: "红外" },
  { id: "O204", x: 56, y: 22, kind: "可见光" },
  { id: "O205", x: 68, y: 32, kind: "可见光" },
  { id: "O206", x: 80, y: 24, kind: "红外" },
  { id: "O207", x: 22, y: 68, kind: "可见光" },
  { id: "O208", x: 36, y: 76, kind: "气体" },
  { id: "O209", x: 50, y: 70, kind: "可见光" },
  { id: "O210", x: 64, y: 78, kind: "可见光" },
  { id: "O211", x: 78, y: 72, kind: "气体" },
  { id: "O212", x: 88, y: 64, kind: "可见光" },
];
/**
 * 装置区地图（MAP-B01）上的空闲定位ID点
 * @description 与 `idleMapPoints` 同口径，但归属装置区地图；示例底图右侧的管廊一带
 */
const idleMapPointsB: { id: string; x: number; y: number; kind: CaptureKind }[] =
  [
    { id: "O301", x: 92, y: 22, kind: "可见光" },
    { id: "O302", x: 78, y: 12, kind: "气体" },
    { id: "O303", x: 94, y: 50, kind: "可见光" },
    { id: "O304", x: 74, y: 50, kind: "红外" },
  ];

/**
 * 由「设备主数据 + 物理点位」派生逻辑点（阶段④）
 * @description 逻辑点只表达"要巡检什么"、不含坐标，且**不暴露给用户**（无页面、无菜单）；
 *              id 与点位顺序对齐（P001 → LP001），落位后回指物理点；
 *              若一个物理点覆盖多个对象，同一 `physicalPointId` 会有多条逻辑点。
 * @param pts 物理点位（seed 传入克隆后的点位，便于回写 `logicalIds`）
 * @returns 逻辑点列表；设备未命中主数据时回落到按编码推导的占位 deviceId
 */
const deriveLogicalPoints = (pts: Point[]): LogicalPoint[] =>
  pts.map((p, i) => {
    const d = devices.find((x) => x.name === p.device);
    const item = d?.items.find((it) => it.target === p.object);
    return {
      id: "LP" + String(i + 1).padStart(3, "0"),
      deviceId: d?.id || "DEV-" + p.device.split(" ")[0],
      itemIds: item ? [item.id] : [],
      region: "一期罐区",
      locateState: "已落位",
      physicalPointId: p.id,
      locateOrigin: "人工新增",
    };
  });
// ── 工厂树与巡检目标台账（客户定稿模型）──────────────────────────────
/**
 * 巡检要求模板库
 * @description 「仪表只是资产，不能直接巡检」——这 7 条要求是"看什么、怎么判"的标准表达；
 *              巡检目标台账 = 仪表 + 其中一条要求 + 算法 + 阈值 + 判断标准
 */
const requirements: Requirement[] = [
  {
    id: "REQ-LEAK",
    code: "ALG-01",
    deploy: "云端",
    name: "看滴漏",
    kind: "可见异常",
    description: "识别泵体 / 法兰 / 阀门根部的渗漏痕迹（液滴、油渍、结晶）",
    targetKinds: ["仪表"],
    capture: "可见光",
    detectKind: "外观",
    algorithm: "液滴 / 油渍分割 v2",
    judge: "有无目标",
    needPhoto: true,
    needReview: true,
    cycle: "每日",
  },
  {
    id: "REQ-HOT",
    code: "ALG-02",
    deploy: "本体",
    name: "看高温",
    kind: "读数识别",
    description: "以热像定位设备表面 / 区域最高温，超过上限判异常",
    targetKinds: ["仪表", "区域"],
    capture: "红外",
    detectKind: "温度",
    algorithm: "红外热像温升分析 v1.3",
    judge: "数值范围",
    unit: "℃",
    min: 0,
    max: 60,
    needPhoto: true,
    cycle: "每日",
  },
  {
    id: "REQ-READ",
    code: "ALG-03",
    deploy: "云端",
    name: "看仪表读数",
    kind: "读数识别",
    description: "识别机械 / 数显表读数并与量程比对",
    targetKinds: ["仪表"],
    capture: "可见光",
    algorithm: "表计读数识别 v1.2",
    judge: "数值范围",
    needPhoto: true,
    needReview: true,
    cycle: "每日",
  },
  {
    id: "REQ-APPEAR",
    code: "ALG-04",
    deploy: "云端",
    name: "看外观破损",
    kind: "可见异常",
    description: "锈蚀、变形、破损、被遮挡、指示缺失",
    targetKinds: ["仪表"],
    capture: "可见光",
    detectKind: "外观",
    algorithm: "外观缺陷检测 v1.0",
    judge: "有无目标",
    needPhoto: true,
    cycle: "每周",
  },
  {
    id: "REQ-GAS",
    code: "ALG-05",
    deploy: "云端",
    name: "看气体浓度",
    kind: "读数识别",
    description: "读取可燃气体探头数值，超过上限判异常",
    targetKinds: ["仪表"],
    capture: "气体",
    detectKind: "气体浓度",
    algorithm: "气体浓度判读 v1.1",
    judge: "数值范围",
    unit: "%LEL",
    min: 0,
    max: 20,
    cycle: "每日",
  },
  {
    // TGT-01 环境 / 区域类：沿锚点泵吸采样，量与探头不同（ppm），单独一套要求与模板
    id: "REQ-GAS-AREA",
    code: "ALG-06",
    deploy: "本体",
    name: "看区域气体浓度",
    kind: "读数识别",
    description: "沿参照物锚点泵吸采样，读取区域可燃气体浓度，超过上限判异常",
    targetKinds: ["区域"],
    capture: "气体",
    detectKind: "气体浓度",
    algorithm: "区域气体浓度判读 v1.0",
    judge: "数值范围",
    unit: "ppm",
    min: 0,
    max: 50,
    cycle: "每日",
  },
  {
    id: "REQ-STATE",
    code: "ALG-07",
    deploy: "云端",
    name: "看阀位状态",
    kind: "状态判别",
    description: "判别阀门开 / 关并期望状态比对",
    targetKinds: ["仪表"],
    capture: "可见光",
    detectKind: "阀门状态",
    algorithm: "阀位 / 开关状态判别 v1.4",
    judge: "期望状态",
    expected: "开启",
    needPhoto: true,
    cycle: "每日",
  },
  {
    id: "REQ-SOUND",
    code: "ALG-08",
    deploy: "本体",
    name: "听异响（声纹）",
    kind: "声音判别",
    description: "录音判别异常噪声（摩擦、撞击、啸叫），仪表异响与区域声纹共用本要求",
    targetKinds: ["仪表", "区域"],
    capture: "声音",
    detectKind: "声纹",
    algorithm: "设备异响识别 v0.9",
    judge: "等级评分",
    needReview: true,
    cycle: "每班",
  },
  {
    id: "REQ-AI",
    code: "ALG-09",
    deploy: "本体",
    name: "看 AI 不安全行为",
    kind: "可见异常",
    description: "识别区域内未戴安全帽、越界、违规作业等不安全行为",
    targetKinds: ["区域"],
    capture: "可见光",
    detectKind: "不安全行为",
    algorithm: "AI 不安全行为识别 v1.0",
    judge: "有无目标",
    needPhoto: true,
    cycle: "每班",
  },
  {
    id: "REQ-ENV-VIS",
    code: "ALG-10",
    deploy: "云端",
    name: "环境拍照比对",
    kind: "可见异常",
    description: "按锚点固定视角拍照并与基准图比对（积水、杂物、破损、指示缺失）",
    targetKinds: ["环境"],
    capture: "可见光",
    detectKind: "外观",
    algorithm: "可见光图像比对 v1.0",
    judge: "期望状态",
    expected: "无异常",
    needPhoto: true,
    cycle: "每日",
  },
];
/**
 * 由设备清单的「检测目标」派生仪表（工厂树第三层）
 * @description 每个检测目标就是一台被巡检的仪表；采集方式与单位随清单带入
 * @param devs 设备主数据
 * @returns 仪表列表（id 沿用设备巡检项 id，保证可追溯到清单）
 */
const deriveInstruments = (devs: DeviceAsset[]): Instrument[] =>
  devs.flatMap((d) =>
    d.items.map((it) => ({
      id: it.id,
      name: it.target,
      deviceId: d.id,
      capture: it.kind,
      unit: it.unit || undefined,
      locationDesc: d.locationDesc,
      state: "在用" as const,
    })),
  );
/**
 * 仪表 → 默认巡检要求
 * @description 采集方式决定"看什么"：气体→看浓度、红外→看高温、有量纲→读表、
 *              无量纲的阀类→看阀位、其余→看外观
 * @param ins 仪表
 * @returns 巡检要求 id
 */
const requirementOfInstrument = (ins: Instrument) => {
  if (ins.capture === "气体") return "REQ-GAS";
  if (ins.capture === "声音") return "REQ-SOUND";
  if (ins.capture === "红外") return "REQ-HOT";
  if (ins.unit) return "REQ-READ";
  return /阀|位/.test(ins.name) ? "REQ-STATE" : "REQ-APPEAR";
};
/**
 * 由仪表派生巡检目标台账
 * @description 种子保证"清单里的每台仪表都有一条可直接执行的目标"：
 *              要求取模板默认值，阈值与点位判定规则**同源**（都按单位给量程），避免两处量程漂移
 * @param ins 仪表列表
 * @param devs 设备主数据（取巡检项的频率 / 优先级 / 是否巡检）
 * @returns 巡检目标台账列表
 */
const deriveBusinessTargets = (
  ins: Instrument[],
  devs: DeviceAsset[],
): BusinessTarget[] => {
  return ins.map((x) => {
    const item = devs
      .find((d) => d.id === x.deviceId)
      ?.items.find((it) => it.id === x.id);
    const req = requirements.find(
      (r) => r.id === defaultRequirementOfInstrument(x),
    )!;
    const range = req.judge === "数值范围" ? defaultRangeOfUnit(x.unit) : undefined;
    return {
      id: "BT-" + x.id,
      // 分类随设备清单的检测项（罐壁 / 管廊等空间目标→区域类），缺省按仪表类
      targetKind: item?.targetKind || "仪表",
      instrumentId: x.id,
      requirementId: req.id,
      algorithm: req.algorithm,
      judge: req.judge,
      unit: range ? x.unit : undefined,
      min: range?.min,
      max: range?.max,
      expected: req.judge === "期望状态" ? req.expected : undefined,
      criteria: req.description,
      needPhoto: req.needPhoto ?? x.capture === "可见光",
      needVideo: false,
      needReview: req.needReview ?? item?.priority !== "普通",
      cycle: item?.cycle || req.cycle || "每日",
      priority: (item?.priority as BusinessTarget["priority"]) || "普通",
      inspect: item?.inspect ?? true,
      // 业务目标与业务要求（说明性口径，列表与任务详情据此解释"这条目标是干什么的"）
      goal: `确认${x.name}${req.judge === "期望状态" ? "状态符合要求" : "读数在正常范围内"}`,
      require: req.description,
      // 告警设置：**平台唯一的告警配置入口**（阈值即上面的 min/max/expected，告警项全部手填）
      alarm: {
        level: item?.priority === "紧急" ? "一级" : "二级",
        trigger: "单次异常即告警",
        notify: ["设备岗"],
      },
      createdAt: "2026-09-20 09:10",
    };
  });
};
/** 租户清单与默认租户：定义在 tenants.ts（平台级独立存储），此处再导出保持既有引用路径 */
export { DEFAULT_TENANT, TENANTS };
/**
 * 给非默认租户的数据加租户前缀（仅改 name/label，不动 id，避免引用断裂）
 * @description 演示级隔离：切租户后左侧树、设备、机器人、台账名称整体变化，一眼可辨
 */
function retagForTenant(s: State, t: Tenant): State {
  const pre = `${t.code}·`;
  const tag = (o: any): any => {
    if (o) {
      if (typeof o.name === "string") o.name = pre + o.name;
      if (typeof o.label === "string") o.label = pre + o.label;
    }
    return o;
  };
  return {
    ...s,
    areas: s.areas.map(tag),
    devices: s.devices.map(tag),
    instruments: s.instruments.map(tag),
    requirements: s.requirements.map(tag),
    points: s.points.map(tag),
    maps: s.maps.map(tag),
    robots: s.robots.map(tag),
    businessTargets: (s.businessTargets || []).map(tag),
  };
}
export function seed(
  tenantId: string = DEFAULT_TENANT,
  /** 平台租户清单：默认取独立存储的清单，新增的租户也能正确加名称前缀 */
  tenants: Tenant[] = loadTenants(),
): State {
  // 逻辑点由「设备主数据 + 点位」派生，避免两处手工维护导致口径漂移；
  // 并把派生结果回写到点位 logicalIds（一物理点可承载多条逻辑点）
  const pts = structuredClone(points);
  /**
   * DATA-01：为每个巡检点补「统一坐标系」权威定位 world（全厂 XYZ，米）。
   * 演示环境按底图 1:1（100m×62m）投影，z 取 0；真实项目由地图标定 / 定位系统换算。
   * 权威定位以 world 为准，`x/y`（百分比）仅作底图投影展示，地图删改不影响本坐标。
   */
  pts.forEach((p) => {
    p.world = { x: p.x, y: p.y, z: 0 };
  });
  const lps = deriveLogicalPoints(pts);
  lps.forEach((lp) => {
    const p = pts.find((x) => x.id === lp.physicalPointId);
    if (p) p.logicalIds = [...new Set([...(p.logicalIds || []), lp.id])];
  });
  /**
   * 设备清单
   * @description 补厂区列供指标按厂区裁剪（scopedState）。多数设备属「一期罐区」，
   *              管廊类（装置区 A / B 段）属「装置区」——口径与 `areaNameOf`
   *              （优先 region，其次按安装位置前缀归属）保持一致，
   *              否则装置区设备的检测目标会被算进罐区的覆盖率分母
   */
  const devs = structuredClone(devices).map((d) => ({
    region: d.locationDesc.startsWith("装置区") ? "装置区" : "一期罐区",
    ...d,
  }));
  /**
   * 工厂树与巡检目标台账：仪表 ← 设备清单的检测目标；业务目标 ← 仪表 + 巡检要求。
   */
  const ins = deriveInstruments(devs);
  const biz = deriveBusinessTargets(ins, devs);
  /**
   * TGT-01：空间 / 区域（非装置）类目标示例 —— **不关联设备台账**，
   * 以参照物锚点圈定范围（气体 / 区域红外），供「空间与区域目标」页演示。
   */
  biz.push(
    {
      id: "BT-ENV-GAS",
      targetKind: "区域",
      anchor: "3# 罐区北侧立柱",
      requirementId: "REQ-GAS-AREA",
      goal: "确认 3# 罐区可燃气体浓度在安全范围内",
      require: "沿罐区北侧立柱 3 米高度泵吸采样，读数超上限即异常",
      algorithm: "区域气体浓度判读 v1.0",
      judge: "数值范围",
      unit: "ppm",
      min: 0,
      max: 50,
      criteria: "取泵吸稳定后 10 秒均值，超过 50 ppm 判异常",
      // 区域类也走同一套主数据链路：巡检要求（区域气体）→ 算法 → 告警项（ppm 口径）
      alarm: {
        level: "一级",
        trigger: "单次异常即告警",
        notify: ["设备岗", "值班长"],
      },
      needPhoto: false,
      needVideo: false,
      needReview: false,
      cycle: "每日",
      priority: "高",
      inspect: true,
    },
    {
      id: "BT-ENV-IR",
      targetKind: "区域",
      anchor: "管廊 A 段起点",
      requirementId: "REQ-HOT",
      goal: "确认管廊 A 段区域温度无异常热点",
      require: "对管廊 A 段整体热成像扫描，定位最高温点",
      algorithm: "红外热像区域测温",
      judge: "数值范围",
      unit: "℃",
      min: 0,
      max: 120,
      criteria: "以区域最高温为准，超过 120 ℃ 判异常",
      // 区域红外：℃ 0–120 口径，与探头测温的量程区分开
      alarm: {
        level: "二级",
        trigger: "单次异常即告警",
        notify: ["设备岗"],
      },
      needPhoto: false,
      needVideo: false,
      needReview: false,
      cycle: "每日",
      priority: "普通",
      inspect: true,
    },
  );
  /**
   * 告警设置补齐：一个台账只有一个告警设置（就是台账的 `alarm`，与「告警管理 › 告警设置」
   * 同一份数据），至少一条告警项 = 台账的判定口径；两条区域类示例台账再挂一条三级预警项，
   * 演示「一个台账 · 多个告警项」
   */
  const alarmHost: AlarmSettingHost = {
    alarmClasses: ALARM_CLASSES,
    instruments: ins,
    requirements,
  };
  const bizFinal = biz.map((t) => {
    const ready = withAlarmSetting(alarmHost, t);
    if (t.id !== "BT-ENV-GAS" && t.id !== "BT-ENV-IR") return ready;
    const alarm = ready.alarm!;
    const main = alarm.items![0];
    const warn: AlarmItem = {
      id: `AI-${t.id}-2`,
      category: main.category,
      envKind: main.envKind,
      level: "三级",
      judge: main.judge,
      from: main.from,
      // 预警项先于主告警项触发（阈值的 80%），用于演示同一台账的多等级告警项
      to: Math.round((main.to ?? 0) * 0.8 * 100) / 100,
      unit: main.unit,
      abnormalName: `${main.abnormalName} 预警`,
      alarmSeconds: 0,
    };
    return { ...ready, alarm: { ...alarm, items: [...alarm.items!, warn] } };
  });
  /**
   * 巡检项：为已有点位派生「巡检项名称 + 业务目标 + 机器操作内容」，
   * 使「巡检点管理」一打开就有已配置的巡检点可维护（真实项目里由用户逐项添加）
   */
  pts.forEach((p) => {
    const dev = devs.find((d) => d.name === p.device);
    const item = dev?.items.find((it) => it.target === p.object);
    const bt = biz.find((b) => b.instrumentId === item?.id);
    const insRec = ins.find((x) => x.id === item?.id);
    if (!bt || !insRec) return;
    p.inspectItems = [
      {
        id: "IP-" + p.id,
        name: p.item,
        targetId: bt.id,
        actions: [captureAction[insRec.capture]],
        pose: p.actionPlan || {
          ptz: { pan: 12, tilt: -6, zoom: 3 },
          viewDir: `正对${p.object}`,
          light: 40,
          dwellSec: 5,
        },
      },
    ];
  });
  const _s: State = {
    tenantId,
    tenants,
    schema: 13,
    points: pts,
    maps: [
      {
        id: "MAP-A03",
        name: "一期罐区巡检地图",
        region: "一期罐区",
        version: 3,
        syncState: "已同步",
        status: "启用",
        source: "机器人首次走行",
        batch: "B001",
        cloud: "B001-multimodal.pcd",
        video: "B001-raw-video.mp4",
        file: "MAP-A03-m3.map",
        checksum: "sha256:8e93a17c…",
        // 示例底图：打开地图即可在图上标注点位（可随时替换/清除）
        image: SAMPLE_MAP_IMAGE,
        // 地图是**纯点云**：不含任何定位ID、巡检点与业务信息
        // 版本历史：最新在前；只记空间版本 V
        history: [
          { version: 3, note: "定版发布 · 原始资料（点云 + 视频）完整", at: "2026-09-28 14:32" },
          { version: 2, note: "补充装置区 A / B 段管廊点云", at: "2026-09-12 09:20" },
          { version: 1, note: "机器人首次走行建图（纯点云底图）", at: "2026-08-30 16:05" },
        ],
        // 最近更新时间：用于地图列表「更新时间」列
        updatedAt: "2026-09-28 14:32",
        frames: {
          resolution: 0.05,
          origin: { x: 0, y: 0, yaw: 0 },
          rotateDeg: 0,
          calibState: "已标定",
        },
        layers: {
          底图: true,
          障碍物层: true,
          点云层: true,
          业务区域层: true,
          巡检点层: true,
          路线层: true,
        },
        deviceListVersion: 1,
        /**
         * 父线：该区域地图上的完整路网（标定工作台画出的线 / 弧）
         * @description 巡检路线（子线）从父线的定位点上挑点组成，机器狗沿父线行驶、按子线顺序作业
         */
        roadnet: {
          paths: [
            {
              id: "RL-01",
              name: "A_1",
              kind: "弧" as const,
              // 西侧主线：沿储罐区外圈绕行，串联 V001 / V003 / V002 等点位所在的定位点
              pointIds: [
                "O105",
                "O201",
                "O202",
                "O101",
                "O104",
                "O204",
                "O205",
                "O103",
                "O106",
              ],
            },
            {
              id: "RL-02",
              name: "A_2",
              kind: "弧" as const,
              // 南侧支线：从罐区南缘绕到东侧，与主线在 O106 汇合（形成分叉）
              pointIds: ["O207", "O208", "O209", "O210", "O102", "O106"],
            },
            {
              id: "RL-03",
              name: "L_1",
              kind: "直线" as const,
              // 北向支线：**自主线东端 O106 接出**，避免出现孤立块（孤立块会让子线只能直连）
              pointIds: ["O206", "O106"],
            },
            {
              id: "RA-01",
              name: "A_3",
              kind: "弧" as const,
              // 东南支线：同样接到 O106（管廊一带）
              pointIds: ["O212", "O211", "O106"],
            },
          ],
        },
      },
      {
        id: "MAP-B01",
        name: "装置区巡检地图",
        region: "装置区",
        version: 1,
        syncState: "已同步",
        status: "启用",
        source: "机器人首次走行",
        batch: "B002",
        cloud: "B002-multimodal.pcd",
        video: "B002-raw-video.mp4",
        file: "MAP-B01-m1.map",
        checksum: "sha256:4b71de09…",
        image: SAMPLE_MAP_IMAGE,
        history: [
          {
            version: 1,
            note: "机器人首次走行建图（纯点云底图）· 定版发布",
            at: "2026-09-05 11:20",
          },
        ],
        updatedAt: "2026-09-05 11:20",
        frames: {
          resolution: 0.05,
          origin: { x: 0, y: 0, yaw: 0 },
          rotateDeg: 0,
          calibState: "已标定",
        },
        layers: {
          底图: true,
          障碍物层: true,
          点云层: true,
          业务区域层: true,
          巡检点层: true,
          路线层: true,
        },
        deviceListVersion: 1,
        /**
         * 父线：装置区管廊沿线的连续路网
         * @description 沿装置区道路形成一条连续折线（左上 → 右上 → 右下 → 中），无交叉、无断点
         */
        roadnet: {
          paths: [
            {
              id: "RL-B1",
              name: "A_1",
              kind: "直线" as const,
              pointIds: ["O302", "O107", "O301", "O110", "O303", "O304"],
            },
          ],
        },
      },
    ],
    /**
     * 巡检点标定数据（**独立模块，与地图分开放**）
     * @description 地图是纯点云、不含任何点位；采集时产出的「巡检点标定文件」解析后全部落在这里，
     *              按 mapId 关联地图、不设独立版本（版本只跟地图空间版本 V{n} 走）。
     */
    mapCalibrations: [
      {
        id: "CAL-MAP-A03",
        mapId: "MAP-A03",
        updatedAt: "2026-09-20 10:30",
        targets: [
          // 已被现有巡检点绑定（一对一占用）：只收本图（一期罐区）的点位，装置区的点见 CAL-MAP-B01
          ...points
            .filter((p) => p.mapId === "MAP-A03")
            .map((p) => ({
              id: p.targetId,
              externalId: p.targetId,
              source: "地图导入" as const,
              kind: p.kind as CaptureKind,
              x: p.x,
              y: p.y,
              world: { x: p.x, y: p.y, z: 0 },
              state: "已确认" as const,
              pointId: p.id,
            })),
          // 空闲定位ID点：还没有巡检点绑定，可在「添加巡检点」里直接选
          ...idleMapPoints.map((t) => ({
            id: t.id,
            externalId: t.id,
            source: "地图导入" as const,
            kind: t.kind,
            x: t.x,
            y: t.y,
            world: { x: t.x, y: t.y, z: 0 },
            state: "待确认" as const,
          })),
        ],
      },
      {
        id: "CAL-MAP-B01",
        mapId: "MAP-B01",
        updatedAt: "2026-09-05 11:25",
        targets: [
          // 装置区的巡检点（装置区 A / B 段管廊气体浓度）
          ...points
            .filter((p) => p.mapId === "MAP-B01")
            .map((p) => ({
              id: p.targetId,
              externalId: p.targetId,
              source: "地图导入" as const,
              kind: p.kind as CaptureKind,
              x: p.x,
              y: p.y,
              world: { x: p.x, y: p.y, z: 0 },
              state: "已确认" as const,
              pointId: p.id,
            })),
          // 装置区的空闲定位ID点：可继续在「添加巡检点」里绑定
          ...idleMapPointsB.map((t) => ({
            id: t.id,
            externalId: t.id,
            source: "地图导入" as const,
            kind: t.kind,
            x: t.x,
            y: t.y,
            world: { x: t.x, y: t.y, z: 0 },
            state: "待确认" as const,
          })),
        ],
      },
    ],
    robots: [
      {
        id: "R01",
        name: "罐区巡检一号",
        region: "一期罐区",
        battery: 86,
        /** J′ 口径收敛：只表达"采集方式"；业务类型（仪表/阀门）归设备主数据，不再参与调度校验 */
        capabilities: ["可见光", "红外", "气体"],
        state: "执行中",
        mapId: "MAP-A03",
        mapVersion: 3,
        current: "T009",
        x: 27,
        y: 55,
        deviceType: "机器狗",
        constraints: { minBattery: 40, needChargingPlan: true },
        health: 92,
        firmware: "DOG-2.4.1",
        sn: "SN-DOG-2411-0007",
        enabled: true,
        runSince: "2026-08-18T05:37:00",
        inspectCount: 74,
        inspectSeconds: 648360,
        tripMileage: 0,
        totalMileage: 84.4,
        lastChargeAt: "2026-10-27 16:15:20",
        updatedAt: "2026-09-18 09:12:00",
      },
      {
        id: "R02",
        name: "罐区巡检二号",
        region: "一期罐区",
        battery: 72,
        /** J′ 口径收敛：只表达"采集方式" */
        capabilities: ["可见光", "红外"],
        state: "空闲",
        mapId: "MAP-A03",
        mapVersion: 2,
        x: 18,
        y: 72,
        deviceType: "四轮车",
        constraints: { minBattery: 25, needChargingPlan: true, maxSpeed: 1.5 },
        health: 88,
        firmware: "AGV-1.9.0",
        sn: "SN-AGV-2508-0132",
        enabled: true,
        runSince: "2026-09-12T08:00:00",
        inspectCount: 12,
        inspectSeconds: 100800,
        tripMileage: 1.2,
        totalMileage: 36.8,
        lastChargeAt: "2026-10-26 20:10:00",
        updatedAt: "2026-10-09 14:30:00",
      },
      {
        id: "R03",
        name: "装置巡检三号",
        region: "装置区",
        battery: 18,
        capabilities: ["气体", "可见光", "红外"],
        state: "充电",
        mapId: "MAP-B01",
        mapVersion: 1,
        x: 87,
        y: 73,
        deviceType: "挂轨",
        constraints: {
          minBattery: 15,
          needChargingPlan: false,
          railSectionId: "RS01",
        },
        health: 95,
        firmware: "RAIL-3.0.2",
        sn: "SN-RAIL-2306-0045",
        enabled: true,
        runSince: "2026-07-30T09:15:00",
        inspectCount: 31,
        inspectSeconds: 266400,
        tripMileage: 0.6,
        totalMileage: 52.3,
        lastChargeAt: "2026-10-27 06:40:00",
        updatedAt: "2026-10-21 08:45:00",
      },
    ],
    templates: [
      {
        id: "TMP01",
        name: "一期罐区常规巡检路线",
        points: ["P001", "P002", "P003"],
        end: "返航",
        state: "启用",
        version: 1,
        updatedAt: "2026/09/22 10:00:00",
      },
      {
        id: "TMP02",
        name: "罐体温度专项路线",
        points: ["P004", "P006"],
        end: "返航",
        state: "启用",
        version: 1,
        updatedAt: "2026/10/15 16:20:00",
      },
    ],
    plans: [
      {
        id: "PL01",
        robotId: "R01",
        name: "罐区每日巡检",
        kind: "周期任务",
        templateId: "TMP01",
        cycle: "每天",
        start: "2026-09-22",
        end: "2026-12-31",
        time: "10:00",
        advance: 15,
        timeout: 60,
        wait: 30,
        state: "启用",
        version: 1,
      },
      {
        id: "PL02",
        robotId: "R01",
        name: "罐区专项巡检（定时一次）",
        kind: "定时任务",
        templateId: "TMP01",
        cycle: "每天",
        start: "2026-10-16",
        end: "2026-10-16",
        time: "09:30",
        advance: 15,
        timeout: 60,
        wait: 30,
        state: "启用",
        version: 1,
      },
    ],
    tasks: [
      task("T009", "罐区早班自主巡检", "执行中", "R01"),
      { ...task("T010", "罐区午前例行巡检", "待调度"), deadline: dueIn(12) },
      {
        ...task("T011", "V001 异常现场核验", "待调度"),
        source: "人工临时",
        deadline: dueIn(6),
      },
      {
        ...task("T008", "罐区早班压力检测", "完成", "R01"),
        created: dueIn(-118),
        startedAt: dueIn(-110),
        finishedAt: dueIn(-88),
        items: [{ ...points[0], mapVersion: 3 }],
        done: ["P001"],
        index: 1,
      },
      task("T012", "罐区交班补充巡检", "已分配", "R01"),
      task("T013", "罐区阀门复核", "已分配", "R01"),
      task("T014", "二号机器人版本更新后巡检", "已分配", "R02"),
      // ── 演示用：已结束任务，供「执行回溯」列表展示 ──
      {
        ...task("T020", "罐区早班综合巡检", "完成", "R01"),
        startedAt: dueIn(-180),
        finishedAt: dueIn(-150),
        items: points.slice(0, 3).map((p) => ({ ...p, mapVersion: 3 })),
        done: points.slice(0, 3).map((p) => p.id),
        index: 3,
      },
      {
        ...task("T021", "V001 例行压力检测", "部分完成", "R01"),
        startedAt: dueIn(-160),
        finishedAt: dueIn(-140),
        items: points.slice(0, 3).map((p) => ({ ...p, mapVersion: 3 })),
        done: ["P001"],
        skipped: ["P002"],
        index: 2,
        failure: "P002 出口阀门不可达",
      },
      {
        ...task("T022", "装置区红外测温巡检", "失败", "R02"),
        startedAt: dueIn(-200),
        finishedAt: dueIn(-170),
        items: [{ ...points[2], mapVersion: 3 }],
        skipped: ["P003"],
        index: 1,
        failure: "红外传感器异常",
      },
      {
        ...task("T023", "罐区阀门紧急复核", "取消", "R01"),
        startedAt: dueIn(-90),
        finishedAt: dueIn(-80),
        items: [{ ...points[1], mapVersion: 3 }],
        index: 1,
      },
      {
        ...task("T024", "罐区夜间补充巡检", "超期", "R02"),
        deadline: dueIn(-30),
        items: points.slice(0, 3).map((p) => ({ ...p, mapVersion: 3 })),
        index: 0,
      },
      // ── 演示用：已完成任务（每个任务均有对应巡检结果，供「巡检结果」按任务维度分组展示）──
      {
        ...task("T030", "罐区清晨综合巡检", "完成", "R01"),
        created: dueIn(-1080),
        startedAt: dueIn(-1050),
        finishedAt: dueIn(-1020),
        done: ["P001", "P002", "P003"],
        index: 3,
      },
      {
        ...task("T031", "罐区早班综合巡检", "完成", "R01"),
        created: dueIn(-960),
        startedAt: dueIn(-930),
        finishedAt: dueIn(-900),
        done: ["P001", "P002", "P003"],
        index: 3,
      },
      {
        ...task("T032", "罐区夜班综合巡检", "完成", "R02"),
        created: dueIn(-840),
        startedAt: dueIn(-810),
        finishedAt: dueIn(-780),
        done: ["P001", "P002", "P003"],
        index: 3,
      },
      {
        ...task("T033", "V001 压力专项检测", "完成", "R01"),
        created: dueIn(-705),
        startedAt: dueIn(-675),
        finishedAt: dueIn(-650),
        items: [{ ...points[0], mapVersion: 3 }],
        done: ["P001"],
        index: 1,
      },
      {
        ...task("T034", "罐区中班综合巡检", "完成", "R01"),
        created: dueIn(-600),
        startedAt: dueIn(-570),
        finishedAt: dueIn(-540),
        done: ["P001", "P002", "P003"],
        index: 3,
      },
      {
        ...task("T035", "V001 阀门状态巡检", "完成", "R02"),
        created: dueIn(-490),
        startedAt: dueIn(-460),
        finishedAt: dueIn(-430),
        items: [{ ...points[1], mapVersion: 3 }],
        done: ["P002"],
        index: 1,
      },
      {
        ...task("T036", "罐区午间综合巡检", "完成", "R01"),
        created: dueIn(-390),
        startedAt: dueIn(-360),
        finishedAt: dueIn(-330),
        done: ["P001", "P002", "P003"],
        index: 3,
      },
      {
        ...task("T037", "V001 压力复测", "完成", "R01"),
        created: dueIn(-300),
        startedAt: dueIn(-270),
        finishedAt: dueIn(-240),
        items: [{ ...points[0], mapVersion: 3 }],
        done: ["P001"],
        index: 1,
      },
      {
        ...task("T038", "V002 罐壁温度巡检", "完成", "R02"),
        created: dueIn(-210),
        startedAt: dueIn(-180),
        finishedAt: dueIn(-150),
        items: [{ ...points[2], mapVersion: 3 }],
        done: ["P003"],
        index: 1,
      },
      {
        ...task("T039", "罐区交班综合巡检", "完成", "R01"),
        created: dueIn(-130),
        startedAt: dueIn(-100),
        finishedAt: dueIn(-70),
        done: ["P001", "P002", "P003"],
        index: 3,
      },
      // ── 演示用：扩充点位对应的已完成任务（供告警 / 结果 / 排行取数）──
      {
        ...task("T040", "罐区夜间综合巡检", "完成", "R01"),
        items: points.filter(p => !["P007", "P010"].includes(p.id)).map(p => ({...p, mapVersion:3})),
        created: dueIn(-140),
        startedAt: dueIn(-120),
        finishedAt: dueIn(-70),
        done: [
          "P001",
          "P002",
          "P003",
          "P004",
          "P005",
          "P006",
          "P008",
          "P009",
          "P011",
        ],
        index: 9,
      },
      {
        ...task("T041", "V004 罐壁温度复测", "完成", "R02"),
        created: dueIn(-190),
        startedAt: dueIn(-170),
        finishedAt: dueIn(-148),
        items: [{ ...points[5], mapVersion: 3 }],
        done: ["P006"],
        index: 1,
      },
      {
        ...task("T042", "装置区管廊气体巡检", "完成", "R03"),
        created: dueIn(-60),
        startedAt: dueIn(-45),
        finishedAt: dueIn(-24),
        // 装置区的任务挂装置区地图（与 R03 的 mapVersion 1 对齐，否则"同一张地图"校验不通过）
        mapId: "MAP-B01",
        mapVersion: 1,
        items: [
          { ...points[6], mapVersion: 1 },
          { ...points[9], mapVersion: 1 },
        ],
        done: ["P007", "P010"],
        index: 2,
      },
      {
        ...task("T043", "罐区夜班综合巡检（历史）", "完成", "R01"),
        created: dueIn(-11100),
        startedAt: dueIn(-11080),
        finishedAt: dueIn(-11040),
        items: [{ ...points[8], mapVersion: 3 }],
        done: ["P009"],
        index: 1,
      },
      {
        ...task("T044", "V001 压力专项检测（历史）", "完成", "R01"),
        created: dueIn(-15100),
        startedAt: dueIn(-15080),
        finishedAt: dueIn(-15040),
        items: [{ ...points[0], mapVersion: 3 }],
        done: ["P001"],
        index: 1,
      },
    ],
    results: [
      // T008 罐区早班压力检测：压力超上限（手写演示结果，与 result() 同口径，带规则快照）
      result("RES001", "T008", points[0], "0.92", "0.92", true, "已确认", -95, 0.93),
      // ── 演示用：已完成 / 部分完成任务对应的巡检结果（按任务维度分组展示）──
      // T020 罐区早班综合巡检（完成）
      result("RES002", "T020", points[0], "0.62", "0.62", false, "已确认", -172),
      result("RES003", "T020", points[1], "开启", "开启", false, "已确认", -165),
      result("RES004", "T020", points[2], "38.5", "38.5", false, "已确认", -158),
      // T021 V001 例行压力检测（部分完成，仅 P001 形成有效结果）
      result("RES005", "T021", points[0], "0.55", "0.55", false, "已确认", -155),
      // T030 罐区清晨综合巡检（完成）
      result("RES006", "T030", points[0], "0.71", "0.71", false, "已确认", -1042),
      result("RES007", "T030", points[1], "开启", "开启", false, "已确认", -1035),
      result("RES008", "T030", points[2], "42.3", "42.3", false, "已确认", -1028),
      // T031 罐区早班综合巡检（完成，压力超上限）
      result("RES009", "T031", points[0], "0.88", "0.88", true, "已确认", -922),
      result("RES010", "T031", points[1], "开启", "开启", false, "已确认", -915),
      result("RES011", "T031", points[2], "45.1", "45.1", false, "已确认", -908),
      // T032 罐区夜班综合巡检（完成，阀门未按期望开启）
      result("RES012", "T032", points[0], "0.66", "0.66", false, "已识别", -802),
      result("RES013", "T032", points[1], "关闭", "关闭", true, "已确认", -795),
      result("RES014", "T032", points[2], "58.4", "58.4", false, "已确认", -788),
      // T033 V001 压力专项检测（完成，压力超上限已确认）
      result("RES015", "T033", points[0], "0.90", "0.90", true, "已确认", -660),
      // T034 罐区中班综合巡检（完成，罐壁温度超限）
      result("RES016", "T034", points[0], "0.58", "0.58", false, "已确认", -562),
      result("RES017", "T034", points[1], "开启", "开启", false, "已确认", -555),
      result("RES018", "T034", points[2], "61.2", "61.2", true, "已确认", -548),
      // T035 V001 阀门状态巡检（完成）
      result("RES019", "T035", points[1], "开启", "开启", false, "已确认", -445),
      // T036 罐区午间综合巡检（完成）
      result("RES020", "T036", points[0], "0.49", "0.49", false, "已确认", -352),
      result("RES021", "T036", points[1], "开启", "开启", false, "已确认", -345),
      result("RES022", "T036", points[2], "36.8", "36.8", false, "已确认", -338),
      // T037 V001 压力复测（完成）
      result("RES023", "T037", points[0], "0.77", "0.77", false, "已确认", -255),
      // T038 V002 罐壁温度巡检（完成）
      result("RES024", "T038", points[2], "33.2", "33.2", false, "已确认", -165),
      // T039 罐区交班综合巡检（完成，压力超上限已确认）
      result("RES025", "T039", points[0], "0.83", "0.83", true, "已确认", -92),
      result("RES026", "T039", points[1], "开启", "开启", false, "已确认", -85),
      result("RES027", "T039", points[2], "40.6", "40.6", false, "已识别", -78),
      // ── 演示用：扩充点位的巡检结果（告警事件的数据来源）──
      result("RES028", "T040", points[3], "0.86", "0.86", true, "已确认", -84),
      result("RES029", "T040", points[4], "关闭", "关闭", true, "已确认", -80),
      result("RES030", "T040", points[7], "0.74", "0.74", false, "已确认", -76),
      result("RES031", "T041", points[5], "63.5", "63.5", true, "已确认", -152),
      result("RES032", "T042", points[6], "26", "26", true, "已确认", -26),
      result("RES033", "T043", points[8], "62.8", "62.8", true, "已确认", -11045),
      result("RES034", "T044", points[0], "0.89", "0.89", true, "已确认", -15045),
      result("RES035", "T040", points[8], "58.2", "58.2", false, "已确认", -74),
      result("RES036", "T042", points[9], "18.6", "18.6", false, "已确认", -30),
      result("RES037", "T040", points[10], "关闭", "关闭", true, "已确认", -68),
      result("RES038", "T040", points[0], "0.79", "0.79", false, "已确认", -72),
      // AI 状态异常（三级告警）演示：图像模糊未识别出有效读数，风险信息本身无异常
      result(
        "RES039",
        "T042",
        points[9],
        "未识别",
        "未识别",
        false,
        "已识别",
        -40,
        0.32,
        "图像模糊，未识别出有效读数",
      ),
    ],
    alarms: [
      {
        id: "AL001",
        resultId: "RES001",
        taskId: "T008",
        pointId: "P001",
        name: "V001 出口压力超上限",
        level: "二级",
        category: "业务",
        state: "待确认",
        notes: [],
        time: dueIn(-95),
      },
      // ── 演示用：扩充告警事件（覆盖多个点位 / 机器 / 等级 / 状态 / 时间区间）──
      {
        id: "AL002",
        resultId: "RES028",
        taskId: "T040",
        pointId: "P004",
        name: "V003 出口压力超上限",
        level: "二级",
        category: "业务",
        state: "待确认",
        notes: [],
        time: dueIn(-84),
      },
      {
        id: "AL003",
        resultId: "RES029",
        taskId: "T040",
        pointId: "P005",
        name: "V003 出口阀门异常关闭",
        level: "一级",
        category: "业务",
        state: "处理中",
        notes: ["已通知维修班现场核查阀位"],
        time: dueIn(-80),
      },
      {
        id: "AL004",
        resultId: "RES031",
        taskId: "T041",
        pointId: "P006",
        name: "V004 罐壁温度偏高",
        level: "二级",
        category: "业务",
        state: "待确认",
        notes: [],
        time: dueIn(-152),
      },
      {
        id: "AL005",
        resultId: "RES032",
        taskId: "T042",
        pointId: "P007",
        name: "装置区 A 段管廊气体浓度偏高",
        level: "一级",
        category: "业务",
        state: "待确认",
        notes: [],
        time: dueIn(-26),
      },
      {
        id: "AL006",
        resultId: "RES009",
        taskId: "T031",
        pointId: "P001",
        name: "V001 出口压力超上限",
        level: "二级",
        category: "业务",
        state: "已关闭",
        notes: [
          "处置后连续两次复测正常",
          "处理：受理",
          "处理说明：现场泄压后复测连续两次正常",
        ],
        handledAt: dueIn(-880),
        handleResult: "受理",
        handleNote: "现场泄压后复测连续两次正常",
        falsePositive: false,
        time: dueIn(-922),
      },
      {
        id: "AL007",
        resultId: "RES013",
        taskId: "T032",
        pointId: "P002",
        name: "V001 出口阀门异常关闭",
        level: "二级",
        category: "业务",
        state: "已关闭",
        notes: ["处理：受理", "处理说明：现场复位阀位后复测正常"],
        handledAt: dueIn(-762),
        handleResult: "受理",
        handleNote: "现场复位阀位后复测正常",
        falsePositive: false,
        time: dueIn(-795),
      },
      {
        id: "AL008",
        resultId: "RES015",
        taskId: "T033",
        pointId: "P001",
        name: "V001 出口压力波动超限",
        level: "三级",
        category: "业务",
        state: "已关闭",
        notes: ["处理：忽略", "处理说明：波动在工艺允许区间内，记录备查"],
        handledAt: dueIn(-640),
        handleResult: "忽略",
        handleNote: "波动在工艺允许区间内，记录备查",
        falsePositive: false,
        time: dueIn(-660),
      },
      {
        id: "AL009",
        resultId: "RES018",
        taskId: "T034",
        pointId: "P003",
        name: "V002 罐壁温度超限",
        level: "二级",
        category: "业务",
        state: "已关闭",
        notes: [
          "处理：忽略（误报）",
          "处理说明：热像测温受罐体反光影响，复测未超限",
        ],
        handledAt: dueIn(-530),
        handleResult: "忽略",
        handleNote: "热像测温受罐体反光影响，复测未超限",
        falsePositive: true,
        time: dueIn(-548),
      },
      {
        id: "AL012",
        resultId: "RES025",
        taskId: "T039",
        pointId: "P001",
        name: "V001 出口压力超上限",
        level: "二级",
        category: "业务",
        state: "待确认",
        notes: [],
        time: dueIn(-92),
      },
      {
        id: "AL014",
        resultId: "RES037",
        taskId: "T040",
        pointId: "P011",
        name: "V004 出口阀门异常关闭",
        level: "二级",
        category: "业务",
        state: "处理中",
        notes: [],
        time: dueIn(-68),
      },
      {
        id: "AL016",
        resultId: "RES033",
        taskId: "T043",
        pointId: "P009",
        name: "V003 罐壁温度超限",
        level: "二级",
        category: "业务",
        state: "已关闭",
        notes: ["处理：受理", "处理说明：已排查罐壁保温层，复测恢复"],
        handledAt: dueIn(-11000),
        handleResult: "受理",
        handleNote: "已排查罐壁保温层，复测恢复",
        falsePositive: false,
        time: dueIn(-11045),
      },
      {
        id: "AL017",
        resultId: "RES034",
        taskId: "T044",
        pointId: "P001",
        name: "V001 出口压力超上限",
        level: "二级",
        category: "业务",
        state: "处理中",
        notes: ["处理：受理", "处理说明：现场已复位，复测恢复正常"],
        handledAt: dueIn(-47520),
        handleResult: "受理",
        handleNote: "现场已复位，复测恢复正常",
        falsePositive: false,
        time: dueIn(-15045),
      },
      {
        id: "AL022",
        resultId: "RES039",
        taskId: "T042",
        pointId: points[9].id,
        // AI 状态异常 = 识别失败：机器人预警 › 识别故障，固定三级；仍带任务 / 点位 / 结果用于追溯
        name: points[9].name + " 识别故障",
        level: "三级",
        category: "机器人",
        alarmClass: "识别故障",
        robotId: "R03",
        state: "待确认",
        notes: ["AI 状态异常（三级）：图像模糊，未识别出有效读数"],
        time: dueIn(-40),
      },
      // ── 演示用：机器人本体异常告警（与业务告警同表，分类=机器人；无业务点位/任务，仅关联 robotId）──
      {
        id: "AL018",
        category: "机器人",
        // 机器人本体告警没有业务台账，告警类别在此显式指定
        // （下装 = 底盘 / 行走 / 定位 / 通信 / 电池；上装 = 采集载荷 / 传感器）
        alarmClass: "下装",
        robotId: "R02",
        name: "装置巡检二号通信离线",
        level: "一级",
        state: "待确认",
        notes: [],
        handle: "推送值班主管，立即排查通信链路与基站覆盖",
        time: dueIn(-55),
      },
      {
        id: "AL019",
        category: "机器人",
        alarmClass: "下装",
        robotId: "R01",
        name: "罐区巡检一号急停触发",
        level: "一级",
        state: "处理中",
        notes: ["已通知现场班组确认周边安全"],
        handle: "现场确认安全后复位急停，复核任务可继续执行",
        time: dueIn(-40),
      },
      {
        id: "AL020",
        category: "机器人",
        alarmClass: "上装",
        robotId: "R03",
        name: "装置巡检三号红外传感器异常",
        level: "二级",
        state: "处理中",
        notes: ["传感器信号丢失，热像采集失败"],
        handle: "现场检查镜头/传感器，清洁或返修后重新标定",
        time: dueIn(-35),
      },
      {
        id: "AL021",
        category: "机器人",
        alarmClass: "下装",
        robotId: "R03",
        name: "装置巡检三号定位丢失",
        level: "二级",
        state: "待确认",
        notes: [],
        handle: "重新建图/校准，定位恢复前暂停该区段任务",
        time: dueIn(-30),
      },
      {
        id: "AL022",
        category: "机器人",
        alarmClass: "下装",
        robotId: "R03",
        name: "装置巡检三号电量低于返航阈值",
        level: "三级",
        state: "待确认",
        notes: [],
        handle: "安排返航充电，避免任务中途耗尽",
        time: dueIn(-25),
      },
      {
        id: "AL023",
        category: "机器人",
        alarmClass: "下装",
        robotId: "R02",
        name: "罐区巡检二号里程达保养阈值",
        level: "三级",
        state: "已关闭",
        notes: ["已纳入计划性保养"],
        handle: "按里程计划保养（履带/轮组/电池）",
        time: dueIn(-120),
      },
      {
        id: "AL024",
        category: "机器人",
        alarmClass: "下装",
        robotId: "R03",
        name: "装置巡检三号固件校验异常",
        level: "三级",
        state: "已关闭",
        notes: ["重启后校验通过"],
        handle: "已重启恢复，持续观察固件完整性",
        time: dueIn(-300),
      },
    ],
    /**
     * 地图下发记录（**最新在前**）：每个「空间版本 V{n}」下发给哪台机器、结果如何。
     * @description 与机器人当前激活版本互为印证：
     *              - R01 已激活 m3 / c7（= 本图当前版本，已同步）
     *              - R02 仍停在 m2 / c6（历史上同步过 V2，本图 V3 待下发）
     *              - R03 属「装置区」，与一期罐区地图不匹配，从未下发（「不适用区域」）
     */
    syncs: [
      {
        // 当前版本已下发给 R02，但对方尚未回激活回执：地图"下发到位"=已同步，机器仍停在旧版本
        id: "SYNC-A03-05",
        mapId: "MAP-A03",
        robotId: "R02",
        mapVersion: 3,
        state: "待激活",
        at: "2026-09-28 14:42",
      },
      {
        id: "SYNC-A03-04",
        mapId: "MAP-A03",
        robotId: "R01",
        mapVersion: 3,
        state: "已同步",
        at: "2026-09-28 14:40",
      },
      {
        id: "SYNC-A03-03",
        mapId: "MAP-A03",
        robotId: "R02",
        mapVersion: 2,
        state: "已同步",
        at: "2026-09-22 10:05",
      },
      {
        id: "SYNC-A03-02",
        mapId: "MAP-A03",
        robotId: "R01",
        mapVersion: 2,
        state: "已同步",
        at: "2026-09-22 09:58",
      },
      {
        id: "SYNC-B01-01",
        mapId: "MAP-B01",
        robotId: "R03",
        mapVersion: 1,
        state: "已同步",
        at: "2026-09-05 11:40",
      },
      {
        id: "SYNC-A03-01",
        mapId: "MAP-A03",
        robotId: "R01",
        mapVersion: 1,
        state: "已同步",
        at: "2026-08-30 16:20",
      },
    ],
    changes: [
      {
        id: "CH001",
        mapId: "MAP-A03",
        pointId: "P002",
        type: "目标移动/新增/移除",
        source: "R01 上报",
        note: "阀门附近新增管线，请确认目标关联是否受影响。证据 IMG-C001",
        state: "待确认",
      },
    ],
    sessions: [],
    logs: [
      {
        id: "L001",
        time: "09:00:00",
        action: "任务开始",
        object: "T009",
        detail: "R01 接收目标清单，已核对 m3 / p7",
      },
      // T020 完成
      {
        id: "L020",
        time: dueIn(-180),
        action: "DISPATCH",
        object: "T020",
        detail: "T020 下发至 R01，已核对 m3 / p7",
      },
      {
        id: "L021",
        time: dueIn(-178),
        action: "START",
        object: "T020",
        detail: "R01 开始执行罐区早班综合巡检",
      },
      {
        id: "L022",
        time: dueIn(-162),
        action: "TICK",
        object: "T020",
        detail: "完成 P001 出口压力表采集，读数正常",
        reading: "压力 1.62 MPa（正常阈值 0.2–0.8）",
        image: photo("P001 出口压力表 1.62MPa", 205),
      },
      {
        id: "L023",
        time: dueIn(-155),
        action: "TICK",
        object: "T020",
        detail: "完成 P002 阀门、P003 罐壁温度采集",
        reading: "P002 阀位 全关 · P003 罐壁温度 38.5℃",
        image: photo("P002 阀门 / P003 罐壁现场", 140),
      },
      {
        id: "L024",
        time: dueIn(-150),
        action: "TASK_FINISHED",
        object: "T020",
        detail: "全部检测项完成，任务正常结束",
      },
      // T021 部分完成
      {
        id: "L025",
        time: dueIn(-160),
        action: "DISPATCH",
        object: "T021",
        detail: "T021 下发至 R01",
      },
      {
        id: "L026",
        time: dueIn(-158),
        action: "START",
        object: "T021",
        detail: "R01 开始执行 V001 例行压力检测",
      },
      {
        id: "L027",
        time: dueIn(-150),
        action: "FAIL",
        object: "T021",
        detail: "P002 出口阀门不可达，已重试 2 次仍失败",
        reading: "重试 2 次：阀门无开度反馈",
        image: photo("P002 阀门不可达现场", 8),
      },
      {
        id: "L028",
        time: dueIn(-148),
        action: "SKIP",
        object: "T021",
        detail: "跳过 P002，继续后续检测项",
      },
      {
        id: "L029",
        time: dueIn(-140),
        action: "TASK_FINISHED",
        object: "T021",
        detail: "部分检测项完成，P002 失败未形成有效结果",
      },
      // T022 失败
      {
        id: "L030",
        time: dueIn(-200),
        action: "DISPATCH",
        object: "T022",
        detail: "T022 下发至 R02",
      },
      {
        id: "L031",
        time: dueIn(-198),
        action: "START",
        object: "T022",
        detail: "R02 开始执行装置区红外测温巡检",
      },
      {
        id: "L032",
        time: dueIn(-175),
        action: "FAIL",
        object: "T022",
        detail: "红外传感器异常，无法生成热像",
        reading: "热像缺失：传感器无信号",
        image: photo("红外传感器异常", 0),
      },
      {
        id: "L033",
        time: dueIn(-170),
        action: "STOP",
        object: "T022",
        detail: "连续失败，任务被强制终止",
      },
      // T023 取消
      {
        id: "L034",
        time: dueIn(-90),
        action: "DISPATCH",
        object: "T023",
        detail: "T023 下发至 R01",
      },
      {
        id: "L035",
        time: dueIn(-88),
        action: "START",
        object: "T023",
        detail: "R01 开始执行罐区阀门紧急复核",
      },
      {
        id: "L036",
        time: dueIn(-80),
        action: "STOP",
        object: "T023",
        detail: "人工确认现场无需复核，取消任务",
      },
      // T024 超期
      {
        id: "L037",
        time: dueIn(-45),
        action: "ASSIGN",
        object: "T024",
        detail: "T024 分配至 R02 待执行队列",
      },
      {
        id: "L038",
        time: dueIn(-40),
        action: "DISPATCH",
        object: "T024",
        detail: "T024 已下发，等待 R02 接收",
      },
      // ── 演示用：为已完成任务补齐执行事件，供「过程回放 / 执行回溯」时间轴展示 ──
      ...taskLogs(
        "T008",
        "罐区早班压力检测",
        "R01",
        -110,
        -88,
        [["P001 出口压力表", "压力 0.92 MPa（超上限 0.8）", 205]],
        "全部检测项完成，生成 1 条有效结果，已触发压力超限告警",
      ),
      ...taskLogs("T030", "罐区清晨综合巡检", "R01", -1050, -1020, [
        ["P001 出口压力表", "压力 0.71 MPa", 205],
        ["P002 出口阀门", "阀位 开启", 140],
        ["P003 罐壁温度", "罐壁温度 42.3℃", 30],
      ]),
      ...taskLogs(
        "T031",
        "罐区早班综合巡检",
        "R01",
        -930,
        -900,
        [
          ["P001 出口压力表", "压力 0.88 MPa（超上限 0.8）", 205],
          ["P002 出口阀门", "阀位 开启", 140],
          ["P003 罐壁温度", "罐壁温度 45.1℃", 30],
        ],
        "全部检测项完成，P001 压力超上限已记录",
      ),
      ...taskLogs(
        "T032",
        "罐区夜班综合巡检",
        "R02",
        -810,
        -780,
        [
          ["P001 出口压力表", "压力 0.66 MPa", 205],
          ["P002 出口阀门", "阀位 关闭（未按期望开启）", 8],
          ["P003 罐壁温度", "罐壁温度 58.4℃", 30],
        ],
        "全部检测项完成，P002 阀门未按期望开启",
      ),
      ...taskLogs(
        "T033",
        "V001 压力专项检测",
        "R01",
        -675,
        -650,
        [["P001 出口压力表", "压力 0.90 MPa（超上限 0.8）", 205]],
        "检测完成，P001 压力超上限，已触发告警",
      ),
      ...taskLogs(
        "T034",
        "罐区中班综合巡检",
        "R01",
        -570,
        -540,
        [
          ["P001 出口压力表", "压力 0.58 MPa", 205],
          ["P002 出口阀门", "阀位 开启", 140],
          ["P003 罐壁温度", "罐壁温度 61.2℃（超上限 60）", 30],
        ],
        "全部检测项完成，P003 罐壁温度超限",
      ),
      ...taskLogs("T035", "V001 阀门状态巡检", "R02", -460, -430, [
        ["P002 出口阀门", "阀位 开启", 140],
      ]),
      ...taskLogs("T036", "罐区午间综合巡检", "R01", -360, -330, [
        ["P001 出口压力表", "压力 0.49 MPa", 205],
        ["P002 出口阀门", "阀位 开启", 140],
        ["P003 罐壁温度", "罐壁温度 36.8℃", 30],
      ]),
      ...taskLogs("T037", "V001 压力复测", "R01", -270, -240, [
        ["P001 出口压力表", "压力 0.77 MPa", 205],
      ]),
      ...taskLogs("T038", "V002 罐壁温度巡检", "R02", -180, -150, [
        ["P003 罐壁温度", "罐壁温度 33.2℃", 30],
      ]),
      ...taskLogs(
        "T039",
        "罐区交班综合巡检",
        "R01",
        -100,
        -70,
        [
          ["P001 出口压力表", "压力 0.83 MPa（超上限 0.8）", 205],
          ["P002 出口阀门", "阀位 开启", 140],
          ["P003 罐壁温度", "罐壁温度 40.6℃", 30],
        ],
        "全部检测项完成，P001 压力超上限，已触发告警",
      ),
      // ── 演示用：扩充任务的执行事件与证据（供执行回溯 / 回溯内置页展示）──
      ...taskLogs(
        "T040",
        "罐区夜间综合巡检",
        "R01",
        -120,
        -70,
        [
          ["P004 出口压力表", "压力 0.86 MPa（超上限 0.8）", 205],
          ["P005 出口阀门", "阀位 关闭（期望开启）", 140],
          ["P006 罐壁温度", "罐壁温度 63.5℃（超上限 60）", 30],
          ["P008 出口压力表", "压力 0.74 MPa", 205],
          ["P009 罐壁温度", "罐壁温度 58.2℃", 30],
          ["P011 出口阀门", "阀位 关闭（期望开启）", 140],
        ],
        "P004 压力超限、P005 / P011 阀位异常、P006 温度超限，已生成告警",
      ),
      ...taskLogs(
        "T041",
        "V004 罐壁温度复测",
        "R02",
        -170,
        -148,
        [["P006 罐壁温度", "罐壁温度 63.5℃（超上限 60）", 30]],
        "P006 罐壁温度超限，已生成告警",
      ),
      ...taskLogs(
        "T042",
        "装置区管廊气体巡检",
        "R03",
        -45,
        -24,
        [
          ["P007 装置区 A 段管廊气体浓度", "气体浓度 26 %LEL（超上限 20）", 175],
          ["P010 装置区 B 段管廊气体浓度", "气体浓度 18.6 %LEL", 175],
        ],
        "P007 可燃气体浓度超限，已生成告警并升级 SLA",
      ),
      ...taskLogs(
        "T043",
        "罐区夜班综合巡检（历史）",
        "R01",
        -11080,
        -11040,
        [["P009 罐壁温度", "罐壁温度 62.8℃（超上限 60）", 30]],
        "P009 罐壁温度超限，已处置",
      ),
      ...taskLogs(
        "T044",
        "V001 压力专项检测（历史）",
        "R01",
        -15080,
        -15040,
        [["P001 出口压力表", "压力 0.89 MPa（超上限 0.8）", 205]],
        "P001 出口压力超上限，已处置",
      ),
    ],
    extras: [
      {
        id: "STD01",
        category: "standards",
        name: "压力读数标准",
        detail: "0.2–0.8 MPa · 重要 · v1",
      },
      {
        id: "RULE01",
        category: "rules",
        name: "压力超限告警",
        detail: "P001 · 压力 > 0.8 MPa · 重要",
      },
      {
        id: "ROUTE01",
        category: "routes",
        name: "罐区常规路线",
        detail: "P001 → P002 → P003 · 允许机器人优化顺序",
      },
      {
        id: "AI01",
        category: "services",
        name: "表计读数服务 v1.2",
        detail: "外部 AI · 仪表 · 置信度低于 0.85 进入复核",
      },
      {
        id: "AI02",
        category: "services",
        name: "目标识别模型 v2",
        detail: "机器人本地 · 仪表/阀门识别 · 一期罐区",
      },
      {
        id: "U01",
        category: "users",
        name: "张工",
        detail: "生产运行部 · 巡检主管 · 一期罐区",
      },
      {
        id: "ROLE01",
        category: "roles",
        name: "巡检主管",
        detail: "一期罐区 · 地图发布 / 调度 / 遥控 / 复核 / 关闭告警",
      },
      {
        id: "PAR01",
        category: "settings",
        name: "自主失败最大重试次数",
        detail: "2 次",
        type: "业务参数",
      },
      {
        id: "PAR02",
        category: "settings",
        name: "任务生成提前量",
        detail: "15 分钟",
        type: "业务参数",
      },
      {
        id: "DIC01",
        category: "settings",
        name: "任务执行状态",
        // 直接取任务状态全集，保证字典与任务列表的状态口径一致
        detail: TASK_STATUSES.join(", "),
        type: "数据字典",
        values: TASK_STATUSES.map((s) => ({ key: s, value: s })),
      },
    ],
    // ── schema 2 新增集合（接管 / 反馈 / 现场 / 资产 / 排班 / 通知）──
    takeovers: [],
    feedbacks: [
      {
        id: "FB001",
        resultId: "RES001",
        deviceType: "机器狗",
        pointId: "P001",
        algorithm: "AI01 表计读数服务 v1.2",
        label: "误报",
        reviewer: "小郑",
        consumed: false,
        time: dueIn(-85),
      },
    ],
    fieldOrders: [
      {
        id: "F001",
        robotId: "R03",
        type: "清洁",
        state: "待处理",
        detail: "装置区挂轨镜头积尘，需现场擦拭后重新采集",
        offline: true,
        time: dueIn(-1180),
      },
    ],
    chargers: [
      {
        id: "CH01",
        name: "装置区 1 号充电桩",
        region: "装置区",
        state: "占用",
        robotId: "R03",
        queue: [],
        occupiedMin: 35,
        x: 90,
        y: 62,
      },
      {
        id: "CH02",
        name: "罐区 2 号充电桩",
        region: "一期罐区",
        state: "空闲",
        queue: [],
        occupiedMin: 0,
        x: 12,
        y: 18,
      },
    ],
    railSections: [
      {
        id: "RS01",
        name: "装置区 A 段轨道",
        mapId: "MAP-B01",
        state: "占用",
        robotId: "R03",
        nextMaintain: dayIn(30240),
        length: 120,
        x: 84,
        y: 28,
      },
      {
        id: "RS02",
        name: "装置区 B 段轨道",
        mapId: "MAP-B01",
        state: "空闲",
        nextMaintain: dayIn(56160),
        length: 85,
        x: 84,
        y: 46,
      },
    ],
    spares: [
      {
        id: "SP01",
        name: "压力表密封圈",
        deviceTypes: ["机器狗", "四轮车"],
        stock: 12,
        unit: "个",
        minStock: 5,
      },
      {
        id: "SP02",
        name: "轨道滑块",
        deviceTypes: ["挂轨"],
        stock: 2,
        unit: "件",
        minStock: 4,
      },
    ],
    shifts: [
      {
        id: "SH01",
        date: dayIn(0),
        shift: "早班",
        person: "张工",
        role: "巡检主管",
        robots: ["R01"],
        certOk: true,
        certName: "机器狗操作证",
      },
      {
        id: "SH02",
        date: dayIn(0),
        shift: "中班",
        person: "老周",
        role: "远程操作员",
        robots: ["R02", "R03"],
        certOk: false,
        certName: "四轮车安全员证（已过期）",
      },
    ],
    notices: [
      {
        id: "N001",
        type: "计划变更",
        target: ["张工", "小赵"],
        content: "罐区每日巡检计划时间由 10:00 调整为 14:00，请确认排班",
        read: false,
        time: dueIn(-1250),
      },
    ],
    // ── 「地图 → 巡检任务」链路新增示例数据（schema 6，可选集合）──────────
    /** 设备主数据：导入即生效（含「是否巡检」开关）；明细见模块级 `devices` */
    devices: devs,
    /** 机器人上装能力（后台可维护；机器人能力 / 任务指令集的上游口径） */
    robotPayloads,
    /** 机器人能力（两级：能力类型 → 能力参数）：巡检项「能力项」的候选来源 */
    robotAbilities,
    /** 算法（AI 能力）清单：目标台账按名称引用，列表显示「关联台账」条数 */
    algoConfigs,
    /**
     * 区域（工厂树：固定根「全厂区」AREA-ROOT → 一级区域 → 子区域）。
     * 区域在此作为**可维护的主数据**（后台管理里可新增 / 改名 / 删除），
     * 但根节点「全厂区」内置不可删；设备按安装位置前缀归属到区域；
     * 地图 / 机器人的"区域"下拉也取自这里。
     */
    areas: [
      { id: "AREA-ROOT", code: "AR-00", name: "全厂区" },
      {
        id: "AREA-01",
        code: "AR-01",
        name: "一期罐区",
        parentId: "AREA-ROOT",
        owner: "王旭",
        department: "储运部",
        // 范围轮廓（全厂区底图百分比）：巡检点的区域归属按它推算（见 deviceMaster.areaOfCoord）
        polygon: DEMO_AREA_POLYGONS["一期罐区"],
        updatedAt: "2026-02-05 09:12:34",
      },
      {
        id: "AREA-02",
        code: "AR-02",
        name: "装置区",
        parentId: "AREA-ROOT",
        owner: "陈磊",
        department: "生产部",
        // 演示底图上管廊在右侧，故与罐区按 X 80% 分界；正式环境在「区域配置」里按实际片区重画
        polygon: DEMO_AREA_POLYGONS["装置区"],
        updatedAt: "2026-01-19 16:48:07",
      },
    ],
    /** 仪表：设备清单里的检测目标，只是资产、**不能直接巡检** */
    instruments: ins,
    /** 巡检要求模板库（看滴漏 / 看高温 / 看仪表读数 / 看外观破损 / 看气体浓度 / 看阀位 / 听异响） */
    requirements: structuredClone(requirements),
    /** 巡检目标台账 = 仪表 + 巡检要求 + 算法 + 阈值 + 判断标准 + 告警设置（巡检项从这里选） */
    businessTargets: bizFinal,
    /** 告警类别（告警管理 › 告警类别）：告警设置可选「告警类型」与告警记录分类筛选的数据源 */
    alarmClasses: ALARM_CLASSES,
    /** 告警推送人员（告警管理 › 告警推送） */
    alarmPushStaff: ALARM_PUSH_STAFF,
    /** 逻辑巡检点：**不暴露给用户**，由「设备主数据 + 点位」派生（见 deriveLogicalPoints） */
    logicalPoints: lps,
    /** 巡检路线 */
    routes: [
      {
        id: "RT01",
        name: "一期罐区常规路线",
        mapId: "MAP-A03",
        mapVersion: 3,
        nodeIds: ["P001", "P002", "P003"],
        strategy: "单向循环",
        connectivity: "通过",
        version: 1,
      },
    ],
    /** 现场踩点记录（含一条离线待同步） */
    siteSurveys: [
      {
        id: "SS01",
        mapId: "MAP-A03",
        offline: false,
        synced: true,
        pointType: "停靠点",
        deviceCode: "V001",
        target: "出口压力表",
        viewDir: "正对",
        ptzPreset: "预置位 1",
        remark: "表盘无遮挡",
        x: 36,
        y: 33,
      },
      {
        id: "SS02",
        mapId: "MAP-A03",
        offline: true,
        synced: false,
        pointType: "充电桩",
        deviceCode: "CH01",
        x: 12,
        y: 88,
      },
    ],
    /** 轨迹采样点（用于生成初始路线） */
    trackSamples: [
      { id: "TS01", mapId: "MAP-A03", x: 36, y: 33, kind: "停靠点", seq: 1 },
      { id: "TS02", mapId: "MAP-A03", x: 62, y: 60, kind: "停靠点", seq: 2 },
      { id: "TS03", mapId: "MAP-A03", x: 70, y: 62, kind: "转弯点", seq: 3 },
      { id: "TS04", mapId: "MAP-A03", x: 12, y: 88, kind: "充电桩", seq: 4 },
    ],
    /** 试采回执（Mock） */
    trialReceipts: [
      {
        pointId: "P001",
        robotId: "R01",
        inFrame: true,
        angleOk: true,
        distance: 3.2,
        poseErrorCm: 4,
        at: "2026-09-29 09:10",
      },
    ],
    roleId: "admin",
  };
  // 新增租户的编码由「租户管理」保证非空；清单里查不到时按「不加前缀」处理，避免 undefined 崩溃
  const t = tenants.find((x) => x.id === tenantId);
  return tenantId !== DEFAULT_TENANT && t ? retagForTenant(_s, t) : _s;
}
