/**
 * @file types.ts
 * @description 全量数据模型类型 + 链路常量（stages / taskTypeActions / atomicActionCapability）；
 *              含「地图 → 巡检任务」链路新增类型（DeviceAsset/LogicalPoint/Route/TrialReceipt…）
 * @interaction 被 data 层（seed / engine / selectors / metrics / planSchedule…）与各页面组件消费
 */
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
  /** 物理停靠位姿（阶段⑥：示教定稿时回填） */
  pose?: { x: number; y: number; yaw: number };
  /** 该物理点承载的逻辑点（阶段④⑤：一个停靠位可覆盖多个逻辑点） */
  logicalIds?: string[];
  /** 机器人动作编排（阶段⑥：到点后"怎么看"） */
  actionPlan?: PointActionPlan;
  /** 校准状态（阶段⑤⑧：试采误差或换版后可能待校准） */
  calibrate?: "正常" | "待校准";
  /** 是否由示教「记录当前位姿」回填而来 */
  taught?: boolean;
  /**
   * 巡检项（**多个巡检项组成一个巡检点**）
   * @description 有巡检项时：任务指令集（原子动作）与所需采集方式**以巡检项配置为准**，
   *              上面的 device / object / item / unit / kind 退化为"首个巡检项"的派生视图（兼容旧页面）
   */
  inspectItems?: InspectSpec[];
}
/**
 * 地图点位来源
 * @description `地图导入` = 随地图文件带来的定位ID（外部ID，平台不改）；
 *              `平台新增` = 在「地图工作台」里继续添加的点位
 */
export type MapPointSource = "地图导入" | "平台新增";

export interface Candidate {
  referenceImage?: { name: string; dataUrl: string; uploadedAt: string };
  id: string;
  kind: string;
  x: number;
  y: number;
  state: "待确认" | "已确认" | "已剔除";
  pointId?: string;
  /** 地图点位来源（地图导入 / 平台新增） */
  source?: MapPointSource;
  /** 地图自带的外部定位ID（source = 地图导入 时随文件带入） */
  externalId?: string;
  /** 候选点来源（阶段⑤：三种模式 + 人工兜底） */
  origin?: CandidateOrigin;
  /** 来源依据：踩点记录 id / 图纸坐标 / 点云图层名 */
  inputRef?: string;
  /** 该候选停靠位覆盖的逻辑点（阶段④⑤ 聚类结果） */
  covers?: string[];
  /** AI 推荐的观察方向与云台角度（origin === "AI推荐"） */
  recommended?: { viewDir?: string; ptz?: PTZ };
  /** 聚类簇 id（一个停靠位覆盖多设备） */
  clusterId?: string;
}
export interface MapAsset {
  id: string;
  name: string;
  region: string;
  version: number;
  pointSet: number;
  /**
   * 地图状态：`草稿`（内容未定版）/ `已发布`（已定版，可下发与引用）
   * @description 平台**不区分试验版 / 正式版**：下发时会自动把当前内容定版为「已发布」
   */
  state: "草稿" | "已发布";
  source: string;
  batch: string;
  cloud: string;
  video: string;
  file: string;
  checksum: string;
  targets: Candidate[];
  history: string[];
  /** 坐标系标定（阶段②，原型可只存示意值） */
  frames?: MapFrames;
  /** 图层可用性/可见性（阶段②） */
  layers?: MapLayerFlags;
  /** 设备清单版本（阶段⑧，与 version / pointSet 并列的第三类版本） */
  deviceListVersion?: number;
  /** 底图（用户上传的地图图片 dataUrl）；有底图即可在图上标注点位 */
  image?: string;
}

/* ── 以下为「地图 → 巡检任务」链路改造新增类型（阶段①~⑧） ───────────── */

/** 云台角度（水平 / 俯仰 / 变焦） */
export interface PTZ {
  pan: number;
  tilt: number;
  zoom: number;
}

/**
 * 巡检项：巡检点下的一个执行项
 * @description **巡检项 = 巡检项名称 + 业务巡检目标 + 机器操作内容**；
 *              多个巡检项组成一个巡检点——机器人到点后**逐项执行**。
 *              机器操作内容 = 原子动作（做什么）+ 云台/视角参数（怎么看，可操作云台细化）
 */
export interface InspectSpec {
  id: string;
  /** 巡检项名称（如 压力读数 / 泵体滴漏） */
  name: string;
  /** 业务巡检目标 id（仪表 + 巡检要求 + 算法 + 阈值 + 判断标准） */
  targetId: string;
  /** 机器操作内容：原子动作集合 */
  actions: AtomicAction[];
  /** 机器操作参数：云台 / 观察方向 / 补光 / 升降 / 停留 / 避障 / 预置位 */
  pose: PointActionPlan;
}

/** 点位级机器人动作编排（阶段⑥：解决"到得了之后怎么看"） */
export interface PointActionPlan {
  ptz: PTZ;
  /** 升降杆高度 */
  lift?: number;
  /** 补光灯亮度 */
  light?: number;
  /** 停留时间（秒） */
  dwellSec?: number;
  /** 避障策略 */
  avoidPolicy?: string;
  /** 观察方向 */
  viewDir?: string;
  /** 云台预置位 */
  preset?: string;
  /**
   * 逐项取景覆盖：一个停靠位有多个朝向差异大的目标时，按检测项覆盖主视角。
   * @description 缺省共用主视角（大多数情况一次停靠即可拍全）
   */
  perItem?: Record<string, Omit<PointActionPlan, "perItem">>;
}

/** 候选物理点来源（阶段⑤） */
export type CandidateOrigin = "现场踩点" | "坐标反推" | "AI推荐" | "人工新增";

/** 地图图层开关（阶段②；缺省视为可用） */
export interface MapLayerFlags {
  "底图"?: boolean;
  "障碍物层"?: boolean;
  "点云层"?: boolean;
  "业务区域层"?: boolean;
  "巡检点层"?: boolean;
  "路线层"?: boolean;
}

/** 坐标系与标定关系（阶段①②） */
export interface MapFrames {
  /** 分辨率（米/像素） */
  resolution?: number;
  /** 地图原点（机器人初始位姿） */
  origin?: { x: number; y: number; yaw: number };
  /** 旋转角（对齐正北，度） */
  rotateDeg?: number;
  /** 云台/相机外参（占位） */
  extrinsics?: Record<string, PTZ>;
  /** 标定状态：未标定则不允许落点 */
  calibState?: "未标定" | "部分标定" | "已标定";
}

/** 轨迹采样点（阶段①录制，用于生成初始路线） */
export interface TrackSample {
  id: string;
  mapId: string;
  x: number;
  y: number;
  kind: "停靠点" | "转弯点" | "充电桩" | "待机点";
  seq: number;
}

/** 现场踩点记录（阶段①：移动端跟随机器人打点，支持离线） */
export interface SiteSurvey {
  id: string;
  mapId: string;
  /** 离线打点：联网后再同步 */
  offline: boolean;
  synced: boolean;
  pointType: "停靠点" | "观察点" | "充电桩" | "待机点";
  /** 现场抄录的设备唯一编码 */
  deviceCode?: string;
  /** 检测目标 */
  target?: string;
  /** 观察方向 */
  viewDir?: string;
  /** 云台预置位 */
  ptzPreset?: string;
  photo?: string;
  remark?: string;
  x: number;
  y: number;
}

/** 采集方式（机器人能力口径；业务类型如"仪表/阀门"归设备主数据） */
export type CaptureKind = "可见光" | "红外" | "气体" | "声音";

/** 全部采集方式：导入校验与能力口径共用同一份名单 */
export const captureKinds: CaptureKind[] = ["可见光", "红外", "气体", "声音"];

/** 巡检项（阶段③：设备清单里的"巡检什么"） */
export interface InspectItem {
  id: string;
  /** 检测目标（如 P-50406A 油杯） */
  target: string;
  /** 采集方式 */
  kind: CaptureKind;
  unit: string;
  /** 关联告警规则 id */
  ruleId?: string;
  /** 「是否巡检」开关：任务生成时过滤 */
  inspect: boolean;
  cycle: string;
  priority: "普通" | "高" | "紧急";
}

/* ── 工厂树与业务巡检目标（客户定稿模型）───────────────────────────────
   区域 → 设备 → 仪表；仪表只是资产，不能直接巡检；
   仪表 + 巡检要求 + 算法 + 阈值 + 判断标准 = 业务巡检目标（可执行的最小巡检单元） */

/** 区域（工厂树第一层） */
export interface Area {
  id: string;
  name: string;
}

/**
 * 仪表：实际被巡检的资产对象
 * @description 挂在设备下（单归属），本身只是资产，**不能直接巡检**；
 *              必须叠加「巡检要求」形成业务巡检目标后才可执行
 */
export interface Instrument {
  id: string;
  name: string;
  /** 外键 → DeviceAsset.id */
  deviceId: string;
  /** 采集方式（可见光 / 红外 / 气体 / 声音），决定需要哪种机器人能力 */
  capture: CaptureKind;
  /** 缺省单位（读表类仪表） */
  unit?: string;
  model?: string;
  locationDesc?: string;
  state?: "在用" | "停用";
}

/** 巡检要求分类：这一类要求"看什么" */
export type RequirementKind = "可见异常" | "读数识别" | "状态判别" | "声音判别";

/** 判定方式：这一类要求"怎么判" */
export type JudgeType = "数值范围" | "期望状态" | "有无目标" | "等级评分";

/** 巡检要求（模板库：看滴漏 / 看高温 / 看仪表读数 / 看外观破损 …） */
export interface Requirement {
  id: string;
  name: string;
  kind: RequirementKind;
  description: string;
  /** 背后的算法 / AI 表达方式（默认值，业务巡检目标可覆盖） */
  algorithm: string;
  /** 默认判定方式与阈值（可被业务巡检目标覆盖） */
  judge: JudgeType;
  unit?: string;
  min?: number;
  max?: number;
  expected?: string;
  /** 默认采集与复核要求 */
  needPhoto?: boolean;
  needVideo?: boolean;
  needReview?: boolean;
  cycle?: string;
}

/**
 * 告警设置（**整个平台唯一的告警配置入口**，挂在业务巡检目标上）
 * @description 巡检点 / 点位不提供告警配置：巡检点的判定直接复用所绑业务目标的
 *              阈值（`judge/min/max/expected`）与这里的三项设置（是否告警 / 等级 / 通知）
 */
export interface BusinessAlarm {
  /** 是否产生告警（关闭时只记录结果与证据，不生成告警、不进入待确认） */
  on: boolean;
  /** 告警等级：决定告警列表分级与工单 SLA（紧急 5 / 重要 15 / 一般 60 分钟） */
  level: "一般" | "重要" | "紧急";
  /** 触发条件补充说明；一期只支持"单次超限即告警" */
  trigger?: string;
  /** 通知对象（岗位 / 角色），随告警记录一并带出 */
  notify?: string[];
}

/**
 * 业务巡检目标 = 业务目标 + 业务要求 + 仪表 + 巡检要求 + 算法 + 阈值 + 判断标准 + 告警设置
 * @description 任务的最小执行单元：一个巡检点（地图上的业务执行点）可绑定多个业务巡检目标，
 *              任务执行到点后逐项展开
 */
export interface BusinessTarget {
  id: string;
  /** 外键 → Instrument（仪表） */
  instrumentId: string;
  /** 外键 → Requirement（巡检要求） */
  requirementId: string;
  /** 业务目标：这条目标要达成什么（如"确认出口压力表读数在正常范围内"） */
  goal?: string;
  /** 业务要求（对采集与判定的具体要求，默认取巡检要求的说明） */
  require?: string;
  /** 采用的算法 / AI 表达方式 */
  algorithm: string;
  /** 判定方式 */
  judge: JudgeType;
  unit?: string;
  min?: number;
  max?: number;
  expected?: string;
  /** 判断标准补充说明（如"以罐体上半部最高温为准"） */
  criteria?: string;
  /** 告警设置（平台唯一入口；巡检点不可配置告警） */
  alarm?: BusinessAlarm;
  needPhoto: boolean;
  needVideo: boolean;
  needReview: boolean;
  cycle: string;
  priority: "普通" | "高" | "紧急";
  /** 「是否巡检」：关闭后不进入任务指令集 */
  inspect: boolean;
  createdAt?: string;
}

/** 设备主数据（阶段③：Excel/CSV/API 导入 → 待审核 → 生效） */
export interface DeviceAsset {
  /** 设备唯一编码（业务身份的唯一依据） */
  id: string;
  name: string;
  type: string;
  regionCode: string;
  locationDesc: string;
  coord?: string;
  coordSys?: string;
  height?: number;
  /** 设备—部件—检测目标 层级（无部件时只填 items） */
  parts?: { id: string; name: string; items: InspectItem[] }[];
  items: InspectItem[];
  photo?: string;
  remark?: string;
  reviewState: "待审核" | "已通过" | "已驳回";
  /**
   * 设备启停：停用后，含该设备点位的任务创建 / 派单被拦截。
   * @description 替代旧口径 `extras.category === "equipment"`（种子里从无该类数据，该校验一直空转）
   */
  state?: "在用" | "停用";
  /** 所属厂区（清单里的厂区列）：指标按厂区裁剪时用；缺省时不参与裁剪 */
  region?: string;
  /** 导入批次（批量导入时写入；标注页「＋快速新建」不写） */
  importBatch?: string;
  /** 导入时间 */
  importedAt?: string;
  /** 审核意见（驳回原因等） */
  reviewNote?: string;
}

/** 逻辑巡检点（阶段④：只表达"要巡检什么"，不含坐标） */
export interface LogicalPoint {
  id: string;
  /** 外键 → DeviceAsset */
  deviceId: string;
  partId?: string;
  /** 覆盖的巡检项 */
  itemIds: string[];
  region: string;
  /** 未落位 = 待定位（由现场扫码/拍照/拖拽兜底） */
  locateState: "待定位" | "已落位" | "待校准";
  physicalPointId?: string;
  locateOrigin?: CandidateOrigin;
}

/** 巡检路线（阶段⑦） */
export interface Route {
  id: string;
  name: string;
  mapId: string;
  mapVersion: number;
  /** 途经物理点顺序 */
  nodeIds: string[];
  strategy: "单向循环" | "双向折返";
  connectivity: "通过" | "存在孤立点";
  version: number;
}

/** 试采回执（阶段⑤后半：机器人批量跑候选点的回执，原型为 Mock） */
export interface TrialReceipt {
  pointId: string;
  robotId: string;
  /** 目标是否在画面内 */
  inFrame: boolean;
  /** 云台角度是否合适 */
  angleOk: boolean;
  /** 距离（米） */
  distance: number;
  /** 位姿误差（cm），超过阈值（10）→ 待校准 */
  poseErrorCm: number;
  at: string;
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
  /**
   * 创建任务时推导出的到位原子动作列表（快照：不随后续设备主数据 / 采集方式变更而变）
   * @description 一个停靠位可覆盖多个检测目标，故为列表（如同时"拍照"+"采集红外热像"）
   */
  actions?: AtomicAction[];
}
export type TaskType =
  "光学任务" | "红外任务" | "气体采集任务" | "声音采集任务" | "综合巡检任务";
export type AtomicAction =
  "拍照" | "录像片段" | "采集红外热像" | "采集气体" | "录制声音";
/** 全部原子动作：巡检项「机器操作内容」的选择范围（与任务指令集同一份名单） */
export const atomicActions: AtomicAction[] = [
  "拍照",
  "录像片段",
  "采集红外热像",
  "采集气体",
  "录制声音",
];
/**
 * 由原子动作反推任务类型
 * @description 指令集现在由所选巡检点的巡检项决定，任务类型不再需要人工选择：
 *              单一采集能力 → 对应任务类型（可见光→光学 / 红外→红外 / 气体→气体采集 / 声音→声音采集），
 *              多种能力混合 → 综合巡检任务
 * @param actions 原子动作列表
 * @returns 任务类型
 */
export const taskTypeOfActions = (actions: AtomicAction[]): TaskType => {
  const caps = [...new Set(actions.map((a) => atomicActionCapability[a]))].sort();
  const hit = (
    ["光学任务", "红外任务", "气体采集任务", "声音采集任务"] as TaskType[]
  ).find((t) => {
    const c = [
      ...new Set(taskTypeActions[t].map((a) => atomicActionCapability[a])),
    ].sort();
    return c.length === caps.length && c.every((x, i) => x === caps[i]);
  });
  return hit || "综合巡检任务";
};
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
/**
 * 采集方式 → 原子动作（任务指令集由"看什么"推导，不由业务类型推导）
 * @description 「怎么看」（PTZ / 补光 / 停留 / 避障）由 `Point.actionPlan` 承载，与"做什么动作"正交
 */
export const captureAction: Record<CaptureKind, AtomicAction> = {
  可见光: "拍照",
  红外: "采集红外热像",
  气体: "采集气体",
  声音: "录制声音",
};
export interface Task {
  id: string;
  name: string;
  source: string;
  planId?: string;
  planVersion?: number;
  /** 巡检路线（阶段⑦：任务"怎么到"） */
  routeId?: string;
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
  /** 巡检路线（阶段⑦） */
  routeId?: string;
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
/** 告警分类：业务场景（设备/工艺指标超限） vs 机器人本体异常（机器人自身故障/状态） */
export type AlarmCategory = "业务" | "机器人";

/** 告警分类清单（与「告警事件」页筛选、消息中心推送标签同源） */
export const ALARM_CATEGORIES: AlarmCategory[] = ["业务", "机器人"];

/** 告警分类说明：一眼区分两类告警的来源与典型子类 */
export const ALARM_CATEGORY_DESC: Record<AlarmCategory, string> = {
  业务: "设备/工艺指标超限：压力、阀门、温度、气体浓度等",
  机器人: "机器人本体异常：传感器、通信、定位、电量、急停、固件、里程保养等",
};

/** 告警分级处置机制：不同级别对应不同的处理流程与推送策略 */
export interface AlarmLevelPolicy {
  /** 是否自动派发处置工单 */
  autoWorkOrder: boolean;
  /** SLA 档位（影响工单 sla 阈值与超时升级） */
  sla: "紧急" | "高" | "普通";
  /** 推送人群 */
  notify: string;
  /** 是否需要现场确认（而非远程即可闭环） */
  onSiteConfirm: boolean;
  /** 一句话处置机制说明 */
  mechanism: string;
}

/**
 * 告警分级处置策略：级别决定"怎么处理"，分类决定"推给谁/归哪类"
 * @description 紧急=立即处置并升级；重要=限时派单；一般=批量复核；其他=仅记录不计入未关闭
 */
export const ALARM_LEVEL_HANDLING: Record<string, AlarmLevelPolicy> = {
  紧急: {
    autoWorkOrder: true,
    sla: "紧急",
    notify: "值班主管 + 现场班组",
    onSiteConfirm: true,
    mechanism: "立即处置：自动派单并升级，强制现场确认闭环",
  },
  重要: {
    autoWorkOrder: true,
    sla: "高",
    notify: "责任人 + 巡检管理员",
    onSiteConfirm: false,
    mechanism: "限时派单：推送责任人，可远程确认后现场复核",
  },
  一般: {
    autoWorkOrder: false,
    sla: "普通",
    notify: "巡检管理员",
    onSiteConfirm: false,
    mechanism: "提示类：进入批量复核队列，不强制派单",
  },
  其他: {
    autoWorkOrder: false,
    sla: "普通",
    notify: "系统",
    onSiteConfirm: false,
    mechanism: "记录类：已恢复/已关闭不计入未关闭统计",
  },
};

export interface Alarm {
  id: string;
  /** 告警分类：业务场景 / 机器人本体异常（新增维度，与级别正交） */
  category: AlarmCategory;
  /** 业务告警关联的原始结果（机器人本体异常通常无业务结果，故可选） */
  resultId?: string;
  /** 关联任务（机器人本体异常可能无关联任务，故可选） */
  taskId?: string;
  /** 关联业务点位（机器人本体异常无业务点位，改用 robotId，故可选） */
  pointId?: string;
  /** 关联机器人：机器人本体异常必填，业务告警可选（记录执行机） */
  robotId?: string;
  name: string;
  level: string;
  state: "待确认" | "处理中" | "待复查" | "已恢复" | "已关闭";
  notes: string[];
  /** 处置机制摘要（按级别自动推导，可覆盖；用于详情/推送展示"该怎么处理"） */
  handle?: string;
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
  /** 数据模型版本：1→2 工单/验收/接管/反馈/现场/资产集合；2→3 模板 state；5→6「地图→任务」链路集合 */
  schema: 6;
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
  /** ↓ 以下为「地图 → 巡检任务」链路改造新增（可选，兼容旧数据） */
  /** 设备主数据（阶段③） */
  devices?: DeviceAsset[];
  /** 区域（工厂树第一层：区域 → 设备 → 仪表） */
  areas?: Area[];
  /** 仪表（被巡检的资产对象，挂设备下） */
  instruments?: Instrument[];
  /** 巡检要求（模板库） */
  requirements?: Requirement[];
  /** 业务巡检目标（仪表 + 巡检要求 + 算法 + 阈值 + 判断标准） */
  businessTargets?: BusinessTarget[];
  /** 逻辑巡检点（阶段④） */
  logicalPoints?: LogicalPoint[];
  /** 巡检路线（阶段⑦） */
  routes?: Route[];
  /** 现场踩点记录（阶段①） */
  siteSurveys?: SiteSurvey[];
  /** 轨迹采样点（阶段①） */
  trackSamples?: TrackSample[];
  /** 试采回执（阶段⑤） */
  trialReceipts?: TrialReceipt[];
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
