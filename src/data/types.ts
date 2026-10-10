/**
 * @file types.ts
 * @description 全量数据模型类型 + 链路常量（stages / taskTypeActions / atomicActionCapability）；
 *              含「地图 → 巡检任务」链路新增类型（DeviceAsset/LogicalPoint/Route/TrialReceipt…）
 * @interaction 被 data 层（seed / engine / selectors / metrics / planSchedule…）与各页面组件消费
 */
import type { MapCalibration, PendingCalibration } from "./mapCalibration";
export type TaskStatus =
  | "待调度"
  | "已分配"
  | "下发中"
  | "待执行"
  | "执行中"
  /** 人工接管（借调）打断中的任务：由机器人申请 / 人工接管后进入，需显式「恢复任务」才回到执行中 */
  | "已被接管"
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
  /**
   * 来源地图 id（**仅作来源记录，非关键外键**，DATA-01）：
   * 地图删除 / 重传后巡检点仍可用，绑定关系以 targetId → Candidate 为准，
   * 权威坐标以统一坐标系 `world` 为准，不以本字段判别身份。
   */
  mapId: string;
  device: string;
  object: string;
  item: string;
  unit: string;
  kind: string;
  requirement: string;
  state: "待标注" | "待验证" | "已启用" | "待重新验证" | "停用";
  /** 地图内相对坐标（百分比，仅用于底图展示投影，非权威定位） */
  x: number;
  y: number;
  /**
   * 统一坐标系下的巡点位（DATA-01 权威定位）：全厂 XYZ（米）。
   * 多张分区地图（相对坐标系）统一到该坐标系后，才能做"全部巡检点"叠加、
   * 对接人员定位 / 市政地图，且地图删改不影响巡检点。
   */
  world?: { x: number; y: number; z: number };
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
  /** PT-02：标定用机器人 id（选在巡检点层面；位姿由"机器人 → 平台"上行抓取而来） */
  calibrateRobot?: string;
  /**
   * 巡检项（**多个巡检项组成一个巡检点**）
   * @description 有巡检项时：任务指令集（原子动作）与所需采集方式**以巡检项配置为准**，
   *              上面的 device / object / item / unit / kind 退化为"首个巡检项"的派生视图（兼容旧页面）
   */
  inspectItems?: InspectSpec[];
}
/**
 * 标定点来源
 * @description `地图导入` = 随地图文件带来的定位ID（外部ID，平台不改）；
 *              `平台新增` = 在「巡检点导入」面板里补录的点位
 */
export type MapPointSource = "地图导入" | "平台新增";

export interface Candidate {
  referenceImage?: { name: string; dataUrl: string; uploadedAt: string };
  id: string;
  kind: string;
  x: number;
  y: number;
  /** 统一坐标系坐标（米，全厂 XYZ）：由标定文件直接给 XYZ 或由底图坐标换算；演示环境按底图 1:1 */
  world?: { x: number; y: number; z: number };
  state: "待确认" | "已确认" | "已剔除";
  pointId?: string;
  /** 标定点来源（地图导入 / 平台新增） */
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
/**
 * 地图版本历史条目
 * @description 一次「定版 / 修订」= 一条，只记录**地图空间版本 V{n}**；
 *              点位标定数据有自己的版本 c{n}（见 mapCalibration.ts），不写进地图历史。
 */
export interface MapVersionLog {
  /** 空间版本 V{n} */
  version: number;
  /** 该版本发生了什么（中文，直接可读） */
  note: string;
  /** 定版 / 修订时间 */
  at: string;
}
/**
 * 地图（**纯点云**）
 * @description 地图只承载"机器人能走哪"：点云底图 + 采集批次元信息，
 *              **不含任何定位ID、巡检点与业务信息**（第一次扫描不可能已有巡检点）。
 *              巡检点标定数据独立存放在 `mapCalibration.ts` 的标定集合里，按 id 关联。
 */
export interface MapAsset {
  id: string;
  name: string;
  region: string;
  /** 空间版本 V{n}（界面展示口径）：底图 / 建图内容变更时自增（点位标定不改变本版本） */
  version: number;
  /**
   * 地图状态：`未发布`（内容未定版）/ `已发布`（已定版，可下发与引用）
   * @description 平台**不区分试验版 / 正式版**：下发时会自动把当前内容定版为「已发布」
   */
  state: "未发布" | "已发布";
  source: string;
  batch: string;
  cloud: string;
  video: string;
  file: string;
  checksum: string;
  /** 版本历史：**最新在前**（V{n} 一次定版 / 修订 = 一条） */
  history: MapVersionLog[];
  /** 坐标系标定（阶段②，原型可只存示意值） */
  frames?: MapFrames;
  /** 图层可用性/可见性（阶段②） */
  layers?: MapLayerFlags;
  /** 设备清单版本（阶段⑧，与空间版本 V 并列的第三类版本） */
  deviceListVersion?: number;
  /** 底图（用户上传的地图图片 dataUrl）；有底图即可在图上标注点位 */
  image?: string;
  /** 最近更新时间（建图 / 修订 / 定版 / 下发定版等变更时刷新，用于列表「更新时间」列） */
  updatedAt?: string;
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
 * @description **巡检项 = 巡检项名称 + 巡检目标台账 + 机器操作内容**；
 *              多个巡检项组成一个巡检点——机器人到点后**逐项执行**。
 *              机器操作内容 = 原子动作（做什么）+ 云台/视角参数（怎么看，可操作云台细化）
 */
export interface InspectSpec {
  id: string;
  /** 巡检项名称（如 压力读数 / 泵体滴漏） */
  name: string;
  /** 巡检目标台账 id（仪表 + 巡检要求 + 算法 + 阈值 + 判断标准） */
  targetId: string;
  /** 机器操作内容：原子动作集合 */
  actions: AtomicAction[];
  /** 机器操作参数：云台 / 观察方向 / 补光 / 升降 / 停留 / 避障 / 预置位（共享默认视角） */
  pose: PointActionPlan;
  /**
   * 逐项原子动作编排：按「上装（云台 / 相机 / 气体 / 声音）+ 动作模板」单独配置参数
   * @description 缺省不填时复用 `pose` 的共享视角；一旦为该动作单独配置，则以这里为准。
   *              参数来源分两种：`import` = 运维跑图时预设并导入；`manual` = 现场实测 / 监控操作录入。
   */
  actionConfigs?: Partial<Record<AtomicAction, AtomicActionConfig>>;
}

/**
 * 单项原子动作的参数编排
 * @description 与 `PointActionPlan` 同构，但显式记录「参数来源」：
 *              `import` 由现场踩点 / 试采回执预设导入；`manual` 由现场实测或操控台逐帧录入。
 */
export interface AtomicActionConfig {
  /**
   * 参数来源：
   * - import = 运维跑图预设 / Excel 导入；
   * - manual = 用户手动输入；
   * - cockpit = 通过操控台（云台/镜头/机器人移动）边调边看并自动记录。
   */
  source: "import" | "manual" | "cockpit";
  /** 导入来源说明（如 现场踩点 SS-xxx / 试采 TR-xxx / Excel 导入），manual / cockpit 时为空 */
  importRef?: string;
  ptz?: PTZ;
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
   * 镜头对焦距离（PT-03：常用上装参数提升为结构化字段，避免 key 名各写各的）。
   * @description 口径：以下上装参数均为**粗参考**，机器人到场后由本体本地算法微调对准。
   */
  focus?: number;
  /** 镜头光圈（F 值） */
  aperture?: number;
  /** PT-07：气体采集方式 —— 泵吸式（主动抽气，响应快）/ 扩散式（被动感应） */
  gasMode?: "泵吸式" | "扩散式";
  /** PT-07：气体传感器种类（如 4 种 / 6 种 / 具体气体组分） */
  sensorKind?: string;
  /** PT-07：红外测温发射率（0–1，材质相关） */
  emissivity?: number;
  /** PT-07：红外有效测温距离（米） */
  thermalDistance?: number;
  /** PT-07：声纹关注频段（如 20Hz–20kHz） */
  soundBand?: string;
  /** PT-07：AI 不安全行为识别的具体类别清单（见 BEHAVIOR_TYPES） */
  behaviorTypes?: string[];
  /**
   * 其它操控台额外记录项（机器人移动速度、辅助功能开关等，未结构化的部分）。
   * @description 上装能力差异大，先结构化常用项（focus / aperture / lift / light / 四类能力专属参数），其余用 key-value 兜底。
   */
  extra?: Record<string, string | number | boolean>;
}

/**
 * 上装分组：把原子动作按执行载荷归类，供「按上装选动作模板」展示
 * @description 一个上装对应一类机器人能力（可见光相机 / 红外相机 / 气体采集 / 声音采集）。
 */
// 能力分类按「采集方式 4 类」对齐（可见光 / 红外 / 气体 / 声音）；
// AI 不安全行为分析不是独立采集方式，而是「可见光 + 边缘 AI」的一个原子动作，归入可见光相机。
export const payloadGroups: { name: string; caption: string; actions: AtomicAction[] }[] = [
  { name: "可见光相机", caption: "拍照 / 录像 / AI 行为分析（可见光 + 边缘 AI）", actions: ["拍照", "录像片段", "分析不安全行为"] },
  { name: "红外相机", caption: "热成像采集（发射率 / 测温距离在动作参数里配置）", actions: ["采集红外热像"] },
  // PT-07：气体采集区分采集方式（泵吸式 / 扩散式）与传感器种类，在动作参数里配置
  { name: "气体采集", caption: "气体浓度采样（泵吸式 / 扩散式）", actions: ["采集气体"] },
  { name: "声音采集", caption: "现场声音录制 / 声纹（关注频段在动作参数里配置）", actions: ["录制声音"] },
];

/** AI 不安全行为识别的具体类别清单（动作参数多选） */
export const BEHAVIOR_TYPES = ["未戴安全帽", "人员闯入", "越界", "违规作业", "人员聚集"];

/**
 * 上装的一项采集能力：一种采集方式 + 该方式下支持的原子动作
 * @description 一个上装可覆盖**多种**采集方式（如可见光 + 红外一体云台），每类各自声明支持动作。
 *              动作归哪类采集由 `atomicActionCapability` 唯一决定，故同一能力组内动作必须同属该采集方式。
 */
export interface RobotPayloadAbility {
  /** 采集方式：与检测项 kind、机器人 capabilities 同口径 */
  kind: CaptureKind;
  /** 该采集方式下支持的动作：任务指令集据此推导（见 taskTypeOfActions） */
  actions: AtomicAction[];
}

/**
 * 机器人上装能力（后台管理 › 机器人上装能力）
 * @description 机器人本体可挂载的采集载荷**主数据**：一台机器人能干什么，取决于它装了哪些上装。
 *              上装 → N 组「采集方式（可见光 / 红外 / 气体 / 声音）→ 原子动作」→ 巡检项 / 任务指令集，
 *              因此这里是「机器人能力 → 可执行任务 → 派单校验」链路的唯一上游口径。
 *              与上装分组常量 `payloadGroups` 的区别：后者只是动作模板的归组展示（写死 4 类，不可维护），
 *              本实体是后台可维护的清单（一个上装可再定义多种采集方式 + 支持动作 / 适用机型 / 启停）。
 */
export interface RobotPayload {
  /** 上装编码（唯一身份，仅字母 / 数字 / 下划线 / 中划线） */
  id: string;
  name: string;
  /** 支持的采集能力组（至少 1 组）：一个上装可覆盖多种采集方式，不再只支持单一采集方式 */
  abilities: RobotPayloadAbility[];
  /** 适用机型：空数组 = 机型无关（通用上装） */
  models: DeviceType[];
  state: "启用" | "停用";
}

/** 算法部署位置：云端（平台算力）/ 本体（机器人本体算力） */
export const algoDeploys = ["云端", "本体"] as const;
export type AlgoDeploy = (typeof algoDeploys)[number];

/** 算法适配的检测类型（独立枚举，与巡检要求分类 / 采集方式解耦） */
export const algoKinds = [
  "读数识别",
  "红外测温",
  "缺陷识别",
  "气体检测",
  "声纹识别",
  "行为识别",
] as const;
export type AlgoKind = (typeof algoKinds)[number];

/**
 * 算法（AI 能力）配置 —— 后台管理 › 算法配置
 * @description 平台可用的 AI 算法清单：算法 ID / 名称 / 部署位置 / 适配检测类型 / 状态 / 更新时间。
 *              巡检要求与巡检目标台账的 `algorithm` 字段按**名称**引用本清单，
 *              因此列表里的「关联台账」= 引用该算法的目标台账条数；停用后不再作为新台账的可选项。
 *              `adapt` 为空的算法表示尚未配置检测类型适配（界面显示「待配置」）。
 */
export interface AlgoConfig {
  /** 算法 ID（平台侧唯一标识） */
  id: string;
  name: string;
  deploy: AlgoDeploy;
  /** 适配的检测类型：独立枚举 AlgoKind；空数组 = 待配置 */
  adapt: AlgoKind[];
  /** 平台侧同步的更新时间（展示用） */
  updatedAt: string;
  state: "启用" | "停用";
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

/**
 * 地图底图上传大小上限（单张）：超过则前端直接拒绝。
 * @description 底图以 dataUrl 形式存进状态并持久化到 localStorage，
 *              base64 后体积约为原图的 1.33 倍；2026-09-30 评审要求由 2 MB 放宽到 3 MB，
 *              再大容易撑爆 localStorage（写失败会静默降级为「仅内存」，刷新即丢）。
 */
export const MAP_IMAGE_MAX_SIZE = 3 * 1024 * 1024;

/** 采集方式（机器人能力口径；业务类型如"仪表/阀门"归设备主数据） */
export type CaptureKind = "可见光" | "红外" | "气体" | "声音";

/** 全部采集方式：导入校验与能力口径共用同一份名单 */
export const captureKinds: CaptureKind[] = ["可见光", "红外", "气体", "声音"];

/** 巡检项（阶段③：设备清单里的"巡检什么"） */
export interface InspectItem {
  id: string;
  /** 检测目标（如 P-50406A 油杯） */
  target: string;
  /**
   * 检测项分类
   * @description 仪表＝有形表计（可读数 / 有量纲，如出口压力表）；区域＝空间范围（罐壁 / 管廊 / 地面）。
   *              与巡检目标台账的 `targetKind` 同口径：检测项增删改后同步到台账，
   *              供「巡检目标台账」按装置 / 空间与区域归类。缺省按「仪表」处理。
   */
  targetKind?: "仪表" | "区域";
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

/* ── 工厂树与巡检目标台账（客户定稿模型）───────────────────────────────
   区域 → 设备 → 仪表；仪表只是资产，不能直接巡检；
   仪表 + 巡检要求 + 算法 + 阈值 + 判断标准 = 巡检目标台账（可执行的最小巡检单元） */

/** 区域（工厂树第一层） */
export interface Area {
  id: string;
  name: string;
}

/**
 * 仪表：实际被巡检的资产对象
 * @description 挂在设备下（单归属），本身只是资产，**不能直接巡检**；
 *              必须叠加「巡检要求」形成巡检目标台账后才可执行
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
export const requirementKinds = [
  "可见异常",
  "读数识别",
  "状态判别",
  "声音判别",
] as const;
export type RequirementKind = (typeof requirementKinds)[number];

/** 判定方式：这一类要求"怎么判" */
export type JudgeType = "数值范围" | "期望状态" | "有无目标" | "等级评分";

/** 巡检要求（模板库：看滴漏 / 看高温 / 看仪表读数 / 看外观破损 …） */
export interface Requirement {
  id: string;
  name: string;
  kind: RequirementKind;
  description: string;
  /**
   * 适用的目标类型（TGT-01 口径）
   * @description 仪表 = 有形表计（看读数 / 看阀位）；环境 / 区域 = 空间范围（气体 / 红外 / 声纹 / AI 行为 / 拍照）。
   *              台账抽屉按目标类型过滤巡检要求，避免把"看仪表读数"配到区域类目标上
   */
  targetKinds: ("仪表" | "环境" | "区域")[];
  /**
   * 默认采集方式（决定需要哪种机器人上装能力）
   * @description 仪表类目标用仪表自己的采集方式；环境 / 区域类目标没有仪表，采集方式由巡检要求给出
   */
  capture: CaptureKind;
  /**
   * 检测类型（匹配告警模板的口径，见 alarmTemplates.kindOfTarget）
   * @description 环境 / 区域类目标常常没有"有量纲的单位"（声纹、AI 行为），
   *              只按单位换算会猜成"阀门状态"；因此由巡检要求显式声明，留空 = 按台账单位换算
   */
  detectKind?: import("./alarmTemplates").ApplyKind;
  /** 背后的算法 / AI 表达方式（默认值，巡检目标台账可覆盖） */
  algorithm: string;
  /** 默认判定方式与阈值（可被巡检目标台账覆盖） */
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
  /** 版本号：每次保存自增（后台管理 › 巡检要求管理维护） */
  version?: number;
  /** 最近修改时间（展示用） */
  updatedAt?: string;
}

/**
 * 告警等级：一级（最严重，需立即处置）/ 二级（需关注）/ 三级（提示）
 * @description 与处置机制一一对应；AI 状态异常固定三级，风险信息异常按检测项风险等级
 */
export type AlarmLevel = "一级" | "二级" | "三级";
/** 告警等级清单（与告警页筛选、驾驶舱分级、消息推送标签同源） */
export const ALARM_LEVELS: AlarmLevel[] = ["一级", "二级", "三级"];
/** 告警等级说明：一眼看懂分级含义 */
export const ALARM_LEVEL_DESC: Record<AlarmLevel, string> = {
  一级: "需立即处置：可能造成停机 / 安全风险，同步通知值班主管",
  二级: "需关注：指标超限或有劣化趋势，按班次跟进处置",
  三级: "提示：识别异常 / 轻微超限，记录并纳入观察",
};
/**
 * 告警设置（**整个平台唯一的告警配置入口**，挂在巡检目标台账上）
 * @description 巡检点 / 点位不提供告警配置：巡检点的判定直接复用所绑业务目标的
 *              阈值（`judge/min/max/expected`）与这里的设置（等级 / 通知 / 引用模板）。
 *              **平台没有「告警开关」**：判定异常即告警；要停止判定只能关台账的「是否巡检」
 */
export interface BusinessAlarm {
  /**
   * 告警规则来源（台账「3、告警规则」选择）
   * @description 模板 = 选现有模板（触发条件 / 触发逻辑 / 等级 / 声光报警 / 处置流程由模板下发）；
   *              手动 = 手动输入（用台账自己的判定口径）。老数据缺省按"手动"处理
   */
  source?: "模板" | "手动";
  /** 告警等级：决定告警列表分级（一级 / 二级 / 三级） */
  level: AlarmLevel;
  /** 触发条件补充说明（手动来源时可写依据；模板来源时按模板回显） */
  trigger?: string;
  /** 通知对象（岗位 / 角色），随告警记录一并带出 */
  notify?: string[];
  /**
   * 关联的告警模板（后台管理 › 告警模板管理，source = 模板 时生效）
   * @description 选中后本目标的触发条件 / 触发逻辑 / 等级 / 声光报警 / 处置流程都按该模板走
   *              （一处维护、多点引用）；留空 = 按检测类型自动套用后台管理的启用模板
   */
  templateId?: string;
  /** 手动来源：触发逻辑（单次即触发 = 识别即触发 / 连续确认） */
  triggerMode?: "单次即触发" | "连续确认";
  /** 手动来源：连续确认次数（至少 2） */
  consecutive?: number;
  /** 手动来源：声光报警持续时长（秒），0 = 不启动 */
  alarmSeconds?: number;
  /** 手动来源：处置流程步骤（受理后按此逐条复检） */
  flow?: string[];
}

/**
 * 巡检目标台账 = 业务目标 + 业务要求 + 仪表 + 巡检要求 + 算法 + 阈值 + 判断标准 + 告警设置
 * @description 任务的最小执行单元：一个巡检点（地图上的业务执行点）可绑定多个巡检目标台账，
 *              任务执行到点后逐项展开
 */
export interface BusinessTarget {
  id: string;
  /**
   * 目标类型（TGT-01）：仪表类挂设备台账；环境 / 区域类**不强制关联设备**（如罐区气体、区域声纹、AI 不安全行为）。
   */
  targetKind?: "仪表" | "环境" | "区域";
  /** 外键 → Instrument（仪表）；环境 / 区域类目标可为空（TGT-01） */
  instrumentId?: string;
  /**
   * 区域 / 空间目标的参照物锚点（TGT-02）：如"3# 罐区北侧立柱"。
   * 区域目标必须有锚点，否则"泄漏发生在哪一段管道 / 哪个罐区"无法归因。
   */
  anchor?: string;
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

/** 设备主数据（阶段③：Excel/CSV/API 导入 → 直接生效） */
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
  /**
   * 设备启停：停用后，含该设备点位的任务创建 / 派单被拦截。
   * @description 替代旧口径 `extras.category === "equipment"`（种子里从无该类数据，该校验一直空转）
   */
  state?: "在用" | "停用";
  /** 所属厂区（清单里的厂区列）：指标按厂区裁剪时用；缺省时不参与裁剪 */
  region?: string;
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

/**
 * 跨图切换点（**地图拓扑**的一条边）
 * @description 机器狗一次只加载一张 SLAM 地图做局部定位，跨图巡检时必须在
 *              「来源地图的边界点」切换到「目标地图」，才能继续覆盖另一张图所属的那部分厂区；
 *              本实体即这条拓扑边：记录两端地图与各自的切换位置。
 * @interaction 由「资源与地图 › 空间管理」维护，引擎动作 MAP_SWITCH_ADD / _REMOVE / _STATE 写入
 */
export interface MapSwitchPoint {
  id: string;
  name: string;
  /** 来源地图 id */
  fromMapId: string;
  /** 目标地图 id */
  toMapId: string;
  /** 切换点在来源地图上的位置（**底图百分比**，来源图的局部界线） */
  from: { x: number; y: number };
  /** 切换点在目标地图上的位置（**底图百分比**，进入目标图后的接驳位） */
  to: { x: number; y: number };
  state: "启用" | "停用";
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
  /** 已同步的空间版本 V{n} */
  mapVersion: number;
  current?: string;
  x: number;
  y: number;
  /** 姿态动作（站立 / 蹲下），用于大屏远程指令演示 */
  posture?: string;
  /** 机型：机器狗 / 四轮车 / 挂轨 */
  deviceType: DeviceType;
  /** 机型特有约束 */
  constraints: DeviceConstraints;
  /** 健康度评分 0-100（电池衰减 / 故障率 / 里程综合） */
  health: number;
  /** 固件版本 */
  firmware: string;
}
/**
 * 任务快照：继承 `Point`（含统一坐标系 `world`）；任务下发时以 `world` 为巡检点权威坐标，
 * 底图百分比 `x/y` 仅作回退展示。
 */
export interface Snapshot extends Point {
  mapVersion: number;
  /**
   * 创建任务时推导出的到位原子动作列表（快照：不随后续设备主数据 / 采集方式变更而变）
   * @description 一个停靠位可覆盖多个检测目标，故为列表（如同时"拍照"+"采集红外热像"）
   */
  actions?: AtomicAction[];
}
export type TaskType =
  "光学任务" | "红外任务" | "气体采集任务" | "声音采集任务" | "综合巡检任务";
export type AtomicAction =
  | "拍照"
  | "录像片段"
  | "采集红外热像"
  | "采集气体"
  | "录制声音"
  /** PT-07：AI 不安全行为分析（未戴安全帽 / 人员闯入 / 越界等），基于可见光 + 边缘 AI */
  | "分析不安全行为";
/** 全部原子动作：巡检项「机器操作内容」的选择范围（与任务指令集同一份名单） */
export const atomicActions: AtomicAction[] = [
  "拍照",
  "录像片段",
  "采集红外热像",
  "采集气体",
  "录制声音",
  "分析不安全行为",
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
  分析不安全行为: "可见光",
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
  taskType: TaskType;
  atomicActions: AtomicAction[];
  state: TaskStatus;
  robotId?: string;
  mapId: string;
  mapVersion: number;
  items: Snapshot[];
  stage: number;
  index: number;
  done: string[];
  skipped: string[];
  failure?: string;
  retries: number;
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
  /** 风险信息：按检测项规则判定的风险（true = 风险异常） */
  abnormal: boolean;
  /** AI 状态：识别是否给出可用结论（true = AI 状态异常，如识别结果为空 / 无有效读数） */
  aiAbnormal?: boolean;
  status: string;
  /** 未做判定的原因（规则未配置 / 识别无效时记录，供用户判断是否可信），可选 */
  triggerReason?: string;
  source: string;
  confidence: number;
  time: string;
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

/** 复检步骤：受理后按引用模板的处置流程逐条反馈 */
export interface VerifyStep {
  /** 步骤文字（受理时按当时引用的模板落库，模板后续修改不影响在办的复检） */
  text: string;
  /** 是否已完成 */
  done: boolean;
  /** 完成时间 */
  at?: string;
}
/**
 * 反馈（复检）流程
 * @description 只有「受理」的告警进入：处置流程（引用自告警模板）逐条回馈是否完成，
 *              全部完成即有效闭环；未闭环超过 30 天自动判定为无效闭环（口径见 selectors.verifyStateOf）
 */
export interface VerifyFlow {
  /** 进入复检的时间（= 受理时间） */
  startedAt: string;
  /** 处置流程步骤清单 */
  steps: VerifyStep[];
  /** 复检结论：待反馈 / 有效闭环 / 无效闭环 */
  state: "待反馈" | "有效闭环" | "无效闭环";
  /** 闭环时间 */
  closedAt?: string;
  /** 闭环说明 / 依据 */
  note?: string;
}
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
  /** 告警等级：一级 / 二级 / 三级 */
  level: AlarmLevel;
  state: "待确认" | "处理中" | "待复查" | "已恢复" | "已关闭";
  notes: string[];
  /** ALM-05 处理时间：人工提交处理时写入；为空表示未处理，非空后不允许二次编辑 */
  handledAt?: string;
  /** ALM-05 处理结果：受理（转现场处置）/ 忽略（记录后不处置） */
  handleResult?: "受理" | "忽略";
  /** ALM-05 处理说明 / 依据（与 notes 里的处理留痕同源，供处理情况表单直接回显） */
  handleNote?: string;
  /** ALM-05 是否误报：人工判定，用于统计报警准确率（准确率 = 已处理中非误报占比） */
  falsePositive?: boolean;
  /** 反馈（复检）流程：仅「受理」的告警进入（「忽略」= 不处置，不需要复检） */
  verify?: VerifyFlow;
  /** 处置机制摘要（按级别自动推导，可覆盖） */
  handle?: string;
  time: string;
}
export interface Sync {
  id: string;
  mapId: string;
  robotId: string;
  mapVersion: number;
  state: "传输中" | "校验中" | "待激活" | "已同步" | "失败";
  /** 下发登记时间（用于「每个版本 × 每台机器」的下发记录展示） */
  at?: string;
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
}
export interface Session {
  startedAt?: string;
  releasedAt?: string;
  resumedAt?: string;
  id: string;
  robotId: string;
  taskId?: string;
  /**
   * TKO-01：接管来源 —— 「人工主动」= 人从接管页主动切入；「机器人申请」= 机器人自主处理超时后申请人介入。
   */
  origin?: "人工主动" | "机器人申请";
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
  /**
   * 告警模板（后台管理 › 告警模板管理）
   * @description 名称 + 触发条件 + 触发逻辑 + 声光报警 + 默认等级 + 处理流程；
   *              原「告警规则库」已并入本集合（规则库的级别 / 类型 / 阈值 / 触发条件都是模板已有字段）
   */
  alarmTemplates?: import("./alarmTemplates").AlarmTemplate[];
  fieldDevices?: Record<string, import("./fieldControl").FieldState>;
  /**
   * 数据模型版本：1→2 接管/反馈/现场/资产集合；2→3 模板 state；5→6「地图→任务」链路集合；
   * 6→7 告警处理口径（validity「有效 / 无效」→ handledAt / handleResult / falsePositive）
   */
  schema: 7;
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
  /** 巡检目标台账（仪表 + 巡检要求 + 算法 + 阈值 + 判断标准） */
  businessTargets?: BusinessTarget[];
  /** 机器人上装能力主数据（后台管理 › 机器人上装能力） */
  robotPayloads?: RobotPayload[];
  /** 算法（AI 能力）清单（后台管理 › 算法模板管理） */
  algoConfigs?: AlgoConfig[];
  /** 逻辑巡检点（阶段④） */
  logicalPoints?: LogicalPoint[];
  /** 巡检路线（阶段⑦） */
  routes?: Route[];
  /** 跨图切换点（空间管理 › 地图拓扑）：每张碎片地图之间的切换位置 */
  mapSwitchPoints?: MapSwitchPoint[];
  /** 现场踩点记录（阶段①） */
  siteSurveys?: SiteSurvey[];
  /** 轨迹采样点（阶段①） */
  trackSamples?: TrackSample[];
  /** 试采回执（阶段⑤） */
  trialReceipts?: TrialReceipt[];
  /**
   * 巡检点标定文件（**独立模块，与地图分开放**）：
   * 地图是纯点云、不含任何点位；采集时产出的「巡检点标定文件」解析后落在这里，按 mapId 关联。
   * @see mapCalibration.ts
   */
  mapCalibrations?: MapCalibration[];
  /**
   * 待绑定的标定文件（暂存）：允许**先导入标定文件**，待点云地图就绪后再选地图绑定
   * @description 绑定前这些定位点不参与任何业务，也不会自动生成平台巡检点
   */
  pendingCalibration?: PendingCalibration;
  /** 当前演示角色 ID，用于角色切换器（原型阶段代替真实登录） */
  roleId: string;
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
