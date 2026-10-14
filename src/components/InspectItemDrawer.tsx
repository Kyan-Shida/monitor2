/**
 * @file InspectItemDrawer.tsx
 * @description 巡检项编辑抽屉：把「名称 + 业务目标 + 机器操作内容」放到右侧抽屉。
 *              参数录入统一走「操控台」——人实际操控机器 / 云台 / 上装，操作即自动记录（source=cockpit）；
 *              操控台按参考界面铺开为「云台控制 / 云台状态 / 镜头控制」三列 + 「辅助功能」通栏，
 *              数值参数支持「查询（回读已记录值）/ 设置（下发并记录）」，右侧实时回显参数总览并可保存。
 * @interaction 被 pages/PointEdit.tsx、pages/PointOnsite.tsx 调用
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Thermometer, Video } from "lucide-react";
import { Badge, Btn, Field, Modal, Note, Table } from "./UI";
import { DeviceTree } from "./DeviceTree";
import { useStore } from "../data/store";
import { areaNameOf } from "../data/deviceMaster";
import {
  abilityFields,
  atomicActionCapability,
  atomicActionOfAbility,
  BEHAVIOR_TYPES,
} from "../data/types";
import type {
  AtomicAction,
  AtomicActionConfig,
  BusinessTarget,
  InspectAbility,
  InspectSpec,
  PTZ,
} from "../data/types";

/** 台账算法关键词 → 原子动作（台账未显式存"所需上装"时据此自动匹配） */
const ALGO_ACTION_RULES: [RegExp, AtomicAction][] = [
  [/红外|测温|热像/, "采集红外热像"],
  [/气体|泄漏/, "采集气体"],
  [/声纹|声音|异响|噪声/, "录制声音"],
  [/行为|不安全/, "分析不安全行为"],
  [
    /读数|表计|缺陷|外观|分割|图像|可见光|阀位|比对|液滴|油渍/,
    "拍照",
  ],
];

/**
 * 依据巡检目标台账推导所需原子动作（决定需要哪些上装）
 * @param bt 巡检目标台账
 * @returns 去重后的原子动作列表（至少含一项，兜底「拍照」）
 */
function actionsOfTarget(bt: BusinessTarget): AtomicAction[] {
  const set = new Set<AtomicAction>();
  const algo = bt.algorithm || "";
  for (const [re, act] of ALGO_ACTION_RULES) if (re.test(algo)) set.add(act);
  if (bt.needPhoto) set.add("拍照");
  if (bt.needVideo) set.add("录像片段");
  if (!set.size) set.add("拍照");
  return [...set];
}

/** 台账判定标准一句话（详情栏回显，与「巡检目标台账」页同一表达） */
function judgeTextOf(b: BusinessTarget): string {
  if (b.judge === "数值范围")
    return `${b.min ?? "—"}–${b.max ?? "—"} ${b.unit || ""}`.trim();
  if (b.judge === "期望状态") return `期望 ${b.expected || "—"}`;
  if (b.judge === "有无目标") return "无 → 正常；有 → 异常";
  return "按等级评分，低分需复核";
}

export interface InspectItemDrawerProps {
  /** 正在编辑的巡检项草稿 */
  draft: InspectSpec;
  /** 草稿变化回调（直接替换对应字段） */
  onChange: (patch: Partial<InspectSpec>) => void;
  /** 保存本项 */
  onSave: () => void;
  /** 取消编辑 */
  onCancel: () => void;
  /** 可选的巡检目标台账列表 */
  businessTargets: BusinessTarget[];
  /** 业务目标一句话标签 */
  labelOfBt: (id: string) => string;
  /** 打开「快速新建巡检目标台账」弹窗 */
  onOpenBt: () => void;
  /** inline 模式：去掉 Modal 外壳，作为常驻面板渲染（实地采集页面用） */
  inline?: boolean;
  /**
   * 只渲染内容（去掉 inline 自带的标题条与底部动作条）
   * @description 供内置页使用：标题与「保存本项 / 取消」由页面顶栏承担
   */
  bare?: boolean;
}

/**
 * 巡检项编辑抽屉
 * @param props 见 InspectItemDrawerProps
 */
export function InspectItemDrawer({
  draft,
  onChange,
  onSave,
  onCancel,
  businessTargets,
  labelOfBt,
  onOpenBt,
  inline,
  bare,
}: InspectItemDrawerProps) {
  const [recordingAction, setRecordingAction] = useState<AtomicAction | "">(
    draft.actions[0] || "",
  );

  /** 取某原子动作的逐项编排；未单独配置时回退到共享视角 */
  function cfgOf(a: AtomicAction): AtomicActionConfig {
    const c = draft.actionConfigs?.[a];
    if (c) return c;
    const p = draft.pose;
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
  }

  /** 更新某原子动作的逐项编排（自动按当前模式标记 source） */
  function updCfg(a: AtomicAction, patch: Partial<AtomicActionConfig>) {
    const cfgs = { ...(draft.actionConfigs || {}) };
    const prev = cfgs[a] || cfgOf(a);
    const source = patch.source ?? "cockpit";
    cfgs[a] = { ...prev, ...patch, source };
    onChange({ actionConfigs: cfgs });
  }

  const { s } = useStore();
  /** 三栏选择器：左栏树选中值（""=全部 / "r:区域" / "d:设备" / "s:台账"） */
  const [navKey, NAVKEY] = useState("");
  /** 三栏选择器中栏关键词 */
  const [btKw, BTKW] = useState("");

  const instruments = s.instruments || [];
  const devices = s.devices || [];
  const requirements = s.requirements || [];
  const insOf = (id: string) => instruments.find((x) => x.id === id);
  /** 台账归属设备（仪表类才有；空间 / 区域类没有） */
  const devOfTarget = (b: BusinessTarget) =>
    b.instrumentId
      ? devices.find((d) => d.id === insOf(b.instrumentId)?.deviceId)
      : undefined;
  /** 台账归属区域（空间 / 区域类目标不挂设备，返回空串） */
  const areaOfTarget = (b: BusinessTarget) => {
    const dev = devOfTarget(b);
    return dev ? areaNameOf(s, dev) : "";
  };
  const reqOfTarget = (b: BusinessTarget) =>
    requirements.find((r) => r.id === b.requirementId);
  /** 空间与区域（非装置）台账：树上挂到独立分组 */
  const spaceTargets = useMemo(
    () =>
      businessTargets.filter(
        (b) => !b.instrumentId || (b.targetKind && b.targetKind !== "仪表"),
      ),
    [businessTargets],
  );
  /** 树节点 → 中栏台账候选 */
  const btMatches = (b: BusinessTarget) => {
    if (!navKey) return true;
    if (navKey.startsWith("s:")) return b.id === navKey.slice(2);
    if (navKey.startsWith("d:")) return devOfTarget(b)?.id === navKey.slice(2);
    return areaOfTarget(b) === navKey.slice(2);
  };
  const btList = businessTargets.filter((b) => {
    if (!btMatches(b)) return false;
    const k = btKw.trim();
    return (
      !k ||
      (b.id + labelOfBt(b.id) + (b.algorithm || "") + (b.unit || "")).includes(k)
    );
  });
  /** 当前选中的台账（右栏详情） */
  const selBt = businessTargets.find((b) => b.id === draft.targetId);

  /**
   * 同步原子动作集合
   * @description 动作变化时清理不再需要的动作参数，并保证「正在记录参数的动作」仍有效
   * @param next 新的原子动作集合
   * @param extra 需要一并写回草稿的其它字段
   */
  function applyActions(next: AtomicAction[], extra?: Partial<InspectSpec>) {
    const cfgs = { ...(draft.actionConfigs || {}) };
    (Object.keys(cfgs) as AtomicAction[]).forEach((k) => {
      if (!next.includes(k)) delete cfgs[k];
    });
    onChange({ actions: next, actionConfigs: cfgs, ...extra });
    if (recordingAction && !next.includes(recordingAction as AtomicAction))
      setRecordingAction(next[0] || "");
  }

  /** 选择巡检目标台账：按其算法自动带出对应能力（能力项表格里的行） */
  function pickTarget(id: string) {
    const bt = businessTargets.find((b) => b.id === id);
    const acts = bt ? actionsOfTarget(bt) : [];
    /** 动作 → 能力参数（能在后台能力清单里对上的，就自动落一行能力项） */
    const params = [
      ...new Set(
        acts
          .map(
            (a) =>
              Object.entries(atomicActionOfAbility).find(
                ([, act]) => act === a,
              )?.[0],
          )
          .filter((x): x is string => !!x),
      ),
    ];
    applyActions(acts, {
      targetId: id,
      abilities: params.map((p, i) => ({
        id: `AB-${Date.now().toString(36)}-${i}`,
        param: p,
        fields: {},
      })),
    });
  }

  /** 能力项清单（本项巡检要用哪些能力） */
  const abilities = draft.abilities || [];
  /** 能力参数候选：取自「后台管理 › 机器人能力」两级清单里的**能力参数** */
  const abilityParams = (s.robotAbilities || []).flatMap((k) => k.params);
  /** 能力参数 → 能力类型（表格第二列只读带出） */
  const kindOfAbility = (param: string) =>
    (s.robotAbilities || []).find((k) =>
      k.params.some((p) => p.name === param),
    )?.name || "";
  /**
   * 能力项变化：同步推导原子动作（任务指令集 / 参数编排以 actions 为键）
   * @param next 新的能力项清单
   */
  function applyAbilities(next: InspectAbility[]) {
    applyActions(
      [
        ...new Set(
          next
            .map((x) => atomicActionOfAbility[x.param])
            .filter((x): x is AtomicAction => !!x),
        ),
      ],
      { abilities: next },
    );
  }
  /** 新增一行能力项（默认取第一个可用能力参数） */
  function addAbility() {
    const first = abilityParams[0]?.name || "";
    applyAbilities([
      ...abilities,
      { id: "AB-" + Date.now().toString(36), param: first, fields: {} },
    ]);
  }
  /** 先选能力类型（大类），再在其子项里挑能力参数（避免 30 项平铺） */
  function setAbilityKind(i: number, kindName: string) {
    const first = (s.robotAbilities || []).find((k) => k.name === kindName)
      ?.params[0]?.name;
    if (first) setAbilityParam(i, first);
  }
  /** 改某行的能力参数（换能力即清掉旧能力的特有配置） */
  function setAbilityParam(i: number, param: string) {
    applyAbilities(
      abilities.map((x, j) => (j === i ? { ...x, param, fields: {} } : x)),
    );
  }
  /** 改某行能力的特有配置项 */
  function setAbilityField(
    i: number,
    key: string,
    value: number | boolean | string,
  ) {
    applyAbilities(
      abilities.map((x, j) =>
        j === i ? { ...x, fields: { ...x.fields, [key]: value } } : x,
      ),
    );
  }
  /** 删除某行能力项 */
  function removeAbility(i: number) {
    applyAbilities(abilities.filter((_, j) => j !== i));
  }

  const content = (
    /*
      本页四步一屏读完：
      ① 选择巡检目标（名称 + 台账：检什么 · 怎么判）
      ② 明确本项需要哪些上装工作（上装开关）
      ③ 视频面板实时操作机器 / 云台，把机器调到最佳观察位置（平台自动记录参数）
      ④ 参数总览与保存（右栏随操控实时回显）
    */
    <div className="item-steps">
      {/* ① 选择需要巡检的目标 */}
      <section className="item-step">
        <h4 className="item-step-h">
          <i>1</i>
          <span>选择需要巡检的目标</span>
          <small className="step-tail">
            {draft.targetId ? labelOfBt(draft.targetId) : "未选择台账"}
          </small>
        </h4>

        <Field label="巡检项名称">
          <input
            value={draft.name}
            placeholder="例如 压力读数 / 泵体滴漏"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Field>

        {/*
          目标台账 = 三栏选择器：左「区域 › 设备」树 ／ 中「台账列表」／ 右「台账详情」。
          点中一条台账即生效（自动按其算法勾选所需上装与原子动作），右栏只读回显口径。
        */}
        <div className="bt-picker">
          <div className="bt-picker-head">
            <span className="bt-picker-cur">
              巡检目标台账（检什么 · 怎么判）：
              <b>点中一条即选中</b>，右栏看口径详情
            </span>
          </div>
          <div className="pick-3col">
            {/* 左栏：与「巡检目标台账」页同一棵树；非装置类挂「空间与区域」分组 */}
            <DeviceTree
              value={navKey}
              onChange={NAVKEY}
              ariaLabel="巡检目标台账树"
              rootLabel="全部台账"
              rootCount={businessTargets.length}
              countOf={(d) =>
                businessTargets.filter((b) => devOfTarget(b)?.id === d.id).length
              }
              hideEmpty
              extraGroup={
                spaceTargets.length
                  ? {
                      name: "空间与区域",
                      leaves: spaceTargets.map((b) => ({
                        value: "s:" + b.id,
                        label: labelOfBt(b.id),
                      })),
                    }
                  : undefined
              }
            />
            {/* 中栏：台账列表 */}
            <div className="pick-main">
              <div className="filter-bar">
                <input
                  placeholder="搜索台账 / 设备 / 算法"
                  value={btKw}
                  onChange={(e) => BTKW(e.target.value)}
                />
              </div>
              <div className="pick-list">
                {btList.map((b) => {
                  const req = reqOfTarget(b);
                  return (
                    <button
                      key={b.id}
                      className={"pick" + (draft.targetId === b.id ? " on" : "")}
                      onClick={() => pickTarget(b.id)}
                    >
                      <b>{labelOfBt(b.id)}</b>
                      <small>
                        {req?.capture || "—"}
                        {b.unit ? ` · ${b.unit}` : ""} · {b.algorithm || "—"}
                      </small>
                    </button>
                  );
                })}
                {!btList.length && (
                  <p className="muted">
                    没有匹配的台账，请在左栏换设备 / 区域或调整关键词。
                  </p>
                )}
              </div>
            </div>
            {/* 右栏：台账详情（只读口径 + 自动勾选的上装） */}
            <aside className="pick-picked">
              <div className="pick-picked-head">
                <b>台账详情</b>
              </div>
              {selBt ? (
                <div className="pick-detail">
                  <p className="pick-detail-name">{labelOfBt(selBt.id)}</p>
                  <div className="bt-sum-kv">
                    <span>类型</span>
                    <b>
                      {selBt.targetKind || (selBt.instrumentId ? "仪表" : "环境")}
                    </b>
                    <span>区域</span>
                    <b>{areaOfTarget(selBt) || "—"}</b>
                    <span>设备</span>
                    <b>{devOfTarget(selBt)?.name || selBt.anchor || "—"}</b>
                    <span>巡检要求</span>
                    <b>{reqOfTarget(selBt)?.name || "—"}</b>
                    <span>采集方式</span>
                    <b>
                      {reqOfTarget(selBt)?.capture ||
                        insOf(selBt.instrumentId)?.capture ||
                        "—"}
                    </b>
                    <span>算法</span>
                    <b>{selBt.algorithm || "—"}</b>
                    <span>判定标准</span>
                    <b>{judgeTextOf(selBt)}</b>
                    <span>告警等级</span>
                    <b>{selBt.alarm?.level || "—"}</b>
                  </div>
                  <h6>自动勾选的上装</h6>
                  <div className="pick-detail-tags">
                    {[
                      ...new Set(
                        actionsOfTarget(selBt).map(
                          (x) => atomicActionCapability[x],
                        ),
                      ),
                    ].map((k) => (
                      <Badge key={k}>{k}</Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="pick-empty">未选择</p>
              )}
            </aside>
          </div>
        </div>

        {!businessTargets.length && (
          <Note>
            还没有巡检目标台账：业务目标 = 仪表 + 巡检要求 + 算法 + 阈值 + 判断标准。
            请先在「巡检目标台账」里建，或点上方「＋ 快速新建巡检目标台账」。
          </Note>
        )}
      </section>

      {/*
        ② 上装开关：明确「这一项巡检需要哪些上装参与」。
        选中台账时按其算法自动置开；也可手动开关，开 = 记入该上装主动作，关 = 移除该上装全部动作。
      */}
      <section className="item-step">
        <h4 className="item-step-h">
          <i>2</i>
          <span>明确本项需要哪些能力</span>
          <small className="step-tail">
            已选 {abilities.length} 项能力 · 原子动作 {draft.actions.length} 个
          </small>
        </h4>
        {/* 能力项表格：能力参数取自「后台管理 › 机器人能力」，选完带出能力类型与特有配置 */}
        <div className="task-toolbar">
          <Btn primary onClick={addAbility}>
            ＋ 新增一行
          </Btn>
        </div>
        <Table
          heads={["能力类型", "能力参数", "配置", "操作"]}
          rows={abilities.map((ab, i) => {
            const kindName = kindOfAbility(ab.param);
            const kindObj = (s.robotAbilities || []).find(
              (k) => k.name === kindName,
            );
            return [
            <select
              aria-label="能力类型"
              value={kindName || ""}
              onChange={(e) => setAbilityKind(i, e.target.value)}
            >
              {(s.robotAbilities || []).map((k) => (
                <option key={k.id} value={k.name}>
                  {k.name}
                </option>
              ))}
            </select>,
            <select
              aria-label="能力参数"
              value={ab.param}
              onChange={(e) => setAbilityParam(i, e.target.value)}
            >
              {(kindObj?.params || []).map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>,
            <div className="ability-fields">
              {(abilityFields[ab.param] || []).map((f) =>
                f.control === "switch" ? (
                  <label key={f.key} className="inline-filter">
                    <input
                      type="checkbox"
                      checked={!!ab.fields[f.key]}
                      onChange={(e) => setAbilityField(i, f.key, e.target.checked)}
                    />
                    <span>{f.label}</span>
                  </label>
                ) : f.control === "number" ? (
                  <label key={f.key} className="inline-filter">
                    <span>{f.label}</span>
                    <input
                      type="number"
                      aria-label={f.label}
                      placeholder={`请输入${f.label}`}
                      value={
                        ab.fields[f.key] === undefined
                          ? ""
                          : Number(ab.fields[f.key])
                      }
                      onChange={(e) =>
                        setAbilityField(i, f.key, Number(e.target.value))
                      }
                    />
                    {f.unit && <span>{f.unit}</span>}
                  </label>
                ) : (
                  <Btn
                    key={f.key}
                    onClick={() => setAbilityField(i, f.key, "已配置")}
                  >
                    {f.action || f.label}
                  </Btn>
                ),
              )}
              {!(abilityFields[ab.param] || []).length && (
                <span className="muted">—</span>
              )}
            </div>,
            <Btn danger onClick={() => removeAbility(i)}>
              删除
            </Btn>,
            ];
          })}
        />
        {!draft.actions.length && (
          <Note>
            还没有能力参与：先选巡检目标，再点「＋ 新增一行」挑能力。
          </Note>
        )}
      </section>

      {/* ③ 实时操控对准最佳位置（平台自动记录参数）＋ ④ 参数总览与保存 */}
      <section className="item-step">
        <h4 className="item-step-h">
          <i>3</i>
          <span>
            通过视频面板实时操作机器 / 云台，把机器调到能看到本巡检项的最佳位置
          </span>
          <small className="step-tail">平台自动记录参数</small>
        </h4>
        {!draft.actions.length ? (
          <Note>选择巡检目标与能力后，此处显示视频面板与操控台。</Note>
        ) : (
          <div className="item-cockpit">
            <div className="item-cockpit-left">
              <ControlCockpit
                draft={draft}
                recordingAction={recordingAction}
                onRecordingActionChange={setRecordingAction}
                cfgOf={cfgOf}
                updCfg={updCfg}
                onPoseAt={(at) => onChange({ pose: { ...draft.pose, at } })}
              />
            </div>
            <div className="item-cockpit-right">
              <h4 className="item-step-h">
                <i>4</i>
                <span>保存本项参数</span>
              </h4>
              <ParamSummary
                draft={draft}
                action={recordingAction}
                cfgOf={cfgOf}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );

  // 内置页（bare）：标题与动作条搬到页面顶栏，这里只留内容
  if (bare)
    return <div className="field-collect-drawer-body">{content}</div>;

  if (inline)
    return (
      <div className="field-collect-drawer">
        <div className="field-collect-drawer-head">
          <b>{draft.id ? `编辑巡检项 · ${draft.name || "未命名"}` : "添加巡检项"}</b>
        </div>
        <div className="field-collect-drawer-body">{content}</div>
        <div className="field-collect-drawer-foot">
          <Btn onClick={onCancel}>取消</Btn>
          <Btn primary onClick={onSave}>
            保存本项
          </Btn>
        </div>
      </div>
    );

  return (
    <Modal
      title={draft.id ? `编辑巡检项 · ${draft.name || "未命名"}` : "添加巡检项"}
      wide
      onClose={onCancel}
      footer={
        <>
          <Btn onClick={onCancel}>取消</Btn>
          <Btn primary onClick={onSave}>
            保存本项
          </Btn>
        </>
      }
    >
      {content}
    </Modal>
  );
}

/** 数值参数：输入 + 「查询（回读已记录值）/ 设置（写入记录）」 */
function QuerySet({
  label,
  unit,
  value,
  min,
  max,
  step,
  onSet,
}: {
  label: string;
  unit?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onSet: (v: number) => void;
}) {
  const [v, setV] = useState(String(value));
  // 切换动作 / 外部记录值变化时同步输入框
  useEffect(() => setV(String(value)), [value]);
  return (
    <div className="qset">
      <span className="lbl">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => setV(e.target.value)}
      />
      {unit && <span>{unit}</span>}
      <Btn onClick={() => setV(String(value))}>查询</Btn>
      <Btn primary onClick={() => onSet(Number(v))}>
        设置
      </Btn>
    </div>
  );
}

/** 开关型辅助按钮（补光灯 / 报警灯 / 雨刷 / 防冻 / 透雾） */
function Switch({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={on ? "switch-btn on" : "switch-btn"}
      onClick={() => onChange(!on)}
    >
      {label} {on ? "开" : "关"}
    </button>
  );
}

/** 参数总览（右栏）：实时回显当前巡检项所有已记录参数，并提供保存入口 */
function ParamSummary({
  draft,
  action,
  cfgOf,
}: {
  draft: InspectSpec;
  /** 当前正在记录参数的动作；缺省取第一个动作 */
  action?: AtomicAction | "";
  cfgOf: (a: AtomicAction) => AtomicActionConfig;
}) {
  const auxFlags = (c: AtomicActionConfig) => {
    const e = c.extra || {};
    const on: string[] = [];
    if ((c.light ?? 0) > 0) on.push("补光灯");
    if (e.alarmLight) on.push("报警灯");
    if (e.wiper) on.push("雨刷");
    if (e.antiFreeze) on.push("防冻");
    if (e.defog) on.push("透雾");
    if (e.emergencyStop) on.push("急停");
    return on;
  };

  if (!draft.actions.length)
    return (
      <div className="param-summary">
        <p className="ps-empty">
          在操控台操作后，参数将自动记录于此。
        </p>
      </div>
    );

  const a = (action || draft.actions[0]) as AtomicAction;
  const c = cfgOf(a);
  const ptz = c.ptz || draft.pose.ptz;
  const at = c.at || draft.pose.at;
  const aux = auxFlags(c);
  return (
    <div className="param-summary">
      {/* 一份清单：只罗列当前操作记录到的参数，不按能力 / 动作分块 */}
      <div className="ps-item">
        <div className="ps-head">
          <b>本项参数记录</b>
          <Badge>{atomicActionCapability[a]}</Badge>
        </div>
        <div className="ps-kv">
          <b>位置坐标</b>
          <span>{at ? `X ${at.x} / Y ${at.y} / Z ${at.z}` : "—"}</span>
          <b>水平角</b>
          <span>{ptz.pan}°</span>
          <b>俯仰角</b>
          <span>{ptz.tilt}°</span>
          <b>变倍</b>
          <span>{ptz.zoom}</span>
          <b>聚焦</b>
          <span>{c.focus ?? "—"}</span>
          <b>升降</b>
          <span>{c.lift ?? 0}</span>
          <b>补光</b>
          <span>{c.light ?? 0}%</span>
          <b>停留</b>
          <span>{c.dwellSec ?? 5}s</span>
          <b>预置位</b>
          <span>{c.preset || "—"}</span>
          {a === "采集气体" && (
            <>
              <b>采集方式</b>
              <span>{c.gasMode ?? "泵吸式"}</span>
              <b>传感器</b>
              <span>{c.sensorKind || "—"}</span>
            </>
          )}
          {a === "采集红外热像" && (
            <>
              <b>发射率</b>
              <span>{c.emissivity ?? "—"}</span>
              <b>测温距离</b>
              <span>{c.thermalDistance ?? "—"}m</span>
            </>
          )}
          {a === "录制声音" && (
            <>
              <b>关注频段</b>
              <span>{c.soundBand || "—"}</span>
            </>
          )}
          {a === "分析不安全行为" && (
            <>
              <b>行为类别</b>
              <span>{(c.behaviorTypes || []).join(" / ") || "—"}</span>
            </>
          )}
          {aux.length > 0 && (
            <>
              <b>辅助</b>
              <span>{aux.join(" / ")}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 操控台：人实际操控机器 / 云台 / 上装，操作即自动记录到当前动作参数 */
function ControlCockpit({
  draft,
  recordingAction,
  onRecordingActionChange,
  cfgOf,
  updCfg,
  onPoseAt,
}: {
  draft: InspectSpec;
  recordingAction: AtomicAction | "";
  onRecordingActionChange: (a: AtomicAction | "") => void;
  cfgOf: (a: AtomicAction) => AtomicActionConfig;
  updCfg: (a: AtomicAction, patch: Partial<AtomicActionConfig>) => void;
  /** 移动后坐标回写到巡检项主视角（保存巡检项时一并落库） */
  onPoseAt?: (at: { x: number; y: number; z: number }) => void;
}) {
  /** 上装 / 下装两块默认收起：点标题按钮才展开对应操控内容（一块展开后很占地方） */
  const [openUpper, SET_OPEN_UPPER] = useState(false);
  const [openLower, SET_OPEN_LOWER] = useState(false);
  const a = (recordingAction || draft.actions[0]) as AtomicAction;
  const c = cfgOf(a);
  const ptz = c.ptz || draft.pose.ptz;
  /** 移动后坐标：机器人移动 / 手动设定后记录进巡检项 */
  const at = c.at || draft.pose.at || { x: 0, y: 0, z: 0 };
  const setAt = (v: { x: number; y: number; z: number }) => {
    updCfg(a, { at: v, source: "cockpit" });
    onPoseAt?.(v);
  };
  /** 移动按钮：按 0.5 米步进改变坐标（原型模拟机器人位移） */
  const moveBy = (dx: number, dy: number) =>
    setAt({
      x: Math.round((at.x + dx) * 100) / 100,
      y: Math.round((at.y + dy) * 100) / 100,
      z: at.z,
    });

  const setPtz = (patch: Partial<PTZ>) =>
    updCfg(a, { ptz: { ...ptz, ...patch }, source: "cockpit" });
  const setExtra = (patch: Record<string, string | number | boolean>) => {
    const extra = { ...(c.extra || {}), ...patch };
    updCfg(a, { extra, source: "cockpit" });
  };
  const extraNum = (key: string, def = 0) => Number(c.extra?.[key] ?? def);
  const extraBool = (key: string) => Boolean(c.extra?.[key]);
  /** 该动作是否被勾选（上装参数按勾选显示） */
  const has = (x: AtomicAction) => draft.actions.includes(x);

  return (
    <div className="cockpit">
      <div className="cockpit-video-row">
        <div className="video-pane">
          <span className="video-label">
            <Video size={14} /> 可见光
          </span>
          <div className="video-placeholder">
            <span>演示画面 · 非真实机器人推流</span>
          </div>
        </div>
        <div className="video-pane">
          <span className="video-label">
            <Thermometer size={14} /> 红外热像
          </span>
          <div className="video-placeholder thermal">
            <span>演示画面 · 非真实机器人推流</span>
          </div>
        </div>
      </div>

      {/* 上装块：云台状态 + 镜头控制（相机 / 云台自己的调整）；默认收起，点标题展开 */}
      <section className="cockpit-block">
        <button
          type="button"
          className={"cockpit-block-head" + (openUpper ? " on" : "")}
          onClick={() => SET_OPEN_UPPER(!openUpper)}
        >
          {openUpper ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          上装 · 云台与镜头
        </button>
        {openUpper && (
        <>
        <div className="cockpit-cols">
        {/* 云台控制：转向 / 升降 */}
        <div className="cockpit-section">
          <>
              <div className="cockpit-sub2">
                <div>
                  <label className="inline-filter">
                    <span>单次转动速度</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={extraNum("turnSpeed", 30)}
                      onChange={(e) =>
                        setExtra({ turnSpeed: Number(e.target.value) })
                      }
                    />
                    <span>{extraNum("turnSpeed", 30)}%</span>
                  </label>
                  <b>云台转向控制</b>
                  <div className="dpad">
                    <button onClick={() => setPtz({ tilt: ptz.tilt + 1 })}>上</button>
                    <div className="dpad-mid">
                      <button onClick={() => setPtz({ pan: ptz.pan - 1 })}>左</button>
                      <button onClick={() => setPtz({ pan: ptz.pan + 1 })}>右</button>
                    </div>
                    <button onClick={() => setPtz({ tilt: ptz.tilt - 1 })}>下</button>
                  </div>
                </div>
                <div>
                  <label className="inline-filter">
                    <span>单次升降速度</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={extraNum("liftSpeed", 30)}
                      onChange={(e) =>
                        setExtra({ liftSpeed: Number(e.target.value) })
                      }
                    />
                    <span>{extraNum("liftSpeed", 30)}%</span>
                  </label>
                  <b>云台升降控制</b>
                  <div className="dpad small">
                    <button
                      onClick={() =>
                        updCfg(a, {
                          lift: (c.lift ?? 0) + 1,
                          source: "cockpit",
                        })
                      }
                    >
                      上升
                    </button>
                    <button
                      onClick={() =>
                        updCfg(a, {
                          lift: Math.max(0, (c.lift ?? 0) - 1),
                          source: "cockpit",
                        })
                      }
                    >
                      下降
                    </button>
                  </div>
                </div>
              </div>
              <QuerySet
                label="升降高度"
                min={0}
                max={100}
                value={c.lift ?? 0}
                onSet={(v) => updCfg(a, { lift: v, source: "cockpit" })}
              />
            </>
        </div>

        {/* 中列：云台状态 */}
        <div className="cockpit-section">
          <b>云台状态</b>
          <QuerySet
            label="垂直角度"
            unit="°"
            min={-90}
            max={90}
            value={ptz.tilt}
            onSet={(v) => setPtz({ tilt: v })}
          />
          <QuerySet
            label="水平角度"
            unit="°"
            min={-180}
            max={180}
            value={ptz.pan}
            onSet={(v) => setPtz({ pan: v })}
          />
          <div className="qset">
            <span className="lbl">预置位</span>
            <input
              value={c.preset ?? ""}
              placeholder="请输入预置位"
              onChange={(e) =>
                updCfg(a, { preset: e.target.value, source: "cockpit" })
              }
            />
            <Btn onClick={() => setExtra({ presetSaved: true })}>添加</Btn>
            <Btn onClick={() => setExtra({ presetRecalled: true })}>召回</Btn>
            <Btn onClick={() => updCfg(a, { preset: "" })}>删除</Btn>
          </div>
        </div>

        {/* 右列：镜头控制 */}
        <div className="cockpit-section">
          <b>镜头控制</b>
          <QuerySet
            label="镜头变倍"
            min={1}
            max={30}
            value={ptz.zoom}
            onSet={(v) => setPtz({ zoom: v })}
          />
          <QuerySet
            label="镜头聚焦"
            min={0}
            max={100}
            value={c.focus ?? 50}
            onSet={(v) => updCfg(a, { focus: v, source: "cockpit" })}
          />
          <div className="qset">
            <span className="lbl">聚焦模式</span>
            {(["自动", "手动", "半自动"] as const).map((mode) => (
              <label key={mode} className="inline-filter">
                <input
                  type="radio"
                  name="focus-mode"
                  checked={(c.extra?.focusMode as string) === mode}
                  onChange={() => setExtra({ focusMode: mode })}
                />
                <span>{mode}</span>
              </label>
            ))}
          </div>
          <div className="qset">
            <span className="lbl">光圈控制</span>
            <Btn
              onClick={() =>
                setExtra({ iris: Math.max(0, extraNum("iris", 50) - 5) })
              }
            >
              －
            </Btn>
            <span>{extraNum("iris", 50)}</span>
            <Btn
              onClick={() =>
                setExtra({ iris: Math.min(100, extraNum("iris", 50) + 5) })
              }
            >
              ＋
            </Btn>
          </div>
        </div>
      </div>

      {/* 上装参数：按已勾选的原子动作显示各自特性参数 */}
      {(has("采集红外热像") ||
        has("采集气体") ||
        has("录制声音") ||
        has("分析不安全行为")) && (
        <div className="cockpit-aux">
          <div className="cockpit-section">
            <b>上装参数</b>
            <div className="cockpit-aux-grid">
              {has("采集红外热像") && (
                <div>
                  <QuerySet
                    label="发射率"
                    step={0.01}
                    min={0}
                    max={1}
                    value={c.emissivity ?? 0.95}
                    onSet={(v) => updCfg(a, { emissivity: v })}
                  />
                  <QuerySet
                    label="测温距离"
                    unit="米"
                    min={0}
                    value={c.thermalDistance ?? 0}
                    onSet={(v) => updCfg(a, { thermalDistance: v })}
                  />
                </div>
              )}
              {has("录制声音") && (
                <div>
                  <div className="qset">
                    <span className="lbl">关注频段</span>
                    <input
                      value={c.soundBand ?? ""}
                      placeholder="如 20Hz–20kHz"
                      onChange={(e) => updCfg(a, { soundBand: e.target.value })}
                    />
                  </div>
                </div>
              )}
              {has("分析不安全行为") && (
                <div>
                  <div className="qset">
                    <span className="lbl">行为类别</span>
                    <div className="actions">
                      {BEHAVIOR_TYPES.map((t) => (
                        <label key={t} className="inline-filter">
                          <input
                            type="checkbox"
                            checked={(c.behaviorTypes || []).includes(t)}
                            onChange={(e) => {
                              const set = new Set(c.behaviorTypes || []);
                              if (e.target.checked) set.add(t);
                              else set.delete(t);
                              updCfg(a, { behaviorTypes: [...set] });
                            }}
                          />
                          <span>{t}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
        </>
        )}
      </section>

      {/* 下装块：机器人移动 + 位姿（移动后坐标随移动按钮记录，保存巡检项时落库） */}
      <section className="cockpit-block">
        <button
          type="button"
          className={"cockpit-block-head" + (openLower ? " on" : "")}
          onClick={() => SET_OPEN_LOWER(!openLower)}
        >
          {openLower ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          下装 · 机器人移动
        </button>
        {openLower && (
        <div className="cockpit-cols">
          <div className="cockpit-section">
            <b>移动控制</b>
            <div className="dpad">
              <button onClick={() => moveBy(0, 0.5)}>前</button>
              <div className="dpad-mid">
                <button onClick={() => moveBy(-0.5, 0)}>左</button>
                <button onClick={() => moveBy(0.5, 0)}>右</button>
              </div>
              <button onClick={() => moveBy(0, -0.5)}>后</button>
            </div>
            <div className="actions">
              <button
                type="button"
                className={
                  extraBool("emergencyStop") ? "switch-btn on" : "switch-btn"
                }
                onClick={() => setExtra({ emergencyStop: true })}
              >
                急停
              </button>
              <button
                type="button"
                className="switch-btn"
                onClick={() => setExtra({ emergencyStop: false })}
              >
                解除
              </button>
            </div>
          </div>
          {/* 位姿与移动后坐标：点位坐标先记录，保存巡检项时一并落库 */}
          <div className="cockpit-section">
            <b>位姿与移动后坐标</b>
            <QuerySet
              label="坐标 X"
              unit="米"
              step={0.1}
              value={at.x}
              onSet={(v) => setAt({ ...at, x: v })}
            />
            <QuerySet
              label="坐标 Y"
              unit="米"
              step={0.1}
              value={at.y}
              onSet={(v) => setAt({ ...at, y: v })}
            />
            <QuerySet
              label="坐标 Z"
              unit="米"
              step={0.1}
              value={at.z}
              onSet={(v) => setAt({ ...at, z: v })}
            />
            <QuerySet
              label="机器人朝向"
              unit="°"
              min={-180}
              max={180}
              value={extraNum("heading", 0)}
              onSet={(v) => setExtra({ heading: v })}
            />
          </div>
        </div>
        )}
      </section>

      {/* 底部通栏：辅助功能 */}
      <div className="cockpit-aux">
        <div className="cockpit-section">
          <b>辅助功能</b>
          <div className="cockpit-aux-grid">
            <Switch
              label="补光灯"
              on={(c.light ?? 0) > 0}
              onChange={(on) =>
                updCfg(a, { light: on ? 60 : 0, source: "cockpit" })
              }
            />
            <Switch
              label="报警灯"
              on={extraBool("alarmLight")}
              onChange={(on) => setExtra({ alarmLight: on })}
            />
            <Switch
              label="雨刷"
              on={extraBool("wiper")}
              onChange={(on) => setExtra({ wiper: on })}
            />
            <Switch
              label="防冻"
              on={extraBool("antiFreeze")}
              onChange={(on) => setExtra({ antiFreeze: on })}
            />
            <Switch
              label="透雾"
              on={extraBool("defog")}
              onChange={(on) => setExtra({ defog: on })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
