/**
 * @file AlarmSettings.tsx
 * @description 告警管理 › 告警设置：**一个台账只有一个告警设置，但可以有多个告警项**。
 *              定位：① 决定该台账的告警规则是否启用（状态开关，接入 alarmRules.rulesOf）；
 *                   ② 添加 / 维护告警项（「+ 告警等级配置」），**告警分类 / 触发逻辑都按告警项单独配**，
 *                      列表里的台账级分类取主项（第一条）；
 *                   ③ 与巡检目标台账**同一份数据**（`BusinessTarget.alarm`），改任一处另一处同步。
 * @interaction data/alarmSettings.ts（读口径 / 主项同步）、engine.ts（SAVE_ALARM_SETTING）、
 *              pages/BusinessTargets.tsx（台账侧同一份数据）
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { usePageSize, useViewState } from "../data/navigation";
import {
  enabledAlarmClassesOf,
  itemKindOfTarget,
  newAlarmItem,
  settingOf,
  targetNameOf,
  upsertAlarmItem,
} from "../data/alarmSettings";
import type { AlarmItem, BusinessTarget } from "../data/types";
import { ALARM_CLASS_MAINS, type AlarmClassMain } from "../data/types";
import { AlarmItems } from "../components/AlarmItems";
import { Btn, Panel, Table, Field, Badge, Empty, Modal, Note } from "../components/UI";
import { FilterPanel } from "../components/FilterPanel";
import { Pager } from "../components/Business";

/**
 * 弹窗里的告警设置草稿
 * @description 不含告警名称（统一由台账名称派生，见 alarmSettings.targetNameOf）；
 *              也不含告警分类（已下沉到告警项单独配，台账级分类由主项派生）
 */
interface Draft {
  targetId: string;
  /** 告警大类：业务预警才绑台账；机器人预警不绑（表单里不出现「关联台账」） */
  main: AlarmClassMain;
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
  /** 可选告警分类（列表筛选 + 告警项下拉共用）：只列「告警类别」里启用中的分类 */
  const classes = enabledAlarmClassesOf(s);
  const targets = s.businessTargets || [];
  const [kw, KW] = useViewState("alarmSettings.kw", "");
  const [classF, CF] = useViewState("alarmSettings.class", "全部");
  const [stateF, SF] = useViewState("alarmSettings.state", "全部");
  /**
   * 标签页口径（业务预警 / 机器人预警）
   * @description 业务预警 = 台账 × 告警项（本页现有内容）；机器人预警 = 机器人本体事件
   *（下装 / 上装），其告警设置口径尚未定稿，先给空态说明，不新增第二套配置入口
   */
  const [mainF, MAINF] = useViewState("alarmSettings.main", "业务预警");
  const isRobot = mainF === "机器人预警";
  /** 告警设置筛选：复用全站 FilterPanel（草稿条件，点「查询」才生效） */
  const [filtDraft, SETFILTDRAFT] = useState<Record<string, string>>({
    kw,
    category: classF,
    state: stateF,
  });
  const applyAlarmFilter = () => {
    KW(filtDraft.kw ?? "");
    CF(filtDraft.category ?? "全部");
    SF(filtDraft.state ?? "全部");
  };
  const resetAlarmFilter = () => {
    SETFILTDRAFT({ kw: "", category: "全部", state: "全部" });
    KW("");
    CF("全部");
    SF("全部");
  };
  const [draft, E] = useState<Draft | null>(null);
  /** 新增模式：弹窗内可切换关联台账；编辑模式台账只读 */
  const [creating, CREATING] = useState(false);
  /** 筛选面板展开态：条件默认收起，点「筛选」才显示 */
  const [filterOpen, SETFILTEROPEN] = useState(false);
  const [pn, PN] = useViewState("alarmSettings.page", 1);
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [pageSize, SETPAGESIZE] = usePageSize("alarmSettings.size");

  const rows = targets
    .map((t) => ({ t, set: settingOf(s, t) }))
    .filter(
      ({ t, set }) =>
        (classF === "全部" || set.category === classF) &&
        (stateF === "全部" || (stateF === "启用" ? set.enabled : !set.enabled)) &&
        (!kw.trim() ||
          [targetNameOf(s, t), t.id].join(" ").includes(kw.trim())),
    );

  // 分页切片：筛选后页数可能变少，当前页一律 clamp 到有效范围
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(Math.max(1, pn), pages);
  const pageRows = rows.slice((cur - 1) * pageSize, cur * pageSize);

  /** 载入某台账的告警设置到弹窗草稿（新增 / 切换台账时复用） */
  function load(t: BusinessTarget) {
    const set = settingOf(s, t);
    E({
      targetId: t.id,
      main: set.main || "业务预警",
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
  /**
   * 新建一条告警项的默认值（弹窗打开时的初值）
   * @description 分类按台账目标类型带出，异常名称按台账名预填（不留空）
   */
  const makeItem = () =>
    newAlarmItem(
      current ? itemKindOfTarget(current) : "普通预警",
      "二级",
      current ? `${targetNameOf(s, current)} · 异常` : "",
    );
  /** 弹窗保存告警项：第一条（主项）即台账判定口径 */
  const saveItem = (index: number | null, item: AlarmItem) =>
    draft && E({ ...draft, items: upsertAlarmItem(draft.items, index, item) });
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

  return (
    <Panel
      title="告警设置"
      extra={
        <div className="actions">
          <Btn onClick={() => SETFILTEROPEN(!filterOpen)}>
            {filterOpen ? "收起筛选" : "筛选"}
          </Btn>
          {/* 机器人预警暂无配置实体，隐藏「+ 添加告警配置」避免给出无效入口 */}
          {!isRobot && (
            <Btn primary disabled={!targets.length} onClick={openCreate}>
              + 添加告警配置
            </Btn>
          )}
        </div>
      }
    >
      {/* 筛选条只服务于业务预警列表；条件默认收起，点「筛选」才展开 */}
      {!isRobot && filterOpen && (
        <FilterPanel
          fields={[
            { key: "kw", label: "关键词（台账名称）", placeholder: "输入台账名称" },
            { key: "category", label: "告警分类", options: ["全部", ...classes.map((c) => c.name)] },
            { key: "state", label: "状态", options: ["全部", "启用", "停用"] },
          ]}
          value={filtDraft}
          onChange={(n) => SETFILTDRAFT((p) => ({ ...p, ...n }))}
          onSearch={applyAlarmFilter}
          onReset={resetAlarmFilter}
        />
      )}
      {/* 标签页：业务预警 / 机器人预警（与「告警记录」同一组口径） */}
      <div className="segmented" style={{ marginBottom: 12 }}>
        {ALARM_CLASS_MAINS.map((m) => (
          <button
            key={m}
            className={mainF === m ? "active" : ""}
            onClick={() => MAINF(m)}
          >
            {m}
          </button>
        ))}
      </div>
      {isRobot ? (
        <>
          <Empty>机器人预警暂无告警配置</Empty>
          <Note>
            <b>待确认（ALM-06）</b>：机器人预警（下装 / 上装）的告警设置口径尚未定稿——
            机器人本体事件没有业务台账与巡检点位，其告警项、阈值与启用开关的落点
            待产品 + 算法方拍板；当前机器人本体告警仅在「告警记录 › 机器人预警」可查。
          </Note>
        </>
      ) : (
      <Table
        heads={["编号", "告警分类", "关联台账", "告警项", "状态", "操作"]}
        rows={pageRows.map(({ t, set }) => [
          <span className="cell-muted">{t.id}</span>,
          <Badge>{set.category}</Badge>,
          <>
            {targetNameOf(s, t)}
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
      )}
      {!isRobot && (
        <Pager
          page={cur}
          count={rows.length}
          size={pageSize}
          onChange={PN}
          onSize={(n) => {
            SETPAGESIZE(n);
            PN(1);
          }}
        />
      )}
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
            <Field label="告警大类" required>
              <select
                value={draft.main}
                onChange={(e) =>
                  E({ ...draft, main: e.target.value as AlarmClassMain })
                }
              >
                {ALARM_CLASS_MAINS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            {/* 关联台账：只有业务预警才绑台账，机器人预警不显示该字段 */}
            {draft.main === "业务预警" && (
              <Field label="关联台账" required>
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
            )}
            <Field label="状态">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => E({ ...draft, enabled: e.target.checked })}
              />
            </Field>
          </div>
          {/* 告警项清单：列表只做展示与删除，参数填写走弹窗；第一条 = 台账判定口径 */}
          <div style={{ marginTop: 12 }}>
            <AlarmItems
              items={draft.items}
              alarmClasses={classes.map((c) => c.name)}
              makeItem={makeItem}
              onSave={saveItem}
              onRemove={removeItem}
            />
          </div>
        </Modal>
      )}
    </Panel>
  );
}
