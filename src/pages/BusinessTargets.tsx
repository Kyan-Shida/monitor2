/**
 * @file BusinessTargets.tsx
 * @description 巡检目标台账 = **仪表 + 巡检要求 + 算法 + 告警模板**。
 *              核心前提：「仪表本身只是资产，不能直接巡检」——必须叠加巡检要求才可执行。
 *              列表 + 新增/编辑抽屉（两步：① 选检测目标（区域 → 设备 → 仪表）
 *              ② 配业务逻辑与算法 = **左栏配置**（1 巡检要求 / 2 使用算法逻辑 / 3 告警规则）+ **右栏直接展示**配置结果；
 *              告警规则来源二选一：**手动输入**（本站自己定判定口径）或**选择现有模板**（口径由模板下发））。
 * @interaction 菜单「资源与地图 › 点位与对象 › 巡检目标台账」（`points` 槽位）；
 *              「巡检点管理 › 添加巡检点」的巡检项从这里选（也可就地快速新建）；
 *              引擎 action：ADD_BUSINESS_TARGET / UPDATE_BUSINESS_TARGET
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { useViewState } from "../data/navigation";
import { Badge, Btn, Empty, Field, Modal, Note, Panel, Steps, Table } from "../components/UI";
import { Pager } from "../components/Business";
import { DeviceTree, deviceTreeRegions } from "../components/DeviceTree";
import { defaultRangeOfUnit } from "../data/alarmRules";
import {
  areaNameOf,
  defaultRequirementOfInstrument,
} from "../data/deviceMaster";
import { ALARM_LEVELS } from "../data/types";
import {
  alarmText,
  kindOfTarget,
  logicText,
  templateFor,
  templatesOf,
  triggerText,
  type AlarmTrigger,
} from "../data/alarmTemplates";
import type {
  AlarmLevel,
  BusinessTarget,
  Instrument,
  JudgeType,
} from "../data/types";

/** 告警通知对象候选（岗位字典）：台账当前按默认「设备岗」带出，未提供选择入口 */
const NOTIFY_ROLES = ["设备岗", "巡检调度岗", "结果复核岗", "值班长"];
/** 触发条件说明默认值：台账不手填，关联模板时按模板回显「触发逻辑 · 声光报警」 */
const ALARM_TRIGGER = "单次异常即告警";
/** 列表每页条数 */
const PAGE_SIZE = 10;

/** 判断标准一句话（列表与抽屉共用同一表达） */
function judgeText(b: {
  judge: JudgeType;
  min?: number;
  max?: number;
  unit?: string;
  expected?: string;
}) {
  if (b.judge === "数值范围") return `${b.min ?? "—"}–${b.max ?? "—"} ${b.unit || ""}`.trim();
  if (b.judge === "期望状态") return `期望 ${b.expected || "—"}`;
  if (b.judge === "有无目标") return "无 → 正常；有 → 异常";
  return "按等级评分，低分需复核";
}

/**
 * 巡检目标台账
 * @param tab 传 "space" 时预置为「空间与区域（非装置）」视图（侧边栏独立入口进入）
 */
export function BusinessTargets({ tab }: { tab?: string } = {}) {
  const { s, act } = useStore();
  const [kw, KW] = useViewState("bt.q", ""),
    [areaF, AF] = useViewState("bt.area", "全部"),
    [devF, DF] = useViewState("bt.device", "全部"),
    /**
     * 目标类型归类：装置＝关联设备台账（仪表 / 阀门）；空间与区域＝非装置（气体 / 声纹 / 红外 / AI / 环境拍照）。
     * tab 为 "space" 时从「空间与区域」独立入口进入，默认只看非装置类。
     */
    [kindF, KF] = useViewState(
      "bt.kind",
      tab === "space" ? "空间与区域" : "全部",
    ),
    /** 树「空间区域巡检」下选中的单个目标 id（空串 = 不收敛） */
    [tgtF, TF] = useViewState("bt.target", ""),
    [pager, PG] = useViewState("bt.page", 1);
  const [open, OPEN] = useState(false);
  const [step, STEP] = useState(0);
  /** 编辑中的巡检目标台账 id；空串表示新增 */
  const [editId, EDIT] = useState("");
  /** 抽屉第一步选中的仪表 id */
  const [pick, PICK] = useState("");
  /** 步骤①：先选「设备（仪表）」还是「区域（环境）」目标 */
  const [scope, SCOPE] = useState<"设备" | "区域">("设备");
  /**
   * 抽屉第一步的三栏导航：左栏区域 › 设备树的选中值
   * @description `d:<设备id>` / `r:<区域名>` / 空串=全部；只影响抽屉内的中栏仪表列表，
   *              不改变列表页的区域 / 设备筛选（两者互不干扰）
   */
  const [navKey, NAVKEY] = useState("");
  /** 抽屉第一步的仪表搜索词（同样只影响抽屉内的中栏列表） */
  const [insKw, INSKW] = useState("");
  const [form, FORM] = useState({
    /** TGT-01：目标类型（仪表类挂设备；环境 / 区域类不关联设备） */
    targetKind: "仪表" as "仪表" | "环境" | "区域",
    /** TGT-02：区域 / 空间目标的参照物锚点 */
    anchor: "",
    requirementId: "",
    algorithm: "",
    judge: "数值范围" as JudgeType,
    unit: "",
    min: 0,
    max: 1,
    expected: "",
    criteria: "",
    /** 告警设置（平台唯一入口；巡检点不配置告警）：没有「告警开关」，判定异常即告警 */
    alarmSource: "模板" as "模板" | "手动",
    alarmLevel: "二级",
    alarmTrigger: ALARM_TRIGGER,
    alarmNotify: ["设备岗"] as string[],
    /** 关联的告警模板（后台管理 › 告警模板管理），空串 = 按检测类型自动套用 */
    alarmTemplateId: "",
    /** 手动输入：触发逻辑 / 连续次数 / 声光报警秒数 / 处置流程（每行一步） */
    alarmTriggerMode: "单次即触发" as "单次即触发" | "连续确认",
    alarmConsecutive: 2,
    alarmSeconds: 10,
    alarmFlow: "",
    needPhoto: true,
    needVideo: false,
    needReview: false,
    cycle: "每日",
    inspect: true,
  });

  const targets = s.businessTargets || [];
  const instruments = s.instruments || [];
  const requirements = s.requirements || [];
  const instrumentOf = (id: string) => instruments.find((x) => x.id === id);
  const deviceOf = (instrumentId: string) =>
    s.devices?.find((d) => d.id === instrumentOf(instrumentId)?.deviceId);
  /** 区域 › 设备 › 仪表：把检测目标回溯到工厂树上的归属 */
  const crumb = (instrumentId: string) => {
    const ins = instrumentOf(instrumentId);
    const dev = deviceOf(instrumentId);
    return {
      area: dev ? areaNameOf(s, dev) : "—",
      device: dev?.name || "—",
      instrument: ins?.name || "—",
      ins,
      dev,
    };
  };
  const targetCountOf = (instrumentId: string) =>
    targets.filter((b) => b.instrumentId === instrumentId).length;

  /** 切换巡检要求：把模板默认的算法 / 判定 / 阈值 / 采集要求填进表单 */
  function applyRequirement(rid: string, ins?: Instrument) {
    const req = requirements.find((r) => r.id === rid);
    const range =
      req?.judge === "数值范围"
        ? // 优先用巡检要求自己声明的量程（如区域气体 ppm 0–50），没有才按单位默认量程
          req.min !== undefined && req.max !== undefined
          ? { min: req.min, max: req.max }
          : defaultRangeOfUnit(req.unit || ins?.unit) || { min: 0, max: 1 }
        : undefined;
    FORM((old) => ({
      ...old,
      requirementId: rid,
      algorithm: req?.algorithm || "",
      judge: req?.judge || "数值范围",
      unit: req?.unit || ins?.unit || "",
      min: range?.min ?? 0,
      max: range?.max ?? 1,
      expected: req?.expected || "",
      criteria: req?.description || "",
      needPhoto: req?.needPhoto ?? true,
      needVideo: req?.needVideo ?? false,
      needReview: req?.needReview ?? false,
      cycle: req?.cycle || "每日",
    }));
  }
  /**
   * 引用后台管理维护的算法清单（启用中的）
   * @description 「算法 / AI 表达方式」不再手填：值来自「后台管理 › 工厂基础数据 › 算法」，
   *              旧数据里的自由文本不在清单时保留为一项，避免打开即丢值
   */
  const algoOptions = (() => {
    /**
     * 巡检要求 → 算法族：该要求的默认算法在「后台管理 › 算法模板管理」里的适配类型（`adapt`）
     * @description 区域 / 环境类（气体泵吸、声纹、AI 行为、环境拍照）与仪表类（读数 / 红外 / 阀位）
     *              用的算法不同，按族收敛，避免把"表计读数识别"配到区域声纹上
     */
    const fam =
      (s.algoConfigs || []).find(
        (a) =>
          a.name ===
          requirements.find((r) => r.id === form.requirementId)?.algorithm,
      )?.adapt || [];
    const names = (s.algoConfigs || [])
      .filter((a) => a.state !== "停用")
      .filter((a) => !fam.length || a.adapt.some((k) => fam.includes(k)))
      .map((a) => a.name);
    return form.algorithm && !names.includes(form.algorithm)
      ? [...names, form.algorithm]
      : names;
  })();
  /** 引用后台管理维护的告警模板（启用中的） */
  const tplOptions = templatesOf(s).filter((t) => t.enabled);
  /**
   * 该台账当前生效的告警模板（与引擎 rulesOf 同源）
   * @description 关联的模板优先，未关联时按检测类型自动匹配启用模板；
   *              第 3 段「告警规则」用它回显触发条件 / 触发逻辑 / 等级 / 声光报警 / 处置流程
   */
  const effTpl = templateFor(
    s,
    // 检测类型：优先巡检要求的声明（环境 / 区域类没有量纲），否则按单位换算
    kindOfTarget(s, form.requirementId, form.unit || instrumentOf(pick)?.unit),
    form.unit || instrumentOf(pick)?.unit,
    form.alarmTemplateId,
  );
  /** 告警规则来源是否为「选择现有模板」（否则 = 手动输入） */
  const isTplMode = form.alarmSource === "模板";
  /**
   * 右侧展示 & 保存口径用的生效告警规则（与引擎 rulesOf 同源）
   * @description 模板来源取模板（未指定/未命中时回落手动口径），手动来源取表单手填值
   */
  const effTrigger: AlarmTrigger =
    isTplMode && effTpl
      ? effTpl.trigger
      : {
          type: form.judge === "期望状态" ? "期望状态" : "数值范围",
          unit: form.unit,
          min: form.min,
          max: form.max,
          expected: form.expected,
          mode: form.alarmTriggerMode,
          consecutive: Math.max(2, form.alarmConsecutive),
        };
  /** 生效等级、声光报警秒数、处置流程（模板来源 → 模板；手动来源 → 手填） */
  const effLevel = isTplMode && effTpl ? effTpl.level : form.alarmLevel;
  const effSeconds =
    isTplMode && effTpl ? effTpl.alarmSeconds : Math.max(0, form.alarmSeconds);
  const effFlow =
    isTplMode && effTpl
      ? effTpl.flow
      : form.alarmFlow
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean);
  /** 巡检要求（第 1 段）与采集方式 / 单位：右侧展示面板与保存校验共用 */
  const effReq = requirements.find((r) => r.id === form.requirementId);
  /** 采集方式：仪表类用仪表自己的；环境 / 区域类没有仪表，由巡检要求给出 */
  const effCapture = instrumentOf(pick)?.capture || effReq?.capture;
  /**
   * 第 1 段「巡检要求」候选：按目标类型过滤（来源主数据 `Requirement.targetKinds`）
   * @description 仪表类目标不出现"看区域气体浓度"；区域 / 环境类目标不出现"看仪表读数"。
   *              当前已选值不在候选里时（老数据）仍保留一行，避免打开即丢值
   */
  const reqOptions = (() => {
    const list = requirements.filter((r) =>
      (r.targetKinds || ["仪表", "环境", "区域"]).includes(form.targetKind),
    );
    const cur = requirements.find(
      (r) => r.id === form.requirementId && !list.some((x) => x.id === r.id),
    );
    return cur ? [cur, ...list] : list;
  })();
  /** 区域 / 环境类目标可选的巡检要求（第 1 步「区域（环境）」入口按它生成候选） */
  const envReqOptions = requirements.filter(
    (r) => r.targetKinds?.includes("区域") || r.targetKinds?.includes("环境"),
  );
  /**
   * 关联 / 套用告警模板（后台管理 › 告警模板管理）
   * @description 一次带出「判定方式 + 阈值 + 单位 + 期望状态 + 告警等级 + 触发条件说明」，
   *              并把模板 ID 写进台账的告警设置（规则判定优先按关联模板走）；
   *              传空串 = 取消关联（只清关联，不改已有阈值）
   * @param id 模板 ID
   */
  function applyAlarmTemplate(id: string) {
    const tpl = tplOptions.find((t) => t.id === id);
    if (!tpl) {
      FORM({ ...form, alarmTemplateId: "" });
      return;
    }
    FORM({
      ...form,
      alarmTemplateId: tpl.id,
      judge: tpl.trigger.type,
      min: tpl.trigger.min,
      max: tpl.trigger.max,
      unit: tpl.trigger.unit || form.unit,
      expected: tpl.trigger.expected || form.expected,
      alarmLevel: tpl.level,
      alarmTrigger: `${logicText(tpl.trigger)} · ${alarmText(tpl.alarmSeconds)}`,
    });
  }
  /** 打开新增抽屉：默认选中该仪表的"默认巡检要求"（采集方式 + 单位决定看什么） */
  function openAdd() {
    EDIT("");
    PICK("");
    SCOPE("设备");
    NAVKEY("");
    INSKW("");
    STEP(0);
    FORM({
      targetKind: "仪表",
      anchor: "",
      requirementId: "",
      algorithm: "",
      judge: "数值范围",
      unit: "",
      min: 0,
      max: 1,
      expected: "",
      criteria: "",
      alarmSource: "模板",
      alarmLevel: "二级",
      alarmTrigger: ALARM_TRIGGER,
      alarmNotify: ["设备岗"],
      alarmTemplateId: "",
      alarmTriggerMode: "单次即触发",
      alarmConsecutive: 2,
      alarmSeconds: 10,
      alarmFlow: "",
      needPhoto: true,
      needVideo: false,
      needReview: false,
      cycle: "每日",
      inspect: true,
    });
    const first = instruments[0];
    if (first) applyRequirement(defaultRequirementOfInstrument(first), first);
    OPEN(true);
  }
  /** 打开编辑抽屉：直接进第二步，仪表只读 */
  function openEdit(b: BusinessTarget) {
    EDIT(b.id);
    PICK(b.instrumentId || "");
    // 左栏树定位到该仪表所属设备（编辑态下仪表只读，树只用于回显上下文）
    NAVKEY(
      b.instrumentId
        ? "d:" + (instrumentOf(b.instrumentId)?.deviceId || "")
        : "",
    );
    INSKW("");
    FORM({
      targetKind: b.targetKind || "仪表",
      anchor: b.anchor || "",
      requirementId: b.requirementId,
      algorithm: b.algorithm,
      judge: b.judge,
      unit: b.unit || "",
      min: b.min ?? 0,
      max: b.max ?? 1,
      expected: b.expected || "",
      criteria: b.criteria || "",
      // 老数据没有 source：关联了模板 = 模板来源，否则按手动（与引擎的缺省口径一致）
      alarmSource: b.alarm?.source || (b.alarm?.templateId ? "模板" : "手动"),
      alarmLevel: b.alarm?.level || "二级",
      alarmTrigger: b.alarm?.trigger || ALARM_TRIGGER,
      alarmNotify: b.alarm?.notify || ["设备岗"],
      alarmTemplateId: b.alarm?.templateId || "",
      alarmTriggerMode: b.alarm?.triggerMode || "单次即触发",
      alarmConsecutive: b.alarm?.consecutive || 2,
      alarmSeconds: b.alarm?.alarmSeconds ?? 10,
      alarmFlow: (b.alarm?.flow || []).join("\n"),
      needPhoto: b.needPhoto,
      needVideo: b.needVideo,
      needReview: b.needReview,
      cycle: b.cycle,
      inspect: b.inspect,
    });
    STEP(1);
    OPEN(true);
  }
  /** 保存：新增走 ADD，编辑走 UPDATE */
  function save() {
    const payload = {
      // TGT-01/02：目标类型 + 区域锚点（环境 / 区域类不关联设备）
      targetKind: form.targetKind,
      anchor: form.anchor,
      requirementId: form.requirementId,
      algorithm: form.algorithm,
      judge: form.judge,
      unit: form.unit,
      min: Number(form.min),
      max: Number(form.max),
      expected: form.expected,
      criteria: form.criteria,
      // 告警设置（平台唯一入口）：来源可选手动输入或引用模板，手填口径随台账一并保存
      alarm: {
        source: form.alarmSource,
        level: form.alarmLevel as AlarmLevel,
        trigger: form.alarmTrigger,
        notify: form.alarmNotify,
        templateId: form.alarmTemplateId || undefined,
        triggerMode: form.alarmTriggerMode,
        consecutive: Math.max(2, form.alarmConsecutive),
        alarmSeconds: Math.max(0, form.alarmSeconds),
        flow: form.alarmFlow
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
      },
      needPhoto: form.needPhoto,
      needVideo: form.needVideo,
      needReview: form.needReview,
      cycle: form.cycle,
      inspect: form.inspect,
    };
    const ok = editId
      ? act({ type: "UPDATE_BUSINESS_TARGET", id: editId, ...payload })
      : act({ type: "ADD_BUSINESS_TARGET", instrumentId: pick, ...payload });
    if (ok) OPEN(false);
  }

  const areas = ["全部", ...deviceTreeRegions(s)];
  const devices = [
    "全部",
    ...new Set(
      (s.devices || [])
        .filter((d) => areaF === "全部" || (d.region || "—") === areaF)
        .map((d) => d.name),
    ),
  ];
  const keyword = kw.trim();
  /** 空间 / 区域（非装置）判定：不关联设备台账 或 目标类型非「仪表」 */
  const isSpaceTarget = (b: BusinessTarget) =>
    !b.instrumentId || (b.targetKind && b.targetKind !== "仪表");
  const list = targets.filter((b) => {
    const c = crumb(b.instrumentId);
    const req = requirements.find((r) => r.id === b.requirementId);
    if (kindF === "装置" && isSpaceTarget(b)) return false;
    if (kindF === "空间与区域" && !isSpaceTarget(b)) return false;
    if (areaF !== "全部" && c.area !== areaF) return false;
    if (devF !== "全部" && c.device !== devF) return false;
    // 树上点中「空间区域巡检」下的某个目标：列表收敛到这一条（点分组节点则回全部）
    if (tgtF && b.id !== tgtF) return false;
    return (
      !keyword ||
      (b.id + b.algorithm + (req?.name || "") + c.area + c.device + c.instrument).includes(
        keyword,
      )
    );
  });
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(pager || 1, pages);
  const rows = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  /**
   * 抽屉第一步（设备类）的仪表候选：按左栏树选中（区域 / 设备）+ 中栏关键词过滤
   * @description 与页面筛选解耦：三栏是「选检测目标」的独立导航
   */
  const drawerInstruments = instruments.filter((x) => {
    const dev = s.devices?.find((d) => d.id === x.deviceId);
    const inScope = !navKey
      ? true
      : navKey.startsWith("d:")
        ? x.deviceId === navKey.slice(2)
        : dev
          ? areaNameOf(s, dev) === navKey.slice(2)
          : false;
    const k = insKw.trim();
    return (
      inScope && (!k || (x.name + (dev?.name || "") + (dev?.region || "")).includes(k))
    );
  });
  const picked = instrumentOf(pick);
  /** 树选中值 ← 页面筛选（单目标 > 设备 > 区域），保证树高亮与列表口径一致 */
  const treeSel = tgtF
    ? "s:" + tgtF
    : devF !== "全部"
      ? "d:" + ((s.devices || []).find((d) => d.name === devF)?.id || "")
      : areaF !== "全部"
        ? "r:" + areaF
        : "";
  /**
   * 树选中 → 页面筛选
   * @description 区域与设备是同一组筛选维度（区域决定设备候选），故一次写两个：
   *              点区域 = 该区域下全部设备；点设备 = 该设备所属区域 + 单台设备
   * @param next 树选中值
   */
  function onTree(next: string) {
    if (next.startsWith("d:")) {
      const d = (s.devices || []).find((x) => x.id === next.slice(2));
      AF(d ? areaNameOf(s, d) : "全部");
      DF(d?.name || "全部");
    } else if (next.startsWith("r:")) {
      AF(next.slice(2));
      DF("全部");
    } else {
      AF("全部");
      DF("全部");
    }
    PG(1);
  }

  return (
    <>
      <div className="metric-strip">
        <div>
          <span>巡检目标台账</span>
          <strong>{targets.length}</strong>
        </div>
        <div>
          <span>已配算法</span>
          <strong>{new Set(targets.map((b) => b.algorithm)).size}</strong>
        </div>
        <div>
          <span>需人工复核</span>
          <strong>{targets.filter((b) => b.needReview).length}</strong>
        </div>
      </div>
      <div className="device-layout">
        {/* 左侧区域 › 设备树：与设备台账同一棵树，选中即落到页面既有的区域 / 设备筛选维度 */}
        <DeviceTree value={treeSel} onChange={onTree} ariaLabel="巡检目标树" />
        <div className="device-main">
          <div className="toolbar">
            <div className="actions">
              {/* 目标类型归类：装置（关联设备台账） vs 空间与区域（非装置）—— 便于单独查看非装置类目标 */}
              <div className="segmented">
                {(["全部", "装置", "空间与区域"] as const).map((x) => (
                  <button
                    key={x}
                    className={kindF === x ? "active" : ""}
                    onClick={() => {
                      KF(x);
                      PG(1);
                    }}
                  >
                    {x}
                  </button>
                ))}
              </div>
              <input
                placeholder="搜索目标 / 仪表 / 设备 / 算法"
                value={kw}
                onChange={(e) => KW(e.target.value)}
              />
            </div>
            <Btn primary onClick={openAdd}>
              ＋ 添加巡检目标台账
            </Btn>
          </div>
          <Panel title="巡检目标台账列表" extra={<span>{list.length} 条</span>}>
            <Table
              heads={[
                "目标",
                "类型",
                "区域",
                "设备 / 锚点",
                "巡检要求 / 算法",
                "操作",
              ]}
              rows={rows.map((b) => {
                const c = b.instrumentId
                  ? crumb(b.instrumentId)
                  : {
                      area: "—",
                      device: b.anchor || "—",
                      instrument: `（${b.targetKind || "环境"}类目标）`,
                    };
                const req = requirements.find((r) => r.id === b.requirementId);
                return [
                  <b>{c.instrument}</b>,
                  b.targetKind || (b.instrumentId ? "仪表" : "环境"),
                  c.area,
                  c.device,
                  <>
                    {req?.name || b.requirementId}
                    <small>
                      {req?.kind} · {b.algorithm}
                    </small>
                  </>,
                  <Btn onClick={() => openEdit(b)}>编辑</Btn>,
                ];
              })}
            />
            {!rows.length && (
              <Empty>
                没有符合条件的巡检目标台账，点「＋ 添加巡检目标台账」新建。
              </Empty>
            )}
            <Pager page={cur} count={list.length} size={PAGE_SIZE} onChange={PG} />
          </Panel>
        </div>
      </div>

      {open && (
        <Modal
          title={editId ? "编辑巡检目标台账" : "添加巡检目标台账"}
          wide
          onClose={() => OPEN(false)}
          footer={
            <>
              <Btn onClick={() => OPEN(false)}>取消</Btn>
              {step === 1 && (
                <Btn disabled={!!editId} onClick={() => STEP(0)}>
                  上一步：换检测目标
                </Btn>
              )}
              {step === 0 && scope === "设备" ? (
                <Btn primary disabled={!pick} onClick={() => STEP(1)}>
                  下一步：配业务逻辑
                </Btn>
              ) : (
                <Btn
                  primary
                  disabled={!form.requirementId || !form.algorithm.trim()}
                  onClick={save}
                >
                  {editId ? "保存修改" : "创建巡检目标台账"}
                </Btn>
              )}
            </>
          }
        >
          <Steps
            items={["选检测目标", "配业务逻辑与算法"]}
            current={step}
          />
          {step === 0 ? (
            <>
              {/* 步骤①：先选「设备」还是「区域」，再在下方点选对应目标 */}
              <div className="segmented" style={{ marginBottom: 14 }}>
                <button
                  className={scope === "设备" ? "active" : ""}
                  onClick={() => {
                    SCOPE("设备");
                    PICK("");
                  }}
                >
                  设备（仪表）
                </button>
                <button
                  className={scope === "区域" ? "active" : ""}
                  onClick={() => {
                    SCOPE("区域");
                    PICK("");
                  }}
                >
                  区域（环境）
                </button>
              </div>

              {scope === "设备" ? (
                /* 左中右三栏：区域 › 设备树（左）｜ 该设备下的仪表（中）｜ 已选检测目标（右） */
                <div className="pick-3col">
                  <DeviceTree
                    value={navKey}
                    onChange={NAVKEY}
                    ariaLabel="检测目标树"
                  />
                  <div className="pick-main">
                    <div className="filter-bar">
                      <input
                        placeholder="搜索仪表 / 设备"
                        value={insKw}
                        onChange={(e) => INSKW(e.target.value)}
                      />
                    </div>
                    <div className="pick-list">
                      {drawerInstruments.map((x) => {
                        const dev = s.devices?.find((d) => d.id === x.deviceId);
                        return (
                          <button
                            key={x.id}
                            className={"pick" + (pick === x.id ? " on" : "")}
                            onClick={() => {
                              PICK(x.id);
                              applyRequirement(
                                defaultRequirementOfInstrument(x),
                                x,
                              );
                            }}
                          >
                            <b>{x.name}</b>
                            <small>
                              {dev?.region || "—"} › {dev?.name || "—"} ·{" "}
                              {x.capture}
                              {x.unit ? ` · ${x.unit}` : " · 无量纲"}
                              {targetCountOf(x.id)
                                ? ` · 已有 ${targetCountOf(x.id)} 条目标`
                                : ""}
                            </small>
                          </button>
                        );
                      })}
                      {!drawerInstruments.length && (
                        <p className="muted">
                          没有匹配的仪表，请在左栏换设备 / 区域或调整关键词。
                        </p>
                      )}
                    </div>
                  </div>
                  <aside className="pick-picked">
                    <div className="pick-picked-head">
                      <b>已选检测目标</b>
                    </div>
                    <ul>
                      {picked ? (
                        <li>
                          <div>
                            <span>{picked.name}</span>
                            <small>
                              {crumb(picked.id).area} › {crumb(picked.id).device}
                            </small>
                            <small>
                              {picked.capture}
                              {picked.unit ? ` · ${picked.unit}` : " · 无量纲"}
                            </small>
                            <small>
                              已有目标 {targetCountOf(picked.id)} 条
                            </small>
                          </div>
                        </li>
                      ) : (
                        <li className="pick-empty">未选择</li>
                      )}
                    </ul>
                  </aside>
                </div>
              ) : (
                <>
                  {/* TGT-01：区域 / 环境类目标 —— 不关联设备台账，直接列出**适用的巡检要求**（来源主数据） */}
                  <Note>
                    区域 / 环境类目标不关联设备台账：先选一条适用的巡检要求（采集方式 / 判定方式 /
                    算法都随它带出），再填参照物锚点圈定范围。
                  </Note>
                  <div className="actions">
                    {envReqOptions.map((r) => {
                      // 目标类型：要求适用区域时按区域（锚点必填），否则按环境
                      const kind = (r.targetKinds || []).includes("区域")
                        ? "区域"
                        : "环境";
                      return (
                        <Btn
                          key={r.id}
                          onClick={() => {
                            PICK("");
                            FORM((old) => ({ ...old, targetKind: kind }));
                            // 采集方式 / 判定方式 / 单位 / 算法都取自这条巡检要求（主数据唯一口径）
                            applyRequirement(r.id);
                            STEP(1);
                          }}
                        >
                          ＋ {r.name}（{r.capture}）
                        </Btn>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {form.targetKind === "仪表" ? (
                <Note>
                  已选仪表：
                  <b>
                    {crumb(pick).area} › {crumb(pick).device} › {crumb(pick).instrument}
                  </b>
                  {!editId && "（如需更换，点底部「上一步」）"}
                </Note>
              ) : (
                <Note>
                  目标类型：<b>{form.targetKind}类</b>（不关联设备台账）。参照物锚点用于圈定范围并归因；
                  业务目标 / 业务要求由系统按「锚点 + 巡检要求 + 判定方式」自动生成，不再手填。
                </Note>
              )}
              {/* TGT-02：区域 / 空间目标必须填写参照物锚点 */}
              {form.targetKind !== "仪表" && (
                <Field
                  label={`参照物锚点${
                    form.targetKind === "区域" ? "（区域类必填）" : "（可选）"
                  }`}
                >
                  <input
                    value={form.anchor}
                    placeholder="例如 3# 罐区北侧立柱 / 管廊 A 段起点"
                    onChange={(e) =>
                      FORM({ ...form, anchor: e.target.value })
                    }
                  />
                </Field>
              )}
              {/*
                第二步「配业务逻辑与算法」= 左栏配置 / 右栏展示（产品草图）：
                左：1、巡检要求 / 2、使用算法逻辑 / 3、告警规则（手动输入 or 选择现有模板）
                右：把左栏配好的内容直接展示出来（采集方式与单位、算法、生效告警口径与处置流程）
              */}
              <div className="bt-two-col">
                <div className="bt-config">
                  <div className="form-section">
                    <h4>1、巡检要求</h4>
                    <select
                      value={form.requirementId}
                      onChange={(e) => applyRequirement(e.target.value, picked)}
                    >
                      {reqOptions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}（{r.kind}
                          {r.targetKinds?.length
                            ? ` · 适用 ${r.targetKinds.join(" / ")}`
                            : ""}
                          ）
                        </option>
                      ))}
                    </select>
                    <p className="muted">{effReq?.description}</p>
                    {/* 采集方式：仪表类取仪表自己的；区域 / 环境类由巡检要求给出（只读展示） */}
                    <p className="muted">
                      采集方式 / 单位：{effCapture || "—"} ·{" "}
                      {form.unit || instrumentOf(pick)?.unit || "—"}
                    </p>
                  </div>
                  <div className="form-section">
                    <h4>2、使用算法逻辑</h4>
                    <select
                      value={form.algorithm}
                      onChange={(e) => FORM({ ...form, algorithm: e.target.value })}
                    >
                      <option value="">请选择算法</option>
                      {algoOptions.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                    <p className="muted">
                      算法来自「后台管理 › 算法模板管理」；采集方式与单位随上面的巡检要求带出。
                    </p>
                  </div>
                  <div className="form-section">
                    <h4>3、告警规则</h4>
                    {/* 来源二选一：选择现有模板（一处维护、多点引用）/ 手动输入（本站自己定口径） */}
                    <div className="radio-row" style={{ marginBottom: 10 }}>
                      {(
                        [
                          ["模板", "选择现有模板"],
                          ["手动", "手动输入"],
                        ] as const
                      ).map(([v, label]) => (
                        <label key={v}>
                          <input
                            type="radio"
                            name="alarm-source"
                            checked={form.alarmSource === v}
                            onChange={() => FORM({ ...form, alarmSource: v })}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    {isTplMode ? (
                      <>
                        <select
                          value={form.alarmTemplateId}
                          onChange={(e) => applyAlarmTemplate(e.target.value)}
                        >
                          <option value="">不指定（按检测类型自动套用启用模板）</option>
                          {tplOptions.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}（{t.level} · {logicText(t.trigger)} ·{" "}
                              {alarmText(t.alarmSeconds)}）
                            </option>
                          ))}
                        </select>
                        <p className="muted">
                          触发条件 / 触发逻辑 / 等级 / 声光报警 / 处置流程都由模板统一下发，
                          右侧展示的就是生效结果。
                        </p>
                      </>
                    ) : (
                      <>
                        <Field label="触发条件">
                          <div className="actions">
                            <select
                              value={form.judge}
                              onChange={(e) =>
                                FORM({
                                  ...form,
                                  judge: e.target.value as JudgeType,
                                })
                              }
                            >
                              <option>数值范围</option>
                              <option>期望状态</option>
                            </select>
                            {form.judge === "数值范围" ? (
                              <>
                                <input
                                  type="number"
                                  step="0.01"
                                  aria-label="下限"
                                  value={form.min}
                                  onChange={(e) =>
                                    FORM({
                                      ...form,
                                      min: Number(e.target.value),
                                    })
                                  }
                                />
                                <span>–</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  aria-label="上限"
                                  value={form.max}
                                  onChange={(e) =>
                                    FORM({
                                      ...form,
                                      max: Number(e.target.value),
                                    })
                                  }
                                />
                                <input
                                  aria-label="单位"
                                  placeholder="单位"
                                  value={form.unit}
                                  onChange={(e) =>
                                    FORM({ ...form, unit: e.target.value })
                                  }
                                />
                              </>
                            ) : (
                              <input
                                aria-label="期望状态"
                                placeholder="期望状态，例如 开启"
                                value={form.expected}
                                onChange={(e) =>
                                  FORM({ ...form, expected: e.target.value })
                                }
                              />
                            )}
                          </div>
                        </Field>
                        <Field label="触发逻辑">
                          <select
                            value={form.alarmTriggerMode}
                            onChange={(e) =>
                              FORM({
                                ...form,
                                alarmTriggerMode: e.target
                                  .value as typeof form.alarmTriggerMode,
                              })
                            }
                          >
                            <option value="单次即触发">
                              识别即触发（本次识别到异常就告警）
                            </option>
                            <option value="连续确认">
                              连续确认（连续 N 次异常才告警）
                            </option>
                          </select>
                        </Field>
                        {form.alarmTriggerMode === "连续确认" && (
                          <Field label="连续确认次数">
                            <input
                              type="number"
                              min={2}
                              value={form.alarmConsecutive}
                              onChange={(e) =>
                                FORM({
                                  ...form,
                                  alarmConsecutive: Math.max(2, +e.target.value),
                                })
                              }
                            />
                          </Field>
                        )}
                        <Field label="告警等级">
                          <select
                            value={form.alarmLevel}
                            onChange={(e) =>
                              FORM({ ...form, alarmLevel: e.target.value })
                            }
                          >
                            {ALARM_LEVELS.map((l) => (
                              <option key={l}>{l}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="声光报警（秒）">
                          <input
                            type="number"
                            min={0}
                            value={form.alarmSeconds}
                            placeholder="0 表示不启动声光报警"
                            onChange={(e) =>
                              FORM({
                                ...form,
                                alarmSeconds: Math.max(0, +e.target.value),
                              })
                            }
                          />
                        </Field>
                        <Field label="处理流程（每行一个步骤，受理后逐条复检）">
                          <textarea
                            rows={4}
                            value={form.alarmFlow}
                            placeholder={
                              "核对读数与识别值是否一致\n对照工艺卡片确认工况\n通知值班长并转现场处置"
                            }
                            onChange={(e) =>
                              FORM({ ...form, alarmFlow: e.target.value })
                            }
                          />
                        </Field>
                      </>
                    )}
                    {/* TGT-03（待确认）：环境类目标的告警策略落点尚未定论，先沿用本处，待产品 + 算法方拍板 */}
                    {form.targetKind !== "仪表" && (
                      <Note>
                        <b>待确认（TGT-03）</b>：环境类目标（气体 / 红外 / 声纹 / AI）的算法关联与告警策略，
                        落在「巡检目标台账」还是「巡检点」尚未定论；当前<b>暂放本处（目标台账）</b>，不新建第二个配置入口。
                      </Note>
                    )}
                  </div>
                </div>
                {/* 右栏：把左栏配好的内容直接展示出来（与左栏 1:1 对应，不重复输入） */}
                <div className="bt-preview">
                  <Panel
                    title="配置结果 · 直接展示"
                    extra={<span>{isTplMode ? "引用模板" : "手动输入"}</span>}
                  >
                    <div className="bt-sum">
                      <section className="bt-sum-group">
                        <h5>
                          <i>1</i>巡检要求
                        </h5>
                        <p className="bt-sum-value">
                          {effReq ? `${effReq.name}（${effReq.kind}）` : "—"}
                        </p>
                        {effReq?.description && (
                          <p className="bt-sum-quote">{effReq.description}</p>
                        )}
                        <div className="bt-sum-kv">
                          <span>采集方式</span>
                          <b>{effCapture || "—"}</b>
                          <span>单位</span>
                          <b>{form.unit || instrumentOf(pick)?.unit || "—"}</b>
                        </div>
                      </section>
                      <section className="bt-sum-group">
                        <h5>
                          <i>2</i>使用算法逻辑
                        </h5>
                        <p className="bt-sum-value">{form.algorithm || "—"}</p>
                      </section>
                      <section className="bt-sum-group">
                        <h5>
                          <i>3</i>告警规则
                        </h5>
                        <div className="bt-sum-kv">
                          <span>来源</span>
                          <b>
                            {isTplMode
                              ? effTpl
                                ? `引用模板 ${effTpl.name}（${effTpl.id}）`
                                : "引用模板 · 暂无匹配的启用模板"
                              : "手动输入"}
                          </b>
                          <span>触发条件</span>
                          <b>{triggerText(effTrigger)}</b>
                          <span>触发逻辑</span>
                          <b>{logicText(effTrigger)}</b>
                          <span>告警等级</span>
                          <b>{effLevel}</b>
                          <span>声光报警</span>
                          <b>{alarmText(effSeconds)}</b>
                        </div>
                        <h6>处置流程 · {effFlow.length} 步（受理后逐条复检）</h6>
                        {effFlow.length ? (
                          <ol className="flow-steps">
                            {effFlow.map((x, i) => (
                              <li key={i}>{x}</li>
                            ))}
                          </ol>
                        ) : (
                          <Note>
                            未配置处置流程：受理后按该级别的处置建议执行，可在「3、告警规则」里补步骤。
                          </Note>
                        )}
                      </section>
                    </div>
                  </Panel>
                </div>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
