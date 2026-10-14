import { useState } from "react";
import { useStore } from "../data/store";
import { optimizePointOrder } from "../data/pointOrder";
import { go, useViewState } from "../data/navigation";
import { Btn, Badge, Panel, Field, Table, Note, Modal } from "../components/UI";
import { Pager } from "../components/Business";
import { QuickTaskDrawer } from "../components/QuickTaskDrawer";
import { PlanRobotBinding } from "../components/PlanRobotBinding";
import { TaskDetailPanel } from "../components/TaskDetailPanel";
import { PointPicker } from "../components/PointPicker";
import { RoutePreview } from "../components/RoutePreview";
import { fmtTime } from "../data/selectors";
import { actionsOfPoint, captureKindsOfPoint } from "../data/deviceMaster";
import { targetsOf } from "../data/mapCalibration";
import { constraints } from "../data/engine";
import { planKindOf } from "../data/planSchedule";
import { planKinds } from "../data/types";
import type { PlanKind, Point, Task } from "../data/types";
export function Planning({ page, id }: { page: string; id?: string }) {
  const { s, act } = useStore();
  const initial = s.plans.find((p) => p.id === id);
  const [templateId, TI] = useState(initial?.templateId || s.templates[0].id),
    [templateEdit, TE] = useState<string>(),
    [name, N] = useState(initial?.name || ""),
    [selected, SE] = useState<string[]>(s.templates[0].points),
    [tstate, TS] = useState<"启用" | "停用">("启用"),
    [tplOpen, setTplOpen] = useState(false),
    [pickQuery, PQ] = useState(""),
    [pickPage, PP] = useState(1),
    /** 执行方式：周期任务（按周期循环）/ 定时任务（指定日期执行一次） */
    [kind, KD] = useState<PlanKind>(initial?.kind || "周期任务"),
    [cycle, CY] = useState(initial?.cycle || "每天"),
    [start, ST] = useState(initial?.start || "2026-09-22"),
    [end, EN] = useState(initial?.end || "2026-12-31"),
    [time, TM] = useState(initial?.time || "10:00"),
    [query, Q] = useViewState("planning." + page + ".query", ""),
    [srcFilter, SF] = useViewState<string>("planning.tasks.srcFilter", "全部"),
    [statusFilter, STF] = useViewState<string>(
      "planning.tasks.statusFilter",
      "全部",
    ),
    [robotFilter, RF] = useViewState<string>(
      "planning.tasks.robotFilter",
      "全部",
    ),
    /** TASK-02：时间范围筛选，默认「当天」；最大跨度锁 30 天，避免列表爆量 */
    [timeRange, TR] = useViewState<string>("planning.tasks.timeRange", "今日"),
    [srcPage, SP] = useState(1),
    [quickOpen, setQuickOpen] = useState(false),
    /** TASK-04：派单（未分配任务选机器人一键派单） */
    [dispatchTask, setDispatchTask] = useState<Task>(),
    [dispatchRobot, setDispatchRobot] = useState(""),
    /** TASK-05：多选删除（勾选后点击「删除」二次确认） */
    [picked, setPicked] = useState<string[]>([]),
    /**
     * 选择态：列表常态不显示复选框列，点击「删除」进入选择态后才出现
     * @description 常态每行长驻复选框会抢占操作列的视觉焦点，改为按需展开
     */
    [pickMode, setPickMode] = useState(false),
    [planOpen, setPlanOpen] = useState(false),
    [planEditingId, setPlanEditingId] = useState<string | undefined>(),
    /** 计划操作的二次确认：取消 / 开始 共用一个确认弹窗 */
    [confirm, setConfirm] = useState<{
      title: string;
      text: string;
      run: () => void;
    } | null>(null);
  /** 任务列表「详情」抽屉中的任务：就地查看完整详情，不打断列表上下文 */
  const [taskPeek, setTaskPeek] = useState<Task>();
  const [boundRobot, BR] = useState(initial?.robotId || "");
  const [advance, AD] = useState(initial?.advance || 15),
    [timeout, TO] = useState(initial?.timeout || 60),
    [wait, WA] = useState(initial?.wait || 30);
  /**
   * 正在编辑的路线（子线）所属地图（父线）
   * @description 一条子线只能落在同一张地图上（机器狗按区域调度，任务本身也要求 mapId 唯一），
   *              故路线编辑时锁定一张图：候选列表只展示该图上的巡检点
   */
  const [routeMapId, RM] = useState("");
  /**
   * 当前是否处于「巡检路线编辑」上下文（templates 页）
   * @description 中栏列表的渲染回调里有一个同名局部变量 `page`（分页页码，number），
   *              会遮蔽 props 的 page；这里先把它收成布尔，避免在回调内比较出错
   */
  const routeLocked = page === "templates";
  /** 重置计划表单为默认值（新建时调用） */
  const resetPlanForm = () => {
    N("");
    BR("");
    TI(s.templates[0].id);
    KD("周期任务");
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
    // 执行方式走统一口径（老数据缺 kind 时按「周期任务」）
    KD(planKindOf(p));
    CY(p.cycle);
    TM(p.time);
    ST(p.start);
    EN(p.end);
    AD(p.advance);
    TO(p.timeout);
    WA(p.wait);
  };
  /**
   * 勾选 / 取消单个巡检点
   * @description 必须用函数式更新：目录树上的「整组全选」会连续调用本函数多次，
   *              若基于闭包里的 selected 计算，后一次会覆盖前一次 —— 表现为点了全选却只进去一个点
   */
  const toggle = (id: string) =>
    SE((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  /**
   * 调整已选巡检点顺序（数组顺序 = 机器狗跑子线的顺序）
   * @description 箭头与拖拽共用：把 from 位置的项摘出来插到 to 位置，其余项相对顺序不变
   */
  const reorder = (from: number, to: number) =>
    SE((prev) => {
      if (from === to || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  /** 巡检点选择器的筛选与分页（模板弹窗与临时任务共用同一数据源与口径） */
  const [pickStateF, PSF] = useViewState<string>("planning.picker.state", "全部");
  const [pickMapF, PMF] = useViewState<string>("planning.picker.map", "全部");
  const PICK_SIZE = 6;
  /** 目录树之外的前置筛选（搜索 / 状态 / 地图）：目录树二级结构在此结果上再裁剪 */
  const pickCandidates = s.points.filter(
    (p) =>
      (p.id + p.name + p.device).includes(pickQuery.trim()) &&
      (pickStateF === "全部" || p.state === pickStateF) &&
      (pickMapF === "全部" || p.mapId === pickMapF) &&
      // 路线（子线）锁定父线地图：只展示同一张图上的巡检点，从源头避免跨图子线
      (!routeLocked || !routeMapId || p.mapId === routeMapId),
  );
  /**
   * 已配置巡检点勾选表（数据源 s.points 来自「巡检点管理」页，平台预先配置好）
   * 模板/临时任务**以巡检点为最小单位**勾选（不选业务目标：业务目标是巡检项内部的事）
   */
  const pickerTable = (
    <PointPicker
      points={pickCandidates}
      selected={selected}
      onToggle={toggle}
      onClear={() => SE([])}
      // 路线编辑需要顺序：机器狗按巡检点顺序跑子线
      onReorder={routeLocked ? reorder : undefined}
      // 最优排序：按父线（路网）节点次序重排，避免走回头路
      onOptimize={
        routeLocked
          ? () => SE(optimizePointOrder(s, selected, routeMapId))
          : undefined
      }
    >
      {(rows) => {
        // 目录树裁剪后重算页数：切节点 / 改筛选不会停在空页
        const page = Math.min(
          pickPage,
          Math.max(1, Math.ceil(rows.length / PICK_SIZE)),
        );
        const pageRows = rows.slice(
          (page - 1) * PICK_SIZE,
          page * PICK_SIZE,
        );
        return (
          <>
      <div className="filter-bar">
        <input
          aria-label="巡检点搜索"
          placeholder="搜索巡检点 / 编码 / 设备"
          value={pickQuery}
          onChange={(e) => {
            PQ(e.target.value);
            PP(1);
          }}
        />
        {/* 路线编辑已锁定父线地图，无需再按地图筛 */}
        {!routeLocked && (
          <select
            aria-label="按地图筛选"
            value={pickMapF}
            onChange={(e) => {
              PMF(e.target.value);
              PP(1);
            }}
          >
            <option value="全部">全部地图</option>
            {s.maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="按状态筛选"
          value={pickStateF}
          onChange={(e) => {
            PSF(e.target.value);
            PP(1);
          }}
        >
          {["全部", "已启用", "停用"].map(
            (x) => (
              <option key={x}>{x}</option>
            ),
          )}
        </select>
        <span>
          共 {rows.length} 个 · 已选 {selected.length} 个
        </span>
      </div>
      <Table
        heads={[
          "选择",
          "巡检点名称",
          "地图 / 标定点",
          "巡检项",
          "机器操作内容",
          "覆盖设备",
          "版本 / 状态",
        ]}
        rows={pageRows.map((p) => {
          const mp = targetsOf(s, p.mapId).find((t) => t.id === p.targetId);
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
              {s.maps.find((x) => x.id === p.mapId)?.name || p.mapId}
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
            // TPL-01：覆盖设备可能多项 → 计数 + 明细展示（当前点位收敛到首个巡检项所属设备）
            <>
              {(() => {
                const devs = [
                  ...new Set(
                    specs
                      .map((sp) => {
                        const bt = s.businessTargets?.find(
                          (b) => b.id === sp.targetId,
                        );
                        const ins = bt
                          ? s.instruments?.find((i) => i.id === bt.instrumentId)
                          : undefined;
                        const dev = ins
                          ? s.devices?.find((d) => d.id === ins.deviceId)
                          : undefined;
                        return dev?.name;
                      })
                      .filter(Boolean) as string[],
                  ),
                ];
                const names = devs.length ? devs : [p.device];
                return (
                  <>
                    {names.length} 台<small>{names.join(" / ")}</small>
                  </>
                );
              })()}
            </>,
            <>
              <Badge>{p.state}</Badge>
            </>,
          ];
        })}
      />
      <Pager
        page={page}
        count={rows.length}
        size={PICK_SIZE}
        onChange={PP}
      />
          </>
        );
      }}
    </PointPicker>
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
      TS("启用");
      // 父线地图默认取第一张有巡检点的图（一张图一条父线，是最常见的用法）
      RM(
        s.maps.find((m) => s.points.some((p) => p.mapId === m.id))?.id ||
          s.maps[0]?.id ||
          "",
      );
      setTplOpen(true);
    };
    /** 打开编辑弹窗：载入路线当前值（父线取路线自身记录，老数据回落到首个点所属地图） */
    const openEdit = (t: (typeof s.templates)[number]) => {
      TE(t.id);
      N(t.name);
      SE(t.points);
      TS(t.state);
      RM(t.mapId || s.points.find((p) => p.id === t.points[0])?.mapId || "");
      setTplOpen(true);
    };
    const closeTpl = () => setTplOpen(false);
    const saveTemplate = () => {
      if (
        act({
          type: "SAVE_TEMPLATE",
          id: templateEdit,
          name,
          points: selected,
          mapId: routeMapId,
          state: tstate,
          end: "返航",
        })
      )
        closeTpl();
    };
    return (
      <>
        <Panel
          title="巡检路线 · 从父线（区域地图）上挑点组成子线"
          extra={
            <>
              <div className="actions">
                <Btn primary onClick={openNew}>
                  ＋ 新建路线
                </Btn>
              </div>
            </>
          }
        >
          <Table
            heads={[
              "路线 / 编号",
              "父线地图",
              "巡检点（执行顺序）",
              "版本",
              "状态",
              "操作",
            ]}
            rows={s.templates.map((t) => [
              <>
                <b>{t.name}</b>
                <small className="cell-muted">{t.id}</small>
              </>,
              s.maps.find(
                (m) =>
                  m.id ===
                  (t.mapId ||
                    s.points.find((p) => p.id === t.points[0])?.mapId),
              )?.name || "—",
              <>
                {t.points.length} 个
                <small className="cell-muted">
                  {t.points
                    .map(
                      (pid) => s.points.find((p) => p.id === pid)?.name || pid,
                    )
                    .slice(0, 3)
                    .join(" → ")}
                  {t.points.length > 3 ? " → …" : ""}
                </small>
              </>,
              <span className="ver">v{t.version}</span>,
              <span className={"badge " + (t.state === "启用" ? "green" : "")}>
                {t.state}
              </span>,
              <div className="actions">
                <Btn onClick={() => openEdit(t)}>编辑</Btn>
                <Btn
                  onClick={() =>
                    setConfirm({
                      title: t.state === "启用" ? "停用路线" : "启用路线",
                      text:
                        t.state === "启用"
                          ? `确认停用路线「${t.name}」？停用后计划将不再引用该路线生成任务。`
                          : `确认启用路线「${t.name}」？`,
                      run: () => act({ type: "TOGGLE_TEMPLATE_STATE", id: t.id }),
                    })
                  }
                >
                  {t.state === "启用" ? "停用" : "启用"}
                </Btn>
                <Btn
                  danger
                  onClick={() =>
                    setConfirm({
                      title: "删除路线",
                      text: `确认删除路线「${t.name}」？删除后不可恢复。`,
                      run: () => {
                        if (
                          act({ type: "DELETE_TEMPLATE", id: t.id }) &&
                          templateEdit === t.id
                        )
                          closeTpl();
                      },
                    })
                  }
                >
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
                ? `编辑路线 · ${editing.id} · v${editing.version}`
                : "新建巡检路线"
            }
            wide
            onClose={closeTpl}
            footer={
              <>
                <Btn onClick={closeTpl}>取消</Btn>
                <Btn
                  primary
                  disabled={!name.trim() || !selected.length || !routeMapId}
                  onClick={saveTemplate}
                >
                  保存路线
                </Btn>
              </>
            }
          >
            <div className="form-grid">
              <Field label="路线名称">
                <input
                  value={name}
                  onChange={(e) => N(e.target.value)}
                  placeholder="输入路线名称"
                />
              </Field>
              <Field label="父线地图">
                <select
                  value={routeMapId}
                  onChange={(e) => {
                    // 换父线 = 换子线基线：已选点整体作废，避免跨图选点
                    RM(e.target.value);
                    SE([]);
                  }}
                >
                  {s.maps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · 路网 {(m.roadnet?.paths || []).length} 段
                    </option>
                  ))}
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
            {/* 子线预览：底图 + 父线 + 按顺序连成的子线（可单独只看子线） */}
            <RoutePreview
              map={s.maps.find((m) => m.id === routeMapId)}
              stops={
                selected
                  .map((pid) => s.points.find((p) => p.id === pid))
                  .filter(Boolean) as Point[]
              }
            />
            <Note>
              子线按「已选」清单的顺序执行：机器狗沿父线行驶到 1 → 2 → 3 …
              依次作业；如需调整顺序，在右侧清单里拖动或点箭头。
            </Note>
            {pickerTable}
          </Modal>
        )}
        {confirm && (
          <Modal
            title={confirm.title}
            onClose={() => setConfirm(null)}
            footer={
              <>
                <Btn onClick={() => setConfirm(null)}>取消</Btn>
                <Btn
                  primary
                  onClick={() => {
                    confirm.run();
                    setConfirm(null);
                  }}
                >
                  确认
                </Btn>
              </>
            }
          >
            <p>{confirm.text}</p>
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
          {/* PLAN-01：信息架构补「巡检规划（路线 / 频次）」一步；有效期须明确，避免"无限期"观感 */}
          <Table
            heads={[
              "计划名称",
              "任务类型",
              "巡检路线",
              "周期 / 时间",
              "执行机器人",
              "有效期",
              "版本 / 状态",
              "操作",
            ]}
            rows={s.plans.map((p) => {
              const k = planKindOf(p);
              return [
              p.name,
              k,
              s.templates.find((t) => t.id === p.templateId)?.name,
              // 定时任务没有周期：直接显示「执行日期 + 时刻」并标注一次性
              k === "定时任务"
                ? `${p.start} ${p.time}（一次）`
                : `${p.cycle} ${p.time}`,
              p.robotId || "待绑定",
              k === "定时任务"
                ? `${p.start} 当日一次`
                : `${p.start} 至 ${p.end}`,
              <Badge tone={p.state === "停用" ? "amber" : undefined}>
                {p.state}
              </Badge>,
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
                  disabled={p.state !== "启用"}
                  onClick={() => {
                    if (act({ type: "GENERATE", id: p.id })) go("tasks");
                  }}
                >
                  模拟当前时刻到点
                </Btn>
                {p.state === "启用" ? (
                  <Btn
                    danger
                    onClick={() =>
                      setConfirm({
                        title: "停用计划",
                        text: `确认停用计划「${p.name}」？停用后停止后续自动生成任务。`,
                        run: () => act({ type: "STOP_PLAN", id: p.id }),
                      })
                    }
                  >
                    停用
                  </Btn>
                ) : (
                  <Btn
                    onClick={() =>
                      setConfirm({
                        title: "启用计划",
                        text: `确认启用计划「${p.name}」？将恢复按时自动生成任务。`,
                        run: () => act({ type: "START_PLAN", id: p.id }),
                      })
                    }
                  >
                    启用
                  </Btn>
                )}
              </div>,
              ];
            })}
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
            kind={kind}
            setKind={KD}
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
        {confirm && (
          <Modal
            title={confirm.title}
            onClose={() => setConfirm(null)}
            footer={
              <>
                <Btn onClick={() => setConfirm(null)}>取消</Btn>
                <Btn
                  primary
                  onClick={() => {
                    confirm.run();
                    setConfirm(null);
                  }}
                >
                  确认
                </Btn>
              </>
            }
          >
            <p>{confirm.text}</p>
          </Modal>
        )}
      </>
    );
  if (page === "plan-edit")
    return (
      <>
        <Panel
          title={initial ? "编辑计划 · 新版本仅影响未来任务" : "新建巡检计划"}
        >
          <div className="form-grid">
            <Field label="计划名称">
              <input value={name} onChange={(e) => N(e.target.value)} />
            </Field>
            <Field label="巡检路线">
              <select value={templateId} onChange={(e) => TI(e.target.value)}>
                {s.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · v{t.version}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="任务类型">
              <select
                value={kind}
                onChange={(e) => KD(e.target.value as PlanKind)}
              >
                {planKinds.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
            {kind === "周期任务" ? (
              <Field label="执行周期">
                <select value={cycle} onChange={(e) => CY(e.target.value)}>
                  <option>每天</option>
                  <option>每周</option>
                  <option>每班</option>
                </select>
              </Field>
            ) : (
              <Field label="执行日期">
                <input
                  type="date"
                  value={start}
                  onChange={(e) => ST(e.target.value)}
                />
              </Field>
            )}
            <Field label="执行时间">
              <input
                type="time"
                value={time}
                onChange={(e) => TM(e.target.value)}
              />
            </Field>
            {kind === "周期任务" && (
              <>
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
              </>
            )}
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
            8 小时一次。<b>定时任务</b>只在「执行日期 + 执行时间」执行一次，错过不补跑。
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
                  kind,
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
  /** 任务列表：搜索词 + 来源/状态/机器人三字段筛选 + 分页（每页 5 条） */
  const TASK_PAGE_SIZE = 5;
  /** 从任务数据动态派生下拉选项，避免硬编码与种子数据不同步 */
  const sourceOpts = ["全部", ...new Set(s.tasks.map((x) => x.source))];
  /** 状态筛选：只留常用决策状态（完整状态仍由行内 Badge 表达，避免下拉过长） */
  const statusOpts = ["全部", "取消", "已分配", "超期", "暂停", "待调度"];
  const robotOpts = [
    "全部",
    "未分配",
    ...new Set(s.tasks.map((x) => x.robotId).filter(Boolean)),
  ];
  const allFiltered = (() => {
    /** TASK-02：按所选时间范围过滤（生成时间 created）；「今日」= 当天；最大 30 天 */
    const now = Date.now();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const windowMs =
      timeRange === "今日"
        ? now - dayStart.getTime()
        : timeRange === "近 7 天"
          ? 7 * 864e5
          : timeRange === "近 30 天"
            ? 30 * 864e5
            : Infinity;
    const loMs =
      timeRange === "今日"
        ? dayStart.getTime()
        : now - Math.min(windowMs, 30 * 864e5);
    const inWindow = (t: (typeof s.tasks)[number]) => {
      const c = Date.parse(t.created);
      return Number.isNaN(c) ? true : c >= loMs && c <= now;
    };
    const rows = s.tasks.filter((t) => {
      if ((t.name + t.id).includes(query) === false) return false;
      if (srcFilter !== "全部" && t.source !== srcFilter) return false;
      if (statusFilter !== "全部" && t.state !== statusFilter) return false;
      if (robotFilter !== "全部" && (t.robotId || "未分配") !== robotFilter)
        return false;
      if (!inWindow(t)) return false;
      return true;
    });
    /** TASK-02：未完成（待调度/已分配/下发中/待执行/执行中/暂停/…）置顶，已完成置后 */
    const TERMINAL = new Set(["完成", "部分完成", "失败", "取消", "超期"]);
    rows.sort((a, b) => {
      const adone = TERMINAL.has(a.state) ? 1 : 0;
      const bdone = TERMINAL.has(b.state) ? 1 : 0;
      if (adone !== bdone) return adone - bdone;
      return Date.parse(b.created) - Date.parse(a.created);
    });
    return rows;
  })();
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
        className="panel-filters-wrap"
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
            <label className="inline-filter">
              <span>时间范围：</span>
              <select
                value={timeRange}
                onChange={(e) => {
                  TR(e.target.value);
                  resetPage();
                }}
                title="默认当天；最大可选近 30 天"
              >
                {["今日", "近 7 天", "近 30 天"].map((o) => (
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
            {/* TASK-05：点「删除」进入选择态（复选框列出现），勾选后再次点击即二次确认删除 */}
            <Btn
              danger
              onClick={() => {
                if (!pickMode) return setPickMode(true);
                if (!picked.length) return setPickMode(false);
                setConfirm({
                  title: "删除任务",
                  text: `确认删除所选 ${picked.length} 条任务？删除后不可恢复。`,
                  run: () => {
                    picked.forEach((id) => act({ type: "DELETE_TASK", id }));
                    setPicked([]);
                    setPickMode(false);
                  },
                });
              }}
            >
              {!pickMode
                ? "删除"
                : picked.length
                  ? `删除（${picked.length}）`
                  : "退出选择"}
            </Btn>
          </div>
        }
      >
        {/* TASK-01：任务生成规则说明；DSP-01：计划任务直接绑定机器人、临时任务走调度 */}
        {allFiltered.length === 0 && (
          <Note>
            当前时间范围（{timeRange}）内没有任务。可放宽到「近 7 天 / 近 30 天」，或核对来源 / 状态等筛选条件。
          </Note>
        )}
        <Table
          heads={[
            // 选择态下才渲染复选框列（含表头全选）
            ...(pickMode
              ? [
                  <input
                    type="checkbox"
                    aria-label="全选任务"
                    checked={
                      !!pageRows.length &&
                      pageRows.every((t) => picked.includes(t.id))
                    }
                    onChange={(e) =>
                      setPicked(
                        e.target.checked
                          ? [
                              ...new Set([
                                ...picked,
                                ...pageRows.map((t) => t.id),
                              ]),
                            ]
                          : picked.filter(
                              (id) => !pageRows.some((t) => t.id === id),
                            ),
                      )
                    }
                  />,
                ]
              : []),
            "任务 / 来源",
            "状态",
            "机器人",
            "完成",
            "时间（生成 / 结束）",
            "操作",
          ]}
          rows={pageRows.map((t) => [
            // 选择态下才渲染行复选框
            ...(pickMode
              ? [
                  <input
                    type="checkbox"
                    aria-label={`选择任务 ${t.id}`}
                    checked={picked.includes(t.id)}
                    onChange={() =>
                      setPicked(
                        picked.includes(t.id)
                          ? picked.filter((x) => x !== t.id)
                          : [...picked, t.id],
                      )
                    }
                  />,
                ]
              : []),
            <b>
              {t.name}
              <small>
                {t.id} · {t.source}
              </small>
            </b>,
            <Badge>{t.state}</Badge>,
            t.robotId || "未分配",
            `${t.done.length}/${t.items.length}`,
            <>
              <span>{fmtTime(t.created)}</span>
              <small className="cell-muted">
                {t.finishedAt ? `结束 ${fmtTime(t.finishedAt)}` : "尚未结束"}
              </small>
            </>,
            <div className="actions">
              {/* TASK-04：未分配机器人的待调度 / 超期任务选机器人一键派单（超期只做高亮，不冻结操作） */}
              {!t.robotId && ["待调度", "超期"].includes(t.state) && (
                <Btn
                  primary
                  onClick={() => {
                    setDispatchTask(t);
                    setDispatchRobot("");
                  }}
                >
                  派单
                </Btn>
              )}
              {/* TASK-05：单条取消（点击二次确认，确认即终止该任务） */}
              {!["完成", "失败", "部分完成", "取消"].includes(t.state) && (
                <Btn
                  danger
                  onClick={() =>
                    setConfirm({
                      title: "取消任务",
                      text: `确认取消任务「${t.name}」？取消后不可自动恢复。`,
                      run: () => act({ type: "STOP", id: t.id }),
                    })
                  }
                >
                  取消
                </Btn>
              )}
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
      </Panel>
      {t && (
        <Panel title={`${t.name} · 不可变任务快照`}>
          <Table
            heads={["点位", "目标身份", "检测要求", "地图版本"]}
            rows={t.items.map((p) => [
              p.name,
              p.targetId,
              p.requirement,
              `V${p.mapVersion}`,
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
      {/* TASK-04：派单弹窗（按调度约束列出适配机器人，选其一即可一键派单） */}
      {dispatchTask && (
        <Modal
          title={`派单 · ${dispatchTask.name}`}
          wide
          onClose={() => setDispatchTask(undefined)}
          footer={
            <>
              <Btn onClick={() => setDispatchTask(undefined)}>取消</Btn>
              <Btn
                primary
                disabled={!dispatchRobot}
                onClick={() => {
                  if (
                    act({
                      type: "ASSIGN",
                      id: dispatchTask.id,
                      robotId: dispatchRobot,
                    })
                  )
                    setDispatchTask(undefined);
                }}
              >
                一键派单
              </Btn>
            </>
          }
        >
          <Table
            heads={["选择", "机器人", "状态", "适配校验"]}
            rows={s.robots.map((rb) => {
              // 与 ASSIGN 同源校验：地图版本待同步可在派单后同步，不作为拦截项
              const reasons = constraints(s, dispatchTask, rb).filter(
                (x) => x !== "地图版本待同步",
              );
              return [
                <input
                  type="radio"
                  name="dispatch-robot"
                  aria-label={`派单给 ${rb.id}`}
                  disabled={!!reasons.length}
                  checked={dispatchRobot === rb.id}
                  onChange={() => setDispatchRobot(rb.id)}
                />,
                <b>
                  {rb.id} · {rb.name}
                  <small>
                    电量 {rb.battery}% · V{rb.mapVersion}
                  </small>
                </b>,
                <Badge>{rb.state}</Badge>,
                reasons.length ? (
                  <Badge tone="red">{reasons.join("；")}</Badge>
                ) : (
                  <Badge tone="green">适配</Badge>
                ),
              ];
            })}
          />
        </Modal>
      )}
      {/* 任务详情抽屉：列表里就地看完整详情（与「任务详情」内置页共用 TaskDetailPanel），主操作由面板内按钮提供 */}
      {taskPeek && (
        <Modal
          title={`任务详情 · ${taskPeek.id}`}
          wide
          onClose={() => setTaskPeek(undefined)}
          footer={<Btn onClick={() => setTaskPeek(undefined)}>关闭</Btn>}
        >
          <TaskDetailPanel
            task={taskPeek}
            onAfterNav={() => setTaskPeek(undefined)}
          />
        </Modal>
      )}
      {/* 操作二次确认（单条取消 / 批量删除）：列表内的危险操作统一走这一个确认弹窗 */}
      {confirm && (
        <Modal
          title={confirm.title}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Btn onClick={() => setConfirm(null)}>取消</Btn>
              <Btn
                primary
                onClick={() => {
                  confirm.run();
                  setConfirm(null);
                }}
              >
                确认
              </Btn>
            </>
          }
        >
          <p>{confirm.text}</p>
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
  kind,
  setKind,
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
  kind: PlanKind;
  setKind: (v: PlanKind) => void;
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
      title={editingId ? "编辑计划 · 新版本仅影响未来任务" : "新建巡检计划"}
      wide
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
                  kind,
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
        <Field label="巡检路线">
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
        <Field label="任务类型">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PlanKind)}
          >
            {planKinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        {kind === "周期任务" ? (
          <Field label="执行周期">
            <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
              <option>每天</option>
              <option>每周</option>
              <option>每班</option>
            </select>
          </Field>
        ) : (
          <Field label="执行日期">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
        )}
        <Field label="执行时间">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
        {kind === "周期任务" && (
          <>
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
          </>
        )}
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
    </Modal>
  );
}
