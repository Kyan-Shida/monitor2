/**
 * @file InspectItemDrawer.tsx
 * @description 巡检项编辑抽屉：把「名称 + 业务目标 + 机器操作内容」放到右侧抽屉。
 *              参数录入统一走「操控台」——人实际操控机器 / 云台 / 上装，操作即自动记录（source=cockpit）；
 *              操控台按参考界面铺开为「云台控制 / 云台状态 / 镜头控制」三列 + 「辅助功能」通栏，
 *              数值参数支持「查询（回读已记录值）/ 设置（下发并记录）」，右侧实时回显参数总览并可保存。
 * @interaction 被 pages/PointEdit.tsx、pages/PointOnsite.tsx 调用
 */
import { useEffect, useState } from "react";
import { Maximize2, Thermometer, Video } from "lucide-react";
import { Badge, Btn, Drawer, Field, Modal, Note, Switch as Toggle } from "./UI";
import { Cascader, type CascaderOption } from "./Cascader";
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
  /**
   * 当前正在记录参数的动作
   * @description 操控台常驻在页面左栏，这份状态由页面持有，这里只用于「当前巡检项记录参」回显
   */
  recordingAction?: AtomicAction | "";
  /** 记录动作变化时回写页面 */
  onRecordingActionChange?: (a: AtomicAction | "") => void;
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
  recordingAction,
  onRecordingActionChange,
}: InspectItemDrawerProps) {
  /** 正在记录参数的动作；页面未接管时缺省取本项第一个动作 */
  const recAct = recordingAction ?? draft.actions[0] ?? "";

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
  /** 当前选中的台账（口径回显） */
  const selBt = businessTargets.find((b) => b.id === draft.targetId);
  /**
   * 巡检目标台账的级联候选：区域 › 设备 › 台账
   * @description 摘掉设备的「空间 / 区域」类台账另起一组（它们不挂设备）；
   *              叶子 value = 台账 id，「选中即按其算法带出能力与原子动作」
   */
  const targetOptions: CascaderOption[] = (() => {
    const devName = (id: string) => devices.find((d) => d.id === id)?.name || id;
    const byArea = new Map<string, Map<string, CascaderOption[]>>();
    const space: CascaderOption[] = [];
    businessTargets.forEach((b) => {
      const leaf: CascaderOption = {
        value: b.id,
        label: b.name || labelOfBt(b.id),
      };
      const dev = devOfTarget(b);
      if (!dev) {
        space.push(leaf);
        return;
      }
      const area = areaOfTarget(b) || "其他区域";
      const devs = byArea.get(area) || new Map<string, CascaderOption[]>();
      devs.set(dev.id, [...(devs.get(dev.id) || []), leaf]);
      byArea.set(area, devs);
    });
    return [
      ...[...byArea].map(([area, devs]) => ({
        value: `a:${area}`,
        label: area,
        children: [...devs].map(([devId, items]) => ({
          value: `d:${devId}`,
          label: devName(devId),
          children: items,
        })),
      })),
      ...(space.length
        ? [{ value: "space", label: "空间与区域", children: space }]
        : []),
    ];
  })();

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
      onRecordingActionChange?.(next[0] || "");
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
  /**
   * 能力参数候选：取自「后台管理 › 机器人能力」两级清单里的**能力参数**
   */
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
  /**
   * 正在配置的能力项下标（null = 抽屉关闭）
   * @description 右栏宽度放不下「类型 / 参数 / 配置 / 操作」四列，改成摘要行 + 抽屉编辑；
   *              改动仍然实时写回 draft（和原来表格内编辑同一套 setAbility*）
   */
  const [abIndex, SETABINDEX] = useState<number | null>(null);
  const editingAb =
    abIndex !== null ? abilities[abIndex] : undefined;

  const content = (
    <>
    {/* 巡检项详情：名称 / 目标台账 / 所需能力列表 / 当前巡检项记录参（操控台在页面左栏常驻） */}
    <div className="pd-detail">
      <Field label="巡检项名称" required>
        <input
          value={draft.name}
          placeholder="例如 压力读数 / 泵体滴漏"
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>

      {/* 巡检目标台账：级联选择器（区域 › 设备 › 台账），点中即生效 */}
      <Field label="巡检目标台账（检什么 · 怎么判）" required>
        <Cascader
          options={targetOptions}
          value={draft.targetId}
          placeholder="请选择巡检目标"
          onChange={pickTarget}
        />
      </Field>
      {selBt && (
        <p className="muted">
          判定：{judgeTextOf(selBt)} · 采集 {reqOfTarget(selBt)?.capture || "—"}
        </p>
      )}
      {!businessTargets.length && (
        <Note>
          还没有巡检目标台账：业务目标 = 仪表 + 算法模板 + 算法 + 阈值 + 判断标准。
          请先在「巡检目标台账」里建，或点下方「＋ 快速新建巡检目标台账」。
        </Note>
      )}

      {/*
        所需能力列表：右栏只有 380px，四列表格会横向溢出被裁掉
        → 这里只放「类型 · 能力 · 参数摘要」的摘要行，点行在右侧抽屉里配参数
      */}
      <div className="pd-block">
        <div className="pd-block-head">
          <b>
            所需能力列表
            <em className="req">*</em>
          </b>
          <Btn
            primary
            onClick={() => {
              addAbility();
              // 新增后直接打开抽屉，省掉"先加一行再点进去"的一步
              SETABINDEX(abilities.length);
            }}
          >
            新增
          </Btn>
        </div>
        <ul className="pd-abilities">
          {abilities.map((ab, i) => {
            const kindName = kindOfAbility(ab.param);
            const conf = (abilityFields[ab.param] || [])
              .filter(
                (f) => ab.fields[f.key] !== undefined && f.control !== "action",
              )
              .map((f) => `${f.label} ${ab.fields[f.key]}${f.unit || ""}`);
            return (
              <li key={ab.id}>
                <button type="button" onClick={() => SETABINDEX(i)}>
                  <span className="pd-ability-kind">{kindName || "未选类型"}</span>
                  <b>{ab.param || "未选择能力"}</b>
                  <small>{conf.length ? conf.join(" · ") : "默认参数"}</small>
                </button>
              </li>
            );
          })}
        </ul>
        {!draft.actions.length && (
          <Note>还没有能力参与：先选巡检目标，再点「新增」挑能力。</Note>
        )}
      </div>
    </div>
    {/* 能力项抽屉：类型 / 参数 / 该能力的特有配置，都在这里配 */}
    {editingAb && abIndex !== null && (
      <Drawer
        title="能力项配置"
        subtitle={`${kindOfAbility(editingAb.param) || "未选类型"} · ${editingAb.param || "未选能力"}`}
        onClose={() => SETABINDEX(null)}
        footer={
          <>
            <Btn
              danger
              onClick={() => {
                removeAbility(abIndex);
                SETABINDEX(null);
              }}
            >
              删除该能力
            </Btn>
            <Btn primary onClick={() => SETABINDEX(null)}>
              完成
            </Btn>
          </>
        }
      >
        <Field label="能力类型" required>
          <select
            value={kindOfAbility(editingAb.param) || ""}
            onChange={(e) => setAbilityKind(abIndex, e.target.value)}
          >
            {(s.robotAbilities || []).map((k) => (
              <option key={k.id} value={k.name}>
                {k.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="能力参数" required>
          <select
            value={editingAb.param}
            onChange={(e) => setAbilityParam(abIndex, e.target.value)}
          >
            {/* 能力参数按能力类型分组列出（页面已无启停，全部可选） */}
            {(
              (s.robotAbilities || []).find(
                (k) => k.name === kindOfAbility(editingAb.param),
              )?.params || []
            ).map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        <div className="pd-block">
          <b>参数配置</b>
          <div className="ability-fields">
            {(abilityFields[editingAb.param] || []).map((f) =>
              f.control === "switch" ? (
                <label key={f.key} className="inline-filter">
                  <input
                    type="checkbox"
                    checked={!!editingAb.fields[f.key]}
                    onChange={(e) =>
                      setAbilityField(abIndex, f.key, e.target.checked)
                    }
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
                      editingAb.fields[f.key] === undefined
                        ? ""
                        : Number(editingAb.fields[f.key])
                    }
                    onChange={(e) =>
                      setAbilityField(abIndex, f.key, Number(e.target.value))
                    }
                  />
                  {f.unit && <span>{f.unit}</span>}
                </label>
              ) : (
                <Btn
                  key={f.key}
                  onClick={() => setAbilityField(abIndex, f.key, "已配置")}
                >
                  {f.action || f.label}
                </Btn>
              ),
            )}
            {!(abilityFields[editingAb.param] || []).length && (
              <span className="muted">该能力没有额外参数，选好即可。</span>
            )}
          </div>
        </div>
      </Drawer>
    )}
    </>
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

/** 开关型辅助功能（补光灯 / 报警灯 / 雨刷 / 防冻 / 透雾）：名称 + 滑块开关 */
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
    <span className="aux-switch">
      <span>{label}</span>
      <Toggle checked={on} onChange={onChange} label={label} />
    </span>
  );
}

/**
 * 参数总览（右栏）：实时回显当前巡检项所有已记录参数
 * @description 同时被「保存巡检项」二次确认弹窗复用（保存前让用户核对一遍参数）
 */
export function ParamSummary({
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
/** 「机器控制」区：双路视频 + 机器人移动 + 云台 + 辅助功能（巡检点详情页左栏常驻） */
export function ControlCockpit({
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
  const a = (recordingAction || draft.actions[0]) as AtomicAction;
  const c = cfgOf(a);
  const ptz = c.ptz || draft.pose.ptz;
  /** 移动后坐标：机器人移动 / 手动设定后记录进巡检项 */
  const at = c.at || draft.pose.at || { x: 0, y: 0, z: 0 };
  const setAt = (v: { x: number; y: number; z: number }) => {
    updCfg(a, { at: v, source: "cockpit" });
    onPoseAt?.(v);
  };
  /** 视频窗全屏：把该窗本身投满屏（Esc / 再次点击退出） */
  const toggleFs = (el: HTMLElement | null) => {
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
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
        {/* 两路画面各自带全屏按钮：点按钮把该窗本身投满屏，Esc / 再点一次退出 */}
        <div className="video-pane">
          <span className="video-label">
            <Video size={14} /> 可见光
          </span>
          <div className="video-placeholder">
            <span>演示画面 · 非真实机器人推流</span>
          </div>
          <button
            type="button"
            className="video-fs"
            title="全屏查看"
            aria-label="全屏查看可见光画面"
            onClick={(e) => toggleFs(e.currentTarget.parentElement)}
          >
            <Maximize2 size={13} />
          </button>
        </div>
        <div className="video-pane">
          <span className="video-label">
            <Thermometer size={14} /> 红外热像
          </span>
          <div className="video-placeholder thermal">
            <span>演示画面 · 非真实机器人推流</span>
          </div>
          <button
            type="button"
            className="video-fs"
            title="全屏查看"
            aria-label="全屏查看红外热像画面"
            onClick={(e) => toggleFs(e.currentTarget.parentElement)}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* 上装块：云台状态 + 镜头控制（相机 / 云台自己的调整）；默认收起，点标题展开 */}
      <section className="cockpit-block">
        <div className="cockpit-cols cockpit-cols-4">
        {/* 云台控制：转向 / 升降 并列，下方接升降高度 */}
        <div className="cockpit-section">
          <div className="cockpit-sub2">
            <div>
              <b>云台转向控制</b>
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
              <b>云台升降控制</b>
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
      </section>

      {/* 下装块：机器人移动 + 位姿（移动后坐标随移动按钮记录，保存巡检项时落库）；区块标题已去掉，减少一行留白 */}
      <section className="cockpit-block">
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
          <div className="cockpit-section cockpit-pose">
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
