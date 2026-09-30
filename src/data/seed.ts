/**
 * @file seed.ts
 * @description 全部演示种子数据（点位/地图/机器人/模板/计划/任务/结果/告警/日志/工单…），
 *              含「地图 → 巡检任务」链路新增集合（devices/logicalPoints/routes/siteSurveys/trackSamples/trialReceipts）
 * @interaction 由 store.tsx 注入 Context；engine/metrics/selectors 消费
 */
import type {
  State,
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
  CaptureKind,
} from "./types";
import { defaultRangeOfUnit } from "./alarmRules";
import { defaultRequirementOfInstrument } from "./deviceMaster";
import { captureAction } from "./types";
import { SAMPLE_MAP_IMAGE } from "./sampleMap";
const points: Point[] = [
  {
    id: "P001",
    name: "V001 出口压力表",
    targetId: "O101",
    mapId: "MAP-A03",
    version: 7,
    device: "V001 原料储罐",
    object: "出口压力表",
    item: "压力读数",
    unit: "MPa",
    kind: "仪表",
    requirement: "身份唯一，表盘清晰，压力正常范围 0.2–0.8 MPa",
    state: "已启用",
    x: 36,
    y: 33,
    validated: "R01 / 能力 v2 / m3 / p7",
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
    version: 4,
    device: "V001 原料储罐",
    object: "出口阀门",
    item: "阀门状态",
    unit: "",
    kind: "阀门",
    requirement: "目标身份唯一，完整采集阀位，期望状态：开启",
    state: "已启用",
    x: 62,
    y: 60,
    validated: "R01 / 能力 v2 / m3 / p4",
    logicalIds: ["LP002"],
    calibrate: "待校准",
    pose: { x: 62, y: 60, yaw: 0 },
  },
  {
    id: "P003",
    name: "V002 表面温度",
    targetId: "O103",
    mapId: "MAP-A03",
    version: 2,
    device: "V002 缓冲罐",
    object: "罐壁",
    item: "表面温度",
    unit: "℃",
    kind: "红外",
    requirement: "完整热像，温度低于 60℃",
    state: "已启用",
    x: 74,
    y: 29,
    validated: "R01 / 能力 v2 / m3 / p2",
  },
  // ── 演示用：扩充点位，支撑告警事件与告警排行 TOP10 的数据量 ──
  {
    id: "P004",
    name: "V003 出口压力表",
    targetId: "O104",
    mapId: "MAP-A03",
    version: 3,
    device: "V003 原料储罐",
    object: "出口压力表",
    item: "压力读数",
    unit: "MPa",
    kind: "仪表",
    requirement: "身份唯一，表盘清晰，压力正常范围 0.2–0.8 MPa",
    state: "已启用",
    x: 45,
    y: 20,
    validated: "R01 / 能力 v2 / m3 / p7",
  },
  {
    id: "P005",
    name: "V003 出口阀门",
    targetId: "O105",
    mapId: "MAP-A03",
    version: 3,
    device: "V003 原料储罐",
    object: "出口阀门",
    item: "阀门状态",
    unit: "",
    kind: "阀门",
    requirement: "目标身份唯一，完整采集阀位，期望状态：开启",
    state: "已启用",
    x: 12,
    y: 48,
    validated: "R01 / 能力 v2 / m3 / p4",
  },
  {
    id: "P006",
    name: "V004 罐壁温度",
    targetId: "O106",
    mapId: "MAP-A03",
    version: 3,
    device: "V004 缓冲罐",
    object: "罐壁",
    item: "表面温度",
    unit: "℃",
    kind: "红外",
    requirement: "完整热像，温度低于 60℃",
    state: "已启用",
    x: 78,
    y: 48,
    validated: "R01 / 能力 v2 / m3 / p2",
  },
  {
    id: "P007",
    name: "装置区 A 段管廊气体浓度",
    targetId: "O107",
    mapId: "MAP-A03",
    version: 3,
    device: "装置区 A 段管廊",
    object: "可燃气体探头",
    item: "气体浓度",
    unit: "%LEL",
    kind: "气体",
    requirement: "探头完好、无遮挡，浓度低于 20 %LEL",
    state: "已启用",
    x: 88,
    y: 14,
    validated: "R03 / 能力 v3 / m1 / p1",
  },
  {
    id: "P008",
    name: "V004 出口压力表",
    targetId: "O108",
    mapId: "MAP-A03",
    version: 3,
    device: "V004 缓冲罐",
    object: "出口压力表",
    item: "压力读数",
    unit: "MPa",
    kind: "仪表",
    requirement: "身份唯一，表盘清晰，压力正常范围 0.2–0.8 MPa",
    state: "已启用",
    x: 66,
    y: 68,
    validated: "R01 / 能力 v2 / m3 / p7",
  },
  {
    id: "P009",
    name: "V003 罐壁温度",
    targetId: "O109",
    mapId: "MAP-A03",
    version: 3,
    device: "V003 原料储罐",
    object: "罐壁",
    item: "表面温度",
    unit: "℃",
    kind: "红外",
    requirement: "完整热像，温度低于 60℃",
    state: "已启用",
    x: 20,
    y: 32,
    validated: "R01 / 能力 v2 / m3 / p2",
  },
  {
    id: "P010",
    name: "装置区 B 段管廊气体浓度",
    targetId: "O110",
    mapId: "MAP-A03",
    version: 3,
    device: "装置区 B 段管廊",
    object: "可燃气体探头",
    item: "气体浓度",
    unit: "%LEL",
    kind: "气体",
    requirement: "探头完好、无遮挡，浓度低于 20 %LEL",
    state: "已启用",
    x: 86,
    y: 42,
    validated: "R03 / 能力 v3 / m1 / p1",
  },
  {
    id: "P011",
    name: "V004 出口阀门",
    targetId: "O111",
    mapId: "MAP-A03",
    version: 3,
    device: "V004 缓冲罐",
    object: "出口阀门",
    item: "阀门状态",
    unit: "",
    kind: "阀门",
    requirement: "目标身份唯一，完整采集阀位，期望状态：开启",
    state: "已启用",
    x: 42,
    y: 62,
    validated: "R01 / 能力 v2 / m3 / p4",
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
  priority: "普通",
  taskType: "综合巡检任务",
  atomicActions: ["拍照", "采集红外热像"],
  state,
  robotId,
  mapId: "MAP-A03",
  mapVersion: 3,
  pointSet: 7,
  items: points.slice(0, 3).map((p) => ({ ...p, mapVersion: 3, pointSet: 7 })),
  stage: 0,
  index: 0,
  done: [],
  skipped: [],
  retries: 0,
  duration: 24,
  /** 默认不要求特殊移动能力；罐顶等点位在具体任务中另行声明 */
  requiredMobility: [],
  /** 演示数据统一按「相对当前时间」生成，避免多日后打开时今日 / 本月统计为空 */
  created: dueIn(-75),
});
/**
 * 生成一条巡检检测结果（演示种子数据）
 * @description 原始采集值即外部 AI 识别输入，识别值默认等于原始值；修正场景由复核记录表达
 * @param id 结果 ID
 * @param taskId 所属任务 ID
 * @param point 关联巡检点位（提供检测项 / 单位）
 * @param raw 原始采集值
 * @param final 最终值
 * @param abnormal 业务判断是否异常
 * @param status 复核状态（待复核 / 已确认 / 已识别 / 无效）
 * @param minutes 采集时间，相对当前时间的分钟数（负数表示过去）
 * @param confidence 外部 AI 识别置信度，默认 0.92
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
): Result => ({
  id,
  taskId,
  pointId: point.id,
  item: point.item,
  raw,
  recognized: raw,
  final,
  unit: point.unit,
  abnormal,
  status,
  source: "机器人采集 / 外部 AI 识别 v1.2",
  confidence,
  time: dueIn(minutes),
  reviews: [],
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
// ── 设备主数据（阶段③：清单导入 → 待审核 → 生效）────────────────────────
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
    reviewState: "已通过",
    state: "在用",
    importBatch: "IMP-20260920-01",
    importedAt: "2026-09-20 09:10",
  },
  {
    id: "DEV-V002",
    name: "V002 缓冲罐",
    type: "储罐",
    regionCode: "R-A03",
    locationDesc: "一期罐区南侧",
    height: 1.4,
    items: [
      {
        id: "II-V002-T",
        target: "罐壁",
        kind: "红外",
        unit: "℃",
        inspect: true,
        cycle: "每日",
        priority: "高",
      },
    ],
    reviewState: "已通过",
    state: "在用",
    importBatch: "IMP-20260920-01",
    importedAt: "2026-09-20 09:10",
  },
  {
    id: "DEV-V003",
    name: "V003 原料储罐",
    type: "储罐",
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
        kind: "红外",
        unit: "℃",
        inspect: true,
        cycle: "每日",
        priority: "高",
      },
    ],
    reviewState: "已通过",
    state: "在用",
    importBatch: "IMP-20260920-01",
    importedAt: "2026-09-20 09:10",
  },
  {
    id: "DEV-V004",
    name: "V004 缓冲罐",
    type: "储罐",
    regionCode: "R-A03",
    locationDesc: "一期罐区东侧",
    height: 1.4,
    items: [
      {
        id: "II-V004-T",
        target: "罐壁",
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
    reviewState: "已通过",
    state: "在用",
    importBatch: "IMP-20260920-01",
    importedAt: "2026-09-20 09:10",
  },
  {
    id: "DEV-PLA",
    name: "装置区 A 段管廊",
    type: "管廊",
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
    reviewState: "已通过",
    state: "在用",
    importBatch: "IMP-20260920-01",
    importedAt: "2026-09-20 09:10",
  },
  {
    id: "DEV-PLB",
    name: "装置区 B 段管廊",
    type: "管廊",
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
    reviewState: "已通过",
    state: "在用",
    importBatch: "IMP-20260920-01",
    importedAt: "2026-09-20 09:10",
  },
  // ── 以下为演示「导入 → 待审核 / 驳回 / 停用」三种后台状态，均无关联点位 ──
  {
    id: "DEV-V005",
    name: "V005 新增储罐",
    type: "储罐",
    regionCode: "R-A03",
    locationDesc: "一期罐区待建区",
    height: 1.2,
    items: [
      {
        id: "II-V005-L",
        target: "液位计",
        kind: "可见光",
        unit: "m",
        inspect: true,
        cycle: "每日",
        priority: "普通",
      },
    ],
    reviewState: "待审核",
    state: "在用",
    importBatch: "IMP-20260929-01",
    importedAt: "2026-09-29 08:40",
  },
  {
    id: "DEV-V006",
    name: "V006 备用泵",
    type: "泵",
    regionCode: "R-A03",
    locationDesc: "一期罐区泵房",
    items: [
      {
        id: "II-V006-S",
        target: "运行状态",
        kind: "可见光",
        unit: "",
        inspect: true,
        cycle: "每周",
        priority: "普通",
      },
    ],
    reviewState: "已驳回",
    reviewNote: "编码与现场铭牌不一致（清单 V006 / 铭牌 P-106），请核对后重新导入",
    importBatch: "IMP-20260929-01",
    importedAt: "2026-09-29 08:40",
  },
  {
    id: "DEV-V009",
    name: "V009 备用储罐",
    type: "储罐",
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
    reviewState: "已通过",
    /** 已停用：含该设备点位的任务会被拦截（当前无点位，仅演示台账状态） */
    state: "停用",
    importBatch: "IMP-20260920-01",
    importedAt: "2026-09-20 09:10",
  },
];
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
    name: "看滴漏",
    kind: "可见异常",
    description: "识别泵体 / 法兰 / 阀门根部的渗漏痕迹（液滴、油渍、结晶）",
    algorithm: "液滴 / 油渍分割 v2",
    judge: "有无目标",
    needPhoto: true,
    needReview: true,
    cycle: "每日",
  },
  {
    id: "REQ-HOT",
    name: "看高温",
    kind: "读数识别",
    description: "以热像定位设备表面最高温，超过上限判异常",
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
    name: "看仪表读数",
    kind: "读数识别",
    description: "识别机械 / 数显表读数并与量程比对",
    algorithm: "表计读数识别 v1.2",
    judge: "数值范围",
    needPhoto: true,
    needReview: true,
    cycle: "每日",
  },
  {
    id: "REQ-APPEAR",
    name: "看外观破损",
    kind: "可见异常",
    description: "锈蚀、变形、破损、被遮挡、指示缺失",
    algorithm: "外观缺陷检测 v1.0",
    judge: "有无目标",
    needPhoto: true,
    cycle: "每周",
  },
  {
    id: "REQ-GAS",
    name: "看气体浓度",
    kind: "读数识别",
    description: "读取可燃气体探头数值，超过上限判异常",
    algorithm: "气体浓度判读 v1.1",
    judge: "数值范围",
    unit: "%LEL",
    min: 0,
    max: 20,
    cycle: "每日",
  },
  {
    id: "REQ-STATE",
    name: "看阀位状态",
    kind: "状态判别",
    description: "判别阀门开 / 关并期望状态比对",
    algorithm: "阀位 / 开关状态判别 v1.4",
    judge: "期望状态",
    expected: "开启",
    needPhoto: true,
    cycle: "每日",
  },
  {
    id: "REQ-SOUND",
    name: "听异响",
    kind: "声音判别",
    description: "录音判别异常噪声（摩擦、撞击、啸叫）",
    algorithm: "设备异响识别 v0.9",
    judge: "等级评分",
    needReview: true,
    cycle: "每班",
  },
];
/**
 * 由设备清单派生区域（工厂树第一层）
 * @param devs 设备主数据
 * @returns 区域列表（按清单里出现的厂区去重）
 */
const deriveAreas = (devs: DeviceAsset[]): Area[] =>
  [...new Set(devs.map((d) => d.region || "未分区"))].map((name, i) => ({
    id: "A" + String(i + 1).padStart(2, "0"),
    name,
  }));
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
      state: d.state === "停用" ? ("停用" as const) : ("在用" as const),
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
  /**
   * 默认开启告警的仪表：与改造前"已配置判定规则"的三个巡检点（P001~P003）对齐；
   * 其余目标默认只记录结果，可在「巡检目标台账 › 告警设置」里逐个打开
   */
  const ALARM_ON = ["II-V001-P", "II-V001-V", "II-V002-T"];
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
      // 告警设置：**平台唯一的告警配置入口**（阈值即上面的 min/max/expected）
      alarm: {
        on: ALARM_ON.includes(x.id),
        level: item?.priority === "紧急" ? "紧急" : "重要",
        trigger: "单次超限即告警（一期不支持连续多次）",
        notify: ["设备岗"],
      },
      createdAt: "2026-09-20 09:10",
    };
  });
};
export function seed(): State {
  // 逻辑点由「设备主数据 + 点位」派生，避免两处手工维护导致口径漂移；
  // 并把派生结果回写到点位 logicalIds（一物理点可承载多条逻辑点）
  const pts = structuredClone(points);
  const lps = deriveLogicalPoints(pts);
  lps.forEach((lp) => {
    const p = pts.find((x) => x.id === lp.physicalPointId);
    if (p) p.logicalIds = [...new Set([...(p.logicalIds || []), lp.id])];
  });
  /** 设备清单（演示数据同属「一期罐区」，此处统一补厂区列，供指标按厂区裁剪） */
  const devs = structuredClone(devices).map((d) => ({
    region: "一期罐区",
    ...d,
  }));
  /**
   * 工厂树与巡检目标台账：仪表 ← **已通过审核**设备的检测目标；业务目标 ← 仪表 + 巡检要求。
   * 未通过审核 / 被驳回的清单不进入工厂树（与设备主数据的"待审核不生效"口径一致）
   */
  const ins = deriveInstruments(devs.filter((d) => d.reviewState === "已通过"));
  const biz = deriveBusinessTargets(ins, devs);
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
  return {
    schema: 6,
    points: pts,
    maps: [
      {
        id: "MAP-A03",
        name: "一期罐区巡检地图",
        region: "一期罐区",
        version: 3,
        pointSet: 7,
        state: "已发布",
        source: "机器人首次走行",
        batch: "B001",
        cloud: "B001-multimodal.pcd",
        video: "B001-raw-video.mp4",
        file: "MAP-A03-m3.map",
        checksum: "sha256:8e93a17c…",
        // 示例底图：打开地图即可在图上标注点位（可随时替换/清除）
        image: SAMPLE_MAP_IMAGE,
        // 地图点位：随地图文件自带的外部定位ID（source = 地图导入）
        targets: [
          // 已被现有巡检点绑定（一对一占用）
          ...points.map((p) => ({
            id: p.targetId,
            externalId: p.targetId,
            source: "地图导入" as const,
            kind: p.kind as CaptureKind,
            x: p.x,
            y: p.y,
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
            state: "待确认" as const,
          })),
        ],
        history: [
          "m1 / p1 首次建图",
          "m2 / p6 补充阀门目标",
          "m3 / p7 已发布 · 原始资料完整",
        ],
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
        pointSet: 7,
        current: "T009",
        x: 27,
        y: 55,
        deviceType: "机器狗",
        mobility: ["爬楼", "越障", "跨楼层"],
        constraints: { minBattery: 40, needChargingPlan: true },
        health: 92,
        firmware: "DOG-2.4.1",
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
        pointSet: 6,
        x: 18,
        y: 72,
        deviceType: "四轮车",
        mobility: ["高速", "大负载", "道路行驶"],
        constraints: { minBattery: 25, needChargingPlan: true, maxSpeed: 1.5 },
        health: 88,
        firmware: "AGV-1.9.0",
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
        pointSet: 1,
        x: 87,
        y: 73,
        deviceType: "挂轨",
        mobility: ["固定轨道", "长时在线"],
        constraints: {
          minBattery: 15,
          needChargingPlan: false,
          railSectionId: "RS01",
        },
        health: 95,
        firmware: "RAIL-3.0.2",
      },
    ],
    templates: [
      {
        id: "TMP01",
        name: "V001 每班综合巡检",
        points: ["P001", "P002", "P003"],
        priority: "普通",
        end: "返航",
        state: "启用",
        version: 1,
      },
    ],
    plans: [
      {
        id: "PL01",
        robotId: "R01",
        name: "罐区每日巡检",
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
    ],
    tasks: [
      task("T009", "罐区早班自主巡检", "执行中", "R01"),
      { ...task("T010", "罐区午前例行巡检", "待调度"), deadline: dueIn(12) },
      {
        ...task("T011", "V001 异常现场核验", "待调度"),
        priority: "高",
        source: "人工临时",
        deadline: dueIn(6),
      },
      {
        ...task("T008", "罐区早班压力检测", "完成", "R01"),
        created: dueIn(-118),
        startedAt: dueIn(-110),
        finishedAt: dueIn(-88),
        items: [{ ...points[0], mapVersion: 3, pointSet: 7 }],
        done: ["P001"],
        index: 1,
      },
      task("T012", "罐区交班补充巡检", "已分配", "R01"),
      {
        // 罐顶点位需爬楼：用于演示"按机型能力匹配机器"（四轮车不可派）
        ...task("T013", "罐区阀门复核", "已分配", "R01"),
        requiredMobility: ["爬楼"],
      },
      task("T014", "二号机器人版本更新后巡检", "已分配", "R02"),
      // ── 演示用：已结束任务，供「执行回溯」列表展示 ──
      {
        ...task("T020", "罐区早班综合巡检", "完成", "R01"),
        startedAt: dueIn(-180),
        finishedAt: dueIn(-150),
        items: points.slice(0, 3).map((p) => ({ ...p, mapVersion: 3, pointSet: 7 })),
        done: points.slice(0, 3).map((p) => p.id),
        index: 3,
      },
      {
        ...task("T021", "V001 例行压力检测", "部分完成", "R01"),
        startedAt: dueIn(-160),
        finishedAt: dueIn(-140),
        items: points.slice(0, 3).map((p) => ({ ...p, mapVersion: 3, pointSet: 7 })),
        done: ["P001"],
        skipped: ["P002"],
        index: 2,
        failure: "P002 出口阀门不可达",
      },
      {
        ...task("T022", "装置区红外测温巡检", "失败", "R02"),
        startedAt: dueIn(-200),
        finishedAt: dueIn(-170),
        items: [{ ...points[2], mapVersion: 3, pointSet: 7 }],
        skipped: ["P003"],
        index: 1,
        failure: "红外传感器异常",
      },
      {
        ...task("T023", "罐区阀门紧急复核", "取消", "R01"),
        startedAt: dueIn(-90),
        finishedAt: dueIn(-80),
        items: [{ ...points[1], mapVersion: 3, pointSet: 7 }],
        index: 1,
      },
      {
        ...task("T024", "罐区夜间补充巡检", "超期", "R02"),
        deadline: dueIn(-30),
        items: points.slice(0, 3).map((p) => ({ ...p, mapVersion: 3, pointSet: 7 })),
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
        items: [{ ...points[0], mapVersion: 3, pointSet: 7 }],
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
        items: [{ ...points[1], mapVersion: 3, pointSet: 7 }],
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
        items: [{ ...points[0], mapVersion: 3, pointSet: 7 }],
        done: ["P001"],
        index: 1,
      },
      {
        ...task("T038", "V002 罐壁温度巡检", "完成", "R02"),
        created: dueIn(-210),
        startedAt: dueIn(-180),
        finishedAt: dueIn(-150),
        items: [{ ...points[2], mapVersion: 3, pointSet: 7 }],
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
        items: points.filter(p => !["P007", "P010"].includes(p.id)).map(p => ({...p, mapVersion:3, pointSet:7})),
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
        items: [{ ...points[5], mapVersion: 3, pointSet: 7 }],
        done: ["P006"],
        index: 1,
      },
      {
        ...task("T042", "装置区管廊气体巡检", "完成", "R03"),
        created: dueIn(-60),
        startedAt: dueIn(-45),
        finishedAt: dueIn(-24),
        items: [
          { ...points[6], mapVersion: 1, pointSet: 1 },
          { ...points[9], mapVersion: 1, pointSet: 1 },
        ],
        done: ["P007", "P010"],
        index: 2,
      },
      {
        ...task("T043", "罐区夜班综合巡检（历史）", "完成", "R01"),
        created: dueIn(-11100),
        startedAt: dueIn(-11080),
        finishedAt: dueIn(-11040),
        items: [{ ...points[8], mapVersion: 3, pointSet: 7 }],
        done: ["P009"],
        index: 1,
      },
      {
        ...task("T044", "V001 压力专项检测（历史）", "完成", "R01"),
        created: dueIn(-15100),
        startedAt: dueIn(-15080),
        finishedAt: dueIn(-15040),
        items: [{ ...points[0], mapVersion: 3, pointSet: 7 }],
        done: ["P001"],
        index: 1,
      },
    ],
    results: [
      {
        id: "RES001",
        taskId: "T008",
        pointId: "P001",
        item: "压力读数",
        raw: "0.92",
        recognized: "0.92",
        final: "0.92",
        unit: "MPa",
        abnormal: true,
        status: "待复核",
        source: "机器人采集 / 外部表计识别 v1.2",
        confidence: 0.93,
        time: dueIn(-95),
        reviews: [],
      },
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
      result("RES013", "T032", points[1], "关闭", "关闭", true, "待复核", -795),
      result("RES014", "T032", points[2], "58.4", "58.4", false, "已确认", -788),
      // T033 V001 压力专项检测（完成，压力超上限待复核）
      result("RES015", "T033", points[0], "0.90", "0.90", true, "待复核", -660),
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
      // T039 罐区交班综合巡检（完成，压力超上限待复核）
      result("RES025", "T039", points[0], "0.83", "0.83", true, "待复核", -92),
      result("RES026", "T039", points[1], "开启", "开启", false, "已确认", -85),
      result("RES027", "T039", points[2], "40.6", "40.6", false, "已识别", -78),
      // ── 演示用：扩充点位的巡检结果（告警事件的数据来源）──
      result("RES028", "T040", points[3], "0.86", "0.86", true, "待复核", -84),
      result("RES029", "T040", points[4], "关闭", "关闭", true, "待复核", -80),
      result("RES030", "T040", points[7], "0.74", "0.74", false, "已确认", -76),
      result("RES031", "T041", points[5], "63.5", "63.5", true, "已确认", -152),
      result("RES032", "T042", points[6], "26", "26", true, "待复核", -26),
      result("RES033", "T043", points[8], "62.8", "62.8", true, "已确认", -11045),
      result("RES034", "T044", points[0], "0.89", "0.89", true, "已确认", -15045),
      result("RES035", "T040", points[8], "58.2", "58.2", false, "已确认", -74),
      result("RES036", "T042", points[9], "18.6", "18.6", false, "已确认", -30),
      result("RES037", "T040", points[10], "关闭", "关闭", true, "待复核", -68),
      result("RES038", "T040", points[0], "0.79", "0.79", false, "已确认", -72),
    ],
    alarms: [
      {
        id: "AL001",
        resultId: "RES001",
        taskId: "T008",
        pointId: "P001",
        name: "V001 出口压力超上限",
        level: "重要",
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
        level: "重要",
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
        level: "紧急",
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
        level: "重要",
        category: "业务",
        state: "待复查",
        notes: [],
        time: dueIn(-152),
      },
      {
        id: "AL005",
        resultId: "RES032",
        taskId: "T042",
        pointId: "P007",
        name: "装置区 A 段管廊气体浓度偏高",
        level: "紧急",
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
        level: "重要",
        category: "业务",
        state: "已恢复",
        notes: ["处置后连续两次复测正常"],
        time: dueIn(-922),
      },
      {
        id: "AL007",
        resultId: "RES013",
        taskId: "T032",
        pointId: "P002",
        name: "V001 出口阀门异常关闭",
        level: "重要",
        category: "业务",
        state: "已关闭",
        notes: [],
        time: dueIn(-795),
      },
      {
        id: "AL008",
        resultId: "RES015",
        taskId: "T033",
        pointId: "P001",
        name: "V001 出口压力波动超限",
        level: "一般",
        category: "业务",
        state: "已关闭",
        notes: [],
        time: dueIn(-660),
      },
      {
        id: "AL009",
        resultId: "RES018",
        taskId: "T034",
        pointId: "P003",
        name: "V002 罐壁温度超限",
        level: "重要",
        category: "业务",
        state: "已关闭",
        notes: [],
        time: dueIn(-548),
      },
      {
        id: "AL010",
        resultId: "RES023",
        taskId: "T037",
        pointId: "P001",
        name: "V001 出口压力接近上限",
        level: "一般",
        category: "业务",
        state: "已关闭",
        notes: [],
        time: dueIn(-255),
      },
      {
        id: "AL011",
        resultId: "RES014",
        taskId: "T032",
        pointId: "P003",
        name: "V002 罐壁温度接近上限",
        level: "一般",
        category: "业务",
        state: "已恢复",
        notes: [],
        time: dueIn(-788),
      },
      {
        id: "AL012",
        resultId: "RES025",
        taskId: "T039",
        pointId: "P001",
        name: "V001 出口压力超上限",
        level: "重要",
        category: "业务",
        state: "待确认",
        notes: [],
        time: dueIn(-92),
      },
      {
        id: "AL013",
        resultId: "RES027",
        taskId: "T039",
        pointId: "P003",
        name: "V002 罐壁温度较上一班次回升",
        level: "一般",
        category: "业务",
        state: "已恢复",
        notes: [],
        time: dueIn(-78),
      },
      {
        id: "AL014",
        resultId: "RES037",
        taskId: "T040",
        pointId: "P011",
        name: "V004 出口阀门异常关闭",
        level: "重要",
        category: "业务",
        state: "处理中",
        notes: [],
        time: dueIn(-68),
      },
      {
        id: "AL015",
        resultId: "RES035",
        taskId: "T040",
        pointId: "P009",
        name: "V003 罐壁温度接近上限",
        level: "一般",
        category: "业务",
        state: "已恢复",
        notes: [],
        time: dueIn(-74),
      },
      {
        id: "AL016",
        resultId: "RES033",
        taskId: "T043",
        pointId: "P009",
        name: "V003 罐壁温度超限",
        level: "重要",
        category: "业务",
        state: "已关闭",
        notes: [],
        time: dueIn(-11045),
      },
      {
        id: "AL017",
        resultId: "RES034",
        taskId: "T044",
        pointId: "P001",
        name: "V001 出口压力超上限",
        level: "重要",
        category: "业务",
        state: "已关闭",
        notes: [],
        time: dueIn(-15045),
      },
      // ── 演示用：机器人本体异常告警（与业务告警同表，分类=机器人；无业务点位/任务，仅关联 robotId）──
      {
        id: "AL018",
        category: "机器人",
        robotId: "R02",
        name: "装置巡检二号通信离线",
        level: "紧急",
        state: "待确认",
        notes: [],
        handle: "推送值班主管，立即排查通信链路与基站覆盖",
        time: dueIn(-55),
      },
      {
        id: "AL019",
        category: "机器人",
        robotId: "R01",
        name: "罐区巡检一号急停触发",
        level: "紧急",
        state: "处理中",
        notes: ["已通知现场班组确认周边安全"],
        handle: "现场确认安全后复位急停，复核任务可继续执行",
        time: dueIn(-40),
      },
      {
        id: "AL020",
        category: "机器人",
        robotId: "R03",
        name: "装置巡检三号红外传感器异常",
        level: "重要",
        state: "处理中",
        notes: ["传感器信号丢失，热像采集失败"],
        handle: "现场检查镜头/传感器，清洁或返修后重新标定",
        time: dueIn(-35),
      },
      {
        id: "AL021",
        category: "机器人",
        robotId: "R03",
        name: "装置巡检三号定位丢失",
        level: "重要",
        state: "待确认",
        notes: [],
        handle: "重新建图/校准，定位恢复前暂停该区段任务",
        time: dueIn(-30),
      },
      {
        id: "AL022",
        category: "机器人",
        robotId: "R03",
        name: "装置巡检三号电量低于返航阈值",
        level: "一般",
        state: "待确认",
        notes: [],
        handle: "安排返航充电，避免任务中途耗尽",
        time: dueIn(-25),
      },
      {
        id: "AL023",
        category: "机器人",
        robotId: "R02",
        name: "罐区巡检二号里程达保养阈值",
        level: "一般",
        state: "已恢复",
        notes: ["已纳入计划性保养"],
        handle: "按里程计划保养（履带/轮组/电池）",
        time: dueIn(-120),
      },
      {
        id: "AL024",
        category: "机器人",
        robotId: "R03",
        name: "装置巡检三号固件校验异常",
        level: "一般",
        state: "已关闭",
        notes: ["重启后校验通过"],
        handle: "已重启恢复，持续观察固件完整性",
        time: dueIn(-300),
      },
    ],
    syncs: [],
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
        "检测完成，P001 压力超上限，已进入待复核",
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
        "全部检测项完成，P001 压力超上限，已进入待复核",
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
        "P009 罐壁温度超限，已闭环",
      ),
      ...taskLogs(
        "T044",
        "V001 压力专项检测（历史）",
        "R01",
        -15080,
        -15040,
        [["P001 出口压力表", "压力 0.89 MPa（超上限 0.8）", 205]],
        "P001 出口压力超上限，已闭环",
      ),
    ],
    requests: [],
    extras: [
      {
        id: "STD01",
        category: "standards",
        name: "压力读数标准",
        status: "启用",
        detail: "0.2–0.8 MPa · 重要 · v1",
      },
      {
        id: "RULE01",
        category: "rules",
        name: "压力超限告警",
        status: "启用",
        detail: "P001 · 压力 > 0.8 MPa · 重要",
      },
      {
        id: "ROUTE01",
        category: "routes",
        name: "罐区常规路线",
        status: "启用",
        detail: "P001 → P002 → P003 · 允许机器人优化顺序",
      },
      {
        id: "AI01",
        category: "services",
        name: "表计读数服务 v1.2",
        status: "启用",
        detail: "外部 AI · 仪表 · 置信度低于 0.85 进入复核",
      },
      {
        id: "AI02",
        category: "services",
        name: "目标识别模型 v2",
        status: "启用",
        detail: "机器人本地 · 仪表/阀门识别 · 一期罐区",
      },
      {
        id: "U01",
        category: "users",
        name: "张工",
        status: "启用",
        detail: "生产运行部 · 巡检管理员 · 一期罐区",
      },
      {
        id: "ROLE01",
        category: "roles",
        name: "巡检管理员",
        status: "启用",
        detail: "一期罐区 · 地图发布 / 调度 / 遥控 / 复核 / 关闭告警",
      },
      {
        id: "PAR01",
        category: "settings",
        name: "自主失败最大重试次数",
        status: "启用",
        detail: "2 次",
      },
      {
        id: "PAR02",
        category: "settings",
        name: "任务生成提前量",
        status: "启用",
        detail: "15 分钟",
      },
    ],
    // ── schema 2 新增集合（工单 / 验收 / 接管 / 反馈 / 现场 / 资产 / 排班 / 通知）──
    workOrders: [
      {
        id: "WO001",
        alarmId: "AL001",
        pointId: "P001",
        title: "V001 出口压力超上限处置",
        level: "高",
        state: "待派单",
        slaLeft: 12,
        slaState: "正常",
        spares: [],
        note: "待指派维修工现场核验压力表与取压管路",
        created: dueIn(-90),
        timeline: [
          {
            time: hhmmIn(-90),
            actor: "系统",
            action: "工单生成",
            detail: "由告警 AL001 自动生成",
          },
        ],
      },
      // ── 演示用：新增告警对应的处置工单（SLA 倒计时 / 派单演示）──
      {
        id: "WO002",
        alarmId: "AL014",
        pointId: "P011",
        title: "V004 出口阀门异常关闭处置",
        level: "普通",
        state: "待派单",
        slaLeft: 8,
        slaState: "预警",
        spares: [],
        note: "现场核查阀位并确认是否需要重新调整",
        created: dueIn(-68),
        timeline: [
          {
            time: hhmmIn(-68),
            actor: "系统",
            action: "工单生成",
            detail: "由告警 AL014 自动生成",
          },
        ],
      },
      {
        id: "WO003",
        alarmId: "AL005",
        pointId: "P007",
        title: "装置区 A 段管廊气体报警处置",
        level: "高",
        state: "处置中",
        slaLeft: -6,
        slaState: "已升级",
        spares: [],
        note: "已通知现场班组长，等待复测与通风确认",
        created: dueIn(-30),
        timeline: [
          {
            time: hhmmIn(-30),
            actor: "系统",
            action: "工单生成",
            detail: "由告警 AL005 自动生成",
          },
          {
            time: hhmmIn(-12),
            actor: "系统",
            action: "SLA 升级",
            detail: "超时未闭环，已升级至值班主管",
          },
        ],
      },
    ],
    acceptances: [],
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
    /** 设备主数据：导入 → 待审核 → 生效（含「是否巡检」开关）；明细见模块级 `devices` */
    devices: devs,
    /** 区域（工厂树第一层：区域 → 设备 → 仪表） */
    areas: deriveAreas(devs),
    /** 仪表：设备清单里的检测目标，只是资产、**不能直接巡检** */
    instruments: ins,
    /** 巡检要求模板库（看滴漏 / 看高温 / 看仪表读数 / 看外观破损 / 看气体浓度 / 看阀位 / 听异响） */
    requirements: structuredClone(requirements),
    /** 巡检目标台账 = 仪表 + 巡检要求 + 算法 + 阈值 + 判断标准（巡检项从这里选） */
    businessTargets: biz,
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
}
