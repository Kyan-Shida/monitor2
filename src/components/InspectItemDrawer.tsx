/**
 * @file InspectItemDrawer.tsx
 * @description 巡检项编辑抽屉：把「名称 + 业务目标 + 机器操作内容」放到右侧抽屉，
 *              支持两种参数录入方式：操控台边调边看、手动逐项输入。
 * @interaction 被 pages/PointEdit.tsx 调用
 */
import { useMemo, useState } from "react";
import {
  Crosshair,
  Move,
  Settings2,
  ScanEye,
  Thermometer,
  Video,
  Focus,
  Aperture,
  Lightbulb,
  Bell,
  CloudRain,
  Snowflake,
  CloudFog,
} from "lucide-react";
import { Badge, Btn, Field, Modal, Note } from "./UI";
import {
  atomicActionCapability,
  payloadGroups,
  BEHAVIOR_TYPES,
} from "../data/types";
import type {
  AtomicAction,
  AtomicActionConfig,
  BusinessTarget,
  InspectSpec,
  PTZ,
} from "../data/types";

/** 避障策略选项（到点后的通行策略） */
const AVOID = ["标准", "谨慎", "绕行"];

/** 两种参数录入方式 */
type EditMode = "cockpit" | "manual";

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
}: InspectItemDrawerProps) {
  const [mode, setMode] = useState<EditMode>("manual");
  const [recordingAction, setRecordingAction] = useState<AtomicAction | "">(
    draft.actions[0] || "",
  );

  /** 取某原子动作的逐项编排；未单独配置时回退到共享视角 */
  function cfgOf(a: AtomicAction): AtomicActionConfig {
    const c = draft.actionConfigs?.[a];
    if (c) return c;
    const p = draft.pose;
    return {
      source: mode === "cockpit" ? "cockpit" : "manual",
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
    const source = patch.source ?? (mode === "cockpit" ? "cockpit" : "manual");
    cfgs[a] = { ...prev, ...patch, source };
    onChange({ actionConfigs: cfgs });
  }

  /** 勾选 / 取消勾选原子动作 */
  function toggleAction(a: AtomicAction, on: boolean) {
    const actions = on
      ? [...draft.actions, a]
      : draft.actions.filter((x) => x !== a);
    const cfgs = { ...(draft.actionConfigs || {}) };
    if (!on) delete cfgs[a];
    onChange({ actions, actionConfigs: cfgs });
    if (on && !recordingAction) setRecordingAction(a);
  }

  /** 渲染模式切换栏 */
  const modeBar = (
    <div className="drawer-mode-bar">
      <span>参数录入方式：</span>
      <div className="actions">
        {(
          [
            { k: "cockpit", label: "操控台录入" },
            { k: "manual", label: "手动输入" },
          ] as { k: EditMode; label: string }[]
        ).map((m) => (
          <label
            key={m.k}
            className={"mode-radio " + (mode === m.k ? "active" : "")}
          >
            <input
              type="radio"
              name="item-mode"
              checked={mode === m.k}
              onChange={() => setMode(m.k)}
            />
            <span>{m.label}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <Modal
      title={draft.id ? `编辑巡检项 · ${draft.name || "未命名"}` : "添加巡检项"}
      drawer
      drawerWidth={860}
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
      {modeBar}

      <Field label="巡检项名称">
        <input
          value={draft.name}
          placeholder="例如 压力读数 / 泵体滴漏"
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>

      <Field label="巡检目标台账（检什么 · 怎么判）">
        <div className="actions">
          <select
            value={draft.targetId}
            onChange={(e) => onChange({ targetId: e.target.value })}
          >
            <option value="">请选择巡检目标台账</option>
            {businessTargets.map((b) => (
              <option key={b.id} value={b.id}>
                {labelOfBt(b.id)}
                {b.inspect ? "" : "（已关闭是否巡检）"}
              </option>
            ))}
          </select>
          <Btn onClick={onOpenBt}>＋ 快速新建巡检目标台账</Btn>
        </div>
      </Field>

      {!businessTargets.length && (
        <Note>
          还没有巡检目标台账：业务目标 = 仪表 + 巡检要求 + 算法 + 阈值 + 判断标准。
          请先在「巡检目标台账」里建，或点上方「＋ 快速新建」。
        </Note>
      )}

      <Field label="机器操作内容 · 原子动作（按上装选动作模板 · 到点后做什么）">
        <div className="payload-groups">
          {payloadGroups.map((g) => (
            <div className="payload-group" key={g.name}>
              <div className="payload-head">
                <b>{g.name}</b>
                <small>
                  {g.caption} · {atomicActionCapability[g.actions[0]]}
                </small>
              </div>
              <div className="actions">
                {g.actions.map((a) => (
                  <label key={a} className="inline-filter">
                    <input
                      type="checkbox"
                      checked={draft.actions.includes(a)}
                      onChange={(e) => toggleAction(a, e.target.checked)}
                    />
                    <span>{a}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Field>

      {mode === "manual" && (
        <ManualActionPanel draft={draft} cfgOf={cfgOf} updCfg={updCfg} />
      )}

      {mode === "cockpit" && (
        <>
          {!draft.actions.length ? (
            <Note>先勾选上方原子动作，再到操控台边调边看。</Note>
          ) : (
            <ControlCockpit
              draft={draft}
              recordingAction={recordingAction}
              onRecordingActionChange={setRecordingAction}
              cfgOf={cfgOf}
              updCfg={updCfg}
            />
          )}
        </>
      )}

    </Modal>
  );
}

/** 手动模式：为每个选中的原子动作单独配参数 */
function ManualActionPanel({
  draft,
  cfgOf,
  updCfg,
}: {
  draft: InspectSpec;
  cfgOf: (a: AtomicAction) => AtomicActionConfig;
  updCfg: (a: AtomicAction, patch: Partial<AtomicActionConfig>) => void;
}) {
  if (!draft.actions.length)
    return (
      <p className="muted">先勾选上方原子动作，再逐项手动输入参数。</p>
    );
  return (
    <Field label="机器操作内容 · 逐项动作编排（手动输入）">
      <div className="action-cards">
        {draft.actions.map((a) => {
          const c = cfgOf(a);
          const ptz = c.ptz || draft.pose.ptz;
          return (
            <div className="action-card" key={a}>
              <div className="action-card-head">
                <b>{a}</b>
                <Badge>{atomicActionCapability[a]}</Badge>
              </div>
              <ActionParamForm a={a} c={c} ptz={ptz} updCfg={updCfg} />
            </div>
          );
        })}
      </div>
    </Field>
  );
}

/** 参数表单（手动与操控台共用输入区） */
function ActionParamForm({
  a,
  c,
  ptz,
  updCfg,
  hidePtz,
}: {
  a: AtomicAction;
  c: AtomicActionConfig;
  ptz: PTZ;
  updCfg: (a: AtomicAction, patch: Partial<AtomicActionConfig>) => void;
  hidePtz?: boolean;
}) {
  return (
    <>
      {!hidePtz && (
        <div className="ptz-row">
          {(
            [
              ["pan", "水平", -180, 180],
              ["tilt", "俯仰", -90, 90],
              ["zoom", "变焦", 1, 30],
            ] as const
          ).map(([k, label, min, max]) => (
            <label key={k} className="inline-filter">
              <span>{label}</span>
              <input
                type="range"
                min={min}
                max={max}
                aria-label={`${label}滑杆`}
                value={ptz[k]}
                onChange={(e) =>
                  updCfg(a, {
                    ptz: { ...ptz, [k]: Number(e.target.value) },
                  })
                }
              />
              <input
                type="number"
                min={min}
                max={max}
                aria-label={label}
                value={ptz[k]}
                onChange={(e) =>
                  updCfg(a, {
                    ptz: { ...ptz, [k]: Number(e.target.value) },
                  })
                }
              />
            </label>
          ))}
        </div>
      )}
      <div className="actions">
        <label className="inline-filter">
          <span>观察方向：</span>
          <input
            value={c.viewDir ?? ""}
            placeholder="例如 正对表盘"
            onChange={(e) => updCfg(a, { viewDir: e.target.value })}
          />
        </label>
        <label className="inline-filter">
          <span>补光：</span>
          <input
            type="range"
            min={0}
            max={100}
            aria-label="补光"
            value={c.light ?? 40}
            onChange={(e) => updCfg(a, { light: Number(e.target.value) })}
          />
          <span>{c.light ?? 40}%</span>
        </label>
        <label className="inline-filter">
          <span>升降：</span>
          <input
            type="number"
            step="0.1"
            aria-label="升降高度"
            value={c.lift ?? 0}
            onChange={(e) => updCfg(a, { lift: Number(e.target.value) })}
          />
        </label>
        <label className="inline-filter">
          <span>停留：</span>
          <input
            type="number"
            aria-label="停留秒数"
            value={c.dwellSec ?? 5}
            onChange={(e) => updCfg(a, { dwellSec: Number(e.target.value) })}
          />
          <span>秒</span>
        </label>
        <label className="inline-filter">
          <span>避障：</span>
          <select
            aria-label="避障策略"
            value={c.avoidPolicy ?? "标准"}
            onChange={(e) => updCfg(a, { avoidPolicy: e.target.value })}
          >
            {AVOID.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="inline-filter">
          <span>预置位：</span>
          <input
            value={c.preset ?? ""}
            placeholder="例如 P-03"
            onChange={(e) => updCfg(a, { preset: e.target.value })}
          />
        </label>
      </div>

      {/* 采集方式专属参数：按能力结构化录入，不再塞进 extra 黑盒 */}
      {a === "采集气体" && (
        <div className="actions">
          <label className="inline-filter">
            <span>采集方式：</span>
            <select
              aria-label="气体采集方式"
              value={c.gasMode ?? "泵吸式"}
              onChange={(e) =>
                updCfg(a, { gasMode: e.target.value as "泵吸式" | "扩散式" })
              }
            >
              <option>泵吸式</option>
              <option>扩散式</option>
            </select>
          </label>
          <label className="inline-filter">
            <span>传感器种类：</span>
            <input
              value={c.sensorKind ?? ""}
              placeholder="如 4 合 1 / 6 合 1 / 具体气体组分"
              onChange={(e) => updCfg(a, { sensorKind: e.target.value })}
            />
          </label>
        </div>
      )}
      {a === "采集红外热像" && (
        <div className="actions">
          <label className="inline-filter">
            <span>发射率：</span>
            <input
              type="number"
              step="0.01"
              min={0}
              max={1}
              aria-label="红外发射率"
              value={c.emissivity ?? ""}
              onChange={(e) =>
                updCfg(a, { emissivity: Number(e.target.value) })
              }
            />
          </label>
          <label className="inline-filter">
            <span>测温距离：</span>
            <input
              type="number"
              aria-label="测温距离"
              value={c.thermalDistance ?? ""}
              onChange={(e) =>
                updCfg(a, { thermalDistance: Number(e.target.value) })
              }
            />
            <span>米</span>
          </label>
        </div>
      )}
      {a === "录制声音" && (
        <div className="actions">
          <label className="inline-filter">
            <span>关注频段：</span>
            <input
              value={c.soundBand ?? ""}
              placeholder="如 20Hz–20kHz"
              onChange={(e) => updCfg(a, { soundBand: e.target.value })}
            />
          </label>
        </div>
      )}
      {a === "分析不安全行为" && (
        <div className="actions">
          <span>行为类别：</span>
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
      )}
    </>
  );
}

/** 操控台：边调边看，自动记录当前动作参数 */
function ControlCockpit({
  draft,
  recordingAction,
  onRecordingActionChange,
  cfgOf,
  updCfg,
}: {
  draft: InspectSpec;
  recordingAction: AtomicAction | "";
  onRecordingActionChange: (a: AtomicAction | "") => void;
  cfgOf: (a: AtomicAction) => AtomicActionConfig;
  updCfg: (a: AtomicAction, patch: Partial<AtomicActionConfig>) => void;
}) {
  const [tab, setTab] = useState<
    "robot" | "gimbal" | "status" | "lens" | "aux"
  >("gimbal");

  const a = (recordingAction || draft.actions[0]) as AtomicAction;
  const c = cfgOf(a);
  const ptz = c.ptz || draft.pose.ptz;

  const setPtz = (patch: Partial<PTZ>) =>
    updCfg(a, { ptz: { ...ptz, ...patch }, source: "cockpit" });
  const setExtra = (
    patch: Record<string, string | number | boolean>,
  ) => {
    const extra = { ...(c.extra || {}), ...patch };
    updCfg(a, { extra, source: "cockpit" });
  };
  const extraNum = (key: string, def = 0) => Number(c.extra?.[key] ?? def);
  const extraBool = (key: string) => Boolean(c.extra?.[key]);

  const tabs = [
    { k: "robot", label: "机器人移动", icon: Move },
    { k: "gimbal", label: "云台控制", icon: Crosshair },
    { k: "status", label: "云台状态", icon: ScanEye },
    { k: "lens", label: "镜头控制", icon: Focus },
    { k: "aux", label: "辅助功能", icon: Settings2 },
  ] as const;

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

      <div className="cockpit-recorder">
        <label>
          正在记录参数的动作：
          <select
            value={a}
            onChange={(e) =>
              onRecordingActionChange(e.target.value as AtomicAction)
            }
          >
            {draft.actions.map((x) => (
              <option key={x} value={x}>
                {x}（{atomicActionCapability[x]}）
              </option>
            ))}
          </select>
        </label>
        <Badge>{atomicActionCapability[a]}</Badge>
        <small className="muted">操作下方控件即自动记录到该动作参数</small>
      </div>

      <div className="cockpit-tabs">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.k}
              className={tab === t.k ? "active" : ""}
              onClick={() => setTab(t.k)}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="cockpit-body">
        {tab === "robot" && (
          <div className="cockpit-grid two-col">
            <div className="cockpit-section">
              <b>移动速度</b>
              <label className="inline-filter">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={extraNum("moveSpeed", 30)}
                  onChange={(e) =>
                    setExtra({ moveSpeed: Number(e.target.value) })
                  }
                />
                <span>{extraNum("moveSpeed", 30)}%</span>
              </label>
              <div className="dpad">
                <button onClick={() => setExtra({ moveY: -1 })}>前</button>
                <div className="dpad-mid">
                  <button onClick={() => setExtra({ moveX: -1 })}>左</button>
                  <button onClick={() => setExtra({ moveX: 1 })}>右</button>
                </div>
                <button onClick={() => setExtra({ moveY: 1 })}>后</button>
              </div>
            </div>
            <div className="cockpit-section">
              <b>安全控制</b>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={extraBool("emergencyStop")}
                  onChange={(e) =>
                    setExtra({ emergencyStop: e.target.checked })
                  }
                />
                <span>急停</span>
              </label>
            </div>
          </div>
        )}

        {tab === "gimbal" && (
          <div className="cockpit-grid two-col">
            <div className="cockpit-section">
              <b>速度 / 高度</b>
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
              <label className="inline-filter">
                <span>升降高度</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={c.lift ?? 0}
                  onChange={(e) =>
                    updCfg(a, { lift: Number(e.target.value), source: "cockpit" })
                  }
                />
              </label>
              <div className="dpad small">
                <button onClick={() => setPtz({ tilt: ptz.tilt + 1 })}>上</button>
                <div className="dpad-mid">
                  <button onClick={() => setPtz({ pan: ptz.pan - 1 })}>左</button>
                  <button onClick={() => setPtz({ pan: ptz.pan + 1 })}>右</button>
                </div>
                <button onClick={() => setPtz({ tilt: ptz.tilt - 1 })}>下</button>
              </div>
            </div>
            <div className="cockpit-section">
              <b>角度 / 预置位</b>
              <label className="inline-filter">
                <span>水平角度</span>
                <input
                  type="number"
                  min={-180}
                  max={180}
                  value={ptz.pan}
                  onChange={(e) =>
                    setPtz({ pan: Number(e.target.value) })
                  }
                />
              </label>
              <label className="inline-filter">
                <span>垂直角度</span>
                <input
                  type="number"
                  min={-90}
                  max={90}
                  value={ptz.tilt}
                  onChange={(e) =>
                    setPtz({ tilt: Number(e.target.value) })
                  }
                />
              </label>
              <label className="inline-filter">
                <span>预置位</span>
                <input
                  value={c.preset ?? ""}
                  placeholder="例如 P-03"
                  onChange={(e) =>
                    updCfg(a, { preset: e.target.value, source: "cockpit" })
                  }
                />
              </label>
              <div className="actions">
                <Btn onClick={() => setExtra({ presetSaved: true })}>添加</Btn>
                <Btn onClick={() => setExtra({ presetRecalled: true })}>召回</Btn>
                <Btn onClick={() => updCfg(a, { preset: "" })}>删除</Btn>
              </div>
            </div>
          </div>
        )}

        {tab === "status" && (
          <div className="cockpit-grid four-col">
            <div className="status-tile">
              <span>水平角度</span>
              <strong>{ptz.pan}°</strong>
            </div>
            <div className="status-tile">
              <span>垂直角度</span>
              <strong>{ptz.tilt}°</strong>
            </div>
            <div className="status-tile">
              <span>变焦</span>
              <strong>{ptz.zoom}</strong>
            </div>
            <div className="status-tile">
              <span>升降高度</span>
              <strong>{c.lift ?? 0}</strong>
            </div>
            <div className="status-tile">
              <span>预置位</span>
              <strong>{c.preset || "—"}</strong>
            </div>
            <div className="status-tile">
              <span>补光</span>
              <strong>{c.light ?? 0}%</strong>
            </div>
          </div>
        )}

        {tab === "lens" && (
          <div className="cockpit-grid two-col">
            <div className="cockpit-section">
              <b>镜头调节</b>
              <label className="inline-filter">
                <span>镜头变倍</span>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={ptz.zoom}
                  onChange={(e) => setPtz({ zoom: Number(e.target.value) })}
                />
                <span>{ptz.zoom}</span>
              </label>
              <label className="inline-filter">
                <span>镜头聚焦</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={extraNum("focus", 50)}
                  onChange={(e) => setExtra({ focus: Number(e.target.value) })}
                />
                <span>{extraNum("focus", 50)}</span>
              </label>
              <label className="inline-filter">
                <span>光圈控制</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={extraNum("iris", 50)}
                  onChange={(e) => setExtra({ iris: Number(e.target.value) })}
                />
                <span>{extraNum("iris", 50)}</span>
              </label>
            </div>
            <div className="cockpit-section">
              <b>聚焦模式</b>
              <div className="actions">
                {(["自动", "手动", "半自动"] as const).map((m) => (
                  <label key={m} className="inline-filter">
                    <input
                      type="radio"
                      name="focus-mode"
                      checked={(c.extra?.focusMode as string) === m}
                      onChange={() => setExtra({ focusMode: m })}
                    />
                    <span>{m}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "aux" && (
          <div className="cockpit-grid">
            <div className="cockpit-section">
              <b>辅助开关</b>
              <div className="aux-grid">
                <AuxToggle
                  icon={Lightbulb}
                  label="补光灯"
                  checked={(c.light ?? 0) > 0}
                  onChange={(on) =>
                    updCfg(a, { light: on ? 60 : 0, source: "cockpit" })
                  }
                />
                <AuxToggle
                  icon={Bell}
                  label="报警灯"
                  checked={extraBool("alarmLight")}
                  onChange={(on) => setExtra({ alarmLight: on })}
                />
                <AuxToggle
                  icon={CloudRain}
                  label="雨刷"
                  checked={extraBool("wiper")}
                  onChange={(on) => setExtra({ wiper: on })}
                />
                <AuxToggle
                  icon={Snowflake}
                  label="防冻"
                  checked={extraBool("antiFreeze")}
                  onChange={(on) => setExtra({ antiFreeze: on })}
                />
                <AuxToggle
                  icon={CloudFog}
                  label="透雾"
                  checked={extraBool("defog")}
                  onChange={(on) => setExtra({ defog: on })}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 辅助功能开关 */
function AuxToggle({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: typeof Lightbulb;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="aux-toggle">
      <Icon size={16} />
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
