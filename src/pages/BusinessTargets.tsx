/**
 * @file BusinessTargets.tsx
 * @description 巡检目标台账 = **仪表 + 巡检要求 + 算法**。
 *              核心前提：「仪表本身只是资产，不能直接巡检」——必须叠加巡检要求才可执行。
 *              列表 + 新增/编辑抽屉（两步：① 选检测目标（区域 → 设备 → 仪表）
 *              ② 配业务逻辑与算法 = **左栏配置**（1 巡检要求 / 2 使用算法逻辑 / 3 告警规则）+ **右栏直接展示**配置结果。
 * @interaction 菜单「资源与地图 › 点位与对象 › 巡检目标台账」（`points` 槽位）；
 *              「巡检点管理 › 添加巡检点」的巡检项从这里选（也可就地快速新建）；
 *              引擎 action：ADD_BUSINESS_TARGET / UPDATE_BUSINESS_TARGET
 */
import { useEffect, useState } from "react";
import { useStore } from "../data/store";
import { back, go, usePageSize, useViewState } from "../data/navigation";
import {
  Btn,
  Drawer,
  Empty,
  Field,
  Modal,
  Note,
  Panel,
  Table,
} from "../components/UI";
import { AreaSketch, type SketchPoint } from "../components/AreaSketch";
import { Pager } from "../components/Business";
import { FilterPanel } from "../components/FilterPanel";
import { useListDelete } from "../components/ListDelete";
import { Cascader, type CascaderOption } from "../components/Cascader";
import { AlarmItems } from "../components/AlarmItems";
import { DeviceTree, deviceTreeRegions } from "../components/DeviceTree";
import { defaultRangeOfUnit } from "../data/alarmRules";
import {
  derivedTargetNameOf,
  enabledAlarmClassesOf,
  itemKindOfTarget,
  newAlarmItem,
  settingOf,
  targetNameOf,
  upsertAlarmItem,
} from "../data/alarmSettings";
import {
  areaNameOf,
  deviceKindOf,
  defaultRequirementOfInstrument,
} from "../data/deviceMaster";
import { deviceKinds } from "../data/types";
import {
  alarmText,
  logicText,
  triggerText,
  type AlarmTrigger,
} from "../data/alarmRules";
import type {
  AlarmItem,
  BusinessTarget,
  DeviceKind,
  Instrument,
  JudgeType,
} from "../data/types";

/** 告警通知对象候选（岗位字典）：台账当前按默认「设备岗」带出，未提供选择入口 */
const NOTIFY_ROLES = ["设备岗", "巡检调度岗", "值班长"];
/** 触发条件说明默认值：台账不手填，关联模板时按模板回显「触发逻辑 · 声光报警」 */
const ALARM_TRIGGER = "单次异常即告警";

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
 * @param tab 传 "space" 时预置为「虚拟设备」筛选视图（侧边栏独立入口进入）
 * @param mode 传 "edit" 时渲染**编辑内置页**（同一份表单逻辑，去掉弹窗外壳）
 * @param id 内置页模式下被编辑的台账 id；"new" / 缺省 = 新建
 */
export function BusinessTargets({
  tab,
  id,
  mode,
}: { tab?: string; id?: string; mode?: "edit" } = {}) {
  const { s, act } = useStore();
  /** 内置页模式（列表页「编辑 / 添加」跳转进来）：台账设置弹窗装不下，改为独立页面 */
  const editing = mode === "edit";
  /** 路由 id：空 / "new" = 新建，否则为被编辑的台账 id */
  const initId = editing && id && id !== "new" ? id : "";
  /**
   * 列表筛选（生效值）：台账名称 / 算法 / 巡检目标 + 设备形态；
   * 左树另管区域 · 设备 · 单目标
   */
  const [nameF, NAMEF] = useViewState("bt.name", ""),
    [algoF, ALGOF] = useViewState("bt.algo", "全部"),
    [tgtKwF, TGTKWF] = useViewState("bt.targetKw", ""),
    [areaF, AF] = useViewState("bt.area", "全部"),
    [devF, DF] = useViewState("bt.device", "全部"),
    /** 设备形态筛选：全部 / 实体设备 / 虚拟设备（`tab="space"` 时预置虚拟设备） */
    [kindF, KF] = useViewState(
      "bt.kind",
      tab === "space" ? "虚拟设备" : "全部",
    ),
    /** 树「空间区域巡检」下选中的单个目标 id（空串 = 不收敛） */
    [tgtF, TF] = useViewState("bt.target", ""),
    [pager, PG] = useViewState("bt.page", 1),
    /** 每页条数：全站统一走 usePageSize（默认 5 条） */
    [pageSize, SETPAGESIZE] = usePageSize("bt.size");
  const [open, OPEN] = useState(false);
  /** 保存前的「配置结果」预览弹窗：结果不在页面上常驻展示，点保存才弹出做二次确认 */
  const [preview, CLOSE] = useState(false);
  /** 预览弹窗确认后的去向：close=回列表；add=留在本页继续新增（「保存并新增」） */
  const [previewAdd, PREVIEWADD] = useState(false);
  /** 筛选面板展开态 + 草稿条件（点「查询」才写回生效值） */
  const [filterOpen, SETFILTEROPEN] = useState(false);
  /** 筛选草稿：字段与 FilterPanel 的 fields 一一对应（点「查询」才写回生效值） */
  const [draft, DRAFT] = useState({
    name: nameF,
    algorithm: algoF,
    target: tgtKwF,
    kind: kindF,
  });
  const [editId, EDIT] = useState(initId);
  /** 第 1 段当前选中的仪表 id（空串 = 未选 / 选了区域 · 环境类目标） */
  const [pick, PICK] = useState("");
  /** 台账名称是否被用户手改过：没改过时预填派生值并跟着仪表 / 算法刷新 */
  const [nameTouched, NAMETOUCHED] = useState(false);
  /** 「配业务逻辑」的两个 Tab：算法模板（含算法与判定口径）/ 告警设置 */
  const [cfgTab, CFGTAB] = useState<"require" | "alarm">("require");
  /** 锚点绘制抽屉：复用右侧抽屉展示标绘页（与「区域配置」同一套 AreaSketch） */
  const [sketchOpen, SETSKETCHOPEN] = useState(false);
  /** 抽屉里编辑的锚点名称：点「保存范围」才一并写回表单 */
  const [sketchAnchor, SETSKETCHANCHOR] = useState("");
  const [form, FORM] = useState({
    /** 台账名称：留空时按仪表名 / 锚点派生（列表展示与告警名称的默认值都取这里） */
    name: "",
    /** TGT-01：目标类型（仪表类挂设备；环境 / 区域类不关联设备） */
    targetKind: "仪表" as "仪表" | "环境" | "区域",
    /** TGT-02：区域 / 空间目标的参照物锚点 */
    anchor: "",
    /**
     * 锚点范围：在全厂底图上绘制 / 框选出的多边形（闭合才落库）
     * @description 与区域配置同一套坐标口径；不画也能保存（锚点文本已够描述位置）
     */
    anchorPolygon: [] as SketchPoint[],
    /** 绘制中的范围是否已闭合（闭合后「保存范围」才有意义） */
    anchorClosed: false,
    requirementId: "",
    algorithm: "",
    criteria: "",
    /**
     * 告警项清单（入口：本处 /「告警管理 › 告警设置」，同一份数据）：
     * **第一条 = 主告警项 = 台账的判定口径**（判断类型 / 阈值 / 单位 / 等级 / 声光报警同源），
     * 每条都可选模板（一键带出内容字段）或直接手填
     */
    alarmItems: [] as AlarmItem[],
    alarmTrigger: ALARM_TRIGGER,
    alarmNotify: ["设备岗"] as string[],
    /**
     * 台账级告警字段只剩「触发条件说明 + 通知对象」
     * @description 告警分类 / 触发逻辑都按**告警项**单独配（第一条 = 主项 = 台账判定口径，
     *              台账级的 category / triggerMode 由主项派生，页面上不再有台账级入口）；
     *              告警开关不在本页展示：台账创建即开启，停用只在「告警管理 › 告警设置」操作；
     *              告警名称也不在此维护：名称统一由台账名称派生（alarmSettings.targetNameOf）
     */
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
  /**
   * 台账名称预填：用户没手改过名称时，跟着锚点等表单改动刷新派生值
   * @description 名称一打开就有值（不再是空的），且可直接改；手改过就不再被自动覆盖。
   *              未手改的（等于派生值）保存为「未自定义」，换仪表 / 换算法后名称自动跟随
   * @param patch 本次一并生效的表单改动，用于算出新的派生名
   * @returns 要合并进表单的名称补丁；手改过则为空对象
   */
  const namePatch = (patch: Partial<typeof form> = {}) => {
    if (nameTouched) return {};
    const next = { ...form, ...patch };
    return {
      name: derivedTargetNameOf(s, {
        id: editId,
        instrumentId: pick,
        anchor: next.anchor,
        algorithm: next.algorithm,
        requirementId: next.requirementId,
      }),
    };
  };

  /** 切换巡检要求：把要求默认的算法 / 判定 / 阈值 / 采集要求填进表单（主告警项随之刷新） */
  function applyRequirement(rid: string, ins?: Instrument) {
    const req = requirements.find((r) => r.id === rid);
    const range =
      req?.judge === "数值范围"
        ? // 优先用巡检要求自己声明的量程（如区域气体 ppm 0–50），没有才按单位默认量程
          req.min !== undefined && req.max !== undefined
          ? { min: req.min, max: req.max }
          : defaultRangeOfUnit(req.unit || ins?.unit) || { min: 0, max: 1 }
        : undefined;
    FORM((old) => {
      const prevMain = old.alarmItems[0];
      /**
       * 主告警项 = 台账判定口径：判定方式 / 阈值 / 单位 / 期望状态随巡检要求刷新
       */
      const main: AlarmItem = {
        ...(prevMain || {
          id: "AI-" + Math.random().toString(36).slice(2, 8),
          category: itemKindOfTarget(old),
          envKind: undefined,
          level: "二级" as AlarmItem["level"],
          abnormalName: "",
          alarmSeconds: 10,
          judge: "数值范围" as AlarmItem["judge"],
        }),
        category: itemKindOfTarget(old),
        envKind: old.targetKind === "仪表" ? undefined : prevMain?.envKind,
        judge: req?.judge || "数值范围",
        value: req?.judge === "数值范围" ? undefined : req?.expected || "",
        from: range?.min ?? 0,
        to: range?.max ?? 1,
        unit: req?.unit || ins?.unit || "",
        abnormalName:
          prevMain?.abnormalName ||
          `${ins?.name || old.anchor || req?.name || "检测目标"} · 异常`,
      };
      return {
        ...old,
        // 台账名称预填：没手改过时跟着仪表 / 算法刷新（选仪表、切换巡检要求都会走到这里）
        ...(nameTouched
          ? {}
          : {
              name: derivedTargetNameOf(s, {
                id: editId,
                instrumentId: ins?.id || pick,
                anchor: old.anchor,
                algorithm: req?.algorithm || "",
                requirementId: rid,
              }),
            }),
        requirementId: rid,
        algorithm: req?.algorithm || "",
        criteria: req?.description || "",
        // 告警项由用户点「+ 告警等级配置」手动新增：空表不代建，
        // 已有条目时只把第一条的口径跟着巡检要求刷新（主项 = 台账判定口径）
        alarmItems: old.alarmItems.length ? [main, ...old.alarmItems.slice(1)] : [],
        needPhoto: req?.needPhoto ?? true,
        needVideo: req?.needVideo ?? false,
        needReview: req?.needReview ?? false,
        cycle: req?.cycle || "每日",
      };
    });
  }
  /**
   * 可否提交：巡检目标（巡检要求 + 算法）与**至少一条告警项**缺一不可
   * @description 告警项改为手动新增后，空表即没有判定口径，台账不能建
   */
  const canSubmit =
    !!form.requirementId && !!form.algorithm.trim() && !!form.alarmItems.length;
  /** 主告警项（第一条）：与台账判定口径同源——判断类型 / 阈值 / 单位 / 等级 / 声光报警都取它 */
  const mainItem = form.alarmItems[0];
  /** 主项的判定口径：台账 `judge / unit / min / max / expected` 在页面上的唯一来源 */
  const mainJudge = mainItem?.judge || "数值范围";
  const mainUnit = mainItem?.unit || "";
  /**
   * 保存预览用的生效告警规则（与引擎 rulesOf 同源）
   * @description 判定口径与触发逻辑都取主告警项（第一条），台账级不再单独配
   */
  const effTrigger: AlarmTrigger = {
    type: mainJudge === "期望状态" ? "期望状态" : "数值范围",
    unit: mainUnit,
    min: mainItem?.from ?? 0,
    max: mainItem?.to ?? 0,
    expected: mainItem?.value || "",
    mode: mainItem?.triggerMode || "识别即触发",
    consecutive: Math.max(2, mainItem?.consecutive ?? 2),
  };
  /** 生效等级 / 声光报警：主项自己的值（引用模板时就是模板带出的值） */
  const effLevel = mainItem?.level || "二级";
  const effSeconds = Math.max(0, mainItem?.alarmSeconds ?? 0);
  /** 巡检要求（第 1 段）与采集方式 / 单位：右侧展示面板与保存校验共用 */
  const effReq = requirements.find((r) => r.id === form.requirementId);
  /** 采集方式：仪表类用仪表自己的；环境 / 区域类没有仪表，由巡检要求给出 */
  const effCapture = instrumentOf(pick)?.capture || effReq?.capture;
  /**
   * 「算法模板」候选：只列启用中的模板，并按目标类型过滤（来源主数据 `Requirement.targetKinds`）
   * @description 仪表类目标不出现"看区域气体浓度"；区域 / 环境类目标不出现"看仪表读数"。
   *              当前已选值不在候选里时（老数据 / 已停用）仍保留一行，避免打开即丢值
   */
  const reqOptions = (() => {
    const list = requirements.filter(
      (r) =>
        r.state !== "停用" &&
        (r.targetKinds || ["仪表", "环境", "区域"]).includes(form.targetKind),
    );
    const cur = requirements.find(
      (r) => r.id === form.requirementId && !list.some((x) => x.id === r.id),
    );
    return cur ? [cur, ...list] : list;
  })();
  /** 区域 / 环境类目标可选的算法模板（第 1 段「区域 / 环境目标」分组按它生成候选） */
  const envReqOptions = requirements.filter(
    (r) =>
      r.state !== "停用" &&
      (r.targetKinds?.includes("区域") || r.targetKinds?.includes("环境")),
  );
  /**
   * 新建一条告警项的默认值（点「+ 告警等级配置」时的初值）
   * @description 告警项不再随巡检要求自动生成，改为用户手动新增；
   *              但初值仍按当前巡检要求带出判定口径（判断方式 / 阈值 / 单位），
   *              用户进去只要确认或微调，不用从 0 开始填
   */
  function makeAlarmItem() {
    const req = requirements.find((r) => r.id === form.requirementId);
    const ins = instrumentOf(pick);
    /** 量程：要求自带的优先（如区域气体 ppm 0–50），否则按单位默认 */
    const range =
      req?.judge === "数值范围"
        ? req.min !== undefined && req.max !== undefined
          ? { min: req.min, max: req.max }
          : defaultRangeOfUnit(req.unit || ins?.unit) || { min: 0, max: 1 }
        : undefined;
    return {
      ...newAlarmItem(
        itemKindOfTarget(form),
        "二级",
        `${form.name.trim() || ins?.name || form.anchor || "检测目标"} · 异常`,
      ),
      judge: req?.judge || "数值范围",
      value: req?.judge === "数值范围" ? undefined : req?.expected || "",
      from: range?.min ?? 0,
      to: range?.max ?? 1,
      unit: req?.unit || ins?.unit || "",
    };
  }
  /** 弹窗保存告警项：第一条（主项）即台账判定口径，不再单独维护 judge / min / max */
  function saveAlarmItem(index: number | null, item: AlarmItem) {
    FORM((old) => ({
      ...old,
      alarmItems: upsertAlarmItem(old.alarmItems, index, item),
    }));
  }
  /**
   * 保存绘制结果：锚点名称 + 多边形一起写回表单
   * @description 名称影响台账派生名（未手改过时同步刷新），所以走 namePatch
   */
  function saveSketch() {
    const anchor = sketchAnchor.trim() || form.anchor;
    FORM({ ...form, anchor, ...namePatch({ anchor }) });
    SETSKETCHOPEN(false);
  }
  /** 删除某一条（至少保留一条：第一条 = 台账判定口径） */
  function removeAlarmItem(i: number) {
    FORM((old) => ({
      ...old,
      alarmItems: old.alarmItems.filter((_, j) => j !== i),
    }));
  }
  /** 打开新增抽屉：默认选中该仪表的"默认巡检要求"（采集方式 + 单位决定看什么） */
  function openAdd() {
    EDIT("");
    PICK("");
    CFGTAB("require");
    // 新增：名称未手改 → 选中仪表 / 要求后自动预填派生值
    NAMETOUCHED(false);
    FORM({
      name: "",
      targetKind: "仪表",
      anchor: "",
      anchorPolygon: [],
      anchorClosed: false,
      requirementId: "",
      algorithm: "",
      criteria: "",
      // 告警项：默认为空，由用户点「+ 告警等级配置」手动新增
      alarmItems: [],
      alarmTrigger: ALARM_TRIGGER,
      alarmNotify: ["设备岗"],
      needPhoto: true,
      needVideo: false,
      needReview: false,
      cycle: "每日",
      inspect: true,
    });
    OPEN(true);
  }
  /** 打开编辑页：目标只读（换目标等于换台账），其余照常可改 */
  function openEdit(b: BusinessTarget) {
    EDIT(b.id);
    PICK(b.instrumentId || "");
    CFGTAB("require");
    // 名称预填：有自定义名就带出来，没有则填派生值（打开即有内容、可直接改）
    NAMETOUCHED(!!b.name);
    FORM({
      name: targetNameOf(s, b),
      targetKind: b.targetKind || "仪表",
      anchor: b.anchor || "",
      // 已绘制的范围直接回显，方便接着改
      anchorPolygon: b.anchorPolygon ? [...b.anchorPolygon] : [],
      anchorClosed: !!b.anchorPolygon?.length,
      requirementId: b.requirementId,
      algorithm: b.algorithm,
      criteria: b.criteria || "",
      /**
       * 告警项：与「告警管理 › 告警设置」同一份数据（第一条 = 台账判定口径，
       * 老缓存缺项时由 settingOf 按台账判定口径补齐；主项模板从台账关联模板回落）
       */
      alarmItems: settingOf(s, b).items,
      alarmTrigger: b.alarm?.trigger || ALARM_TRIGGER,
      alarmNotify: b.alarm?.notify || ["设备岗"],
      needPhoto: b.needPhoto,
      needVideo: b.needVideo,
      needReview: b.needReview,
      cycle: b.cycle,
      inspect: b.inspect,
    });
    OPEN(true);
  }
  /**
   * 内置页模式：挂载即按路由 id 初始化表单
   * @description 列表页「编辑 / 添加」已改为跳转本页（弹窗装不下）；仅初始化一次
   */
  useEffect(() => {
    if (!editing) return;
    const b = initId ? targets.find((t) => t.id === initId) : undefined;
    if (b) openEdit(b);
    else openAdd();
    // 仅挂载时初始化：之后按用户的编辑动作走
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /**
   * 保存：新增走 ADD，编辑走 UPDATE
   * @param keepAdding 保存并新增：落库后把表单复位成新建态，留在本页继续录下一条
   * @returns 是否成功（失败时「保存前预览」弹窗保持打开，好让用户看到提示）
   */
  function save(keepAdding = false) {
    const prev = editId ? targets.find((t) => t.id === editId) : undefined;
    /** 主告警项 = 台账的判定口径（「告警管理 › 告警设置」里的第一条）：两处共用同一份数据 */
    const main = form.alarmItems[0];
    if (!main) return false;
    const rangeJudged = main.judge === "数值范围";
    const payload = {
      /**
       * 台账名称：表单里预填的是派生值，用户没改过就按「未自定义」存（undefined），
       * 换仪表 / 换算法后名称自动跟随；手改过则按输入存，清空同样回到派生
       */
      name: nameTouched && form.name.trim() ? form.name.trim() : undefined,
      // TGT-01/02：目标类型 + 区域锚点（环境 / 区域类不关联设备）
      targetKind: form.targetKind,
      anchor: form.anchor,
      // 锚点范围：只有闭合的多边形才随台账落库
      anchorPolygon: form.anchorClosed ? form.anchorPolygon : undefined,
      requirementId: form.requirementId,
      algorithm: form.algorithm,
      // 判定口径随主告警项（第一条）走，不再单独维护
      judge: main.judge,
      unit: main.unit || "",
      min: rangeJudged ? main.from ?? 0 : 0,
      max: rangeJudged ? main.to ?? 0 : 1,
      expected: rangeJudged ? "" : main.value || "",
      criteria: form.criteria,
      /**
       * 告警设置（与「告警管理 › 告警设置」同一份数据）：开关 + 来源 + 等级 / 声光报警 +
       * 告警项；来源由主项是否引用模板决定。
       * 告警分类 / 触发逻辑都按告警项单独配，台账级只存主项（第一条）的镜像值
       */
      alarm: {
        ...prev?.alarm,
        // 告警名称已废弃（统一由台账名称派生）：写回时清掉老缓存里的残留值
        name: undefined,
        // 分类 / 触发逻辑取主项；主项没选分类时保留原值，不把已配好的值清掉
        category: main.alarmClass || prev?.alarm?.category,
        // 告警开关：台账创建即开启（缺省 true），停用只由「告警管理 › 告警设置」改写
        enabled: prev?.alarm?.enabled !== false,
        level: main.level,
        trigger: form.alarmTrigger,
        notify: form.alarmNotify,
        triggerMode: main.triggerMode || "识别即触发",
        consecutive: Math.max(2, main.consecutive ?? 2),
        alarmSeconds: Math.max(0, main.alarmSeconds),
        items: form.alarmItems,
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
    if (ok) {
      // 保存并新增：留在本页并复位成新建态；否则沿目录返回来源列表
      if (keepAdding) openAdd();
      else back();
    }
    // 返回值给「保存前预览」弹窗用：失败时保持弹窗，好让用户看到提示
    return ok;
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
  /**
   * 目标归属的设备形态：关联设备的按其形态；不关联设备（环境 / 区域类目标）视为虚拟设备
   * @description 与「设备台账」的 deviceKind 同源，避免两处各判一套
   */
  const deviceKindOfTarget = (b: BusinessTarget): DeviceKind => {
    const dev = b.instrumentId ? deviceOf(b.instrumentId) : undefined;
    return dev ? deviceKindOf(dev) : "虚拟设备";
  };
  /** 设备形态筛选值容错：老视图状态残留「装置 / 空间与区域」时一律回落「全部」 */
  const kindFv = (["全部", ...deviceKinds] as string[]).includes(kindF)
    ? kindF
    : "全部";
  /** 算法筛选候选：取自台账现用算法（只有被用到的算法才值得筛） */
  const algoFilterOptions = [
    "全部",
    ...new Set(targets.map((b) => b.algorithm).filter(Boolean)),
  ];
  /** 已生效的筛选条件数（「筛选」按钮上的计数） */
  const filterCount =
    (nameF.trim() ? 1 : 0) +
    (algoF !== "全部" ? 1 : 0) +
    (tgtKwF.trim() ? 1 : 0) +
    (kindFv !== "全部" ? 1 : 0);
  /** 展开筛选面板：用当前生效值填充草稿 */
  function toggleFilter() {
    if (!filterOpen)
      DRAFT({ name: nameF, algorithm: algoF, target: tgtKwF, kind: kindF });
    SETFILTEROPEN(!filterOpen);
  }
  /** 查询：草稿写回生效值并收起面板 */
  function applyFilter() {
    NAMEF(draft.name);
    ALGOF(draft.algorithm);
    TGTKWF(draft.target);
    KF(draft.kind);
    PG(1);
    SETFILTEROPEN(false);
  }
  /** 重置：清空草稿并立即生效 */
  function resetFilter() {
    DRAFT({ name: "", algorithm: "全部", target: "", kind: "全部" });
    NAMEF("");
    ALGOF("全部");
    TGTKWF("");
    KF("全部");
    PG(1);
  }
  const nameKw = nameF.trim();
  const tgtKw = tgtKwF.trim();
  const list = targets.filter((b) => {
    const c = crumb(b.instrumentId);
    if (kindFv !== "全部" && deviceKindOfTarget(b) !== kindFv) return false;
    if (algoF !== "全部" && b.algorithm !== algoF) return false;
    // 台账名称：按列表展示名匹配（自定义名，留空时回落仪表名）
    if (nameKw && !targetNameOf(s, b).includes(nameKw)) return false;
    // 巡检目标：仪表类按「区域 › 设备 › 仪表」，区域 / 环境类按参照物锚点
    if (tgtKw) {
      const hay = b.instrumentId
        ? c.area + c.device + c.instrument
        : b.anchor || "";
      if (!hay.includes(tgtKw)) return false;
    }
    if (areaF !== "全部" && c.area !== areaF) return false;
    if (devF !== "全部" && c.device !== devF) return false;
    // 树上点中「空间区域巡检」下的某个目标：列表收敛到这一条（点分组节点则回全部）
    if (tgtF && b.id !== tgtF) return false;
    return true;
  });
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const cur = Math.min(pager || 1, pages);
  const rows = list.slice((cur - 1) * pageSize, cur * pageSize);
  /** 本页多选：全选 / 反选按当前页收敛（翻页时已选保留） */
  const pageIds = rows.map((b) => b.id);
  /** 列表删除（通用组件）：点「删除」进入多选 + 批量删除 + 二次确认 */
  const del = useListDelete({
    onDelete: (ids) => act({ type: "DELETE_BUSINESS_TARGETS", ids }),
    batch: {
      pageIds,
      title: () => "删除巡检目标台账",
      text: (n) =>
        `确认删除选中的 ${n} 个巡检目标台账？其告警设置一并移除，且不可恢复。`,
    },
  });
  /** 是否处于多选态：勾选列只在点「删除」后出现（与设备台账同一交互） */
  const multi = del.sel !== null;
  /**
   * 第 1 段（选巡检目标）的级联候选：**严格取自设备台账**（`devices[].items`，
   * 不出现台账没有的目标），路径 = 区域 › 设备 › 检测目标，括号里只显示台账的「分类」；
   * 末级另起「区域 / 环境目标」分组（从适用的算法模板进入，不关联设备台账）
   */
  const targetOptions: CascaderOption[] = (() => {
    const byArea = new Map<string, CascaderOption[]>();
    (s.devices || []).forEach((d) => {
      const items = (d.items || []).map((it) => ({
        value: `i:${it.id}`,
        label: `${it.target}（${it.category || "—"}）`,
      }));
      if (!items.length) return;
      const area = areaNameOf(s, d);
      const list = byArea.get(area) || [];
      list.push({ value: `d:${d.id}`, label: d.name, children: items });
      byArea.set(area, list);
    });
    return [
      ...[...byArea].map(([area, children]) => ({
        value: `a:${area}`,
        label: area,
        children,
      })),
      {
        value: "env-group",
        label: "区域 / 环境目标",
        children: envReqOptions.map((r) => ({
          value: `r:${r.id}`,
          label: r.name,
        })),
      },
    ];
  })();
  /** 分组下拉当前值：仪表 = `i:<仪表 id>`；区域 / 环境 = `r:<巡检要求 id>` */
  const pickValue = pick
    ? `i:${pick}`
    : form.targetKind !== "仪表" && form.requirementId
      ? `r:${form.requirementId}`
      : "";
  /** 第 1 段是否已有目标（决定下方的配业务逻辑区是否展开） */
  const hasTarget = !!pick || (form.targetKind !== "仪表" && !!form.requirementId);
  const picked = instrumentOf(pick);
  /**
   * 第 1 段选巡检目标（分组下拉）
   * @description `i:<仪表 id>` = 设备类目标（带出该仪表的默认巡检要求）；
   *              `r:<巡检要求 id>` = 区域 / 环境类目标（不关联设备台账，类型随要求的适用类型）
   * @param v 下拉值
   */
  function pickTarget(v: string) {
    if (v.startsWith("i:")) {
      const ins = instrumentOf(v.slice(2));
      PICK(v.slice(2));
      FORM((old) => ({ ...old, targetKind: "仪表" }));
      if (ins) applyRequirement(defaultRequirementOfInstrument(ins), ins);
      return;
    }
    if (v.startsWith("r:")) {
      const rid = v.slice(2);
      const r = requirements.find((x) => x.id === rid);
      const kind: "区域" | "环境" = (r?.targetKinds || []).includes("区域")
        ? "区域"
        : "环境";
      PICK("");
      // 先定目标类型（决定告警项分类与候选巡检要求），再按该要求带出采集方式 / 算法 / 判定口径
      FORM((old) => ({ ...old, targetKind: kind }));
      applyRequirement(rid);
    }
  }
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
      {/*
        列表视图：内置页模式（`mode="edit"`）下**不渲染列表**，
        只渲染下方的编辑表单——原弹窗改为整页后，两者必须互斥
      */}
      {!editing && (
        <>
      <div className="device-layout">
        {/* 左侧区域 › 设备树：与设备台账同一棵树，选中即落到页面既有的区域 / 设备筛选维度 */}
        <DeviceTree value={treeSel} onChange={onTree} ariaLabel="巡检目标树" />
        <div className="device-main">
          {/* 列表块：标题 + 计数 + 筛选 / 删除 / 新增 全收在面板头，条件展开在面板体内（与设备台账同款） */}
          <Panel
            className="panel-filters-wrap"
            title="巡检目标台账列表"
            extra={
              <div className="actions">
                <span className="panel-count">{list.length} 条</span>
                {/* 关键词搜索并入「筛选」面板：台账名称 / 算法 / 巡检目标 / 设备形态 */}
                <Btn onClick={toggleFilter}>
                  {filterOpen ? "收起筛选" : "筛选"}
                  {filterCount ? `（${filterCount}）` : ""}
                </Btn>
                {/* 删除选中：点一次进入多选，勾完点此处批量删除（通用组件） */}
                {del.bar}
                <Btn primary onClick={() => go("business-target-edit", "new")}>
                  新增
                </Btn>
              </div>
            }
          >
            {filterOpen && (
              <FilterPanel
                fields={[
                  { key: "name", label: "台账名称", placeholder: "名称关键字" },
                  { key: "algorithm", label: "算法", options: algoFilterOptions },
                  {
                    key: "target",
                    label: "巡检目标",
                    placeholder: "仪表 / 锚点关键字",
                  },
                  { key: "kind", label: "设备形态", options: ["全部", ...deviceKinds] },
                ]}
                value={draft}
                onChange={(next) => DRAFT({ ...draft, ...next })}
                onSearch={applyFilter}
                onReset={resetFilter}
              />
            )}
            <Table
              className={del.tableClass}
              heads={[
                ...(multi ? [del.head] : []),
                "名称",
                "巡检目标编码",
                "目标",
                "设备 / 锚点",
                "算法模板",
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
                  // 多选：点「删除」进入多选后才出现勾选框（被巡检点引用的台账引擎会拦截）
                  ...(multi ? [del.cell(b.id, targetNameOf(s, b))] : []),
                  // 名称 = 自定义台账名，留空时回落到仪表名（与告警名称同源）
                  <b>{targetNameOf(s, b)}</b>,
                  // ID 是巡检项 / 任务快照引用的主键：只读展示，便于排查对账
                  <span className="muted">{b.id}</span>,
                  c.instrument,
                  c.device,
                  req?.name || b.requirementId,
                  <Btn onClick={() => go("business-target-edit", b.id)}>编辑</Btn>,
                ];
              })}
            />
            {!rows.length && (
              <Empty>
                没有符合条件的巡检目标台账，点「＋ 添加巡检目标台账」新建。
              </Empty>
            )}
            <Pager
              page={cur}
              count={list.length}
              size={pageSize}
              onChange={PG}
              onSize={(n) => {
                SETPAGESIZE(n);
                PG(1);
              }}
            />
          </Panel>
        </div>
      </div>

      {/* 批量删除二次确认（通用组件；被巡检点引用的台账由引擎拦截并给出提示） */}
      {del.modal}
        </>
      )}

      {open && (
        <div className="inner-page bt-edit-page">
          {/* 内置页顶栏：合并为单页后不再有「上一步 / 下一步」，只留取消 / 保存 */}
          <div className="context-bar">
            <b>
              {editId
                ? `编辑巡检目标台账 · ${form.name.trim() || editId}`
                : "添加巡检目标台账"}
            </b>
            <div className="actions">
              <Btn onClick={() => back()}>取消</Btn>
              <Btn
                disabled={!canSubmit}
                onClick={() => {
                  PREVIEWADD(true);
                  CLOSE(true);
                }}
              >
                保存并新增
              </Btn>
              <Btn
                primary
                disabled={!canSubmit}
                onClick={() => {
                  PREVIEWADD(false);
                  CLOSE(true);
                }}
              >
                {editId ? "保存修改" : "创建巡检目标台账"}
              </Btn>
            </div>
          </div>
          {/*
            第 1 段：选巡检目标 —— 一个带分组的下拉框（按「区域 › 设备」分组列仪表，
            末组列区域 / 环境类目标），选中即带出默认巡检要求；下方接着配业务逻辑与算法，同页完成
          */}
          <Panel title="基础信息">
            <div className="bt-basic">
            <Field label="巡检目标" required>
              {/* 级联：区域 › 设备 › 检测目标（名称括号里只显示台账的分类） */}
              <Cascader
                options={targetOptions}
                value={pickValue}
                disabled={!!editId}
                placeholder="请选择巡检目标"
                onChange={pickTarget}
              />
            </Field>
            {/* 台账名称：打开即预填派生值（仪表名 / 锚点 / 巡检要求名 + 算法），可直接改、可清空 */}
            <Field label="台账名称">
              <input
                value={form.name}
                onChange={(e) => {
                  // 手改过就不再被自动预填覆盖；清空 = 回到派生口径
                  NAMETOUCHED(true);
                  FORM({ ...form, name: e.target.value });
                }}
              />
            </Field>
            {/* TGT-02：区域 / 空间目标必须填写参照物锚点 */}
            {form.targetKind !== "仪表" && (
              <Field
                label={`参照物锚点${
                  form.targetKind === "区域" ? "（区域类必填）" : "（可选）"
                }`}
              >
                {/* 文字 + 图上圈范围：手填太随意，给一个「画出来」的入口 */}
                <div className="field-with-btn">
                  <input
                    value={form.anchor}
                    placeholder="例如 3# 罐区北侧立柱 / 管廊 A 段起点"
                    onChange={(e) => {
                      const anchor = e.target.value;
                      // 锚点变化影响派生名：没手改过名称时同步刷新
                      FORM({ ...form, anchor, ...namePatch({ anchor }) });
                    }}
                  />
                  <Btn
                    onClick={() => {
                      SETSKETCHANCHOR(form.anchor);
                      SETSKETCHOPEN(true);
                    }}
                  >
                    {form.anchorPolygon.length ? "修改范围" : "绘制"}
                  </Btn>
                </div>
              </Field>
            )}
            {editId && (
              <Field label="台账 ID">
                <span className="muted">{editId}</span>
              </Field>
            )}
            </div>
          </Panel>

          {/*
            业务逻辑常驻展示：未选巡检目标时整块置灰不可操作，
            而不是整块隐藏——区块忽隐忽现会让页面高度跳、也看不出这里要配什么
          */}
          <Panel
            title="业务逻辑"
            className={hasTarget ? "" : "panel-locked"}
          >
              <div className="bt-config-wide">
              {/* 配业务逻辑：算法模板（算法与判定口径随模板带出）/ 告警设置，两个 Tab */}
              <div className="segmented" style={{ marginBottom: 14 }}>
                <button
                  className={cfgTab === "require" ? "active" : ""}
                  onClick={() => CFGTAB("require")}
                >
                  算法模板
                </button>
                <button
                  className={cfgTab === "alarm" ? "active" : ""}
                  onClick={() => CFGTAB("alarm")}
                >
                  告警设置
                </button>
              </div>
              {cfgTab === "require" && (
                <>
                  {/* 算法模板：字段用表单排布（标签在上、控件在下），只留「算法模板」可改，其余为派生值 */}
                  <div className="bt-req-form">
                    <Field label="算法模板" required className="full">
                      <select
                        value={form.requirementId}
                        onChange={(e) => {
                          const rid = e.target.value;
                          // 占位项（未选巡检目标）不触发带出，避免把已填的口径清空
                          if (rid) applyRequirement(rid, picked);
                        }}
                      >
                        {!form.requirementId && (
                          <option value="">请先选择巡检目标</option>
                        )}
                        {reqOptions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}（{r.code} · {r.kind}
                            {r.targetKinds?.length
                              ? ` · 适用 ${r.targetKinds.join(" / ")}`
                              : ""}
                            ）
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="算法">
                      <input value={form.algorithm || "—"} readOnly />
                    </Field>
                    <Field label="采集方式">
                      <input value={effCapture || "—"} readOnly />
                    </Field>
                    <Field label="单位">
                      <input value={mainUnit || instrumentOf(pick)?.unit || "—"} readOnly />
                    </Field>
                    <Field label="判定口径">
                      <input
                        readOnly
                        value={judgeText({
                          judge: mainJudge,
                          min: mainItem?.from,
                          max: mainItem?.to,
                          unit: mainUnit,
                          expected: mainItem?.value,
                        })}
                      />
                    </Field>
                  </div>
                  {effReq?.description && (
                    <p className="muted">{effReq.description}</p>
                  )}
                </>
              )}
              {cfgTab === "alarm" && (
                <>
                    {/*
                      告警设置：列表只做展示与删除，参数填写走弹窗；
                      告警分类 / 触发逻辑 / 等级 / 阈值都按条单独配，第一条 = 台账判定口径。
                      与「告警管理 › 告警设置」同一份数据，改任一处另一处同步
                    */}
                    <AlarmItems
                      items={form.alarmItems}
                      alarmClasses={enabledAlarmClassesOf(s)}
                      makeItem={makeAlarmItem}
                      onSave={saveAlarmItem}
                      onRemove={removeAlarmItem}
                    />
                    {/* TGT-03（待确认）：环境类目标的告警策略落点尚未定论，先沿用本处，待产品 + 算法方拍板 */}
                    {form.targetKind !== "仪表" && (
                      <Note>
                        <b>待确认（TGT-03）</b>：环境类目标（气体 / 红外 / 声纹 / AI）的算法关联与告警策略，
                        落在「巡检目标台账」还是「巡检点」尚未定论；当前<b>暂放本处（目标台账）</b>，不新建第二个配置入口。
                      </Note>
                    )}
                </>
              )}
              </div>
          </Panel>

          {/*
            保存前预览（二次确认）：配置结果不在页面上常驻展示，
            点「保存」才把当前配好的内容摊开给用户核对，确认后才真正落库
          */}
          {preview && (
            <Modal
              title="确认保存 · 配置结果预览"
              wide
              onClose={() => CLOSE(false)}
              footer={
                <>
                  <Btn onClick={() => CLOSE(false)}>返回修改</Btn>
                  <Btn
                    primary
                    onClick={() => {
                      // 保存成功会离开 / 复位本页；失败则保持弹窗，用户能看到提示后返回修改
                      if (save(previewAdd)) CLOSE(false);
                    }}
                  >
                    {previewAdd ? "保存并新增" : "确认保存"}
                  </Btn>
                </>
              }
            >
              <div className="bt-preview">
                <Panel title="配置结果 · 直接展示">
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
                        <b>{mainUnit || instrumentOf(pick)?.unit || "—"}</b>
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
                        <span>台账名称</span>
                        <b>{form.name.trim() || "—"}</b>
                        <span>告警分类</span>
                        <b>{mainItem?.alarmClass || "—"}</b>
                        <span>触发条件</span>
                        <b>{triggerText(effTrigger)}</b>
                        <span>触发逻辑</span>
                        <b>{logicText(effTrigger)}</b>
                        <span>告警等级</span>
                        <b>{effLevel}</b>
                        <span>声光报警</span>
                        <b>{alarmText(effSeconds)}</b>
                        <span>告警项</span>
                        <b>{form.alarmItems.length} 条</b>
                      </div>
                    </section>
                  </div>
                </Panel>
              </div>
            </Modal>
          )}
        </div>
      )}
      {/*
        锚点绘制抽屉：与「区域配置」复用同一个 AreaSketch（全厂底图 + 标绘工具 + 标绘列表）
        —— 手填一段文字既不好写也不好对账，直接在图上圈出来更直观
      */}
      {sketchOpen && (
        <Drawer
          title="绘制参照物范围"
          subtitle={`${form.targetKind}类目标 · 锚点名称与范围一起保存`}
          onClose={() => SETSKETCHOPEN(false)}
          footer={
            <>
              <Btn onClick={() => SETSKETCHOPEN(false)}>取消</Btn>
              <Btn primary onClick={saveSketch}>
                保存范围
              </Btn>
            </>
          }
        >
          <Field label="锚点名称">
            <input
              value={sketchAnchor}
              placeholder="例如 3# 罐区北侧立柱 / 管廊 A 段起点"
              onChange={(e) => SETSKETCHANCHOR(e.target.value)}
            />
          </Field>
          <AreaSketch
            label={sketchAnchor}
            height={420}
            value={{
              points: form.anchorPolygon,
              closed: form.anchorClosed,
            }}
            onChange={(next) =>
              FORM({
                ...form,
                anchorPolygon: next.points,
                anchorClosed: next.closed,
              })
            }
          />
          <Note>
            多边形：依次点顶点，点回首点自动闭合；矩形：两次点击取对角。右侧工具条可撤销 / 重做 / 清空。
            {!form.anchorClosed && "未闭合时也能保存，但只有闭合的范围才会随台账落库。"}
          </Note>
        </Drawer>
      )}
    </>
  );
}
