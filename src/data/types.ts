export type TaskStatus =
  | "待调度"
  | "已分配"
  | "下发中"
  | "待执行"
  | "执行中"
  | "暂停"
  | "完成"
  | "部分完成"
  | "失败"
  | "取消"
  | "超期";
export interface Point {
  validationFailure?: string;
  id: string;
  name: string;
  targetId: string;
  mapId: string;
  version: number;
  device: string;
  object: string;
  item: string;
  unit: string;
  kind: string;
  requirement: string;
  state: "待标注" | "待验证" | "已启用" | "待重新验证" | "停用";
  x: number;
  y: number;
  validated?: string;
}
export interface Candidate {
  referenceImage?: { name: string; dataUrl: string; uploadedAt: string };
  id: string;
  kind: string;
  x: number;
  y: number;
  state: "待确认" | "已确认" | "已剔除";
  pointId?: string;
}
export interface MapAsset {
  id: string;
  name: string;
  region: string;
  version: number;
  pointSet: number;
  state: "草稿" | "试验发布" | "已发布";
  source: string;
  batch: string;
  cloud: string;
  video: string;
  file: string;
  checksum: string;
  targets: Candidate[];
  history: string[];
}
/** 机型：三类巡检机器统称“巡检机器”，不做三套系统 */
export type DeviceType = "机器狗" | "四轮车" | "挂轨";

/** 移动能力标签：与载荷能力 capabilities 分离，决定任务可否下发与地图图层 */
export type MobilityCapability =
  | "爬楼"
  | "越障"
  | "跨楼层"
  | "高速"
  | "大负载"
  | "道路行驶"
  | "固定轨道"
  | "长时在线";

/** 机型特有约束：进入调度校验与充电规划 */
export interface DeviceConstraints {
  /** 最低可派电量（%），按机型差异配置 */
  minBattery: number;
  /** 是否参与充电排队规划 */
  needChargingPlan: boolean;
  /** 挂轨专用：当前所在轨道区段 */
  railSectionId?: string;
  /** 四轮车专用：限速 */
  maxSpeed?: number;
}

export interface Robot {
  id: string;
  name: string;
  region: string;
  battery: number;
  capabilities: string[];
  state:
    "空闲" | "执行中" | "暂停" | "人工接管" | "离线" | "充电" | "返航中" | "故障" | "维护";
  mapId: string;
  mapVersion: number;
  pointSet: number;
  current?: string;
  x: number;
  y: number;
  /** 姿态动作（站立 / 蹲下），用于大屏远程指令演示 */
  posture?: string;
  /** 机型：机器狗 / 四轮车 / 挂轨 */
  deviceType: DeviceType;
  /** 移动能力标签，见 MobilityCapability */
  mobility: MobilityCapability[];
  /** 机型特有约束 */
  constraints: DeviceConstraints;
  /** 健康度评分 0-100（电池衰减 / 故障率 / 里程综合） */
  health: number;
  /** 固件版本 */
  firmware: string;
}
export interface Snapshot extends Point {
  mapVersion: number;
  pointSet: number;
}
export type TaskType =
  "光学任务" | "红外任务" | "气体采集任务" | "声音采集任务" | "综合巡检任务";
export type AtomicAction =
  "拍照" | "录像片段" | "采集红外热像" | "采集气体" | "录制声音";
export const taskTypeActions: Record<TaskType, AtomicAction[]> = {
  光学任务: ["拍照"],
  红外任务: ["采集红外热像"],
  气体采集任务: ["采集气体"],
  声音采集任务: ["录制声音"],
  综合巡检任务: ["拍照", "采集红外热像"],
};
export const atomicActionCapability: Record<AtomicAction, string> = {
  拍照: "可见光",
  录像片段: "可见光",
  采集红外热像: "红外",
  采集气体: "气体",
  录制声音: "声音",
};
export interface Task {
  id: string;
  name: string;
  source: string;
  planId?: string;
  planVersion?: number;
  scheduleKey?: string;
  notBefore?: string;
  allowedWait?: number;
  autoRun?: boolean;
  blockedReason?: string;
  nextReportAt?: number;
  alarmId?: string;
  priority: "普通" | "高" | "紧急";
  taskType: TaskType;
  atomicActions: AtomicAction[];
  state: TaskStatus;
  robotId?: string;
  mapId: string;
  mapVersion: number;
  pointSet: number;
  items: Snapshot[];
  stage: number;
  index: number;
  done: string[];
  skipped: string[];
  failure?: string;
  retries: number;
  duration: number;
  /** 任务所需移动能力（如罐顶需爬楼、轨道区段需固定轨道），调度时按机型能力校验 */
  requiredMobility?: MobilityCapability[];
  dispatchId?: string;
  created: string;
  startedAt?: string;
  finishedAt?: string;
  expectedAt?: string;
  deadline?: string;
  preemptedTaskId?: string;
}
export interface Template {
  id: string;
  name: string;
  points: string[];
  priority: "普通" | "高" | "紧急";
  end: string;
  /** 模板状态：启用后计划方可引用；停用仅存档不参与生成 */
  state: "启用" | "停用";
  version: number;
}
export interface Plan {
  robotId?: string;
  generationError?: string;
  id: string;
  name: string;
  templateId: string;
  cycle: string;
  start: string;
  end: string;
  time: string;
  advance: number;
  timeout: number;
  wait: number;
  state: "启用" | "停用";
  version: number;
  lastGenerated?: string;
}
export interface Result {
  ruleSnapshot?: import("./alarmRules").AlarmRule;
  id: string;
  taskId: string;
  pointId: string;
  item: string;
  raw: string;
  recognized: string;
  final: string;
  unit: string;
  abnormal: boolean;
  status: string;
  source: string;
  confidence: number;
  time: string;
  reviews: {
    value: string;
    reason: string;
    time: string;
    conclusion?: string;
    finalState?: string;
  }[];
}
export interface Alarm {
  id: string;
  resultId: string;
  taskId: string;
  pointId: string;
  name: string;
  level: string;
  state: "待确认" | "处理中" | "待复查" | "已恢复" | "已关闭";
  notes: string[];
  reviewTask?: string;
  time: string;
}
export interface Sync {
  id: string;
  mapId: string;
  robotId: string;
  mapVersion: number;
  pointSet: number;
  state: "传输中" | "校验中" | "待激活" | "已同步" | "失败";
  reason?: string;
}
export interface Change {
  id: string;
  mapId: string;
  pointId: string;
  type: string;
  source: string;
  note: string;
  state: "待确认" | "维护中" | "待同步" | "已完成" | "已驳回";
  version?: number;
  pointSet?: number;
}
export interface Session {
  startedAt?: string;
  releasedAt?: string;
  resumedAt?: string;
  id: string;
  robotId: string;
  taskId?: string;
  state: "待暂停确认" | "已接管" | "退出核对中" | "已释放" | "已超时";
  expires: number;
  seq: number;
  pan: number;
  tilt: number;
}
export interface Log {
  id: string;
  time: string;
  action: string;
  object: string;
  detail: string;
  /** 采集到的业务读数（如压力 1.62MPa），供证据时间轴展示 */
  reading?: string;
  /** 现场证据图片（URL 或 data URI），点击可放大 */
  image?: string;
}
export interface Extra {
  id: string;
  name: string;
  category: string;
  status: string;
  detail: string;
}
export interface State {
  systemRules?: import("./alarmRules").SystemRules;
  alarmRules?: import("./alarmRules").AlarmRule[];
  fieldDevices?: Record<string, import("./fieldControl").FieldState>;
  /** 数据模型版本：1 → 2 新增工单/验收/接管/反馈/现场/资产集合；2 → 3 模板新增 state 字段 */
  schema: 5;
  maps: MapAsset[];
  points: Point[];
  robots: Robot[];
  templates: Template[];
  plans: Plan[];
  tasks: Task[];
  results: Result[];
  alarms: Alarm[];
  syncs: Sync[];
  changes: Change[];
  sessions: Session[];
  logs: Log[];
  extras: Extra[];
  requests: { businessId: string; taskId: string }[];
  /** ↓ 以下为 schema 2 新增集合 */
  workOrders: WorkOrder[];
  acceptances: Acceptance[];
  takeovers: Takeover[];
  feedbacks: Feedback[];
  fieldOrders: FieldOrder[];
  chargers: Charger[];
  railSections: RailSection[];
  spares: Spare[];
  shifts: Shift[];
  notices: Notice[];
  /** 当前演示角色 ID，用于角色切换器（原型阶段代替真实登录） */
  roleId: string;
}

/** 工单状态机：告警 → 派单 → 处置 → 验收 → 闭环 */
export type WorkOrderState =
  | "待派单"
  | "已派单"
  | "已接单"
  | "处置中"
  | "待验收"
  | "已验收"
  | "已关闭";

/** SLA 分级：紧急 / 高 / 普通 */
export type SlaLevel = "紧急" | "高" | "普通";

export interface WorkOrder {
  id: string;
  alarmId: string;
  pointId: string;
  title: string;
  level: SlaLevel;
  state: WorkOrderState;
  /** 当前指派人 */
  assignee?: string;
  /** 处置执行人：验收互斥校验用（执行人 ≠ 验收人） */
  executor?: string;
  /** SLA 剩余分钟，负数表示已超时 */
  slaLeft: number;
  slaState: "正常" | "预警" | "已升级";
  /** 消耗备件 ID 列表 */
  spares: string[];
  note: string;
  created: string;
  /** 责任链时间线 */
  timeline: { time: string; actor: string; action: string; detail: string }[];
}

export type AcceptanceState = "待验收" | "通过" | "驳回";

export interface Acceptance {
  id: string;
  workOrderId: string;
  /** 验收人：与工单 executor 互斥 */
  acceptor: string;
  state: AcceptanceState;
  /** 驳回理由（走模板） */
  reason?: string;
  /** 误报标记：进入 feedbacks 供 AI 复核域消费 */
  falsePositive: boolean;
  /** 处置前后对比证据 */
  compareBefore?: string;
  compareAfter?: string;
  time: string;
}

/** 远程接管申请：插在现有 TAKEOVER 之前，高风险操作需双人复核 */
export interface Takeover {
  id: string;
  robotId: string;
  applicant: string;
  approver?: string;
  /** 双人复核人 */
  countersign?: string;
  state: "待审批" | "已批准" | "已驳回" | "已释放" | "已超时";
  reason: string;
  time: string;
}

/** AI 复核标注反馈：写入队列后由"误报漏报分析"消费 */
export interface Feedback {
  id: string;
  resultId: string;
  deviceType: DeviceType;
  pointId: string;
  /** 算法 / 模型版本，如 AI01 v1.2 */
  algorithm: string;
  label: "真报" | "误报" | "漏报";
  reviewer: string;
  consumed: boolean;
  time: string;
}

export type FieldOrderState = "待处理" | "处理中" | "已完成";

/** 现场保障工单：Web 端派发，移动端执行（原型阶段仅记录） */
export interface FieldOrder {
  id: string;
  robotId: string;
  type: "换电" | "清洁" | "卡阻处理" | "镜头擦拭" | "其他";
  state: FieldOrderState;
  owner?: string;
  detail: string;
  /** 是否离线产生，用于"离线同步状态"可见性 */
  offline: boolean;
  time: string;
}

export interface Charger {
  id: string;
  name: string;
  region: string;
  state: "空闲" | "占用" | "故障";
  robotId?: string;
  /** 排队机器人 ID 列表 */
  queue: string[];
  occupiedMin: number;
  /** 地图坐标（百分比），用于驾驶舱图层渲染 */
  x: number;
  y: number;
}

/** 轨道区段：挂轨专用，支撑轨道占用与防碰撞 */
export interface RailSection {
  id: string;
  name: string;
  mapId: string;
  state: "空闲" | "占用" | "检修";
  robotId?: string;
  nextMaintain: string;
  /** 区段长度（米），用于驾驶舱按比例绘制区段 */
  length: number;
  /** 区段中心地图坐标（百分比） */
  x: number;
  y: number;
}

export interface Spare {
  id: string;
  name: string;
  deviceTypes: DeviceType[];
  stock: number;
  unit: string;
  minStock: number;
}

/** 排班：与资质联动，无证 / 过期不可排班 */
export interface Shift {
  id: string;
  date: string;
  shift: "早班" | "中班" | "夜班";
  person: string;
  role: string;
  robots: string[];
  certOk: boolean;
  certName: string;
}

export interface Notice {
  id: string;
  type: "计划变更" | "任务改派" | "升级提醒" | "资质到期";
  target: string[];
  content: string;
  read: boolean;
  time: string;
}
export const stages = [
  "前往目标区域",
  "搜索目标",
  "目标锁定",
  "自主调整",
  "数据采集",
  "本地处理 / AI 分析",
  "结果生成",
];
