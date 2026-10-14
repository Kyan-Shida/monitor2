/**
 * @file AlarmSettings.tsx
 * @description 告警管理 › 告警设置：**一个台账只有一个告警设置，但可以有多个告警项**。
 *              定位：① 决定该台账的告警规则是否启用（状态开关，接入 alarmRules.rulesOf）；
 *                   ② 添加 / 维护告警项（「+ 告警等级配置」），字段与台账「3、告警规则」一致；
 *                   ③ 与巡检目标台账**同一份数据**（`BusinessTarget.alarm`），改任一处另一处同步。
 * @interaction data/alarmSettings.ts（读口径 / 主项同步）、engine.ts（SAVE_ALARM_SETTING）、
 *              pages/BusinessTargets.tsx（台账侧同一份数据）
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { useViewState } from "../data/navigation";
import {
  enabledAlarmClassesOf,
  itemFromTemplate,
  itemKindOfTarget,
  newAlarmItem,
  settingOf,
  targetNameOf,
} from "../data/alarmSettings";
import { templatesOf } from "../data/alarmTemplates";
import type { AlarmItem, BusinessTarget } from "../data/types";
import { AlarmItemAddBar, AlarmItemTable } from "../components/AlarmItemTable";
import { Btn, Panel, Table, Field, Badge, Modal } from "../components/UI";

/**
 * 弹窗里的告警设置草稿（与台账 alarm 字段一一对应）
 * @description 不含告警名称：名称统一由台账名称派生（alarmSettings.targetNameOf）
 */
interface Draft {
  targetId: string;
  category: string;
  enabled: boolean;
  items: AlarmItem[];
}
/** 告警项的判定口径摘要：列表里一眼看清主项在判什么 */
const itemText = (x: AlarmItem) =>
  x.judge === "数值范围"
    ? `${x.from ?? 0}–${x.to ?? 0} ${x.unit || ""}`.trim()
    : `期望 ${x.value || "—"}`;

export function AlarmSettings() {
  const { s, act } = useStore();
  /** 可选告警类型：只列「告警类别」里启用中的分类 */
  const classes = enabledAlarmClassesOf(s);
  const targets = s.businessTargets || [];
  const [kw, KW] = useViewState("alarmSettings.kw", "");
  const [classF, CF] = useViewState("alarmSettings.class", "全部");
  const [stateF, SF] = useViewState("alarmSettings.state", "全部");
  const [draft, E] = useState<Draft | null>(null);
  /** 新增模式：弹窗内可切换关联台账；编辑模式台账只读 */
  const [creating, CREATING] = useState(false);

  const rows = targets
    .map((t) => ({ t, set: settingOf(s, t) }))
    .filter(
      ({ t, set }) =>
        (classF === "全部" || set.category === classF) &&
        (stateF === "全部" || (stateF === "启用" ? set.enabled : !set.enabled)) &&
        (!kw.trim() ||
          [targetNameOf(s, t), t.id].join(" ").includes(kw.trim())),
    );

  /** 载入某台账的告警设置到弹窗草稿（新增 / 切换台账时复用） */
  function load(t: BusinessTarget) {
    const set = settingOf(s, t);
    E({
      targetId: t.id,
      category: set.category,
      enabled: set.enabled,
      items: set.items.map((x) => ({ ...x })),
    });
  }
  function openCreate() {
    const t = targets[0];
    if (!t) return;
    CREATING(true);
    load(t);
  }
  function openEdit(t: BusinessTarget) {
    CREATING(false);
    load(t);
  }
  const patchItem = (i: number, patch: Partial<AlarmItem>) =>
    draft &&
    E({
      ...draft,
      items: draft.items.map((x, j) => (j === i ? { ...x, ...patch } : x)),
    });
  /**
   * 某一条改选告警模板：选中即带出「判断类型 + 阈值 + 单位 + 等级 + 声光报警」，仍可手改；
   * 选「手填」（空串）= 只清模板引用，已带出的值保留
   */
  const pickTemplate = (i: number, templateId: string) => {
    const base = draft?.items[i];
    if (!base) return;
    const tpl = tplOptions.find((t) => t.id === templateId);
    patchItem(i, tpl ? itemFromTemplate(base, tpl) : { templateId: undefined });
  };
  /**
   * 追加一条告警项：分类按台账目标类型带出，异常名称按台账名预填（不留空）
   * @param templateId 传模板 id 时按模板带出内容字段（判断类型 / 阈值 / 单位 / 等级 / 声光报警）
   */
  const addItem = (templateId?: string) => {
    if (!draft || !current) return;
    const tpl = templateId
      ? tplOptions.find((t) => t.id === templateId)
      : undefined;
    const base = newAlarmItem(
      itemKindOfTarget(current),
      "二级",
      `${targetNameOf(s, current)} · 异常`,
    );
    E({
      ...draft,
      items: [...draft.items, tpl ? itemFromTemplate(base, tpl) : base],
    });
  };
  const removeItem = (i: number) =>
    draft && E({ ...draft, items: draft.items.filter((_, j) => j !== i) });
  /** 保存：校验与落库都在引擎里做（失败时以提示条回报原因） */
  const save = () => {
    if (!draft) return;
    if (
      act({ type: "SAVE_ALARM_SETTING", targetId: draft.targetId, setting: draft })
    )
      E(null);
  };
  const current = targets.find((x) => x.id === draft?.targetId);
  /** 可引用的告警模板（启用中的）：告警项可按模板带出字段，也可手填 */
  const tplOptions = templatesOf(s).filter((t) => t.enabled);

  return (
    <Panel
      title="告警设置"
      extra={
        <Btn primary disabled={!targets.length} onClick={openCreate}>
          + 添加告警配置
        </Btn>
      }
    >
      <div className="filter-bar">
        <Field label="关键词（台账名称）">
          <input
            value={kw}
            onChange={(e) => KW(e.target.value)}
            placeholder="输入台账名称"
          />
        </Field>
        <Field label="告警类型">
          <select value={classF} onChange={(e) => CF(e.target.value)}>
            {["全部", ...classes.map((c) => c.name)].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="状态">
          <select value={stateF} onChange={(e) => SF(e.target.value)}>
            {["全部", "启用", "停用"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Btn
          onClick={() => {
            KW("");
            CF("全部");
            SF("全部");
          }}
        >
          重置筛选
        </Btn>
      </div>
      <Table
        heads={["告警类型", "关联台账", "告警项", "状态", "操作"]}
        rows={rows.map(({ t, set }) => [
          <Badge>{set.category}</Badge>,
          <>
            {targetNameOf(s, t)}
            <small>{t.id}</small>
          </>,
          <>
            {set.items.length} 条
            <small>主项 {itemText(set.items[0])}</small>
          </>,
          // 状态开关：决定该台账的告警规则是否启用（停用后只记录结果、不判定）
          <button
            type="button"
            role="switch"
            aria-checked={set.enabled}
            className={"switch-btn" + (set.enabled ? " on" : "")}
            onClick={() =>
              act({
                type: "SAVE_ALARM_SETTING",
                targetId: t.id,
                setting: { ...set, enabled: !set.enabled },
              })
            }
          >
            {set.enabled ? "启用" : "停用"}
          </button>,
          <Btn onClick={() => openEdit(t)}>配置</Btn>,
        ])}
      />
      {draft && (
        <Modal
          wide
          title={creating ? "添加告警配置" : "编辑告警配置"}
          onClose={() => E(null)}
          footer={
            <div className="actions">
              <Btn primary onClick={save}>
                保存
              </Btn>
              <Btn onClick={() => E(null)}>关闭</Btn>
            </div>
          }
        >
          <div className="form-grid">
            <Field label="告警类型">
              <select
                value={draft.category}
                onChange={(e) => E({ ...draft, category: e.target.value })}
              >
                <option value="">请选择告警类型</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                {/* 台账已引用的分类被停用后仍要能回显，避免打开即丢值 */}
                {!classes.some((c) => c.name === draft.category) &&
                  draft.category && <option value={draft.category}>{draft.category}</option>}
              </select>
            </Field>
            <Field label="关联台账">
              {creating ? (
                <select
                  value={draft.targetId}
                  onChange={(e) => {
                    const t = targets.find((x) => x.id === e.target.value);
                    if (t) load(t);
                  }}
                >
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {targetNameOf(s, t)}（{t.id}）
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  readOnly
                  value={
                    current
                      ? `${targetNameOf(s, current)}（${current.id}）`
                      : draft.targetId
                  }
                />
              )}
            </Field>
            <Field label="状态">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => E({ ...draft, enabled: e.target.checked })}
              />
            </Field>
          </div>
          <div className="task-toolbar" style={{ marginTop: 12 }}>
            <AlarmItemAddBar
              templates={tplOptions}
              onAddManual={() => addItem()}
              onAddFromTemplate={(tid) => addItem(tid)}
            />
            <span className="muted">共 {draft.items.length} 条告警项</span>
          </div>
          {/* 告警项表格：一行一条，每条可选模板（一键带出内容字段）或直接手填；第一条 = 台账判定口径 */}
          <AlarmItemTable
            items={draft.items}
            templates={tplOptions}
            onChange={patchItem}
            onPickTemplate={pickTemplate}
            onRemove={removeItem}
          />
        </Modal>
      )}
    </Panel>
  );
}
