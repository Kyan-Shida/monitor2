import { useState } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { Btn, Badge, Panel, Field, Table, Note, Modal } from "../components/UI";
import { Pager } from "../components/Business";
import { QuickTaskDrawer } from "../components/QuickTaskDrawer";
import { PlanRobotBinding } from "../components/PlanRobotBinding";
import { TaskDetailPanel } from "../components/TaskDetailPanel";
import { fmtTime } from "../data/selectors";
import { actionsOfPoint, captureKindsOfPoint } from "../data/deviceMaster";
import type { Task } from "../data/types";
export function Planning({ page, id }: { page: string; id?: string }) {
  const { s, act } = useStore();
  const initial = s.plans.find((p) => p.id === id);
  const [templateId, TI] = useState(initial?.templateId || s.templates[0].id),
    [templateEdit, TE] = useState<string>(),
    [name, N] = useState(initial?.name || ""),
    [selected, SE] = useState<string[]>(s.templates[0].points),
    [priority, PR] = useState("普通"),
    [tstate, TS] = useState<"启用" | "停用">("启用"),
    [tplOpen, setTplOpen] = useState(false),
    [pickQuery, PQ] = useState(""),
    [pickPage, PP] = useState(1),
    [cycle, CY] = useState(initial?.cycle || "每天"),
    [start, ST] = useState(initial?.start || "2026-09-22"),
    [end, EN] = useState(initial?.end || "2026-12-31"),
    [time, TM] = useState(initial?.time || "10:00"),
    [query, Q] = useViewState("planning." + page + ".query", ""),
    [srcFilter, SF] = useViewState<string>("planning.tasks.srcFilter", "全部"),
    [prioFilter, PF] = useViewState<string>(
      "planning.tasks.prioFilter",
      "全部",
    ),
    [statusFilter, STF] = useViewState<string>(
      "planning.tasks.statusFilter",
      "全部",
    ),
    [robotFilter, RF] = useViewState<string>(
      "planning.tasks.robotFilter",
      "全部",
    ),
    [srcPage, SP] = useState(1),
    [quickOpen, setQuickOpen] = useState(false),
    [planOpen, setPlanOpen] = useState(false),
    [planEditingId, setPlanEditingId] = useState<string | undefined>();
  /** 任务列表「详情」抽屉中的任务：就地查看完整详情，不打断列表上下文 */
  const [taskPeek, setTaskPeek] = useState<Task>();
  const [boundRobot, BR] = useState(initial?.robotId || "");
  const [advance, AD] = useState(initial?.advance || 15),
    [timeout, TO] = useState(initial?.timeout || 60),
    [wait, WA] = useState(initial?.wait || 30);
  /** 重置计划表单为默认值（新建时调用） */
  const resetPlanForm = () => {
    N("");
    BR("");
    TI(s.templates[0].id);
    CY("每天");
    TM("10:00");
    ST("2026-09-22");
    EN("2026-12-31");
    AD(15);
    TO(60);
    WA(30);
  };
  /** 加载已有计划到表单（编辑时调用） */
  const loadPlanForm = (pid: string) => {
    const p = s.plans.find((x) => x.id === pid);
    if (!p) return;
    N(p.name);
    BR(p.robotId || "");
    TI(p.templateId);
    CY(p.cycle);
    TM(p.time);
    ST(p.start);
    EN(p.end);
    AD(p.advance);
    TO(p.timeout);
    WA(p.wait);
  };
  const toggle = (id: string) =>
    SE(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  /**
   * 已配置巡检点勾选表（数据源 s.points 来自「巡检点管理」页，平台预先配置好）
   * 模板/临时任务**以巡检点为最小单位**勾选（不选业务目标：业务目标是巡检项内部的事）
   */
  const pickerTable = (
    <Table
      heads={[
        "选择",
        "巡检点",
        "地图 / 地图点位",
        "巡检项",
        "机器操作内容",
        "版本 / 状态",
      ]}
      rows={s.points.map((p) => {
        const m = s.maps.find((x) => x.id === p.mapId);
        const mp = m?.targets.find((t) => t.id === p.targetId);
        const specs = p.inspectItems || [];
        return [
          <input
            type="checkbox"
            checked={selected.includes(p.id)}
            onChange={() => toggle(p.id)}
          />,
          <>
            <b>{p.name}</b>
            <small>
              {p.id} · {p.device}
            </small>
          </>,
          <>
            {m?.name || p.mapId}
            <small>{mp?.externalId ? `定位ID ${mp.externalId}` : "无定位ID"}</small>
          </>,
          <>
            {specs.length} 项
            <small>{specs.map((sp) => sp.name).join(" / ") || p.item}</small>
          </>,
          <>
            {actionsOfPoint(s, p).join(" / ") || "—"}
            <small>{captureKindsOfPoint(s, p).join(" / ")}</small>
          </>,
          <>
            <span>v{p.version} </span>
            <Badge>{p.state}</Badge>
          </>,
        ];
      })}
    />
  );
  if (page === "quick")
    return (
      <QuickTaskDrawer
        onClose={() => go("tasks")}
        onCreated={(id) => go("dispatch", id)}
      />
    );
  if (page === "templates") {
    const editing = s.templates.find((x) => x.id === templateEdit);
    /** 打开新建弹窗：清空表单为默认值 */
    const openNew = () => {
      TE(undefined);
      N("");
      SE([]);
      PR("普通");
      TS("启用");
      setTplOpen(true);
    };
    /** 打开编辑弹窗：载入模板当前值 */
    const openEdit = (t: (typeof s.templates)[number]) => {
      TE(t.id);
      N(t.name);
      SE(t.points);
      PR(t.priority);
      TS(t.state);
      setTplOpen(true);
    };
    const closeTpl = () => setTplOpen(false);
    const removeTemplate = (tid: string) => {
      if (!window.confirm("确认删除该巡检模板？删除后不可恢复。")) return;
      if (act({ type: "DELETE_TEMPLATE", id: tid }) && templateEdit === tid)
        closeTpl();
    };
    const saveTemplate = () => {
      if (
        act({
          type: "SAVE_TEMPLATE",
          id: templateEdit,
          name,
          points: selected,
          priority,
          state: tstate,
          end: "返航",
        })
      )
        closeTpl();
    };
    return (
      <>
        <Panel
          title="巡检模板"
          extra={
            <>
              <span className="head-hint">
                组合巡检点位与业务要求，供巡检计划 / 临时任务引用
              </span>
              <div className="actions">
                <Btn primary onClick={openNew}>
                  ＋ 新建模板
                </Btn>
              </div>
            </>
          }
        >
          <Table
            heads={["模板 / 编号", "优先级", "巡检点", "版本", "状态", "操作"]}
            rows={s.templates.map((t) => [
              <>
                <b>{t.name}</b>
                <small className="cell-muted">{t.id}</small>
              </>,
              <span
                className={
                  "badge " +
                  (t.priority === "紧急"
                    ? "red"
                    : t.priority === "高"
                      ? "amber"
                      : "")
                }
              >
                {t.priority}
              </span>,
              `${t.points.length} 个`,
              <span className="ver">v{t.version}</span>,
              <span className={"badge " + (t.state === "启用" ? "green" : "")}>
                {t.state}
              </span>,
              <div className="actions">
                <Btn onClick={() => openEdit(t)}>编辑</Btn>
                <Btn
                  onClick={() =>
                    act({ type: "TOGGLE_TEMPLATE_STATE", id: t.id })
                  }
                >
                  {t.state === "启用" ? "停用" : "启用"}
                </Btn>
                <Btn danger onClick={() => removeTemplate(t.id)}>
                  删除
                </Btn>
              </div>,
            ])}
          />
        </Panel>
        {tplOpen && (
          <Modal
            title={
              editing
                ? `编辑模板 · ${editing.id} · v${editing.version}`
                : "新建模板"
            }
            drawer
            drawerWidth={700}
            onClose={closeTpl}
            footer={
              <>
                <Btn onClick={closeTpl}>取消</Btn>
                <Btn primary onClick={saveTemplate}>
                  保存模板
                </Btn>
              </>
            }
          >
            <div className="form-grid">
              <Field label="模板名称">
                <input
                  value={name}
                  onChange={(e) => N(e.target.value)}
                  placeholder="输入模板名称"
                />
              </Field>
              <Field label="优先级">
                <select value={priority} onChange={(e) => PR(e.target.value)}>
                  <option>普通</option>
                  <option>高</option>
                  <option>紧急</option>
                </select>
              </Field>
              <Field label="状态">
                <select
                  value={tstate}
                  onChange={(e) => TS(e.target.value as "启用" | "停用")}
                >
                  <option>启用</option>
                  <option>停用</option>
                </select>
              </Field>
              <Field label="结束动作">
                <input readOnly value="返航" />
              </Field>
            </div>
            <Note>
              巡检点从平台已配置的「巡检点管理」中勾选；机器人按各巡检项的机器操作内容执行采集。保存即生成新版本；停用的模板不参与计划生成；已被计划引用的模板不可删除。
            </Note>
            {pickerTable}
          </Modal>
        )}
      </>
    );
  }
  if (page === "plans")
    return (
      <>
        <Panel
          className="plans-panel"
          title="巡检计划 · 绑定机器人按时自动执行"
          extra={
            <Btn
              primary
              onClick={() => {
                resetPlanForm();
                setPlanEditingId(undefined);
                setPlanOpen(true);
              }}
            >
              ＋ 新建计划
            </Btn>
          }
        >
          <Table
            heads={[
              "计划名称",
              <>
                模板
                <span className="th-note">通过模板，实现计划 / 任务复用</span>
              </>,
              <>
                周期 / 时间
                <span className="th-note">自动下发计划任务</span>
              </>,
              "执行机器人 / 自动化",
              "有效期",
              "版本 / 状态",
              "操作",
            ]}
            rows={s.plans.map((p) => [
              p.name,
              s.templates.find((t) => t.id === p.templateId)?.name,
              `${p.cycle} ${p.time}`,
              <>
                <b>{p.robotId || "待绑定"}</b>
                <small>
                  {p.generationError ||
                    (p.robotId
                      ? "按时自动执行 · 异常转人工调度"
                      : "请先绑定机器人")}
                </small>
              </>,
              `${p.start} 至 ${p.end}`,
              <>
                v{p.version} <Badge>{p.state}</Badge>
              </>,
              <div className="actions">
                <Btn
                  onClick={() => {
                    loadPlanForm(p.id);
                    setPlanEditingId(p.id);
                    setPlanOpen(true);
                  }}
                >
                  编辑
                </Btn>
                <Btn
                  primary
                  onClick={() => {
                    if (act({ type: "GENERATE", id: p.id })) go("tasks");
                  }}
                >
                  模拟当前时刻到点
                </Btn>
              </div>,
            ])}
          />
        </Panel>
        {planOpen && (
          <PlanModal
            boundRobot={boundRobot}
            setBoundRobot={BR}
            editingId={planEditingId}
            onClose={() => setPlanOpen(false)}
            onSave={() => setPlanOpen(false)}
            name={name}
            setName={N}
            templateId={templateId}
            setTemplateId={TI}
            cycle={cycle}
            setCycle={CY}
            time={time}
            setTime={TM}
            start={start}
            setStart={ST}
            end={end}
            setEnd={EN}
            advance={advance}
            setAdvance={AD}
            timeout={timeout}
            setTimeout={TO}
            wait={wait}
            setWait={WA}
            templates={s.templates}
            act={act}
          />
        )}
      </>
    );
  if (page === "plan-edit")
    return (
      <>
        <Panel
          title={
            initial ? "编辑计划 · 新版本仅影响未来任务" : "新建周期巡检计划"
          }
        >
          <div className="form-grid">
            <Field label="计划名称">
              <input value={name} onChange={(e) => N(e.target.value)} />
            </Field>
            <Field label="巡检模板">
              <select value={templateId} onChange={(e) => TI(e.target.value)}>
                {s.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · v{t.version}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="执行周期">
              <select value={cycle} onChange={(e) => CY(e.target.value)}>
                <option>每天</option>
                <option>每周</option>
                <option>每班</option>
              </select>
            </Field>
            <Field label="执行时间">
              <input
                type="time"
                value={time}
                onChange={(e) => TM(e.target.value)}
              />
            </Field>
            <Field label="有效期开始">
              <input
                type="date"
                value={start}
                onChange={(e) => ST(e.target.value)}
              />
            </Field>
            <Field label="有效期结束">
              <input
                type="date"
                value={end}
                onChange={(e) => EN(e.target.value)}
              />
            </Field>
            <Field label="提前生成 / 分钟">
              <input
                type="number"
                min={1}
                value={advance}
                onChange={(e) => AD(+e.target.value)}
              />
            </Field>
            <Field label="执行超时 / 分钟">
              <input
                type="number"
                min={1}
                value={timeout}
                onChange={(e) => TO(+e.target.value)}
              />
            </Field>
            <Field label="允许等待 / 分钟">
              <input
                type="number"
                min={1}
                value={wait}
                onChange={(e) => WA(+e.target.value)}
              />
            </Field>
          </div>
          <PlanRobotBinding
            value={boundRobot}
            onChange={BR}
            templateId={templateId}
          />
          <Note>
            计划按北京时间自动生成、下发并执行；提前生成不提前启动。浏览器打开期间运行模拟时钟，异常进入调度中心。每周按有效期首日的星期执行；每班以所填时间为首班，每
            8 小时一次。
          </Note>
          <Btn onClick={() => go("plans")}>取消</Btn>
          <Btn
            primary
            onClick={() => {
              if (
                act({
                  type: "SAVE_PLAN",
                  id: initial?.id,
                  name,
                  templateId,
                  robotId: boundRobot,
                  cycle,
                  start,
                  end,
                  time,
                  advance,
                  timeout,
                  wait,
                })
              )
                go("plans");
            }}
          >
            保存计划版本
          </Btn>
        </Panel>
      </>
    );
  if (page === "quick")
    return (
      <>
        {pickerTable}
        <Btn
          primary
          onClick={() => {
            if (
              act({
                type: "CREATE_TASK",
                name: name || "临时巡检",
                points: selected,
                priority,
              })
            )
              go("dispatch");
          }}
        >
          进入调度
        </Btn>
      </>
    );
  const t = s.tasks.find((t) => t.id === id);
  /** 任务列表：搜索词 + 来源/优先级/状态/机器人四字段筛选 + 分页（每页 5 条） */
  const TASK_PAGE_SIZE = 5;
  /** 从任务数据动态派生下拉选项，避免硬编码与种子数据不同步 */
  const sourceOpts = ["全部", ...new Set(s.tasks.map((x) => x.source))];
  const prioOpts = [
    "全部",
    ...new Set(s.tasks.map((x) => x.priority || "普通")),
  ];
  const statusOpts = ["全部", ...new Set(s.tasks.map((x) => x.state))];
  const robotOpts = [
    "全部",
    "未分配",
    ...new Set(s.tasks.map((x) => x.robotId).filter(Boolean)),
  ];
  const allFiltered = s.tasks.filter((t) => {
    if ((t.name + t.id).includes(query) === false) return false;
    if (srcFilter !== "全部" && t.source !== srcFilter) return false;
    if (prioFilter !== "全部" && (t.priority || "普通") !== prioFilter)
      return false;
    if (statusFilter !== "全部" && t.state !== statusFilter) return false;
    if (robotFilter !== "全部" && (t.robotId || "未分配") !== robotFilter)
      return false;
    return true;
  });
  const pageMax = Math.max(1, Math.ceil(allFiltered.length / TASK_PAGE_SIZE));
  const curPage = Math.min(srcPage, pageMax);
  const pageRows = allFiltered.slice(
    (curPage - 1) * TASK_PAGE_SIZE,
    curPage * TASK_PAGE_SIZE,
  );
  /** 筛选器统一切换回第一页 */
  const resetPage = () => SP(1);
  return (
    <>
      <Panel
        title="任务列表"
        extra={
          <div className="actions">
            <label className="inline-filter">
              <span>来源：</span>
              <select
                value={srcFilter}
                onChange={(e) => {
                  SF(e.target.value);
                  resetPage();
                }}
              >
                {sourceOpts.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="inline-filter">
              <span>优先级：</span>
              <select
                value={prioFilter}
                onChange={(e) => {
                  PF(e.target.value);
                  resetPage();
                }}
              >
                {prioOpts.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="inline-filter">
              <span>状态：</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  STF(e.target.value);
                  resetPage();
                }}
              >
                {statusOpts.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="inline-filter">
              <span>机器人：</span>
              <select
                value={robotFilter}
                onChange={(e) => {
                  RF(e.target.value);
                  resetPage();
                }}
              >
                {robotOpts.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <input
              placeholder="搜索任务名称 / 编号"
              value={query}
              onChange={(e) => {
                Q(e.target.value);
                resetPage();
              }}
            />
            <Btn primary onClick={() => setQuickOpen(true)}>
              ＋ 临时巡检任务
            </Btn>
          </div>
        }
      >
        <Table
          heads={[
            "任务 / 来源",
            "优先级",
            "状态",
            "机器人",
            "版本快照",
            "完成",
            "时间（生成 / 结束）",
            "操作",
          ]}
          rows={pageRows.map((t) => [
            <b>
              {t.name}
              <small>
                {t.id} · {t.source}
              </small>
            </b>,
            <span
              className={
                "badge " +
                (t.priority === "紧急"
                  ? "red"
                  : t.priority === "高"
                    ? "amber"
                    : "")
              }
            >
              {t.priority || "普通"}
            </span>,
            <Badge>{t.state}</Badge>,
            t.robotId || "未分配",
            `m${t.mapVersion} / p${t.pointSet}`,
            `${t.done.length}/${t.items.length}`,
            <>
              <span>{fmtTime(t.created)}</span>
              <small className="cell-muted">
                {t.finishedAt ? `结束 ${fmtTime(t.finishedAt)}` : "尚未结束"}
              </small>
            </>,
            <div className="actions">
              <Btn onClick={() => setTaskPeek(t)}>详情</Btn>
            </div>,
          ])}
        />
        <Pager
          page={curPage}
          count={allFiltered.length}
          size={TASK_PAGE_SIZE}
          onChange={(n) => SP(n)}
        />
        <Note>
          任务来源分两类：计划自动生成（周期计划到点下发）与人工临时下发；优先级为紧急
          / 高的任务建议优先派单。
        </Note>
      </Panel>
      {t && (
        <Panel title={`${t.name} · 不可变任务快照`}>
          <Table
            heads={["点位", "目标身份", "检测要求", "点位 / 地图版本"]}
            rows={t.items.map((p) => [
              p.name,
              p.targetId,
              p.requirement,
              `v${p.version} / m${p.mapVersion}`,
            ])}
          />
          <p>
            计划版本：{t.planVersion || "—"} · 调度编号：
            {t.dispatchId || "未下发"} · 告警来源：{t.alarmId || "—"}
          </p>
          <Btn onClick={() => go("results", t.id)}>查看任务结果</Btn>
        </Panel>
      )}
      {quickOpen && (
        <QuickTaskDrawer
          onClose={() => setQuickOpen(false)}
          onCreated={(id) => go("dispatch", id)}
        />
      )}
      {/* 任务详情抽屉：列表里就地看完整详情（与「任务详情」内置页共用 TaskDetailPanel），主操作由面板内按钮提供 */}
      {taskPeek && (
        <Modal
          title={`任务详情 · ${taskPeek.id}`}
          drawer
          drawerWidth={760}
          onClose={() => setTaskPeek(undefined)}
          footer={<Btn onClick={() => setTaskPeek(undefined)}>关闭</Btn>}
        >
          <TaskDetailPanel
            task={taskPeek}
            onAfterNav={() => setTaskPeek(undefined)}
          />
        </Modal>
      )}
    </>
  );
}

/**
 * 新建/编辑巡检计划弹窗
 * @description 复用 plan-edit 页面的 9 字段表单，避免页面跳转
 * @interaction Planning.tsx plans 页新建按钮、plans 页编辑按钮、templates 页创建按钮均打开此弹窗
 */
function PlanModal({
  boundRobot,
  setBoundRobot,
  editingId,
  onClose,
  onSave,
  name,
  setName,
  templateId,
  setTemplateId,
  cycle,
  setCycle,
  time,
  setTime,
  start,
  setStart,
  end,
  setEnd,
  advance,
  setAdvance,
  timeout,
  setTimeout,
  wait,
  setWait,
  templates,
  act,
}: {
  boundRobot: string;
  setBoundRobot: (id: string) => void;
  editingId?: string;
  onClose: () => void;
  onSave: () => void;
  name: string;
  setName: (v: string) => void;
  templateId: string;
  setTemplateId: (v: string) => void;
  cycle: string;
  setCycle: (v: string) => void;
  time: string;
  setTime: (v: string) => void;
  start: string;
  setStart: (v: string) => void;
  end: string;
  setEnd: (v: string) => void;
  advance: number;
  setAdvance: (v: number) => void;
  timeout: number;
  setTimeout: (v: number) => void;
  wait: number;
  setWait: (v: number) => void;
  templates: { id: string; name: string; version: number }[];
  act: (action: { type: string; [k: string]: any }) => boolean;
}) {
  return (
    <Modal
      title={editingId ? "编辑计划 · 新版本仅影响未来任务" : "新建周期巡检计划"}
      drawer
      drawerWidth={760}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>取消</Btn>
          <Btn
            primary
            onClick={() => {
              if (
                act({
                  type: "SAVE_PLAN",
                  id: editingId,
                  name,
                  templateId,
                  robotId: boundRobot,
                  cycle,
                  start,
                  end,
                  time,
                  advance,
                  timeout,
                  wait,
                })
              )
                onSave();
            }}
          >
            保存计划版本
          </Btn>
        </>
      }
    >
      <PlanRobotBinding
        value={boundRobot}
        onChange={setBoundRobot}
        templateId={templateId}
      />
      <div className="form-grid">
        <Field label="计划名称">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="巡检模板">
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · v{t.version}
              </option>
            ))}
          </select>
        </Field>
        <Field label="执行周期">
          <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
            <option>每天</option>
            <option>每周</option>
            <option>每班</option>
          </select>
        </Field>
        <Field label="执行时间">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
        <Field label="有效期开始">
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="有效期结束">
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
        <Field label="提前生成 / 分钟">
          <input
            type="number"
            min={1}
            value={advance}
            onChange={(e) => setAdvance(+e.target.value)}
          />
        </Field>
        <Field label="执行超时 / 分钟">
          <input
            type="number"
            min={1}
            value={timeout}
            onChange={(e) => setTimeout(+e.target.value)}
          />
        </Field>
        <Field label="允许等待 / 分钟">
          <input
            type="number"
            min={1}
            value={wait}
            onChange={(e) => setWait(+e.target.value)}
          />
        </Field>
      </div>
      <Note>
        页面打开时，系统提前生成任务，到计划时间自动执行；重复触发同一时段不会重复建任务。每班按设定时间每隔
        8 小时执行，按周以开始日期的星期为准。
      </Note>
    </Modal>
  );
}
