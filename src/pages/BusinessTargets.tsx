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
import { useEffect, useState } from "react";
import { useStore } from "../data/store";
import { back, go, useViewState } from "../data/navigation";
import { Btn, Empty, Field, Modal, Note, Panel, Steps, Table } from "../components/UI";
import { Pager } from "../components/Business";
import { AlarmItemAddBar, AlarmItemTable } from "../components/AlarmItemTable";
import { DeviceTree, deviceTreeRegions } from "../components/DeviceTree";
import { defaultRangeOfUnit } from "../data/alarmRules";
import {
  derivedTargetNameOf,
  enabledAlarmClassesOf,
  itemFromTemplate,
  itemKindOfTarget,
  newAlarmItem,
  settingOf,
  targetNameOf,
  withMainAlarmItem,
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
  templatesOf,
  triggerText,
  type AlarmTrigger,
} from "../data/alarmTemplates";
import type {
  AlarmItem,
  BusinessTarget,
  DeviceKind,
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
  const [kw, KW] = useViewState("bt.q", ""),
    [areaF, AF] = useViewState("bt.area", "全部"),
    [devF, DF] = useViewState("bt.device", "全部"),
    /** 设备形态筛选：全部 / 实体设备 / 虚拟设备（`tab="space"` 时预置虚拟设备） */
    [kindF, KF] = useViewState(
      "bt.kind",
      tab === "space" ? "虚拟设备" : "全部",
    ),
    /** 树「空间区域巡检」下选中的单个目标 id（空串 = 不收敛） */
    [tgtF, TF] = useViewState("bt.target", ""),
    [pager, PG] = useViewState("bt.page", 1);
  const [open, OPEN] = useState(false);
  /** 保存前的「配置结果」预览弹窗：结果不在页面上常驻展示，点保存才弹出做二次确认 */
  const [preview, CLOSE] = useState(false);
  /** 列表多选：勾选待删除的台账 id（批量删除） */
  const [sel, SEL] = useState<string[]>([]);
  /** 删除二次确认 */
  const [confirm, setConfirm] = useState<{
    title: string;
    text: string;
    run: () => boolean;
  } | null>(null);
  /** 筛选面板展开态 + 草稿条件（点「查询」才写回生效值） */
  const [filterOpen, SETFILTEROPEN] = useState(false);
  const [draftKind, SETDRAFTKIND] = useState(kindF);
  const [step, STEP] = useState(initId ? 1 : 0);
  /** 编辑中的巡检目标台账 id；空串表示新增 */
  const [editId, EDIT] = useState(initId);
  /** 抽屉第一步选中的仪表 id */
  const [pick, PICK] = useState("");
  /** 台账名称是否被用户手改过：没改过时预填派生值并跟着仪表 / 算法刷新 */
  const [nameTouched, NAMETOUCHED] = useState(false);
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
    /** 台账名称：留空时按仪表名 / 锚点派生（列表展示与告警名称的默认值都取这里） */
    name: "",
    /** TGT-01：目标类型（仪表类挂设备；环境 / 区域类不关联设备） */
    targetKind: "仪表" as "仪表" | "环境" | "区域",
    /** TGT-02：区域 / 空间目标的参照物锚点 */
    anchor: "",
    requirementId: "",
    algorithm: "",
    criteria: "",
    /**
     * 告警项清单（入口：本处 /「告警管理 › 告警设置」，同一份数据）：
     * **第一条 = 主告警项 = 台账的判定口径**（判断类型 / 阈值 / 单位 / 等级 / 声光报警同源），
     * 每条都可选模板（一键带出内容字段）或直接手填
     */
    alarmItems: [] as AlarmItem[],
    /** 告警类型：引用「告警管理 › 告警类别」里启用中的分类 */
    alarmClass: "",
    alarmTrigger: ALARM_TRIGGER,
    alarmNotify: ["设备岗"] as string[],
    /**
     * 台账级配置（不在告警项里）：触发逻辑 + 处置流程
     * @description 告警开关不在本页展示：台账创建即开启，停用只在「告警管理 › 告警设置」操作；
     *              告警名称也不在此维护：名称统一由台账名称派生（alarmSettings.targetNameOf）
     */
    alarmTriggerMode: "单次即触发" as "单次即触发" | "连续确认",
    alarmConsecutive: 2,
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
       * 主告警项 = 台账判定口径：判定方式 / 阈值 / 单位 / 期望状态随巡检要求刷新；
       * 判定口径既然换了就不再引用原模板（避免"引用了模板却不按模板判"）
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
        templateId: undefined,
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
        alarmItems: withMainAlarmItem(old.alarmItems, main),
        needPhoto: req?.needPhoto ?? true,
        needVideo: req?.needVideo ?? false,
        needReview: req?.needReview ?? false,
        cycle: req?.cycle || "每日",
      };
    });
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
  /** 主告警项（第一条）：与台账判定口径同源——判断类型 / 阈值 / 单位 / 等级 / 声光报警都取它 */
  const mainItem = form.alarmItems[0];
  /** 主项的判定口径：台账 `judge / unit / min / max / expected` 在页面上的唯一来源 */
  const mainJudge = mainItem?.judge || "数值范围";
  const mainUnit = mainItem?.unit || "";
  /** 主项引用的模板（表格里选的那一条；未引用 = 手填内容字段） */
  const mainTpl = mainItem?.templateId
    ? tplOptions.find((t) => t.id === mainItem.templateId)
    : undefined;
  /**
   * 右侧展示用的生效告警规则（与引擎 rulesOf 同源）
   * @description 判定口径取主告警项，触发逻辑取台账级设置
   */
  const effTrigger: AlarmTrigger = {
    type: mainJudge === "期望状态" ? "期望状态" : "数值范围",
    unit: mainUnit,
    min: mainItem?.from ?? 0,
    max: mainItem?.to ?? 0,
    expected: mainItem?.value || "",
    mode: form.alarmTriggerMode,
    consecutive: Math.max(2, form.alarmConsecutive),
  };
  /** 生效等级 / 声光报警：主项自己的值（引用模板时就是模板带出的值） */
  const effLevel = mainItem?.level || "二级";
  const effSeconds = Math.max(0, mainItem?.alarmSeconds ?? 0);
  /** 处置流程：主项引用模板时由模板统一下发，否则取台账手填步骤 */
  const effFlow = mainTpl
    ? mainTpl.flow
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
  /** 改某一条告警项（第一条改动即台账判定口径，不再单独维护 judge / min / max） */
  function patchAlarmItem(i: number, patch: Partial<AlarmItem>) {
    FORM((old) => ({
      ...old,
      alarmItems: old.alarmItems.map((x, j) =>
        j === i ? { ...x, ...patch } : x,
      ),
    }));
  }
  /**
   * 某一条改选告警模板（后台管理 › 告警模板管理）
   * @description 选中即带出「判断类型 + 阈值 + 单位 + 等级 + 声光报警」，仍可手改；
   *              选「手填」（空串）= 只清模板引用，已带出的值保留
   */
  function applyItemTemplate(i: number, templateId: string) {
    const base = form.alarmItems[i];
    if (!base) return;
    const tpl = tplOptions.find((t) => t.id === templateId);
    patchAlarmItem(i, tpl ? itemFromTemplate(base, tpl) : { templateId: undefined });
  }
  /**
   * 追加一条告警项：分类按目标类型带出，异常名称按台账名预填（不留空）
   * @param templateId 传模板 id 时按模板带出内容字段（判断类型 / 阈值 / 单位 / 等级 / 声光报警）
   */
  function addAlarmItem(templateId?: string) {
    const tpl = templateId
      ? tplOptions.find((t) => t.id === templateId)
      : undefined;
    FORM((old) => {
      const base = newAlarmItem(
        itemKindOfTarget(old),
        "二级",
        `${old.name.trim() || instrumentOf(pick)?.name || old.anchor || "检测目标"} · 异常`,
      );
      return {
        ...old,
        alarmItems: [
          ...old.alarmItems,
          tpl ? itemFromTemplate(base, tpl) : base,
        ],
      };
    });
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
    SCOPE("设备");
    NAVKEY("");
    INSKW("");
    STEP(0);
    // 新增：名称未手改 → 选中仪表 / 要求后自动预填派生值
    NAMETOUCHED(false);
    FORM({
      name: "",
      targetKind: "仪表",
      anchor: "",
      requirementId: "",
      algorithm: "",
      criteria: "",
      // 告警项：选定巡检要求后由 applyRequirement 带出主项（至少一条）
      alarmItems: [],
      alarmClass: "",
      alarmTrigger: ALARM_TRIGGER,
      alarmNotify: ["设备岗"],
      alarmTriggerMode: "单次即触发",
      alarmConsecutive: 2,
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
    // 名称预填：有自定义名就带出来，没有则填派生值（打开即有内容、可直接改）
    NAMETOUCHED(!!b.name);
    FORM({
      name: targetNameOf(s, b),
      targetKind: b.targetKind || "仪表",
      anchor: b.anchor || "",
      requirementId: b.requirementId,
      algorithm: b.algorithm,
      criteria: b.criteria || "",
      /**
       * 告警项：与「告警管理 › 告警设置」同一份数据（第一条 = 台账判定口径，
       * 老缓存缺项时由 settingOf 按台账判定口径补齐；主项模板从台账关联模板回落）
       */
      alarmItems: settingOf(s, b).items,
      alarmClass: b.alarm?.category || "",
      alarmTrigger: b.alarm?.trigger || ALARM_TRIGGER,
      alarmNotify: b.alarm?.notify || ["设备岗"],
      alarmTriggerMode: b.alarm?.triggerMode || "单次即触发",
      alarmConsecutive: b.alarm?.consecutive || 2,
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
  /** 保存：新增走 ADD，编辑走 UPDATE */
  function save() {
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
       * 告警设置（与「告警管理 › 告警设置」同一份数据）：类型 + 状态 + 来源 +
       * 触发逻辑 / 等级 / 声光报警 / 处置流程 + 告警项；来源由主项是否引用模板决定
       */
      alarm: {
        ...prev?.alarm,
        // 告警名称已废弃（统一由台账名称派生）：写回时清掉老缓存里的残留值
        name: undefined,
        category: form.alarmClass || undefined,
        // 告警开关：台账创建即开启（缺省 true），停用只由「告警管理 › 告警设置」改写
        enabled: prev?.alarm?.enabled !== false,
        source: main.templateId ? "模板" : "手动",
        level: main.level,
        trigger: form.alarmTrigger,
        notify: form.alarmNotify,
        templateId: main.templateId,
        triggerMode: form.alarmTriggerMode,
        consecutive: Math.max(2, form.alarmConsecutive),
        alarmSeconds: Math.max(0, main.alarmSeconds),
        flow: form.alarmFlow
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
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
    // 内置页保存后沿目录返回来源列表（从巡检项页跳来的会原路返回）
    if (ok) back();
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
  const keyword = kw.trim();
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
  /** 展开筛选面板：用当前生效值填充草稿 */
  function toggleFilter() {
    if (!filterOpen) SETDRAFTKIND(kindF);
    SETFILTEROPEN(!filterOpen);
  }
  /** 查询：草稿写回生效值并收起面板 */
  function applyFilter() {
    KF(draftKind);
    PG(1);
    SETFILTEROPEN(false);
  }
  /** 重置：清空草稿并立即生效 */
  function resetFilter() {
    SETDRAFTKIND("全部");
    KF("全部");
    PG(1);
  }
  const list = targets.filter((b) => {
    const c = crumb(b.instrumentId);
    const req = requirements.find((r) => r.id === b.requirementId);
    if (kindFv !== "全部" && deviceKindOfTarget(b) !== kindFv) return false;
    if (areaF !== "全部" && c.area !== areaF) return false;
    if (devF !== "全部" && c.device !== devF) return false;
    // 树上点中「空间区域巡检」下的某个目标：列表收敛到这一条（点分组节点则回全部）
    if (tgtF && b.id !== tgtF) return false;
    return (
      !keyword ||
      (
        b.id +
        (b.name || "") +
        b.algorithm +
        (req?.name || "") +
        c.area +
        c.device +
        c.instrument
      ).includes(keyword)
    );
  });
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(pager || 1, pages);
  const rows = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  /** 本页多选：全选 / 反选按当前页收敛（翻页时已选保留） */
  const pageIds = rows.map((b) => b.id);
  const allChecked =
    pageIds.length > 0 && pageIds.every((x) => sel.includes(x));
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
      {/*
        列表视图：内置页模式（`mode="edit"`）下**不渲染列表**，
        只渲染下方的编辑表单——原弹窗改为整页后，两者必须互斥
      */}
      {!editing && (
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
              <input
                placeholder="搜索目标 / 仪表 / 设备 / 算法"
                value={kw}
                onChange={(e) => KW(e.target.value)}
              />
              <Btn onClick={toggleFilter}>
                {filterOpen ? "收起筛选" : "筛选"}
                {kindFv !== "全部" ? "（1）" : ""}
              </Btn>
            </div>
            <div className="actions">
              <Btn
                danger
                disabled={!sel.length}
                onClick={() =>
                  setConfirm({
                    title: "删除巡检目标台账",
                    text: `确认删除选中的 ${sel.length} 个巡检目标台账？其告警设置一并移除，且不可恢复。`,
                    run: () => {
                      const ok = act({
                        type: "DELETE_BUSINESS_TARGETS",
                        ids: sel,
                      });
                      if (ok) SEL([]);
                      return ok;
                    },
                  })
                }
              >
                删除选中{sel.length ? `（${sel.length}）` : ""}
              </Btn>
              <Btn primary onClick={() => go("business-target-edit", "new")}>
                ＋ 添加巡检目标台账
              </Btn>
            </div>
          </div>
          {filterOpen && (
            <div className="filter-grid">
              <label className="inline-filter">
                <span>设备形态：</span>
                <select
                  value={draftKind}
                  onChange={(e) => SETDRAFTKIND(e.target.value)}
                >
                  {["全部", ...deviceKinds].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <div className="filter-actions">
                <Btn onClick={resetFilter}>重置</Btn>
                <Btn primary onClick={applyFilter}>
                  查询
                </Btn>
              </div>
            </div>
          )}
          <Panel title="巡检目标台账列表" extra={<span>{list.length} 条</span>}>
            <Table
              heads={[
                <input
                  type="checkbox"
                  aria-label="全选本页巡检目标台账"
                  checked={allChecked}
                  onChange={(e) =>
                    SEL(
                      e.target.checked
                        ? [...new Set([...sel, ...pageIds])]
                        : sel.filter((x) => !pageIds.includes(x)),
                    )
                  }
                />,
                "名称",
                "ID",
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
                  // 多选：勾选后可批量删除（被巡检点引用的台账引擎会拦截）
                  <input
                    type="checkbox"
                    aria-label={`选择 ${targetNameOf(s, b)}`}
                    checked={sel.includes(b.id)}
                    onChange={(e) =>
                      SEL(
                        e.target.checked
                          ? [...sel, b.id]
                          : sel.filter((x) => x !== b.id),
                      )
                    }
                  />,
                  // 名称 = 自定义台账名，留空时回落到仪表名（与告警名称同源）
                  <b>{targetNameOf(s, b)}</b>,
                  // ID 是巡检项 / 任务快照引用的主键：只读展示，便于排查对账
                  <span className="muted">{b.id}</span>,
                  c.instrument,
                  b.targetKind || (b.instrumentId ? "仪表" : "环境"),
                  c.area,
                  c.device,
                  <>
                    {req?.name || b.requirementId}
                    <small>
                      {req?.kind} · {b.algorithm}
                    </small>
                  </>,
                  <Btn onClick={() => go("business-target-edit", b.id)}>编辑</Btn>,
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

      {/* 批量删除二次确认（被巡检点引用的台账由引擎拦截并给出提示） */}
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p>{confirm.text}</p>
          <div className="modal-actions">
            <Btn onClick={() => setConfirm(null)}>取消</Btn>
            <Btn
              primary
              onClick={() => {
                if (confirm.run() !== false) setConfirm(null);
              }}
            >
              确认删除
            </Btn>
          </div>
        </Modal>
      )}
        </>
      )}

      {open && (
        <div className="inner-page bt-edit-page">
          {/* 内置页顶栏：原弹窗 title / footer 改到这里（页面空间大，告警项表格不再被挤扁） */}
          <div className="context-bar">
            <b>
              {editId
                ? `编辑巡检目标台账 · ${form.name.trim() || editId}`
                : "添加巡检目标台账"}
            </b>
            <div className="actions">
              <Btn onClick={() => back()}>取消</Btn>
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
                  onClick={() => CLOSE(true)}
                >
                  {editId ? "保存修改" : "创建巡检目标台账"}
                </Btn>
              )}
            </div>
          </div>
          <Steps
            items={["选检测目标", "配业务逻辑与算法"]}
            current={step}
          />
          {step === 0 ? (
            <>
              {/* 步骤①：先选「实体设备」还是「虚拟设备」，再在下方点选对应目标 */}
              <div className="segmented" style={{ marginBottom: 14 }}>
                <button
                  className={scope === "设备" ? "active" : ""}
                  onClick={() => {
                    SCOPE("设备");
                    PICK("");
                  }}
                >
                  实体设备
                </button>
                <button
                  className={scope === "区域" ? "active" : ""}
                  onClick={() => {
                    SCOPE("区域");
                    PICK("");
                  }}
                >
                  虚拟设备
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
              {editId && (
                <Field label="台账 ID">
                  <span className="muted">{editId}</span>
                </Field>
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
                    onChange={(e) => {
                      const anchor = e.target.value;
                      // 锚点变化影响派生名：没手改过名称时同步刷新
                      FORM({ ...form, anchor, ...namePatch({ anchor }) });
                    }}
                  />
                </Field>
              )}
              {/*
                第二步「配业务逻辑与算法」= 左栏配置 / 右栏展示（产品草图）：
                左：1、巡检要求 / 2、使用算法逻辑 / 3、告警规则（手动输入 or 选择现有模板）
                右：把左栏配好的内容直接展示出来（采集方式与单位、算法、生效告警口径与处置流程）
              */}
              <div className="bt-config bt-config-wide">
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
                      {mainUnit || instrumentOf(pick)?.unit || "—"}
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
                    {/* 告警类型 / 状态：与「告警管理 › 告警设置」同一份数据，改任一处另一处同步 */}
                    <Field label="告警类型">
                      <select
                        value={form.alarmClass}
                        onChange={(e) =>
                          FORM({ ...form, alarmClass: e.target.value })
                        }
                      >
                        <option value="">未指定</option>
                        {(() => {
                          const names = enabledAlarmClassesOf(s).map(
                            (c) => c.name,
                          );
                          // 台账已引用的分类被停用后仍要能回显，避免打开即丢值
                          if (
                            form.alarmClass &&
                            !names.includes(form.alarmClass)
                          )
                            names.push(form.alarmClass);
                          return names.map((n) => (
                            <option key={n}>{n}</option>
                          ));
                        })()}
                      </select>
                    </Field>
                    {/* 告警项表格：一行一条，每条可选模板（一键带出内容字段）或直接手填；第一条 = 台账判定口径 */}
                    <div className="task-toolbar" style={{ marginTop: 12 }}>
                      <AlarmItemAddBar
                        templates={tplOptions}
                        onAddManual={() => addAlarmItem()}
                        onAddFromTemplate={(tid) => addAlarmItem(tid)}
                      />
                      <span className="muted">
                        共 {form.alarmItems.length} 条告警项
                      </span>
                    </div>
                    <AlarmItemTable
                      items={form.alarmItems}
                      templates={tplOptions}
                      onChange={patchAlarmItem}
                      onPickTemplate={applyItemTemplate}
                      onRemove={removeAlarmItem}
                    />
                    {/* 台账级配置：触发逻辑（告警项引用了模板时由模板下发）与处置流程 */}
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
                    {/* TGT-03（待确认）：环境类目标的告警策略落点尚未定论，先沿用本处，待产品 + 算法方拍板 */}
                    {form.targetKind !== "仪表" && (
                      <Note>
                        <b>待确认（TGT-03）</b>：环境类目标（气体 / 红外 / 声纹 / AI）的算法关联与告警策略，
                        落在「巡检目标台账」还是「巡检点」尚未定论；当前<b>暂放本处（目标台账）</b>，不新建第二个配置入口。
                      </Note>
                    )}
                  </div>
                </div>
            </>
          )}

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
                      // 保存成功会自行离开本页；失败则保持弹窗，用户能看到提示后返回修改
                      if (save()) CLOSE(false);
                    }}
                  >
                    确认保存
                  </Btn>
                </>
              }
            >
              <div className="bt-preview">
                <Panel
                  title="配置结果 · 直接展示"
                  extra={<span>{mainTpl ? "引用模板" : "手填"}</span>}
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
                        <span>告警类型</span>
                        <b>{form.alarmClass || "—"}</b>
                        <span>来源</span>
                        <b>
                          {mainTpl
                            ? `引用模板 ${mainTpl.name}（${mainTpl.id}）`
                            : "手填"}
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
            </Modal>
          )}
        </div>
      )}
    </>
  );
}
