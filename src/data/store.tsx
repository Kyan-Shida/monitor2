import { useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { StoreContext as C } from "./storeContext";
import { advanceAutomation } from "./automation";
import { seed } from "./seed";
import { SAMPLE_MAP_IMAGE } from "./sampleMap";
import { publishStateOf, transition, type Action } from "./engine";
import { roleOf } from "./roles";
import { algoDeploys, algoKinds } from "./types";
import { defaultDeviceKindOfType, territoryOfDevice } from "./deviceMaster";
import { targetsOf } from "./mapCalibration";
import { withAlarmSetting } from "./alarmSettings";
import type {
  MapVersionLog,
  State,
  AlgoKind,
  RobotPayloadAbility,
  BusinessTarget,
} from "./types";
const KEY = "inspection-v14-prototype";
/** 当前数据模型版本，须与 types.ts 的 State.schema 一致 */
const SCHEMA = 10;
/**
 * 老缓存升级：schema 1 → 2 时补齐接管/反馈等新增集合，
 * 并按序回填机型、约束、健康度、固件字段、已激活的地图版本号，
 * 避免页面读到 undefined（版本号缺失会渲染出 `Vundefined`）；
 * schema 2 → 3 时补齐 Template.state（启用/停用），否则路线列表状态列会渲染出空徽标；
 * schema 5 → 6 时补齐「地图 → 巡检任务」链路新增集合（devices/logicalPoints/routes/…），
 * 老缓存缺这些集合时由 seed() 兜底合并，页面读不到 undefined
 * @param raw 本地缓存解析出的状态对象
 * @returns 当前版本状态；无法识别时返回 null，由调用方回落到 seed()
 */
export function migrate(raw: unknown): State | null {
  if (!raw || typeof raw !== "object") return null;
  const old = raw as Record<string, any>;
  if (old.schema === SCHEMA) return old as State;
  if ([1, 2, 3, 4, 5, 6, 7, 8, 9].includes(old.schema)) {
    const base = seed();
    const merged = { ...base, ...old, schema: SCHEMA } as State;
    // 告警处理口径 6→7：老缓存的告警带废弃的 validity 且缺处理时间，整体改用 seed
    // （告警在演示里是平台产生的数据，不涉及用户录入，直接换成新口径的一套最省事）
    if (
      (old.alarms as Record<string, unknown>[] | undefined)?.some(
        (a) => "validity" in a,
      )
    )
      merged.alarms = base.alarms;
    /**
     * 机器人逐台按序回填：老缓存的机器人可能缺机型 / 约束 / 固件，
     * 尤其缺 `mapVersion` 时页面会渲染出 `Vundefined`。
     * 先铺 seed 同序号那条、再盖上老缓存已有字段——只补缺，不覆盖用户数据
     */
    const oldRobots = (old.robots as any[]) || [];
    merged.robots = oldRobots.length
      ? oldRobots.map((r, i) => ({
          ...base.robots[i % base.robots.length],
          ...r,
        }))
      : base.robots;
    // Template 新增 state 字段：老缓存逐条回填默认值，保留用户已建路线
    merged.templates = (merged.templates || []).map((t: any) => ({
      ...t,
      state: t.state === "停用" ? "停用" : "启用",
    }));
    return merged;
  }
  return null;
}
/**
 * 老缓存补齐：schema 6 的缓存缺两类后加的数据，按需从 seed() 回填，
 * 保证「打开地图就有底图可标注」「打开设备主数据就有台账」。
 * @description 回填都不会覆盖用户的主动操作：
 *              - 底图：用户「清除底图」写入的是空串 `""`，不是 `undefined`；
 *              - 设备：仅在整份集合缺失时回填，用户删改过的集合不会被覆盖；
 *              - 统一坐标系：仅为缺 `world` 的巡检点 / 标定点补值（按底图 1:1，z=0）。
 * @param s 迁移后的状态
 * @returns 补全后的状态（无需补全时原样返回）
 */
/**
 * 老缓存的地图版本历史归一化：早期历史是字符串数组（`"V1 首次建图"`），
 * 迁移为结构化版本日志 `{ version, note, at }`；无法解析出时间的旧条目留空
 * @param raw 老历史数组
 * @returns 结构化版本日志（保持原顺序，最新在前）
 */
function normalizeHistory(raw: unknown): MapVersionLog[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((h, i) => {
    if (h && typeof h === "object") return h as MapVersionLog;
    const text = String(h ?? "");
    const mt = text.match(/^V?(\d+)\s*[·:：,，-]?\s*(.*)$/);
    return {
      version: mt ? Number(mt[1]) : Math.max(1, list.length - i),
      note: mt ? mt[2] || text : text,
      at: "",
    };
  });
}
/**
 * 老缓存（二级口径之前）的扁平告警类别 → 新二级口径的分类名映射
 * @description 只在迁移时用一次：命中任一旧名即认为该缓存还是老口径，
 *              类别主数据与台账的「告警类型」一并切到 seed 的新口径
 */
const LEGACY_ALARM_CLASS: Record<string, string> = {
  固定设备实时巡检: "生产运行",
  机器人定点巡检: "生产运行",
  机器人实时巡检: "生产运行",
  实时气体: "环境安全",
  环境红外巡检: "环境安全",
  机器人故障: "下装",
};
function withSeedDefaults(s: State): State {
  const needMapImage = s.maps?.some((m) => m.image === undefined);
  // 版本历史老缓存：仍是字符串数组时统一迁移为结构化版本日志
  const needHistoryNorm = s.maps?.some((m) =>
    (m.history as unknown[])?.some((h) => typeof h === "string"),
  );
  /**
   * 机器人版本字段：老缓存（含历史 schema 合并结果）可能缺 mapVersion，
   * 页面会渲染出 `Vundefined`；按 seed 顺序回填，只补缺、不覆盖已有值
   */
  const needRobotVersions = s.robots?.some(
    (r) => typeof r.mapVersion !== "number",
  );
  // 设备主数据 / 工厂树 / 巡检目标台账：老缓存缺任一项即整体回填（它们同源派生，必须成套）；
  // 设备仍带已删除的审核字段（reviewState）时属旧口径缓存，同样整体回填
  const devicesStale = s.devices?.some((d) =>
    Object.prototype.hasOwnProperty.call(d, "reviewState"),
  );
  const needDevices =
    !s.devices?.length ||
    !s.logicalPoints?.length ||
    !s.instruments?.length ||
    !s.businessTargets?.length ||
    !!devicesStale;
  /** 设备形态（实体设备 / 虚拟设备）：老缓存设备缺该字段，按设备类型回填，只补缺、不覆盖 */
  const needDeviceKind = !!s.devices?.some((d) => !d.deviceKind);
  /**
   * 巡检点状态收敛（只有 已启用 / 停用）：老缓存里的「待标注 / 待验证 / 待重新验证」
   * 属已下线的过渡态，统一归为「停用」
   */
  const needPointState = !!s.points?.some(
    (p) => p.state !== "已启用" && p.state !== "停用",
  );
  /**
   * 装置区归属修正（老缓存的历史错标）：装置区的点位与设备曾被记为「一期罐区」，
   * 会让跨区派单不再被拦截、覆盖率分母混入装置区目标。
   * 判定用「点位所属设备名 / 设备安装位置」前缀（不写死 id），修正为装置区地图 MAP-B01
   */
  const needZoneFix =
    !!s.points?.some((p) => p.mapId === "MAP-A03" && /^装置区/.test(p.device)) ||
    !!s.devices?.some(
      (d) => d.region === "一期罐区" && d.locationDesc.startsWith("装置区"),
    );
  /** 老缓存引用了不存在的地图（机器人 / 点位 / 轨道指向 MAP-B01，但 maps 里没有）：按 seed 补齐 */
  const needMaps = [
    ...(s.robots || []).map((r) => r.mapId),
    ...(s.points || []).map((p) => p.mapId),
    ...(s.railSections || []).map((x) => x.mapId),
  ]
    .filter(Boolean)
    .some((id) => !s.maps?.some((m) => m.id === id));
  /**
   * 路网失效段（点位归属修正的连带影响）：roadnet 里可能引用了**已不在本图**的定位点
   * （如装置区的 O107 / O110 随点位迁到 MAP-B01），这些段画不出来、表现为「父线断了」。
   * 逐段剔除失效点，剩余不足 2 点的整段移除
   */
  const needRoadnetFix = !!s.maps?.some((m) => {
    const ids = new Set(targetsOf(s, m.id).map((t) => t.id));
    return !!(m.roadnet?.paths || []).some((p) =>
      p.pointIds.some((id) => !ids.has(id)),
    );
  });
  // 地图状态是派生值（口径见 engine.publishStateOf）：老缓存存的是旧口径，载入时按机器 / 下发记录校正
  const needMapState = s.maps?.some((m) => m.state !== publishStateOf(s, m));
  /** 告警被清空过的老缓存：回填示例，否则工作台与「告警事件」是空表（只为演示可读性） */
  const needAlarms = !s.alarms?.length;
  // 巡检点标定数据是独立模块：老缓存里没有该集合时从 seed 回填（地图上不再挂点位）
  const needCalibrations = !s.mapCalibrations?.length;
  // 下发记录：老缓存（schema 6 早期）没有该集合，会渲染出「0 条」空表；缺失时从 seed 回填
  const needSyncs = !s.syncs?.length;
  // 机器人上装能力：老缓存没有该主数据，缺失时从 seed 回填，否则后台配置页是空表
  const needPayloads = !s.robotPayloads?.length;
  // 老缓存的上装是「单一采集方式（kind / actions）」旧口径，缺 abilities 时按旧字段迁移为多采集能力组
  const needPayloadMigrate = !!s.robotPayloads?.some(
    (p) => !Array.isArray((p as { abilities?: unknown }).abilities),
  );
  // 算法（AI 能力）清单：老缓存没有该主数据，缺失时从 seed 回填，否则「算法模板管理」页是空表
  const needAlgos = !s.algoConfigs?.length;
  // 告警模板（告警管理 › 告警模板管理）：老缓存没有该集合时从 seed 回填，
  // 否则后台配置页是空表，且点位规则会失去模板引用（原「规则库」已并入模板集合）
  const needAlarmTemplates = !s.alarmTemplates?.length;
  // 算法口径收敛（部署位置 / 适配类型）：老缓存里的「边缘 / 本地」与旧巡检要求分类统一归一
  const needAlgoNorm = !!s.algoConfigs?.some(
    (a) =>
      !algoDeploys.includes(a.deploy) ||
      a.adapt.some((x) => !algoKinds.includes(x as AlgoKind)),
  );
  /**
   * 统一坐标系回填（DATA-01）：老缓存的巡检点 / 标定点没有 `world`，
   * 巡检点列表会显示「未写入统一坐标」、任务快照也缺权威坐标。
   * 演示口径按底图 1:1（z=0）由底图坐标 x/y 回填，只补缺、不覆盖已有值。
   */
  const needWorld =
    s.points?.some((p) => !p.world) ||
    s.mapCalibrations?.some((c) => c.targets?.some((t) => !t.world));
  /**
   * 区域主数据：老缓存里是空的，或只剩早期派生出来的占位「未分区」，
   * 一律用 seed 的正式区域清单（一期罐区 / 装置区）覆盖，避免后台管理区域配置为空。
   */
  const areasStale =
    !s.areas?.length || s.areas.every((a) => a.name === "未分区");
  /** 属地主数据：老缓存没有该集合时从 seed 回填（设备下拉 / 告警 KPI / 推送范围都取它） */
  const needTerritories = !s.territories?.length;
  /**
   * 巡检要求（模板库）：老缓存缺新增条目（如区域类 REQ-GAS-AREA）时按 id 补回 seed，
   * 不覆盖用户在「巡检要求管理」后台页新建 / 修改的条目（该页已暴露编辑入口）
   */
  const needReqMaster =
    !s.requirements?.length ||
    !s.requirements?.some((r) => r.id === "REQ-GAS-AREA");
  const needAlgoMaster = !s.algoConfigs?.some((a) => a.id === "ALG-10");
  const needTplMaster = !s.alarmTemplates?.some((t) => t.id === "TPL-06");
  // 告警类别（告警管理 › 告警类别）：老缓存没有该集合时从 seed 回填，否则告警设置的可选类型与筛选为空
  const needAlarmClasses = !s.alarmClasses?.length;
  // 告警类别口径切换（扁平 6 类 → 二级口径）：命中旧分类名时整体切到 seed 的新口径
  const needAlarmClassNorm = !!s.alarmClasses?.some(
    (c) => c.name in LEGACY_ALARM_CLASS,
  );
  // 告警推送人员（告警管理 › 告警推送）：老缓存没有该集合时从 seed 回填
  const needAlarmPush = !s.alarmPushStaff?.length;
  // 推送范围（区域 / 属地 / 设备）：老缓存没有该绑定，按 id 从 seed 回填演示范围，只补缺
  const needPushScope = !!s.alarmPushStaff?.some(
    (p) => !p.areas && !p.territories && !p.devices,
  );
  /**
   * 台账告警设置（类型 / 开关 / 告警项）：schema 7 的老缓存缺这些字段，
   * 按台账现有判定口径补齐（只补缺，不改已有规则），保证「告警管理 › 告警设置」不为空；
   * 告警名称已废弃，老缓存残留该字段时也走一次补齐把它清掉
   */
  const needAlarmSettings = !!s.businessTargets?.some(
    (b) =>
      !b.alarm?.items?.length ||
      b.alarm?.name !== undefined ||
      !b.alarm?.category ||
      b.alarm?.enabled === undefined,
  );
  /** 环境 / 区域类示例台账的旧口径：改接新的区域巡检要求与区域模板 */
  const needEnvNorm = !!s.businessTargets?.some(
    (b) =>
      b.id === "BT-ENV-GAS" ||
      b.id === "BT-ENV-IR" ||
      (b.targetKind === "区域" && b.requirementId === "REQ-GAS"),
  );
  if (
    !needMapImage &&
    !needDevices &&
    !needMapState &&
    !needAlarms &&
    !needCalibrations &&
    !needSyncs &&
    !needPayloads &&
    !needPayloadMigrate &&
    !needAlgos &&
    !needAlgoNorm &&
    !needAlarmTemplates &&
    !needReqMaster &&
    !needAlgoMaster &&
    !needTplMaster &&
    !needAlarmClasses &&
    !needAlarmClassNorm &&
    !needAlarmPush &&
    !needPushScope &&
    !needAlarmSettings &&
    !needEnvNorm &&
    !areasStale &&
    !needTerritories &&
    !needHistoryNorm &&
    !needRobotVersions &&
    !needWorld &&
    !needDeviceKind &&
    !needPointState &&
    !needZoneFix &&
    !needMaps &&
    !needRoadnetFix
  )
    return s;
  const base = seed();
  /** 补齐台账告警设置所需的上下文（告警类别 + 仪表名 + 巡检要求名兜底） */
  const alarmHost = {
    alarmClasses: needAlarmClasses ? base.alarmClasses : s.alarmClasses,
    instruments: needDevices ? base.instruments : s.instruments,
    requirements: s.requirements || base.requirements,
  };
  const merged: State = {
    ...s,
    // 统一坐标系：老缓存的巡检点 / 标定点按底图 1:1 回填 world（z=0）
    points:
      needWorld || needPointState || needZoneFix
        ? s.points.map((p) => ({
            ...p,
            ...(needWorld && !p.world
              ? { world: { x: p.x, y: p.y, z: 0 } }
              : {}),
            // 状态收敛：非两态的过渡态一律归「停用」（只改状态，不动其他字段）
            ...(needPointState && p.state !== "已启用" && p.state !== "停用"
              ? { state: "停用" as const }
              : {}),
            // 装置区归属修正：装置区的点改挂装置区地图
            ...(needZoneFix && /^装置区/.test(p.device)
              ? { mapId: "MAP-B01" }
              : {}),
          }))
        : s.points,
    // 标定数据：装置区归属修正时整体用 seed 覆盖（装置区点位的标定点要从罐区挪到装置区图）
    mapCalibrations: (
      needCalibrations || needZoneFix ? base.mapCalibrations : s.mapCalibrations
    ).map((c) =>
      needWorld
        ? {
            ...c,
            targets: (c.targets || []).map((t) =>
              t.world ? t : { ...t, world: { x: t.x, y: t.y, z: 0 } },
            ),
          }
        : c,
    ),
    maps: [
      ...s.maps.map((m) => {
        /** 本图当前可用的定位点：路网只允许引用它们，其余视为失效 */
        const ids = new Set(targetsOf(s, m.id).map((t) => t.id));
        return {
          ...m,
          ...(needHistoryNorm ? { history: normalizeHistory(m.history) } : {}),
          ...(needMapImage && m.image === undefined
            ? { image: SAMPLE_MAP_IMAGE }
            : {}),
          // 路网失效段清理：剔除已不在本图的定位点，剩余不足 2 点的整段移除
          ...(needRoadnetFix && m.roadnet
            ? {
                roadnet: {
                  paths: m.roadnet.paths
                    .map((p) => ({
                      ...p,
                      pointIds: p.pointIds.filter((id) => ids.has(id)),
                    }))
                    .filter((p) => p.pointIds.length >= 2),
                },
              }
            : {}),
        };
      }),
      // 补齐老缓存缺失、但已被机器人 / 点位 / 轨道引用的地图（如装置区 MAP-B01）
      ...(needMaps
        ? base.maps.filter((bm) => !s.maps.some((m) => m.id === bm.id))
        : []),
    ],
    robots: needRobotVersions
      ? s.robots.map((r, i) => {
          const d = base.robots[i % base.robots.length];
          return {
            ...d,
            ...r,
            mapVersion:
              typeof r.mapVersion === "number" ? r.mapVersion : d.mapVersion,
          };
        })
      : s.robots,
    devices: (needDevices ? base.devices : s.devices).map((d) => ({
      ...d,
      // 设备形态：老缓存缺该字段时按设备类型回填，只补缺、不覆盖已有值
      deviceKind: d.deviceKind || defaultDeviceKindOfType(d.type),
      // 属地单位（告警 KPI 的「属地」维度）：老缓存缺该字段时按安装位置回填，只补缺
      territory: d.territory || territoryOfDevice(d),
      // 装置区归属修正：安装位置在装置区的设备，厂区列改为「装置区」
      ...(needZoneFix && d.locationDesc.startsWith("装置区")
        ? { region: "装置区" }
        : {}),
    })),
    logicalPoints: needDevices ? base.logicalPoints : s.logicalPoints,
    areas: needDevices || areasStale ? base.areas : s.areas,
    territories:
      needDevices || needTerritories ? base.territories : s.territories,
    instruments: needDevices ? base.instruments : s.instruments,
    // 巡检要求：设备主数据重建时整体用 seed 覆盖；否则按 id 合并——
    // 保留用户在「巡检要求管理」后台页新建 / 修改的条目，只补 seed 里缺失的新增项
    requirements: needDevices
      ? base.requirements
      : [
          ...(s.requirements || []),
          ...(needReqMaster
            ? base.requirements.filter(
                (r) => !(s.requirements || []).some((x) => x.id === r.id),
              )
            : []),
        ],
    businessTargets: (
      needDevices
        ? base.businessTargets
        : (s.businessTargets || []).map((b): BusinessTarget => {
            /** 告警类别口径切换：老缓存里的旧分类名按映射改成新分类名 */
            const b2: BusinessTarget =
              needAlarmClassNorm &&
              b.alarm?.category &&
              LEGACY_ALARM_CLASS[b.alarm.category]
                ? {
                    ...b,
                    alarm: {
                      ...b.alarm,
                      category: LEGACY_ALARM_CLASS[b.alarm.category],
                    },
                  }
                : b;
            /**
             * 环境 / 区域类示例台账的旧口径迁移：改接区域巡检要求 + 区域模板，
             * 否则这两条演示台账没有处置流程（手动来源、模板引用为空）
             */
            if (b2.id === "BT-ENV-GAS" || (b2.targetKind === "区域" && b2.requirementId === "REQ-GAS"))
              return {
                ...b2,
                requirementId: "REQ-GAS-AREA",
                algorithm: "区域气体浓度判读 v1.0",
                alarm: { ...b2.alarm, source: "模板" as const, templateId: "TPL-06" },
              };
            if (b2.id === "BT-ENV-IR")
              return {
                ...b2,
                alarm: { ...b2.alarm, source: "模板" as const, templateId: "TPL-07" },
              };
            return b2;
          })
      // 告警设置补齐（幂等）：schema 7 的老缓存缺告警名称 / 类型 / 开关 / 告警项
    ).map((b) => withAlarmSetting(alarmHost, b)),
    alarmClasses:
      needAlarmClasses || needAlarmClassNorm ? base.alarmClasses : s.alarmClasses,
    alarmPushStaff: needAlarmPush
      ? base.alarmPushStaff
      : (s.alarmPushStaff || []).map((p) => {
          if (!needPushScope) return p;
          const d = base.alarmPushStaff?.find((x) => x.id === p.id);
          return {
            ...p,
            areas: p.areas ?? d?.areas,
            territories: p.territories ?? d?.territories,
            devices: p.devices ?? d?.devices,
          };
        }),
    // 告警口径切换时整体换 seed：老缓存的告警缺机器人本体告警的 alarmClass 字段
    alarms: needAlarms || needAlarmClassNorm ? base.alarms : s.alarms,
    syncs: needSyncs ? base.syncs : s.syncs,
    robotPayloads: needPayloads
      ? base.robotPayloads
      : s.robotPayloads?.map((p) => {
          // 旧口径 { kind, actions } → 新口径 { abilities: [{ kind, actions }] }
          const legacy = p as { abilities?: unknown; kind?: string; actions?: string[] };
          return Array.isArray(p.abilities)
            ? p
            : {
                ...p,
                abilities: (legacy.kind
                  ? [{ kind: legacy.kind, actions: legacy.actions || [] }]
                  : []) as RobotPayloadAbility[],
              };
        }),
    algoConfigs: needAlgos
      ? base.algoConfigs
      : [
          ...(s.algoConfigs || []).map((a) => ({
            ...a,
            deploy: algoDeploys.includes(a.deploy) ? a.deploy : "本体",
            adapt: a.adapt.filter((x) => algoKinds.includes(x as AlgoKind)),
          })),
          // 只补 seed 里新增、缓存里还没有的算法（不覆盖后台已维护的条目）
          ...(needAlgoMaster
            ? base.algoConfigs.filter(
                (a) => !(s.algoConfigs || []).some((x) => x.id === a.id),
              )
            : []),
        ],
    alarmTemplates: needAlarmTemplates
      ? base.alarmTemplates
      : [
          ...(s.alarmTemplates || []),
          // 同理：只补新增的告警模板（如区域气体 / 声纹 / 不安全行为 / 外观）
          ...(needTplMaster
            ? base.alarmTemplates.filter(
                (t) => !(s.alarmTemplates || []).some((x) => x.id === t.id),
              )
            : []),
        ],
  };
  // 状态派生：以合并后的机器版本 + 下发记录为准重算，避免老缓存里的旧状态
  return {
    ...merged,
    maps: merged.maps.map((m) => ({ ...m, state: publishStateOf(merged, m) })),
  };
}
function initial() {
  try {
    return withSeedDefaults(migrate(JSON.parse(localStorage.getItem(KEY) || "null")) || seed());
  } catch {
    return seed();
  }
}
/**
 * 持久化当前状态到 localStorage
 * @description 以 file:// 直接打开（离线分发）时，部分浏览器会禁用本地存储并抛错，
 *              此处必须容错，否则一次写失败就会整页白屏；失败时降级为「仅内存」
 * @param n 待持久化的状态
 */
export function persist(n: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(n));
  } catch {
    /* 存储不可用：本次浏览改为纯内存态，刷新即回到初始演示数据 */
  }
}
export function Store({ children }: { children: ReactNode }) {
  const [s, set] = useState<State>(initial),
    [message, msg] = useState("");
  const latest = useRef(s);
  latest.current = s;
  useEffect(() => {
    const tab =
      globalThis.crypto?.randomUUID?.() ||
      `clock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) {
        try {
          const n = withSeedDefaults(migrate(JSON.parse(e.newValue)));
          if (n) {
            latest.current = n;
            set(n);
          }
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    const timer = setInterval(() => {
      // One browser tab owns the mock clock; other tabs consume storage updates.
      try {
        const lease = JSON.parse(
          localStorage.getItem("inspection-clock-owner") || "null",
        );
        if (lease && lease.id !== tab && lease.until > Date.now()) return;
        localStorage.setItem(
          "inspection-clock-owner",
          JSON.stringify({ id: tab, until: Date.now() + 2500 }),
        );
      } catch {}
      const n = advanceAutomation(latest.current);
      if (n !== latest.current) {
        latest.current = n;
        set(n);
        persist(n);
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
      try {
        const lease = JSON.parse(
          localStorage.getItem("inspection-clock-owner") || "null",
        );
        if (lease?.id === tab)
          localStorage.removeItem("inspection-clock-owner");
      } catch {}
    };
  }, []);
  function act(a: Action, onSuccess?: (s: State) => void) {
    try {
      const n = transition(latest.current, a);
      latest.current = n;
      set(n);
      persist(n);
      msg("操作成功 · " + n.logs[0].object);
      setTimeout(() => msg(""), 4000);
      onSuccess?.(n);
      return true;
    } catch (e) {
      msg((e as Error).message);
      return false;
    }
  }
  /**
   * 切换演示角色：仅改 roleId，不触发业务状态机
   * @param rid 角色 ID，见 roles.ts
   */
  function setRole(rid: string) {
    const n = { ...latest.current, roleId: rid };
    latest.current = n;
    set(n);
    persist(n);
    msg(`已切换角色：${roleOf(rid).name}（${roleOf(rid).scope}）`);
    setTimeout(() => msg(""), 3000);
  }
  return (
    <C.Provider
      value={{
        s,
        act,
        message,
        setRole,
        reset: () => {
          const n = seed();
          latest.current = n;
          set(n);
          persist(n);
          msg("演示数据已重置");
        },
      }}
    >
      {children}
    </C.Provider>
  );
}
export const useStore = () => useContext(C);
