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
import { go, usePageSize, useViewState } from "../data/navigation";
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
import {
  Badge,
  Btn,
  Confirm,
  Field,
  Note,
  Panel,
  Switch,
  Table,
} from "../components/UI";
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
/** 机器人预警各分类的适用故障：分类名称本身看不出范围，列表里补一列 */
const ROBOT_CLASS_HINT: Record<string, string> = {
  下装: "底盘 · 行走 · 定位 · 通信 · 电池",
  上装: "采集载荷 · 传感器",
  识别故障: "照片模糊 · 算法调用失败 · 传感器无数据",
};
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
   * @description 业务预警 = 台账 × 告警项；机器人预警没有业务台账，
   *              按「告警类别」里的机器人分类（下装 / 上装）逐项维护
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
  /** 筛选面板展开态：条件默认收起，点「筛选」才显示 */
  const [filterOpen, SETFILTEROPEN] = useState(false);
  const [pn, PN] = useViewState("alarmSettings.page", 1);
  /** 启停二次确认：业务预警（台账级）/ 机器人预警（分类级）共用一个确认弹窗 */
  const [toggleAsk, ASKTOGGLE] = useState<null | {
    title: string;
    message: string;
    ok: string;
    run: () => void;
  }>(null);
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

  /** 机器人预警：筛选（分类名称 / 状态）+ 分页，与业务预警各用一套视图状态 */
  const [rkw, RKW] = useViewState("alarmSettings.robot.kw", "");
  const [rstate, RSTATE] = useViewState("alarmSettings.robot.state", "全部");
  const [rFilterOpen, SETRFILTEROPEN] = useState(false);
  const [rDraft, SETRDRAFT] = useState<Record<string, string>>({
    kw: rkw,
    state: rstate,
  });
  const [rPn, RPN] = useViewState("alarmSettings.robot.page", 1);
  const [rSize, SETRSIZE] = usePageSize("alarmSettings.robot.size");
  const robotRows = (s.alarmClasses || [])
    .filter((c) => c.main === "机器人预警")
    .filter(
      (c) =>
        (rstate === "全部" ||
          (rstate === "启用" ? c.enabled : !c.enabled)) &&
        (!rkw.trim() || c.name.includes(rkw.trim())),
    );
  const rPages = Math.max(1, Math.ceil(robotRows.length / rSize));
  const rCur = Math.min(Math.max(1, rPn), rPages);
  const rPageRows = robotRows.slice((rCur - 1) * rSize, rCur * rSize);

  return (
    <Panel
      title="告警设置"
      extra={
        <div className="actions">
          <Btn
            onClick={() =>
              isRobot ? SETRFILTEROPEN(!rFilterOpen) : SETFILTEROPEN(!filterOpen)
            }
          >
            {(isRobot ? rFilterOpen : filterOpen) ? "收起筛选" : "筛选"}
          </Btn>
          {isRobot ? (
            <Btn primary onClick={() => go("alarm-robot-edit", "new")}>
              ＋ 新增
            </Btn>
          ) : (
            <Btn
              primary
              disabled={!targets.length}
              onClick={() => go("alarm-setting-edit", "new")}
            >
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
      {/* 机器人预警筛选：分类名称 / 状态 */}
      {isRobot && rFilterOpen && (
        <FilterPanel
          fields={[
            { key: "kw", label: "分类名称", placeholder: "输入分类名称" },
            { key: "state", label: "状态", options: ["全部", "启用", "停用"] },
          ]}
          value={rDraft}
          onChange={(n) => SETRDRAFT((p) => ({ ...p, ...n }))}
          onSearch={() => {
            RKW(rDraft.kw ?? "");
            RSTATE(rDraft.state ?? "全部");
            SETRFILTEROPEN(false);
          }}
          onReset={() => {
            SETRDRAFT({ kw: "", state: "全部" });
            RKW("");
            RSTATE("全部");
          }}
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
        <Table
          heads={["编号", "告警分类", "适用故障", "告警记录", "状态", "操作"]}
          rows={rPageRows.map((c) => [
            <span className="cell-muted">{c.id}</span>,
            <Badge>{c.name}</Badge>,
            <span className="muted">
              {c.hint || ROBOT_CLASS_HINT[c.name] || "—"}
            </span>,
            `${
              s.alarms.filter(
                (a) => a.category === "机器人" && a.alarmClass === c.name,
              ).length
            } 条`,
            // 状态 = 开关：点一下先二次确认，停用后该分类从告警设置 / 告警记录筛选里消失
            <Switch
              checked={c.enabled}
              label={`${c.name} 启用状态`}
              onChange={() =>
                ASKTOGGLE({
                  title: c.enabled ? "停用告警分类" : "启用告警分类",
                  message: c.enabled
                    ? `停用「${c.name}」后，该分类不再出现在告警设置的可选类型与告警记录筛选项里；已产生的告警记录照常保留。`
                    : `启用后「${c.name}」重新出现在告警设置的可选类型与告警记录筛选项里。`,
                  ok: c.enabled ? "停用" : "启用",
                  run: () =>
                    act({
                      type: "SAVE_ALARM_CLASS",
                      category: { ...c, enabled: !c.enabled },
                    }),
                })
              }
            />,
            <Btn onClick={() => go("alarm-robot-edit", c.id)}>配置</Btn>,
          ])}
        />
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
          <Switch
            checked={set.enabled}
            label={`${targetNameOf(s, t)} 告警规则启停`}
            onChange={() =>
              ASKTOGGLE({
                title: set.enabled ? "停用告警规则" : "启用告警规则",
                message: set.enabled
                  ? `停用「${targetNameOf(s, t)}」的告警规则后，该台账仍照常采集结果，但不再判定异常、不触发告警。`
                  : `启用后「${targetNameOf(s, t)}」恢复异常判定与告警触发。`,
                ok: set.enabled ? "停用" : "启用",
                run: () =>
                  act({
                    type: "SAVE_ALARM_SETTING",
                    targetId: t.id,
                    setting: { ...set, enabled: !set.enabled },
                  }),
              })
            }
          />,
          <Btn onClick={() => go("alarm-setting-edit", t.id)}>配置</Btn>,
        ])}
      />
      )}
      <Pager
        page={isRobot ? rCur : cur}
        count={isRobot ? robotRows.length : rows.length}
        size={isRobot ? rSize : pageSize}
        onChange={isRobot ? RPN : PN}
        onSize={(n) => {
          if (isRobot) {
            SETRSIZE(n);
            RPN(1);
          } else {
            SETPAGESIZE(n);
            PN(1);
          }
        }}
      />
      {/* 启停二次确认：业务预警 / 机器人预警两处开关共用 */}
      {toggleAsk && (
        <Confirm
          title={toggleAsk.title}
          message={toggleAsk.message}
          confirmText={toggleAsk.ok}
          danger={toggleAsk.ok === "停用"}
          onClose={() => ASKTOGGLE(null)}
          onConfirm={() => {
            toggleAsk.run();
            ASKTOGGLE(null);
          }}
        />
      )}
    </Panel>
  );
}

/**
 * 添加 / 编辑告警配置（内置页）
 * @description 原为弹窗：台账 + 告警项清单（含多级表单）装不下，改为整页；
 *              业务预警绑台账并可配阈值，机器人预警只维护分类与告警项
 * @param id 路由参数："new" / 缺省 = 新建，否则为被配置的台账 id
 */
export function AlarmSettingEdit({ id }: { id?: string }) {
  const { s, act } = useStore();
  const targets = s.businessTargets || [];
  const classes = enabledAlarmClassesOf(s);
  /** 新建模式：可切换关联台账；编辑模式台账只读 */
  const creating = !id || id === "new";
  const [draft, E] = useState<Draft | null>(() => {
    const t = creating
      ? targets[0]
      : targets.find((x) => x.id === id) || targets[0];
    if (!t) return null;
    const set = settingOf(s, t);
    return {
      targetId: t.id,
      // 本页只服务业务预警：机器人预警在「告警分类」页维护，不绑台账
      main: "业务预警",
      enabled: set.enabled,
      items: set.items.map((x) => ({ ...x })),
    };
  });
  const current = targets.find((x) => x.id === draft?.targetId);
  /** 切换关联台账：草稿整体换成该台账的现有配置 */
  const load = (t: BusinessTarget) => {
    const set = settingOf(s, t);
    E({
      targetId: t.id,
      main: "业务预警",
      enabled: set.enabled,
      items: set.items.map((x) => ({ ...x })),
    });
  };
  /**
   * 新建一条告警项的默认值
   * @description 分类按台账目标类型带出，异常名称按台账名预填（不留空）
   */
  const makeItem = () =>
    newAlarmItem(
      current ? itemKindOfTarget(current) : "普通预警",
      "二级",
      current ? `${targetNameOf(s, current)} · 异常` : "",
    );
  /** 保存告警项：第一条（主项）即台账判定口径 */
  const saveItem = (index: number | null, item: AlarmItem) =>
    draft && E({ ...draft, items: upsertAlarmItem(draft.items, index, item) });
  const removeItem = (i: number) =>
    draft && E({ ...draft, items: draft.items.filter((_, j) => j !== i) });
  const back = () => go("alarm-settings");
  /** 保存：校验与落库都在引擎里做（失败时以提示条回报原因） */
  const save = () => {
    if (!draft) return;
    if (
      act({ type: "SAVE_ALARM_SETTING", targetId: draft.targetId, setting: draft })
    )
      back();
  };

  return (
    <Panel
      title={creating ? "添加告警配置" : "编辑告警配置"}
      extra={
        <div className="actions">
          <Btn onClick={back}>取消</Btn>
          <Btn primary disabled={!draft} onClick={save}>
            保存
          </Btn>
        </div>
      }
    >
      {!draft ? (
        <Note>没有可配置的台账，请先在「巡检目标台账」创建台账。</Note>
      ) : (
        <>
          <div className="form-grid">
            {/* 告警大类：本页只维护业务预警，机器人预警在「告警分类」页维护 */}
            <Field label="告警大类">
              <input value="业务预警" readOnly />
            </Field>
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
              alarmClasses={classes}
              makeItem={makeItem}
              onSave={saveItem}
              onRemove={removeItem}
              main={draft.main}
            />
          </div>
        </>
      )}
    </Panel>
  );
}

/**
 * 机器人预警告警配置（内置页）
 * @description 机器人预警不绑业务台账，配置对象是「告警类别」里的机器人分类：
 *              新增分类 / 改分类名称 / 启停；保存走 SAVE_ALARM_CLASS
 * @param id 路由参数："new" / 缺省 = 新增，否则为被配置的分类 id
 */
export function AlarmRobotEdit({ id }: { id?: string }) {
  const { s, act } = useStore();
  const creating = !id || id === "new";
  const found = (s.alarmClasses || []).find((c) => c.id === id);
  const [name, SETNAME] = useState(found?.name || "");
  const [enabled, SETENABLED] = useState(found?.enabled !== false);
  /** 适用故障：可自行维护，缺省带上该分类的预置说明 */
  const [hint, SETHINT] = useState(
    found?.hint || ROBOT_CLASS_HINT[found?.name || ""] || "",
  );
  const back = () => go("alarm-settings");
  /** 保存：空名 / 重名由引擎校验，失败时以提示条回报原因 */
  const save = () => {
    if (
      act({
        type: "SAVE_ALARM_CLASS",
        category: {
          id: creating ? "" : id!,
          name: name.trim(),
          main: "机器人预警",
          enabled,
          hint: hint.trim(),
        },
      })
    )
      back();
  };

  return (
    <Panel
      title={creating ? "新增机器人预警告警配置" : "编辑机器人预警告警配置"}
      extra={
        <div className="actions">
          <Btn onClick={back}>取消</Btn>
          <Btn primary disabled={!name.trim()} onClick={save}>
            保存
          </Btn>
        </div>
      }
    >
      <div className="form-grid">
        <Field label="告警大类">
          <input value="机器人预警" readOnly />
        </Field>
        <Field label="分类名称" required>
          <input
            value={name}
            placeholder="例如 通信故障"
            onChange={(e) => SETNAME(e.target.value)}
          />
        </Field>
        <Field label="状态">
          <select
            value={enabled ? "启用" : "停用"}
            onChange={(e) => SETENABLED(e.target.value === "启用")}
          >
            <option>启用</option>
            <option>停用</option>
          </select>
        </Field>
        <Field label="适用故障">
          <input
            value={hint}
            placeholder="例如 底盘 · 行走 · 定位 · 通信 · 电池"
            onChange={(e) => SETHINT(e.target.value)}
          />
        </Field>
      </div>
    </Panel>
  );
}
