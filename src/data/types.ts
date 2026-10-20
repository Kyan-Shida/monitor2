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
  /**
   * 巡检点状态：只有两态 —— 已启用（验证通过、可下发）/ 停用（未启用或验证未通过）
   * @description 原「待标注 / 待验证 / 待重新验证」属过渡态，已收敛：保存 / 标注 / 验证失败 /
   *              变更确认一律落「停用」，人工「启用」或自主验证通过后转「已启用」
   */
  state: "已启用" | "停用";
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
  /** 点类型（标定工作台：停靠点 / 充电点 / 待机点 / 观察点） */
  pointType?: string;
  /** 楼层设置（标定工作台） */
  floor?: number;
  /** 楼层连接点（标定工作台） */
  floorLink?: number;
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
   * 同步状态：`未同步`（当前版本尚未下发给所有引用它的机器人）/
   *           `已同步`（当前版本已下发给所有引用它的机器人）
   * @description 平台**不区分试验版 / 正式版**：下发时即把当前内容定版，「已同步」表示机器人端都用上了最新版
   */
  syncState: "未同步" | "已同步";
  /**
   * 逻辑启停：与派生的 `syncState` 解耦，用于人工停用某张地图
   * @description 停用后该地图不再允许用于导航 / 任务下发；默认「启用」
   */
  status?: "启用" | "停用";
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
  /** 路网（标定工作台：人工在像素地图上打点、连线形成的路线） */
  roadnet?: Roadnet;
}

/**
 * 路网线（标定工作台「元素浏览 › 线 / 弧」）
 * @description 把已打的点连成路线：直线取 2 点，弧取 ≥ 3 点按序连线
 */
export interface RoadnetPath {
  id: string;
  name: string;
  kind: "直线" | "弧";
  /** 依次经过的点 id（首尾即「起点 ID / 终点 ID」） */
  pointIds: string[];
  /** 高级参数（速度 / 避障 / 道路等，在标定工作台可改） */
  props?: RoadnetPathProps;
}

/** 路网线的高级参数（缺省值见 `DEFAULT_PATH_PROPS`，与参考设计一致） */
export interface RoadnetPathProps {
  /** 障碍物检测 */
  avoidObstacle: boolean;
  /** 楼层设置 */
  floor: number;
  /** 最大角速度 */
  maxAngularSpeed: number;
  /** 最小角速度 */
  minAngularSpeed: number;
  /** 最大前进速度 */
  maxForwardSpeed: number;
  /** 最小前进速度 */
  minForwardSpeed: number;
  /** 最大后退速度 */
  maxBackwardSpeed: number;
  /** 最小后退速度 */
  minBackwardSpeed: number;
  /** 避障模式：停障 / 绕障 */
  avoidMode: string;
  /** 宽窄道设置：宽道 / 窄道 */
  widthMode: string;
  /** 道路选择：正常路面 / 坡道 */
  roadType: string;
  /** 起点到终点：前进 / 后退 */
  forwardDir: string;
  /** 终点到起点：前进 / 后退 */
  backwardDir: string;
}

/** 线 / 弧高级参数缺省值 */
export const DEFAULT_PATH_PROPS: RoadnetPathProps = {
  avoidObstacle: true,
  floor: 0,
  maxAngularSpeed: 0.6,
  minAngularSpeed: 0,
  maxForwardSpeed: 0.6,
  minForwardSpeed: 0.1,
  maxBackwardSpeed: 0.3,
  minBackwardSpeed: 0.1,
  avoidMode: "停障",
  widthMode: "宽道",
  roadType: "正常路面",
  forwardDir: "前进",
  backwardDir: "前进",
};

/**
 * 地图路网：线 / 弧
 * @description 标定工作台的「点」= 该图的**定位点**（`mapCalibrations.targets`，与现场采集同源），
 *              故路网只存线 / 弧；线的两端用定位点 id 引用，保证"地图上的点"全平台只有一份
 */
export interface Roadnet {
  paths: RoadnetPath[];
}

/**
 * 地图数据包（机器人扫描回传的原始产物，**还不是地图**）
 * @description 「新增地图」由在线机器人扫描并回传数据包；数据包在地图列表中以卡片展示，
 *              经「编辑」（命名 / 定区域）后才落为正式地图（`MapAsset`）
 */
export interface MapPacket {
  id: string;
  /** 数据包名称（未编辑前为占位名，如 `地图信息-01-R01`） */
  name: string;
  /** 采集机器人 */
  robotId: string;
  /** 接收完成时间 */
  at: string;
  /** 点云预览（缺省用示例底图） */
  image?: string;
  /** 来源说明 */
  source: string;
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
  /**
   * 能力项清单（机器操作内容的来源）：每项 = 一个能力参数 + 其特有配置
   * @description `actions` 由能力推导（见 `atomicActionOfAbility`），仍作为任务指令集与
   *              参数编排（`actionConfigs`）的键。
   */
  abilities?: InspectAbility[];
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
   * 移动后坐标（控制机器人移动后记录的平台坐标，米）
   * @description 巡检项保存时一并落库：机器人先走到 / 挪到这个位置，再做云台与镜头动作
   */
  at?: { x: number; y: number; z: number };
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

/**
 * 机器人能力（后台管理 › 机器人能力）：**两级清单** —— 能力类型 → 能力参数
 * @description 巡检项的「能力项」从能力参数里选（见 `InspectAbility`）：
 *              一条能力 = 一个能力参数 + 该参数特有的配置项（见 `abilityFields`）；
 *              能力参数 → 原子动作的换算见 `atomicActionOfAbility`（任务指令集据此生成）。
 */
export interface RobotAbilityParam {
  id: string;
  /** 能力参数名（如 红外识别 / 高清识别 / 声纹采集） */
  name: string;
  /** 适用机型（留空 = 不限） */
  models?: DeviceType[];
  /** 启停（缺省 = 启用）：停用后不再作为巡检项能力项的可选项 */
  state?: "启用" | "停用";
}
export interface RobotAbilityKind {
  id: string;
  /** 能力类型（父级，如 表计识别能力 / 充电房能力） */
  name: string;
  /** 该类型下的能力参数（子级） */
  params: RobotAbilityParam[];
}

/** 能力项的附加配置项形态：开关 / 数字（带查询与设置）/ 只挂一个动作按钮 */
export type AbilityFieldControl = "switch" | "number" | "action";
/** 能力项的一个附加配置项（不同能力要配的东西不一样） */
export interface AbilityField {
  key: string;
  label: string;
  control: AbilityFieldControl;
  unit?: string;
  /** `control = action` 时的按钮文案（原型里点一下即记录） */
  action?: string;
}

/**
 * 能力参数 → 附加配置项
 * @description 例：红外识别配「拍照纠正 / 云台复位 / 红外补偿距离 / 红外识别区域」；
 *              可见光实况识别配「云台复位 / 持续时长」。未列出的能力没有额外配置项。
 */
export const abilityFields: Record<string, AbilityField[]> = {
  红外识别: [
    { key: "photoCorrect", label: "拍照纠正", control: "switch" },
    { key: "ptzReset", label: "云台复位", control: "switch" },
    { key: "irOffsetCm", label: "红外补偿距离", control: "number", unit: "cm" },
    {
      key: "region",
      label: "红外识别区域",
      control: "action",
      action: "红外识别区域",
    },
  ],
  可见光实况识别: [
    { key: "ptzReset", label: "云台复位", control: "switch" },
    { key: "durationSec", label: "持续时长", control: "number", unit: "s" },
  ],
  高清识别: [
    { key: "photoCorrect", label: "拍照纠正", control: "switch" },
    { key: "ptzReset", label: "云台复位", control: "switch" },
  ],
  "视频片段识别(4s)": [
    { key: "ptzReset", label: "云台复位", control: "switch" },
    { key: "durationSec", label: "持续时长", control: "number", unit: "s" },
  ],
  声纹采集: [
    { key: "ptzReset", label: "云台复位", control: "switch" },
    { key: "durationSec", label: "采集时长", control: "number", unit: "s" },
  ],
  局部放电检测: [
    { key: "ptzReset", label: "云台复位", control: "switch" },
    { key: "sensitivity", label: "灵敏度", control: "number", unit: "%" },
  ],
  声学成像泄漏检测: [
    { key: "ptzReset", label: "云台复位", control: "switch" },
    { key: "gain", label: "增益", control: "number" },
  ],
  甲烷遥测: [
    { key: "ptzReset", label: "云台复位", control: "switch" },
    { key: "distanceM", label: "遥测距离", control: "number", unit: "m" },
  ],
};

/**
 * 能力参数 → 原子动作
 * @description 巡检项的动作集合由所选能力推导（任务类型 / 指令集据此生成）；
 *              没有对应动作的能力（如「充电桩上电」）只记录配置，不产生采集动作。
 */
export const atomicActionOfAbility: Record<string, AtomicAction> = {
  红外识别: "采集红外热像",
  高清识别: "拍照",
  可见光实况识别: "拍照",
  "视频片段识别(4s)": "录像片段",
  "视频片段识别(15s)": "录像片段",
  "视频片段识别(30s)": "录像片段",
  声纹采集: "录制声音",
  局部放电检测: "录制声音",
  声学成像泄漏检测: "采集气体",
  甲烷遥测: "采集气体",
};

/**
 * 巡检项的一项能力（机器操作内容的来源）
 * @description 能力参数取自「后台管理 › 机器人能力」；`fields` 存该能力特有的配置值
 *              （键见 `abilityFields[param]`）。
 */
export interface InspectAbility {
  id: string;
  /** 能力参数名 */
  param: string;
  /** 该能力特有的配置值 */
  fields: Record<string, number | boolean | string>;
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

/**
 * 算法数据库（平台侧）
 * @description 「后台管理 › 算法」**不手写算法**：厂区只从这份平台库里**勾选启用**，
 *              启用结果写进 `State.algoConfigs`（列表展示的就是厂区已勾选的那批）。
 *              库条目由平台侧同步维护，页面只读。
 */
export const ALGO_LIBRARY: AlgoConfig[] = [
  { id: "ALG-01", name: "表计读数识别 v1.2", deploy: "云端", adapt: ["读数识别"], updatedAt: "2026-01-27 22:42:05", state: "启用" },
  { id: "ALG-02", name: "红外热像温升分析 v1.3", deploy: "本体", adapt: ["红外测温"], updatedAt: "2026-01-22 09:15:31", state: "启用" },
  { id: "ALG-03", name: "红外热像区域测温", deploy: "本体", adapt: ["红外测温"], updatedAt: "2026-01-18 14:03:12", state: "启用" },
  { id: "ALG-04", name: "气体浓度判读 v1.1", deploy: "云端", adapt: ["气体检测"], updatedAt: "2026-01-15 10:21:48", state: "启用" },
  { id: "ALG-05", name: "阀位 / 开关状态判别 v1.4", deploy: "云端", adapt: ["读数识别"], updatedAt: "2026-01-12 16:58:20", state: "启用" },
  { id: "ALG-06", name: "液滴 / 油渍分割 v2", deploy: "云端", adapt: ["缺陷识别"], updatedAt: "2026-01-09 11:07:33", state: "启用" },
  { id: "ALG-07", name: "外观缺陷检测 v1.0", deploy: "云端", adapt: ["缺陷识别"], updatedAt: "2026-01-06 08:44:02", state: "启用" },
  { id: "ALG-08", name: "设备异响识别 v0.9", deploy: "本体", adapt: ["声纹识别"], updatedAt: "2025-12-28 19:12:57", state: "启用" },
  { id: "ALG-09", name: "多模态融合识别", deploy: "云端", adapt: [], updatedAt: "2025-12-25 13:30:11", state: "启用" },
  { id: "ALG-10", name: "局部放电识别 v1.0", deploy: "本体", adapt: ["声纹识别"], updatedAt: "2026-02-02 09:12:40", state: "启用" },
  { id: "ALG-11", name: "液位读数识别 v1.2", deploy: "云端", adapt: ["读数识别"], updatedAt: "2026-02-01 15:36:22", state: "启用" },
  { id: "ALG-12", name: "渗漏 / 跑冒滴漏识别 v1.1", deploy: "本体", adapt: ["缺陷识别"], updatedAt: "2026-01-30 10:05:18", state: "启用" },
  { id: "ALG-13", name: "红外温差趋势分析 v1.1", deploy: "云端", adapt: ["红外测温"], updatedAt: "2026-01-29 17:41:09", state: "启用" },
  { id: "ALG-14", name: "人员聚集识别 v1.0", deploy: "本体", adapt: ["行为识别"], updatedAt: "2026-01-26 08:22:45", state: "启用" },
  { id: "ALG-15", name: "甲烷遥测反演 v0.8", deploy: "云端", adapt: ["气体检测"], updatedAt: "2026-01-24 20:14:03", state: "启用" },
];

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
  /** 移动后坐标（控制机器人移动后记录的平台坐标，米）：巡检项保存时一并落库 */
  at?: { x: number; y: number; z: number };
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

/**
 * 检测项分类建议项（界面按此给下拉建议，允许手填）
 * @description 常见仪表分类 + 环境类：分类只表达"看的是什么量"，
 *              不作白名单校验，用户可填清单外的值
 */
export const itemCategories = [
  "压力",
  "温度",
  "液位",
  "流量",
  "阀位",
  "气体浓度",
  "环境",
  "外观",
];

/** 巡检项（阶段③：设备清单里的"巡检什么"） */
export interface InspectItem {
  id: string;
  /** 检测目标（如 P-50406A 油杯） */
  target: string;
  /**
   * 检测项分类
   * @description 仪表＝有形表计（可读数 / 有量纲，如出口压力表）；区域＝空间范围（罐壁 / 管廊 / 地面）。
   *              与巡检目标台账的 `targetKind` 同口径：检测项增删改后同步到台账，
   *              供「巡检目标台账」按设备形态（实体设备 / 虚拟设备）归类。缺省按「仪表」处理。
   */
  targetKind?: "仪表" | "区域";
  /**
   * 检测项分类（界面口径：压力 / 温度 / 阀位 / 环境 …）
   * @description 与「类型」（实体 / 虚拟）并列的第二维度：类型说有没有实体形态，
   *              分类说看的是什么量。下拉给常见项、允许手填，界面按 itemCategories 建议。
   */
  category?: string;
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

/** 区域树固定根 id：全厂区（内置、不可删除 / 改名），所有区域最终挂在它下面 */
export const ROOT_AREA_ID = "AREA-ROOT";
/** 固定根显示名 */
export const ROOT_AREA_NAME = "全厂区";

/** 区域（工厂树节点，根节点为固定的「全厂区」AREA-ROOT） */
export interface Area {
  id: string;
  name: string;
  /** 父级区域（可选）：区域支持多级树，根区域不设父级 */
  parentId?: string;
  /** 区域负责人（非必填，从推送人员里选） */
  owner?: string;
  /** 管理部门（非必填，从推送人员所属部门里选） */
  department?: string;
  /**
   * 区域范围轮廓（**全厂区 2D 底图**百分比坐标，≥3 个顶点的闭合多边形）
   * @description 未绘制时为 undefined；仅保存**已闭合**的顶点，编辑时回显并在地图上展示
   */
  polygon?: { x: number; y: number }[];
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

/**
 * 检测类型：这条要求 / 这个目标的检测项属于哪一类
 * @description 由巡检要求显式声明；老数据缺失时可按单位换算兜底（见 alarmRules.kindOfUnit）
 */
export const APPLY_KINDS = [
  "压力",
  "温度",
  "气体浓度",
  "阀门状态",
  "位移",
  "液位",
  "声纹",
  "不安全行为",
  "外观",
] as const;
export type ApplyKind = (typeof APPLY_KINDS)[number];

/**
 * 算法模板（原「巡检要求」+「算法模板管理」两套主数据合并，界面口径统一叫「算法模板」）
 * @description 一条模板 = 看什么（`kind` 算法能力类型 / `judge` 判定方式）+ 怎么采（`capture` 默认采集方式）
 *              + 拿什么算（`algorithm`）+ 阈值口径（`unit` / `min` 下限含 / `max` 上限含）+ 部署位置与状态。
 *              巡检目标台账选模板即带出上述默认值；类型 `Requirement` 保留原有命名，减少对既有引用的改动。
 */
export interface Requirement {
  id: string;
  /** 算法模板编码（ALG-xx，必填且唯一） */
  code: string;
  name: string;
  kind: RequirementKind;
  /** 模板说明：适用场景 / 原理 / 注意事项（选填） */
  description: string;
  /**
   * 适用的目标类型（TGT-01 口径）
   * @description 仪表 = 有形表计（看读数 / 看阀位）；环境 / 区域 = 空间范围（气体 / 红外 / 声纹 / AI 行为 / 拍照）。
   *              台账按目标类型过滤算法模板，避免把"看仪表读数"配到区域类目标上
   */
  targetKinds: ("仪表" | "环境" | "区域")[];
  /**
   * 默认采集方式（决定需要哪种机器人上装能力）
   * @description 仪表类目标用仪表自己的采集方式；环境 / 区域类目标没有仪表，采集方式由算法模板给出
   */
  capture: CaptureKind;
  /**
   * 检测类型
   * @description 环境 / 区域类目标常常没有"有量纲的单位"（声纹、AI 行为），
   *              只按单位换算会猜成"阀门状态"；因此由算法模板显式声明，留空 = 按台账单位换算
   */
  detectKind?: ApplyKind;
  /** 算法：算这条模板看的东西用哪个 AI 能力（取自平台算法库 ALGO_LIBRARY） */
  algorithm: string;
  /** 默认判定方式与阈值 (可被巡检目标台账覆盖) */
  judge: JudgeType;
  unit?: string;
  min?: number;
  max?: number;
  expected?: string;
  /** 部署位置：云端 / 本体（沿用算法库口径） */
  deploy: AlgoDeploy;
  /** 状态：停用后不再出现在巡检目标台账的算法模板候选里 */
  state: "启用" | "停用";
  /** 默认采集与复核要求 */
  needPhoto?: boolean;
  needVideo?: boolean;
  needReview?: boolean;
  cycle?: string;
  /** 版本号：每次保存自增（后台管理 › 算法模板维护） */
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
 * 告警大类（告警管理 › 告警类别）
 * @description 业务预警 = 设备 / 环境类判定异常；机器人预警 = 机器人本体事件。
 *              与告警事件的分类（业务 / 机器人）同源，见 ALARM_MAIN_OF_CATEGORY
 */
export const ALARM_CLASS_MAINS = ["业务预警", "机器人预警"] as const;
export type AlarmClassMain = (typeof ALARM_CLASS_MAINS)[number];
/** 告警事件分类 → 告警大类：告警记录筛选与告警类别共用同一套口径 */
export const ALARM_MAIN_OF_CATEGORY: Record<string, AlarmClassMain> = {
  业务: "业务预警",
  机器人: "机器人预警",
};
/**
 * 告警类别（告警管理 › 告警类别）
 * @description 平台维护「告警分类名称 + 告警大类 + 是否启用」的主数据：
 *              启用的分类是「告警设置 › 告警类型」下拉与「告警记录 › 分类筛选」的数据源
 */
export interface AlarmClass {
  id: string;
  /** 分类名称（业务预警：环境安全 / 生产运行 / 人员与作业；机器人预警：下装 / 上装） */
  name: string;
  /** 告警大类：业务预警 / 机器人预警 */
  main: AlarmClassMain;
  /** 是否启用：停用后不再出现在告警设置的可选类型里 */
  enabled: boolean;
  updatedAt?: string;
}
/**
 * 告警项的「告警分类」（只属于告警项自身的两档枚举，与「告警类别」的大类无关）
 * @description 普通预警 = 数值 / 状态类判定（仪表读数、阀位等）；
 *              环境预警 = 环境识别类判定（气体、红外、声纹、AI 行为）
 */
export const ALARM_ITEM_KINDS = ["普通预警", "环境预警"] as const;
export type AlarmItemKind = (typeof ALARM_ITEM_KINDS)[number];

/**
 * 告警项（告警管理 › 告警设置 › 告警配置项）
 * @description 字段与巡检目标台账「3、告警规则」一致：一个告警设置可挂多条告警项，
 *              第一条与台账的判定口径（judge / min / max / expected）同源，双向同步
 */
export interface AlarmItem {
  id: string;
  /** 告警分类：普通预警 / 环境预警（按目标类型自动带出，可改） */
  category: AlarmItemKind;
  /** 环境识别分类：环境 / 区域类目标的识别细分（如 气体浓度 / 红外测温 / 声纹）；仪表类为空 */
  envKind?: string;
  /** 告警等级：一级 / 二级 / 三级 */
  level: AlarmLevel;
  /** 判断类型：数值范围 / 期望状态 */
  judge: JudgeType;
  /** 判断值：期望状态类使用（如 开启） */
  value?: string;
  /** 起始值：数值范围类的下限（含） */
  from?: number;
  /** 结束值：数值范围类的上限（含） */
  to?: number;
  unit?: string;
  /** 异常名称：触发后写入告警事件的异常名 */
  abnormalName: string;
  /** 声光报警持续时长（秒），0 = 不启动 */
  alarmSeconds: number;
  /**
   * 告警分类：引用「告警管理 › 告警类别」中启用的分类名称（如 生产运行 / 设备运行）
   * @description 每条告警项单独配；第一条（主告警项）的值同步到台账 `BusinessAlarm.category`
   */
  alarmClass?: string;
  /**
   * 触发逻辑（每条告警项单独配）
   * @description 识别即触发 = 本次识别到异常就告警；连续确认 = 连续命中 N 次才告警。
   *              第一条（主告警项）的值同步到台账 `BusinessAlarm.triggerMode / consecutive`
   */
  triggerMode?: "识别即触发" | "连续确认";
  /** 连续确认次数（≥2，仅 triggerMode = 连续确认 时生效） */
  consecutive?: number;
}
/**
 * 告警设置（挂在巡检目标台账上，一个台账一条）
 * @description 维护入口有两个且是**同一份数据**：巡检目标台账「告警设置」与
 *              「告警管理 › 告警设置」，改任一处另一处同步生效。
 *              巡检点 / 点位不提供告警配置：巡检点的判定直接复用所绑业务目标的
 *              阈值（`judge/min/max/expected`）与这里的设置（等级 / 通知 / 告警项）。
 *              `enabled` 是平台唯一的「告警开关」：停用后该台账只记录结果、不做判定。
 *              告警项全部手填，平台不再有「告警模板」概念（每条告警项自带判定口径）
 */
export interface BusinessAlarm {
  /** 告警等级：决定告警列表分级（一级 / 二级 / 三级） */
  level: AlarmLevel;
  /** 触发条件补充说明（可写判定依据） */
  trigger?: string;
  /** 通知对象（岗位 / 角色），随告警记录一并带出 */
  notify?: string[];
  /**
   * 触发逻辑（识别即触发 / 连续确认）
   * @description 按告警项单独配，此处只是**主项（第一条）的镜像**，保存时由主项派生（见 applyAlarmSetting）
   */
  triggerMode?: "识别即触发" | "连续确认";
  /** 连续确认次数（至少 2）：主项的镜像 */
  consecutive?: number;
  /** 手动来源：声光报警持续时长（秒），0 = 不启动 */
  alarmSeconds?: number;
  /**
   * 处置流程步骤
   * @description 配置侧已无填写入口；字段保留供既有数据与结果快照展示
   */
  flow?: string[];
  /**
   * ↓ 以下为「告警管理 › 告警设置」字段：与巡检目标台账共用同一个 alarm 对象（单数据源 = 天然同步）
   */
  /**
   * @deprecated 告警名称已废弃：名称统一由台账名称派生（见 alarmSettings.targetNameOf），
   *  老缓存里的残留值会在告警设置补齐时被清除
   */
  name?: string;
  /**
   * 告警大类：业务预警绑定台账；机器人预警是机器人本体事件，不绑台账
   * @description 在告警设置弹窗里选；选机器人预警时表单不再出现「关联台账」
   */
  main?: AlarmClassMain;
  /**
   * 告警分类：引用「告警类别」中启用的分类名称（如 生产运行）
   * @description 按告警项单独配，此处只是**主项（第一条）的镜像**；主项没选分类时保留原值
   */
  category?: string;
  /**
   * 告警开关（告警设置）：决定该台账的告警规则是否启用
   * @description 缺省 = 启用（兼容老数据）；停用后该台账只记录结果、不做异常判定，
   *              与台账的「是否巡检」是两个独立开关（后者控制是否进入任务）
   */
  enabled?: boolean;
  /** 告警项：一个台账只有一个告警设置，但可以有多个告警项（第一条与台账判定口径同源） */
  items?: AlarmItem[];
}

/**
 * 巡检目标台账 = 业务目标 + 业务要求 + 仪表 + 巡检要求 + 算法 + 阈值 + 判断标准 + 告警设置
 * @description 任务的最小执行单元：一个巡检点（地图上的业务执行点）可绑定多个巡检目标台账，
 *              任务执行到点后逐项展开
 */
export interface BusinessTarget {
  id: string;
  /**
   * 台账名称（可选）：留空时按现有规则派生（仪表名 → 锚点 → 业务目标），
   * 用于区分同一台仪表下的多条台账（如「V001 出口压力表 · 读数」「V001 出口压力表 · 阀位」）。
   * 列表展示、告警名称与异常名称的默认值都由这里派生，见 alarmSettings.targetNameOf
   */
  name?: string;
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
  /** 告警设置（入口：台账「告警规则」/「告警管理 › 告警设置」，同一份数据；巡检点不可配置告警） */
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

/** 设备形态：实体设备（有形装置，如储罐 / 泵 / 分析仪）/ 虚拟设备（区域 / 空间类目标载体，如管廊 / 罐区） */
export const deviceKinds = ["实体设备", "虚拟设备"] as const;
export type DeviceKind = (typeof deviceKinds)[number];

/** 设备主数据（阶段③：Excel/CSV/API 导入 → 直接生效） */
export interface DeviceAsset {
  /** 设备唯一编码（业务身份的唯一依据） */
  id: string;
  name: string;
  /** 设备类型（自由文本，如 储罐 / 管廊 / 分析仪） */
  type: string;
  /**
   * 设备形态（实体设备 / 虚拟设备）
   * @description 与 `type` 并列的第二维度：`type` 说"是什么装置"，本字段说"有没有实体形态"。
   *              缺省由 `type` 推导（见 deviceMaster.defaultDeviceKindOfType），
   *              新增设备 / 清单导入 / 老缓存回填三处共用同一口径。
   */
  deviceKind?: DeviceKind;
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
  /** 最近更新时间（建档 / 编辑 / 清单导入时刷新，用于台账「更新时间」列） */
  updatedAt?: string;
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

/**
 * 巡检路线（阶段⑦，地图侧视图）
 * @description 「路线管理」目录已下线，巡检路线统一由 `Template` 维护（带 `mapId` 父线与有序 `points`）；
 *              本类型保留给地图空间预览（MapSpatialPreview / MapCanvas）绘制路线图层
 */
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
  /** 机器人编号（SN）：出厂硬件序列号，与内部编码 id 一一对应 */
  sn?: string;
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
/**
 * 自建路线的路径锚点（底图百分比坐标，口径与 RoutePreview / MapImageCanvas 一致）
 * @description `pointId` 非空表示该锚点吸附到某个巡检点的定位点——只引用既有巡检点，
 *              不会新建或删除业务点位；机器狗按这条自绘线路行驶，不再沿父线路网寻路
 */
export interface RouteNode {
  x: number;
  y: number;
  pointId?: string;
  /**
   * 与前一个锚点之间是否按曲线连接
   * @description 画线工具的「直线 / 曲线」逐段落在锚点上：曲线段按中点垂直偏移生成控制点，
   *              机器狗实际走的就是这条平滑线；首个锚点该字段无意义
   */
  curve?: boolean;
}
/** 巡检路线方式：预设路线（沿已标定的固定路网自动寻路）/ 自建路线（自绘线路，须导航验证后方可启用） */
export const routeModes = ["预设路线", "自建路线"] as const;
export type RouteMode = (typeof routeModes)[number];
export interface Template {
  id: string;
  name: string;
  /**
   * 巡检点 id 序列：**顺序即机器狗的执行顺序**（子线按此顺序跑）
   * @description 路线就是这条有序数组，**不绑定地图**：地图只负责把点位与线路画出来，
   *              换版 / 重新标定 / 新增地图都不会改动或作废路线
   */
  points: string[];
  end: string;
  /** 路线状态：启用后计划方可引用；停用仅存档不参与生成 */
  state: "启用" | "停用";
  version: number;
  /** 路线方式：缺省视为「预设路线」（老数据兼容） */
  mode?: RouteMode;
  /** 自建线路的路径锚点（`mode="自建路线"` 时必填，至少 2 个） */
  path?: RouteNode[];
  /**
   * 导航验证：自建路线必须由机器人实跑一遍验证可行后才允许启用
   * @description 跟随父线的路线沿已验证路网行驶，缺省视为已通过
   */
  verified?: boolean;
  /** 验证机器人 / 验证时间（列表与详情展示用） */
  verifiedBy?: string;
  verifiedAt?: string;
  /** 最近一次保存时间（路线列表「更新时间」列；老数据缺省显示「—」） */
  updatedAt?: string;
}
/** 计划执行方式：周期任务（按「每月 / 每天 / 每小时」循环）/ 定时任务（指定日期时刻执行一次） */
export const planKinds = ["周期任务", "定时任务"] as const;
export type PlanKind = (typeof planKinds)[number];
/** 周期任务的执行周期：月 / 天 / 时三档，数组顺序即下拉顺序 */
export const planCycles = ["每月", "每天", "每小时"] as const;
export type PlanCycle = (typeof planCycles)[number];

export interface Plan {
  robotId?: string;
  /**
   * 执行方式
   * @description 与 `cycle` 并列的第二维度：`cycle` 说"多久一次"，本字段说"是否重复"。
   *              缺省按「周期任务」处理（老数据无该字段），统一口径见 planSchedule.planKindOf
   */
  kind?: PlanKind;
  generationError?: string;
  /** 巡检路线（阶段⑦） */
  routeId?: string;
  id: string;
  name: string;
  templateId: string;
  /** 执行周期（月 / 天 / 时） */
  cycle: PlanCycle;
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

export interface Alarm {
  id: string;
  /** 告警分类：业务场景 / 机器人本体异常（新增维度，与级别正交） */
  category: AlarmCategory;
  /**
   * 告警类别（分类名称）：业务告警由所属台账的告警设置派生（单一数据源，不在此重复填写）；
   * 机器人本体告警没有业务台账，无法派生，故在此显式指定（下装 / 上装）
   */
  alarmClass?: string;
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
  /** 处置机制摘要（按级别自动推导，可覆盖） */
  handle?: string;
  time: string;
}
/**
 * 告警推送人员（告警管理 › 告警推送）
 * @description 告警产生后按等级推送给对应人员：等级留空 = 接收全部等级；
 *              推送通道按登录名定位账号，短信按手机号下发
 */
export interface AlarmPushStaff {
  id: string;
  name: string;
  phone: string;
  /** 用户登录名（推送通道按登录名定位账号） */
  login: string;
  /** 所属部门 */
  dept: string;
  /** 接收的告警等级：可多选，空数组 = 全部等级 */
  levels: AlarmLevel[];
  /**
   * 绑定范围 · 区域：可多选，空数组 = 不限区域。
   * 与设备维度同时成立（各维度内多选取并集），见 alarmPush.pushStaffOfAlarm
   */
  areas?: string[];
  /** 绑定范围 · 设备：可多选，空数组 = 不限设备 */
  devices?: string[];
  /** 是否发送短信 */
  sms: boolean;
  /** 最后更新人（原型阶段取当前角色的人员姓名） */
  updatedBy?: string;
  updatedAt?: string;
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
  /** 参数类型（参数配置中心）：业务参数走单值，数据字典走键值对 */
  type?: "业务参数" | "数据字典";
  /** 数据字典的枚举项（键 = 存储值，值 = 显示名） */
  values?: { key: string; value: string }[];
}
/**
 * 租户（多租户演示级）
 * @description 省事版方案：一份数据一个租户 —— 切换租户即整份换数据（缓存键不同），
 *              不做行级隔离；切换在 store 层完成，页面无需感知。
 */
export interface Tenant {
  id: string;
  name: string;
  /** 编码前缀：给该租户的数据命名加标，便于演示隔离 */
  code: string;
  status: "启用" | "停用";
  /** 最后更新时间（租户管理列表展示） */
  updatedAt?: string;
}

export interface State {
  systemRules?: import("./alarmRules").SystemRules;
  alarmRules?: import("./alarmRules").AlarmRule[];
  /**
   * 告警类别（告警管理 › 告警类别）：分类名称 + 告警大类 + 是否启用
   * @description 启用的分类是「告警设置 › 告警类型」与「告警记录 › 分类筛选」的数据源
   */
  alarmClasses?: AlarmClass[];
  /** 告警推送人员（告警管理 › 告警推送）：按等级推送给对应人员的名单 */
  alarmPushStaff?: AlarmPushStaff[];
  fieldDevices?: Record<string, import("./fieldControl").FieldState>;
  /**
   * 数据模型版本：1→2 接管/反馈/现场/资产集合；2→3 模板 state；5→6「地图→任务」链路集合；
   * 6→7 告警处理口径（validity「有效 / 无效」→ handledAt / handleResult / falsePositive）；
   * 7→8 告警类别集合 + 台账告警设置（告警名称 / 类型 / 开关 / 多条告警项）；
   * 8→9 告警推送人员名单；9→10 告警项的「告警分类」改为两档枚举（普通预警 / 环境预警）
   */
  /** 租户清单（平台级，各租户一致） */
  tenants?: Tenant[];
  /** 当前租户 id：切换即换一份数据（缓存键 inspection-v14-prototype:<tenantId>） */
  tenantId?: string;
  schema: 12;
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
  /** 机器人能力主数据（后台管理 › 机器人能力）：两级 —— 能力类型 → 能力参数 */
  robotAbilities?: RobotAbilityKind[];
  /** 算法（AI 能力）清单（后台管理 › 算法模板管理） */
  algoConfigs?: AlgoConfig[];
  /** 逻辑巡检点（阶段④） */
  logicalPoints?: LogicalPoint[];
  /** 巡检路线（阶段⑦） */
  routes?: Route[];
  /** 跨图切换点（空间管理 › 地图拓扑）：每张碎片地图之间的切换位置 */
  mapSwitchPoints?: MapSwitchPoint[];
  /** 地图数据包（机器人扫描回传，尚未成为地图） */
  mapPackets?: MapPacket[];
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
