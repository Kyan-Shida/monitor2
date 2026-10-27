/**
 * @file PointEdit.tsx
 * @description 巡检点详情（单页）：**新增巡检点与编辑巡检项合并在这一页**（原「添加/编辑巡检点」「添加巡检项」「现场采集」三页合一）。
 *   顶栏：巡检点详情（居中）｜ 取消 · 删除 · 保存（右侧）：页内不放机器人 / 地图选择器
 *   左栏：① 基本信息（所属区域 · 巡检点名称 · 巡检点坐标「采集当前位置 / 保存」）② 机器控制（常驻操控台）
 *   右栏：巡检项清单（排序手柄 + 名称 + 编辑）⇄ 巡检项详情（名称 / 目标台账 / 所需能力列表 / 当前巡检项记录参 + 取消·保存）
 *   入口语义由 `field` 区分：现场采集进来「采集当前位置」可点、自动读机器人实时坐标；
 *   编辑巡检点进来按钮置灰，只回显该点此前现场采集到的坐标。
 *   现场采集入口先弹「现场采集准备」定执行机器人与它要用的地图（防呆：只列该机器人已绑定的地图），
 *   定完直接进页；编辑入口沿用该点已绑定的机器人与地图，两个入口的顶栏都不再放选择器。
 *   坐标未「保存」前不能添加巡检项（点了弹窗提示）；点已保存巡检项的「编辑」会二次确认。
 * @interaction 入口：「巡检点管理」列表行内「编辑巡检点」、工具条「现场采集新增」、地图上线工作台「现场采集」；
 *              引擎 action：CAPTURE_ONSITE_POINT（定格点位）、SAVE_POINT（落巡检点）、DELETE_POINT（删巡检点）、ADD_BUSINESS_TARGET（就地补台账）
 */
import { useRef, useState } from "react";
import { GripVertical, Pencil } from "lucide-react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { Badge, Btn, Empty, Field, Modal, Note, Panel } from "../components/UI";

import { OnsiteSetupModal } from "../components/OnsiteSetupModal";
import {
  ControlCockpit,
  InspectItemDrawer,
  ParamSummary,
} from "../components/InspectItemDrawer";
import { businessTargetLabelOf } from "../data/businessTargetCrumb";
import { clearPointDraft, pointDraftKey } from "../data/pointEditDraft";
import type {
  AtomicAction,
  AtomicActionConfig,
  BusinessTarget,
  Candidate,
  InspectSpec,
  JudgeType,
} from "../data/types";
import { defaultRangeOfUnit } from "../data/alarmRules";
import {
  areaOfCoord,
  defaultRequirementOfInstrument,
} from "../data/deviceMaster";
import { targetsOf } from "../data/mapCalibration";

/**
 * 取下一个现场采集定位ID
 * @description 延续标定文件里的 O 序列（O101 / O201 …）在**该地图现有最大编号上自增**，
 *              保证同一地图内定位ID唯一；空地图从 O101 起算
 * @param targets 该地图现有标定点
 * @returns 新的定位ID，如 O213
 */
function nextExternalId(targets: Candidate[]): string {
  const nums = targets
    .map((t) => /^O(\d+)$/.exec(t.externalId || ""))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => Number(m[1]));
  const max = nums.length ? Math.max(...nums) : 100;
  return `O${String(max + 1).padStart(3, "0")}`;
}

/** 没有巡检项在编时，操控台用的空草稿：只为了让它能正常渲染与下发指令 */
const IDLE: InspectSpec = {
  id: "",
  name: "",
  targetId: "",
  actions: ["拍照"],
  pose: {
    ptz: { pan: 0, tilt: 0, zoom: 1 },
    light: 40,
    dwellSec: 5,
    viewDir: "",
    avoidPolicy: "标准",
  },
};

export function PointEdit({
  id,
  field,
  robot,
}: {
  /** 巡检点 id；缺省 = 新增 */
  id?: string;
  /** 是否从「现场采集」入口进来（可「采集当前位置」，自动读机器人实时坐标） */
  field?: boolean;
  /** 现场采集深链带进来的机器人 id */
  robot?: string;
}) {
  const { s, act } = useStore();
  const editing = id ? s.points.find((p) => p.id === id) : undefined;
  /**
   * 表单状态存会话草稿：刷新 / 切页回来时名称、地图、坐标、已保存的巡检项都不丢
   */
  const key = pointDraftKey(id);
  const [name, NAME] = useViewState(`${key}.name`, editing?.name || "");
  const [mapId, MAP] = useViewState(
    `${key}.map`,
    editing?.mapId || s.maps[0]?.id || "",
  );
  const [targetId, TGT] = useViewState(`${key}.target`, editing?.targetId || "");
  /** 已保存的巡检项（多个巡检项组成一个巡检点） */
  const [items, ITEMS] = useViewState<InspectSpec[]>(
    `${key}.items`,
    editing?.inspectItems || [],
  );
  /** 正在编辑的巡检项草稿：null = 右栏显示清单 */
  const [draft, DRAFT] = useViewState<InspectSpec | null>(`${key}.draft`, null);
  /** 当前带领 / 操控的机器人（现场采集要读它的实时坐标） */
  const [robotId, ROBOT] = useViewState(
    `${key}.robot`,
    // 深链带入 > 该点此前现场采集用的机器 > 首台（页内不再提供选择器，默认值要尽量贴业务）
    robot || editing?.calibrateRobot || s.robots[0]?.id || "",
  );
  /**
   * 现场采集入口：机器人与地图是否已在「准备」弹窗里定过
   * @description 每次进入都重新问一次（不落草稿），避免上次的机器 / 地图被沿用后直接开跑
   */
  const [ready, READY] = useState(!field);
  /** 操控台正在记录参数的动作（左栏操控台与右栏记录参共用） */
  const [recAct, RECACT] = useViewState<AtomicAction | "">(
    `${key}.recAct`,
    "拍照",
  );
  /** 本次「采集当前位置」定格到的点（尚未点「保存」） */
  const [picked, PICKED] = useViewState<{
    id: string;
    externalId: string;
    x: number;
    y: number;
  } | null>(`${key}.picked`, null);
  /**
   * 坐标是否已保存
   * @description 未保存前不允许添加巡检项；编辑既有巡检点时坐标为历史数据，直接视为已保存
   */
  const [poseSaved, POSE_SAVED] = useViewState(
    `${key}.poseSaved`,
    !!editing?.targetId,
  );
  const [err, ERR] = useState("");
  /** 待二次确认的巡检项（点了「编辑」） */
  const [askEdit, ASKEDIT] = useState<InspectSpec | null>(null);
  /** 坐标未保存却点了「添加巡检项」的提示 */
  const [askPose, ASKPOSE] = useState(false);
  /** 删除巡检点的二次确认 */
  const [askDel, ASKDEL] = useState(false);
  /** 保存巡检项的二次确认（弹窗里回显本项参数记录，核对无误再落库） */
  const [confirmItem, SETCONFIRMITEM] = useState(false);
  /** 保存巡检点（整点）的二次确认：校验名称必填 / 不重名后弹窗 */
  const [confirmPoint, SETCONFIRMPOINT] = useState(false);
  /** 确认保存后的去向：false=回列表；true=留在本页继续新增（「保存并新增」） */
  const [saveAdd, SAVEADD] = useState(false);
  /** 拖动排序时的行下标（用于高亮） */
  const [drag, DRAG] = useState<number | null>(null);
  /** 同步一份行下标：拖拽事件里即时读取，规避 state 更新滞后导致的换位不灵敏 */
  const dragRef = useRef<number | null>(null);
  /** 「＋ 快速新建巡检目标台账」弹窗 */
  const [btOpen, BTO] = useState(false);
  const [bt, BT] = useState({
    instrumentId: "",
    requirementId: "",
    algorithm: "",
    judge: "数值范围" as JudgeType,
    unit: "",
    min: 0,
    max: 1,
    expected: "",
    criteria: "",
  });

  const bts = s.businessTargets || [];
  const r = s.robots.find((x) => x.id === robotId);
  const mapTargets = targetsOf(s, mapId || "");
  /** 该点已绑定的标定点（编辑态回显历史采集坐标） */
  const bound = mapTargets.find((t) => t.id === targetId);
  /** 当前要展示 / 采纳的坐标：优先本次采集，其次已绑定 */
  const shown = picked || bound;
  const worldOf = bound?.world || editing?.world;

  /**
   * 所属区域：**按坐标推算，不给选**
   * @description 采集到坐标之后才知道归属：区域主数据里画过范围轮廓的，
   *              坐标落在哪个轮廓里就归哪个区域（轮廓与点位同为全厂区底图百分比口径）；
   *              还没采集坐标 / 没落在任何轮廓内 → 未分区。区域不由地图决定
   */
  const regionOfPoint = areaOfCoord(s, shown?.x, shown?.y) || "未分区";
  /** 现场采集入口：进页即弹「准备」弹窗定机器人与地图，确认后才进页面 */
  const needSetup = !!field && !ready;
  const labelOfBt = (bid: string) => businessTargetLabelOf(s, bid);
  const insOf = (bid: string) =>
    s.instruments?.find((x) => x.id === bts.find((b) => b.id === bid)?.instrumentId);

  const upd = (patch: Partial<InspectSpec>) =>
    DRAFT((d) => (d ? { ...d, ...patch } : d));
  /** 操控台操作的草稿：没有巡检项在编时用空草稿顶着，指令照发、参数不落库 */
  const cockpitDraft = draft || IDLE;
  /** 取某原子动作的逐项编排；未单独配置时回退到共享视角（与巡检项详情同一口径） */
  const cfgOf = (a: AtomicAction): AtomicActionConfig => {
    const c = cockpitDraft.actionConfigs?.[a];
    if (c) return c;
    const p = cockpitDraft.pose;
    return {
      source: "cockpit",
      ptz: { ...p.ptz },
      light: p.light ?? 40,
      dwellSec: p.dwellSec ?? 5,
      viewDir: p.viewDir,
      preset: p.preset,
      lift: p.lift,
      avoidPolicy: p.avoidPolicy,
    };
  };
  /** 更新某原子动作的逐项编排（自动标记来源为操控台） */
  const updCfg = (a: AtomicAction, patch: Partial<AtomicActionConfig>) =>
    upd({
      actionConfigs: {
        ...(cockpitDraft.actionConfigs || {}),
        [a]: { ...cfgOf(a), ...patch, source: patch.source ?? "cockpit" },
      },
    });

  /** 停稳采集：取机器人当前位置坐标，自动分配定位ID并落成标定点 */
  function capture() {
    if (!r) return ERR("请先选择当前机器人");
    if (!mapId) return ERR("请先选择当前地图");
    ERR("");
    const externalId = nextExternalId(mapTargets);
    const x = Math.round(r.x * 10) / 10;
    const y = Math.round(r.y * 10) / 10;
    act(
      { type: "CAPTURE_ONSITE_POINT", mapId, robotId: r.id, externalId, x, y },
      (st) => {
        const t = targetsOf(st, mapId).find((q) => q.externalId === externalId);
        if (t) PICKED({ id: t.id, externalId, x: t.x, y: t.y });
      },
    );
  }
  /** 保存坐标：采纳本次采集结果（编辑态即确认历史坐标），并解锁添加巡检项 */
  function savePose() {
    if (picked) TGT(picked.id);
    POSE_SAVED(true);
    ERR("");
  }
  /**
   * 进入巡检项详情（右栏就地切换）
   * @param sp 要编辑的巡检项；缺省 = 新开一条（默认带一个原子动作与保守参数）
   */
  function openItem(sp?: InspectSpec) {
    if (!poseSaved) return ASKPOSE(true);
    ERR("");
    DRAFT(sp ? { ...sp } : { ...IDLE });
  }
  /** 巡检项必填校验：保存与「二次确认」前共用同一套规则，避免弹窗里才发现缺项 */
  function itemErrorOf(d: InspectSpec | null): string {
    if (!d) return "";
    if (!d.name.trim()) return "请填写巡检项名称";
    if (!d.targetId) return "请选择巡检目标台账（检什么、怎么判）";
    if (!d.actions.length) return "请至少选择一个原子动作";
    return "";
  }
  /** 保存入口：先弹二次确认（内含本项参数记录），确认后才真落库 */
  function askSaveItem() {
    const msg = itemErrorOf(draft);
    if (msg) return ERR(msg);
    ERR("");
    SETCONFIRMITEM(true);
  }
  /** 保存巡检项：编辑态覆盖、新增态追加；保存后右栏恢复清单 */
  function saveItem() {
    if (!draft) return;
    const msg = itemErrorOf(draft);
    if (msg) return ERR(msg);
    SETCONFIRMITEM(false);
    const rec: InspectSpec = {
      ...draft,
      id: draft.id || "IP-" + Date.now().toString(36),
    };
    ITEMS((old) =>
      old.some((x) => x.id === rec.id)
        ? old.map((x) => (x.id === rec.id ? rec : x))
        : [...old, rec],
    );
    ERR("");
    DRAFT(null);
  }
  /** 取消本项：丢弃草稿，右栏恢复清单 */
  function cancelItem() {
    DRAFT(null);
    ERR("");
  }
  /** 巡检项排序：把第 from 项挪到 to 位（列表顺序即机器人执行顺序） */
  function moveItem(from: number, to: number) {
    if (from === to) return;
    ITEMS((old) => {
      const next = [...old];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }
  /**
   * 保存巡检点前的校验（入口与真正落库共用）
   * @description 名称必填 + **不与已有巡检点重名**（同一工厂里点位名是现场对账凭据），
   *              再检查坐标与巡检项是否齐备
   */
  function pointErrorOf(): string {
    if (draft) return "请先「保存巡检项」或「取消」，再保存巡检点";
    if (!name.trim()) return "请填写巡检点名称";
    const dup = s.points.some(
      (p) => p.name.trim() === name.trim() && p.id !== editing?.id,
    );
    if (dup) return `巡检点名称「${name.trim()}」已存在，请换一个名称`;
    if (!targetId) return "请先「采集当前位置」并保存巡检点坐标";
    if (!items.length) return "请至少添加并保存一个巡检项";
    return "";
  }
  /**
   * 保存入口：校验通过后弹二次确认（列出名称 / 区域 / 坐标 / 巡检项数）
   * @param keepAdding 保存并新增：确认后把表单复位成新建态，留在本页继续标注下一个点
   */
  function askSavePoint(keepAdding = false) {
    const msg = pointErrorOf();
    if (msg) return ERR(msg);
    ERR("");
    SAVEADD(keepAdding);
    SETCONFIRMPOINT(true);
  }
  /** 落库：坐标 + 身份 + 全部巡检项一次性提交（「保存」与「保存并新增」共用同一路径） */
  function commitPoint(): boolean {
    const msg = pointErrorOf();
    if (msg) {
      ERR(msg);
      return false;
    }
    SETCONFIRMPOINT(false);
    ERR("");
    return act({
      type: "SAVE_POINT",
      pointId: editing?.id,
      mapId,
      targetId,
      name,
      inspectItems: items,
      // 现场采集的机器人与停靠位姿随巡检点存档；编辑时保留原值
      calibrateRobot: editing?.calibrateRobot || (field ? r?.id : undefined),
      pose: editing?.pose || (shown ? { x: shown.x, y: shown.y, yaw: 0 } : undefined),
    });
  }
  /** 保存巡检点：落库后回巡检点列表 */
  function savePoint() {
    if (!commitPoint()) return;
    clearPointDraft(id);
    go("annotation");
  }
  /**
   * 保存并新增：落库后把本页复位成新建态，继续标注下一个巡检点
   * @description 地图 / 机器人沿用当前选择（连续标注通常在同一张图上），
   *              名称 / 坐标 / 巡检项清空，避免把上一个点的内容带进下一个点
   */
  function saveAndNew() {
    if (!commitPoint()) return;
    clearPointDraft(id);
    NAME("");
    TGT("");
    ITEMS([]);
    DRAFT(null);
    PICKED(null);
    POSE_SAVED(false);
  }
  /** 取消：清掉本次会话草稿（名称 / 地图 / 坐标 / 巡检项一项都不落库），回巡检点列表 */
  function cancelPage() {
    clearPointDraft(id);
    go("annotation");
  }
  /** 删除巡检点：二次确认后落库并回列表（被路线引用时引擎会拦下并提示） */
  function delPoint() {
    ASKDEL(false);
    const ok = act({ type: "DELETE_POINT", id: editing?.id });
    if (ok) {
      clearPointDraft(id);
      go("annotation");
    }
  }
  /** 打开快速新建业务目标：默认取已选巡检项的仪表 */
  function openBt() {
    const insId = insOf(draft?.targetId || "")?.id || s.instruments?.[0]?.id || "";
    const ins = s.instruments?.find((x) => x.id === insId);
    const rid = ins ? defaultRequirementOfInstrument(ins) : "";
    BT({
      instrumentId: insId,
      requirementId: rid,
      algorithm: "",
      judge: "数值范围",
      unit: ins?.unit || "",
      min: 0,
      max: 1,
      expected: "",
      criteria: "",
    });
    if (ins && rid) applyReq(rid, insId);
    BTO(true);
  }
  /** 选算法模板：带出算法 / 判定 / 阈值 / 单位 / 判断标准 */
  function applyReq(rid: string, insId: string) {
    const req = (s.requirements || []).find((x) => x.id === rid);
    const ins = s.instruments?.find((x) => x.id === insId);
    const range =
      req?.judge === "数值范围"
        ? defaultRangeOfUnit(req.unit || ins?.unit) || { min: 0, max: 1 }
        : undefined;
    BT((o) => ({
      ...o,
      requirementId: rid,
      algorithm: req?.algorithm || "",
      judge: req?.judge || "数值范围",
      unit: req?.unit || ins?.unit || "",
      min: range?.min ?? 0,
      max: range?.max ?? 1,
      expected: req?.expected || "",
      criteria: req?.description || "",
    }));
  }
  /** 提交快速新建（人工新增、直接生效） */
  function saveBt() {
    const ok = act({
      type: "ADD_BUSINESS_TARGET",
      instrumentId: bt.instrumentId,
      requirementId: bt.requirementId,
      algorithm: bt.algorithm,
      judge: bt.judge,
      unit: bt.unit,
      min: Number(bt.min),
      max: Number(bt.max),
      expected: bt.expected,
      criteria: bt.criteria,
      needPhoto: true,
      needVideo: false,
      needReview: false,
      cycle: "每日",
      priority: "普通" as BusinessTarget["priority"],
      inspect: true,
    });
    if (ok) BTO(false);
  }

  /** 坐标回显文案：定位ID + 底图投影 +（有则）统一坐标 */
  const coordText = shown
    ? `${shown.externalId || shown.id} · X ${shown.x} / Y ${shown.y}${
        worldOf ? ` · 统一坐标 XYZ（${worldOf.x}, ${worldOf.y}, ${worldOf.z}）米` : ""
      }`
    : "";

  return (
    /* pd-page：整页锁一屏（main 已是 main-fill），内部用 flex 把高度分给三个面板，尽量不出现滚动条 */
    <div className="pd-page">
      {/* 顶栏：标题居中，取消 / 删除 / 保存靠右（机器人与地图在进页前的「准备」弹窗里定了） */}
      <div className="context-bar pd-topbar">
        <b className="pd-title">巡检点详情</b>
        <div className="actions">
          {/* 取消：本次改动一律不落库（含已填的巡检项），直接回列表 */}
          <Btn onClick={cancelPage}>取消</Btn>
          {editing && <Btn onClick={() => ASKDEL(true)}>删除</Btn>}
          {/* 保存并新增只在新增态给：编辑态的落库走 UPDATE，复位后会继续改同一条 */}
          {!editing && (
            <Btn disabled={!!draft} onClick={() => askSavePoint(true)}>
              保存并新增
            </Btn>
          )}
          <Btn primary disabled={!!draft} onClick={() => askSavePoint()}>
            保存
          </Btn>
        </div>
      </div>

      {err && (
        <p role="alert" className="reference-upload-error">
          {err}
        </p>
      )}

      {/* 现场采集准备：定执行机器人 + 机器人使用地图，防呆不通过则进不去 */}
      {needSetup && (
        <OnsiteSetupModal
          robotId={robotId}
          mapId={mapId}
          onClose={cancelPage}
          onConfirm={(rid, mid) => {
            ROBOT(rid);
            MAP(mid);
            READY(true);
          }}
        />
      )}

      <div className="pd-split">
        <div className="pd-col">
          {/* ① 基本信息：巡检点名称 · 所属区域 · 巡检点坐标 同一行 */}
          <Panel
            title="基本信息"
            className="pd-fixed"
            extra={<Badge>{editing ? editing.id : "新建"}</Badge>}
          >
            <div className="pd-basic">
              <Field label="巡检点名称" required>
                <input
                  value={name}
                  placeholder="例如 V001 出口压力表"
                  onChange={(e) => NAME(e.target.value)}
                />
              </Field>
              <Field label="所属区域">
                {/* 按坐标推算：只读展示，跟随采集到的点位，不给人手改的机会 */}
                <p className="pd-value">{regionOfPoint}</p>
              </Field>
              <Field label="巡检点坐标" required>
                {/* 现场采集入口：自动读取机器人当前坐标；编辑入口：置灰，只回显历史采集坐标 */}
                <div className="actions">
                  <Btn primary disabled={!field || !r} onClick={capture}>
                    采集当前位置
                  </Btn>
                  {/* 开关用 picked（本次采集的暂存坐标）而不是 targetId（已落库的坐标）：
                      targetId 只有本按钮自己才会写入，拿它当开关会让「新建巡检点」永远点不动 */}
                  <Btn disabled={!picked || poseSaved} onClick={savePose}>
                    保存
                  </Btn>
                </div>
                {/* 坐标回显跟着「巡检点坐标」走：放在本字段内，不再单独占面板一整行 */}
                <p className="muted pd-coord-line">
                  {coordText
                    ? `采集坐标：${coordText}`
                    : field
                      ? "把机器带到点位停稳后点「采集当前位置」"
                      : "该巡检点尚无现场采集坐标"}
                </p>
              </Field>
            </div>
          </Panel>

          {/* ② 机器控制：双路视频 + 机器人移动 + 云台，常驻 */}
          <Panel className="pd-grow pd-flat">
            <ControlCockpit
              draft={cockpitDraft}
              recordingAction={recAct}
              onRecordingActionChange={RECACT}
              cfgOf={cfgOf}
              updCfg={updCfg}
              onPoseAt={(at) => upd({ pose: { ...cockpitDraft.pose, at } })}
            />
          </Panel>
        </div>

        <div className="pd-col">
          {draft ? (
            <Panel title="巡检项详情" className="pd-grow">
              <InspectItemDrawer
                bare
                draft={draft}
                onChange={upd}
                onSave={saveItem}
                onCancel={cancelItem}
                businessTargets={bts}
                labelOfBt={labelOfBt}
                onOpenBt={openBt}
                recordingAction={recAct}
                onRecordingActionChange={RECACT}
              />
              <div className="pd-foot">
                <Btn onClick={cancelItem}>取消</Btn>
                {/* 保存前弹二次确认：把本项参数记录摊开让人核对一遍 */}
                <Btn primary onClick={askSaveItem}>
                  保存
                </Btn>
              </div>
            </Panel>
          ) : (
            <Panel
              title="巡检项"
              className="pd-grow"
              extra={
                <Btn primary onClick={() => openItem()}>
                  添加
                </Btn>
              }
            >
              <ul className="pd-items">
                {items.map((sp, i) => (
                  <li
                    key={sp.id}
                    className={drag === i ? "dragging" : undefined}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(i));
                      dragRef.current = i;
                      DRAG(i);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnter={() => {
                      const from = dragRef.current;
                      if (from === null || from === i) return;
                      moveItem(from, i);
                      dragRef.current = i;
                      DRAG(i);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      dragRef.current = null;
                      DRAG(null);
                    }}
                    onDragEnd={() => {
                      dragRef.current = null;
                      DRAG(null);
                    }}
                  >
                    {/* 排序手柄：draggable 已挂到整行 li 上，grip 仅作视觉提示 */}
                    <span className="pd-grip" aria-label={`拖动排序 ${sp.name}`}>
                      <GripVertical size={14} />
                    </span>
                    <span className="pd-item-name">{sp.name}</span>
                    <span
                      className="pd-edit"
                      title="编辑巡检项"
                      onDragStart={(e) => e.stopPropagation()}
                    >
                      <Btn onClick={() => ASKEDIT(sp)} aria-label={`编辑 ${sp.name}`}>
                        <Pencil size={13} />
                      </Btn>
                    </span>
                  </li>
                ))}
              </ul>
              {!items.length && <Empty>还没有巡检项，点「添加」开始填写。</Empty>}
            </Panel>
          )}
        </div>
      </div>

      {/* 坐标未保存：拦下「添加 / 编辑巡检项」 */}
      {askPose && (
        <Modal
          title="请先保存巡检点坐标"
          slim
          onClose={() => ASKPOSE(false)}
          footer={
            <Btn primary onClick={() => ASKPOSE(false)}>
              知道了
            </Btn>
          }
        >
          <p>巡检项记录的是「机器在哪个位置、以什么姿态看」，需要先保存巡检点坐标。</p>
        </Modal>
      )}

      {/* 重新编辑已保存的巡检项：二次确认（本次操控参数会清零重录） */}
      {askEdit && (
        <Modal
          title="重新编辑巡检项"
          slim
          onClose={() => ASKEDIT(null)}
          footer={
            <>
              <Btn onClick={() => ASKEDIT(null)}>取消</Btn>
              <Btn
                primary
                onClick={() => {
                  const sp = askEdit;
                  ASKEDIT(null);
                  openItem(sp);
                }}
              >
                继续编辑
              </Btn>
            </>
          }
        >
          <p>
            继续编辑「{askEdit.name}」将清零该项已保存的操控参数（云台 / 镜头 / 记录值），
            需要重新操控记录。确认继续？
          </p>
        </Modal>
      )}

      {/* 删除巡检点：二次确认 */}
      {askDel && (
        <Modal
          title={`删除巡检点「${editing?.name || ""}」`}
          slim
          onClose={() => ASKDEL(false)}
          footer={
            <>
              <Btn onClick={() => ASKDEL(false)}>取消</Btn>
              <Btn danger onClick={delPoint}>
                删除
              </Btn>
            </>
          }
        >
          <p>删除后该巡检点及其巡检项一并移除，占用的定位ID自动释放；已被巡检路线引用时不能删除。</p>
        </Modal>
      )}

      {/* 保存巡检项：二次确认 —— 把「本项参数记录」摊开核对，确认后才落库 */}
      {confirmItem && draft && (
        <Modal
          title={`保存巡检项「${draft.name || "未命名"}」`}
          slim
          onClose={() => SETCONFIRMITEM(false)}
          footer={
            <>
              <Btn onClick={() => SETCONFIRMITEM(false)}>返回修改</Btn>
              <Btn primary onClick={saveItem}>
                确认保存
              </Btn>
            </>
          }
        >
          <p className="muted">
            保存后本条巡检项的名称、目标台账、所需能力与下列参数将随巡检点一起落库，请核对：
          </p>
          <ParamSummary draft={draft} action={recAct} cfgOf={cfgOf} />
        </Modal>
      )}

      {/* 保存巡检点：二次确认 —— 名称 / 区域 / 坐标 / 巡检项数一次过目 */}
      {confirmPoint && (
        <Modal
          title={`保存巡检点「${name.trim()}」`}
          slim
          onClose={() => SETCONFIRMPOINT(false)}
          footer={
            <>
              <Btn onClick={() => SETCONFIRMPOINT(false)}>返回修改</Btn>
              <Btn primary onClick={saveAdd ? saveAndNew : savePoint}>
                {saveAdd ? "保存并新增" : "确认保存"}
              </Btn>
            </>
          }
        >
          <div className="ps-kv">
            <b>巡检点名称</b>
            <span>{name.trim()}</span>
            <b>所属区域</b>
            <span>{regionOfPoint}</span>
            <b>巡检点坐标</b>
            <span>{coordText || "—"}</span>
            <b>巡检项</b>
            <span>{items.length} 项</span>
          </div>
          <p className="muted">
            保存后该巡检点连同上述 {items.length} 条巡检项一起落库；取消则本次改动全部丢弃。
          </p>
        </Modal>
      )}

      {btOpen && (
        <Modal
          title="快速新建巡检目标台账"
          onClose={() => BTO(false)}
          footer={
            <>
              <Btn onClick={() => BTO(false)}>取消</Btn>
              <Btn
                primary
                disabled={!bt.instrumentId || !bt.requirementId || !bt.algorithm.trim()}
                onClick={saveBt}
              >
                创建并生效
              </Btn>
            </>
          }
        >
          <Note>
            巡检目标台账 = 仪表 + 算法模板。
            此处为现场补录入口，建完提交即人工新增、直接生效。
          </Note>
          <Field label="检测目标（仪表）">
            <select
              value={bt.instrumentId}
              onChange={(e) => {
                const insId = e.target.value;
                const ins = s.instruments?.find((x) => x.id === insId);
                const rid = ins ? defaultRequirementOfInstrument(ins) : "";
                BT((o) => ({ ...o, instrumentId: insId }));
                if (rid) applyReq(rid, insId);
              }}
            >
              <option value="">请选择仪表</option>
              {(s.instruments || []).map((x) => {
                const dev = s.devices?.find((d) => d.id === x.deviceId);
                return (
                  <option key={x.id} value={x.id}>
                    {dev?.region || "—"} › {dev?.name || "—"} › {x.name}（
                    {x.capture}
                    {x.unit ? ` · ${x.unit}` : ""}）
                  </option>
                );
              })}
            </select>
          </Field>
          <Field label="算法模板（决定看什么）">
            <select
              value={bt.requirementId}
              onChange={(e) => applyReq(e.target.value, bt.instrumentId)}
            >
              {(s.requirements || [])
                .filter((x) => (x.targetKinds || ["仪表"]).includes("仪表"))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}（{x.kind}）
                  </option>
                ))}
            </select>
          </Field>
          <Field label="判定方式">
            <select
              value={bt.judge}
              onChange={(e) => BT({ ...bt, judge: e.target.value as JudgeType })}
            >
              {(["数值范围", "期望状态", "有无目标", "等级评分"] as JudgeType[]).map(
                (j) => (
                  <option key={j}>{j}</option>
                ),
              )}
            </select>
          </Field>
          {bt.judge === "数值范围" && (
            <Field label="阈值（判断标准）">
              <div className="actions">
                <input
                  type="number"
                  step="0.01"
                  aria-label="下限"
                  value={bt.min}
                  onChange={(e) => BT({ ...bt, min: Number(e.target.value) })}
                />
                <span>–</span>
                <input
                  type="number"
                  step="0.01"
                  aria-label="上限"
                  value={bt.max}
                  onChange={(e) => BT({ ...bt, max: Number(e.target.value) })}
                />
                <input
                  aria-label="单位"
                  placeholder="单位"
                  value={bt.unit}
                  onChange={(e) => BT({ ...bt, unit: e.target.value })}
                />
              </div>
            </Field>
          )}
          {bt.judge === "期望状态" && (
            <Field label="期望状态">
              <input
                value={bt.expected}
                placeholder="例如 开启"
                onChange={(e) => BT({ ...bt, expected: e.target.value })}
              />
            </Field>
          )}
          <Field label="判断标准补充说明">
            <textarea
              rows={2}
              value={bt.criteria}
              placeholder="例如 以罐体上半部最高温为准"
              onChange={(e) => BT({ ...bt, criteria: e.target.value })}
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}
