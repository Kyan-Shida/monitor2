import { useState, type ReactNode } from "react";
import { useStore } from "../data/store";
import { go, usePageSize, useViewState } from "../data/navigation";
import { Btn, Badge, Panel, Table, Note, Empty, Confirm, Switch } from "../components/UI";
import { profileOf, deviceTypes } from "../data/deviceProfile";
import { areaOptions } from "../data/deviceMaster";
import { capabilityMatrix, componentStatuses } from "../data/robotCapabilities";
import { ObjectLink, Kpis, Pager } from "../components/Business";
import { FilterPanel } from "../components/FilterPanel";
import { MapCanvas } from "../components/MapCanvas";
import { Operations as Legacy } from "./OperationsLegacy";
import { ControlConsole } from "./Execution";
import type { Robot, DeviceType } from "../data/types";
import {
  currentTask,
  queueFor,
  stageOf,
  fmtTime,
  robotColors,
  terminal,
} from "../data/selectors";
/** 机器人状态筛选选项（台账列表与页内筛选同一份名单） */
const ROBOT_STATES = [
  "全部",
  "空闲",
  "执行中",
  "充电",
  "人工接管",
  "故障",
  "离线",
];
/**
 * 正在执行任务的状态：这些状态下不允许停用机器人
 * @description 与调度口径一致——任务未结束就停用会中断作业，故只能「启用」不能「停用」
 */
const EXECUTING_STATES = ["执行中", "暂停", "返航中"];
export function Operations({
  page,
  id,
  tab = "tasks",
}: {
  page: string;
  id?: string;
  tab?: string;
}) {
  const { s, act } = useStore();
  const [region, REG] = useViewState("monitor.region", "一期罐区");
  const [q, Q] = useViewState("robots.query", ""),
    [status, ST] = useViewState("robots.status", "全部"),
    [pn, PN] = useViewState("robots.page", 1);
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [pageSize, SETPAGESIZE] = usePageSize("robots.size");
  /** 机器人详情 › 历史任务：自带分页状态，长列表不再撑高整页 */
  const [rtPage, RTPAGE] = useViewState("robot.tasks.page", 1);
  const [rtSize, RTSIZE] = usePageSize("robot.tasks.size");
  /** 筛选草稿：复用全站 FilterPanel，点「查询」才写回生效值 */
  const [draft, DRAFT] = useState({ q, status });
  /** 筛选面板展开态：默认收起，由 panel 头部的「筛选」按钮切换 */
  const [filterOpen, SETFILTEROPEN] = useState(false);
  /** 待停用的机器人：开关拨到停用时先落在这，二次确认后再真正停用 */
  const [stopRobot, ASKSTOP] = useState<Robot | null>(null);
  /** 已生效的筛选条件数（「筛选」按钮上的计数） */
  const filterCount = (q.trim() ? 1 : 0) + (status !== "全部" ? 1 : 0);
  /** 展开 / 收起筛选面板：展开时用当前生效值刷新草稿 */
  const toggleFilter = () => {
    if (!filterOpen) DRAFT({ q, status });
    SETFILTEROPEN(!filterOpen);
  };
  const r = s.robots.find((r) => r.id === id) || s.robots[0];
  const t = currentTask(s, r);
  if (page === "calendar")
    return <Legacy page={page} id={id} />;
  if (page === "robots") {
    const rows = s.robots.filter(
      (r) =>
        (r.id + r.name + r.region).includes(q) &&
        (status === "全部" || r.state === status),
    );
    /** 查询：草稿写回生效值，并收起筛选面板（列表回到第 1 页） */
    const applyFilter = () => {
      Q(draft.q);
      ST(draft.status);
      PN(1);
      SETFILTEROPEN(false);
    };
    /** 重置：清空条件并立即生效（面板保持展开，便于继续调条件） */
    const resetFilter = () => {
      DRAFT({ q: "", status: "全部" });
      Q("");
      ST("全部");
      PN(1);
    };
    return (
      <>
        {/* ROB-01：新增机器人入口收在列表右侧（robot-new 为内置页，带返回）；
            ROB-03：台账固定为列表视图（原「运行视图」卡片已下线）；
            详情页内含机器能力标签页，故行内不再单列「能力」入口。
            列表块：筛选 / 新增 / 分页都收在同一个面板内（与设备台账同款） */}
        <Panel
          className="panel-filters-wrap"
          title="机器人台账"
          extra={
            <div className="actions">
              {/* 筛选：与设备台账 / 巡检目标台账同一套 FilterPanel（草稿条件，点「查询」才生效） */}
              <Btn onClick={toggleFilter}>
                {filterOpen ? "收起筛选" : "筛选"}
                {filterCount ? `（${filterCount}）` : ""}
              </Btn>
              <Btn primary onClick={() => go("robot-new")}>
                ＋ 新增机器人
              </Btn>
            </div>
          }
        >
          {filterOpen && (
            <FilterPanel
              fields={[
                {
                  key: "q",
                  label: "机器人 / 区域",
                  placeholder: "名称 / 区域关键字",
                },
                { key: "status", label: "当前状态", options: ROBOT_STATES },
              ]}
              value={draft}
              onChange={(next) => DRAFT({ ...draft, ...next })}
              onSearch={applyFilter}
              onReset={resetFilter}
            />
          )}
          <Table
            heads={[
              "机器人编码",
              "机器人编号（SN）",
              "机器名称",
              "当前状态",
              "电量",
              "待执行",
              "启用",
              "更新时间",
              "操作",
            ]}
            rows={rows.slice((pn - 1) * pageSize, pn * pageSize).map((r) => [
              r.id,
              r.sn || <span className="muted">—</span>,
              <ObjectLink type="robot" id={r.id}>
                {r.name}
              </ObjectLink>,
              <Badge>{r.state}</Badge>,
              `${r.battery}%`,
              queueFor(s, r.id).length ? (
                <ObjectLink type="queue" id={r.id}>
                  {queueFor(s, r.id).length} 个
                </ObjectLink>
              ) : (
                <span className="muted">—</span>
              ),
              (() => {
                const on = r.enabled !== false;
                // 关联状态：执行任务中的机器人只能保持启用，不允许停用
                const locked = on && EXECUTING_STATES.includes(r.state);
                return (
                  <span
                    className={locked ? "switch-cell locked" : "switch-cell"}
                    title={
                      locked ? `执行任务中（${r.state}），不可停用` : undefined
                    }
                  >
                    <Switch
                      checked={on}
                      label={`${r.id} 启用状态`}
                      disabled={locked}
                      onChange={(next) => {
                        // 停用：二次确认后再落库；启用：直接生效
                        if (next) act({ type: "TOGGLE_ROBOT", id: r.id });
                        else ASKSTOP(r);
                      }}
                    />
                  </span>
                );
              })(),
              r.updatedAt || <span className="muted">—</span>,
              <div className="actions">
                <Btn onClick={() => go("robot", r.id)}>详情</Btn>
              </div>,
            ])}
          />
          <Pager
            page={pn}
            count={rows.length}
            size={pageSize}
            onChange={PN}
            onSize={(n) => {
              SETPAGESIZE(n);
              PN(1);
            }}
          />
        </Panel>
        {/* 停用二次确认：任务状态已挡住执行中的机器人，这里再问一次避免误点 */}
        {stopRobot && (
          <Confirm
            title="停用机器人"
            message={`停用「${stopRobot.name}」后不再参与调度派单，之后可随时重新启用。`}
            confirmText="停用"
            danger
            onClose={() => ASKSTOP(null)}
            onConfirm={() => {
              act({ type: "TOGGLE_ROBOT", id: stopRobot.id });
              ASKSTOP(null);
            }}
          />
        )}
      </>
    );
  }
  // ====== 以下为「机器人管理」新一级目录下的独立二级页面 ======
  // 复用原 robot 详情页 tab 内容，顶部补机器人选择与固定摘要
  if (["health", "robot-map", "manual", "device"].includes(page)) {
    const [selRobot, SR] = useViewState("robot-detail.selected", id);
    // 路由带回的 id 优先：从其它页面「接管 / 遥控」跳入时锁定该机器人；否则沿用页内选择
    const cur =
      s.robots.find((x) => x.id === id) ||
      s.robots.find((x) => x.id === selRobot) ||
      s.robots[0];
    if (!cur) return null;
    const common = (
      <div className="robot-fixed-summary">
        <div className="robot-glyph">{cur.id}</div>
        <div>
          <h2>{cur.name}</h2>
          <span>
            {cur.deviceType} · {cur.region || "未分配区域"}
          </span>
        </div>
        <select
          aria-label="切换机器人"
          value={cur.id}
          onChange={(e) => SR(e.target.value)}
        >
          {s.robots.map((x) => (
            <option key={x.id} value={x.id}>
              {x.id} · {x.name} · {x.region}
            </option>
          ))}
        </select>
      </div>
    );
    // 「机器人能力」合并页：能力与健康 / 地图与版本 / 机型专项 三个 Tab（原三个二级页面合并而来）
    if (page === "health") {
      const capTab = ["ability", "map"].includes(tab || "")
        ? tab!
        : "ability";
      return (
        <>
          {common}
          <div className="object-tabs">
            {(
              [
                ["ability", "能力与健康"],
                ["map", "地图与版本"],
              ] as const
            ).map(([k, n]) => (
              <button
                key={k}
                className={capTab === k ? "active" : ""}
                onClick={() => go("health", cur.id, k)}
              >
                {n}
              </button>
            ))}
          </div>
          {capTab === "ability" && (
            <Panel title="能力、组件与业务影响">
              {/* 可用性与「配备上装」口径来自 data/robotCapabilities（关联后台上装主数据），与计划绑定机器人页共用 */}
              <Table
                heads={["能力 / 组件", "可用性", "配备上装", "业务影响"]}
                rows={capabilityMatrix(s, cur).map((c) => [
                  c.key,
                  <Badge key={c.key}>{c.availability}</Badge>,
                  c.payload || <span className="muted">—</span>,
                  c.impact,
                ])}
              />
            </Panel>
          )}
          {capTab === "map" && (
            <Panel title="当前实际激活版本">
              <dl>
                <dt>地图</dt>
                <dd>
                  <ObjectLink type="maps" id={cur.mapId} tab="detail">
                    {cur.mapId}
                  </ObjectLink>
                </dd>
                <dt>空间版本</dt>
                <dd>V{cur.mapVersion}</dd>
                <dt>最近同步</dt>
                <dd>
                  <Badge>
                    {s.syncs.find((x) => x.robotId === cur.id)?.state ||
                      "初始激活副本"}
                  </Badge>
                </dd>
              </dl>
              <Btn onClick={() => go("map-detail", cur.mapId, "sync")}>
                版本同步工作台
              </Btn>
            </Panel>
          )}
        </>
      );
    }
    if (page === "robot-map")
      return (
        <>
          {common}
          <Panel title="当前实际激活版本">
            <dl>
              <dt>地图</dt>
              <dd>
                <ObjectLink type="maps" id={cur.mapId} tab="detail">
                  {cur.mapId}
                </ObjectLink>
              </dd>
              <dt>空间版本</dt>
              <dd>V{cur.mapVersion}</dd>
              <dt>最近同步</dt>
              <dd>
                <Badge>
                  {s.syncs.find((x) => x.robotId === cur.id)?.state ||
                    "初始激活副本"}
                </Badge>
              </dd>
            </dl>
            <Btn onClick={() => go("map-detail", cur.mapId, "sync")}>
              版本同步工作台
            </Btn>
          </Panel>
        </>
      );
    if (page === "manual")
      return (
        <>
          {common}
          <ControlConsole robotId={cur.id} />
        </>
      );
    if (page === "device")
      return (
        <>
          {common}
          <Panel title={`${cur.deviceType}机型专项 · 差异配置`}>
            <Note>{profileOf(cur.deviceType).summary}</Note>
            <Table
              heads={["配置维度", "本机型内容"]}
              rows={[
                [
                  "机型约束",
                  `最低派单电量 ${cur.constraints.minBattery}%` +
                    (cur.constraints.railSectionId
                      ? ` · 所在区段 ${cur.constraints.railSectionId}`
                      : "") +
                    (cur.constraints.maxSpeed
                      ? ` · 限速 ${cur.constraints.maxSpeed} m/s`
                      : ""),
                ],
                ["详情关注项", profileOf(cur.deviceType).detailTabs.join(" / ")],
                ["地图图层", profileOf(cur.deviceType).mapLayers.join(" / ")],
                ["操控重点", profileOf(cur.deviceType).controlPanel.join(" / ")],
                ["告警类型", profileOf(cur.deviceType).alarmTypes.join(" / ")],
                ["任务约束", profileOf(cur.deviceType).taskConstraints.join(" / ")],
                ["健康度 / 固件", `${cur.health} · ${cur.firmware}`],
              ]}
            />
          </Panel>
        </>
      );
  }
  if (page === "robot") {
    /** 标签页兜底：运行监测 / 运行记录已下线，旧深链（?tab=monitor、?tab=records）一律回到历史任务 */
    const rTab = tab === "ability" ? "ability" : "tasks";
    /** 历史任务全量（已结束的任务）与当前页切片：由标准 Pager 控制 */
    const rTasks = s.tasks.filter(
      (x) => x.robotId === r.id && terminal.includes(x.state),
    );
    const rTaskPage = rTasks.slice((rtPage - 1) * rtSize, rtPage * rtSize);
    return (
      <>
        <div className="robot-fixed-summary">
          <div className="robot-glyph">{r.id}</div>
          <div>
            <h2>{r.name}</h2>
            <span>
              {r.deviceType} · {r.region || "未分配区域"} ·{" "}
              {r.state === "离线" ? "离线" : "在线"}
            </span>
          </div>
          <Badge>{r.state}</Badge>
          <b>{r.state === "人工接管" ? "MANUAL" : "AUTO"}</b>
          <span>
            电量 <b>{r.battery}%</b>
          </span>
          <span>
            当前任务 <ObjectLink type="execution" id={t?.id} />
          </span>
        </div>
        <div className="object-tabs">
          {[
            ["tasks", "历史任务"],
            ["ability", "机器参数"],
          ].map(([k, n]) => (
            <button
              className={rTab === k ? "active" : ""}
              key={k}
              onClick={() => go("robot", r.id, k)}
            >
              {n}
            </button>
          ))}
        </div>
        {rTab === "tasks" && (
          <>
            <Panel title="历史任务">
              {/* 与「设备巡检任务」列表同口径；本页已按机器人限定，故省略「机器人」列 */}
              <Table
                heads={["任务编码", "任务", "来源", "状态", "开始时间", "结束时间", "回放"]}
                rows={rTaskPage.map((t) => [
                    t.id,
                    <ObjectLink type="task-detail" id={t.id}>
                      {t.name}
                    </ObjectLink>,
                    t.source,
                    <Badge>{t.state}</Badge>,
                    fmtTime(t.created),
                    t.finishedAt ? (
                      fmtTime(t.finishedAt)
                    ) : (
                      <span className="muted">—</span>
                    ),
                    <ObjectLink
                      type="replay"
                      id={t.id}
                      to="replay-detail"
                      from={{ page: "robot", id: r.id }}
                    >
                      过程回放
                    </ObjectLink>,
                  ])}
              />
              {/* 标准分页：与告警记录 / 巡检路线等列表页同一套（分页器由全局样式压在卡片底部） */}
              <Pager
                page={rtPage}
                count={rTasks.length}
                size={rtSize}
                onChange={RTPAGE}
                onSize={RTSIZE}
              />
            </Panel>
          </>
        )}
        {rTab === "ability" && <RobotCapabilityTab key={r.id} robot={r} />}
      </>
    );
  }
  const robots = s.robots.filter(
    (r) => region === "全部区域" || r.region === region,
  );
  const tasks = s.tasks.filter(
    (t) =>
      region === "全部区域" ||
      s.maps.find((m) => m.id === t.mapId)?.region === region,
  );
  const running = tasks.filter((t) => ["执行中", "暂停"].includes(t.state));
  const alerts = s.alarms.filter(
    (a) => a.state !== "已关闭" && tasks.some((t) => t.id === a.taskId),
  );
  const counts = (states: string[]) =>
    tasks.filter((t) => states.includes(t.state)).length;
  return (
    <>
      <div className="filter-bar">
        <b>值班运行总览</b>
        <select
          aria-label="运行区域"
          value={region}
          onChange={(e) => REG(e.target.value)}
        >
          {["全部区域", ...new Set(s.robots.map((r) => r.region).filter(Boolean))].map(
            (x) => (
              <option key={x}>{x}</option>
            ),
          )}
        </select>
        <span>当前机器人反馈与业务待办 · Mock</span>
      </div>
      <div className="operation-stat-bands">
        <section>
          <h3>机器人</h3>
          <Kpis
            items={[
              { label: "总数", value: robots.length },
              ...["在线", "空闲", "执行中", "充电", "人工接管", "故障"].map(
                (st) => ({
                  label: st,
                  value: robots.filter((r) =>
                    st === "在线" ? r.state !== "离线" : r.state === st,
                  ).length,
                  action: () => {
                    const next = st === "在线" ? "全部" : st;
                    ST(next);
                    // 同步筛选草稿：总览跳转到台账后，筛选面板要显示同一个条件
                    DRAFT({ q: "", status: next });
                    go("robots");
                  },
                }),
              ),
            ]}
          />
        </section>
        <section>
          <h3>任务</h3>
          <Kpis
            items={[
              {
                label: "待调度",
                value: counts(["待调度"]),
                action: () => go("dispatch"),
              },
              {
                label: "待执行",
                value: counts(["已分配", "下发中", "待执行"]),
                action: () => go("queue"),
              },
              {
                label: "执行中",
                value: counts(["执行中"]),
                action: () => go("execution"),
              },
              {
                label: "异常中断",
                value: tasks.filter((t) => t.failure || t.state === "失败")
                  .length,
              },
              {
                label: "今日完成",
                value: tasks.filter(
                  (t) =>
                    t.state === "完成" &&
                    (t.finishedAt || t.created).slice(0, 10) ===
                      new Date().toISOString().slice(0, 10),
                ).length,
              },
              {
                label: "即将超期",
                value: tasks.filter(
                  (t) =>
                    t.deadline &&
                    Date.parse(t.deadline) - Date.now() < 900000 &&
                    !terminal.includes(t.state),
                ).length,
              },
            ]}
          />
        </section>
        <section>
          <h3>异常</h3>
          <Kpis
            items={["待确认", "处理中", "已关闭"].map((x) => ({
              label: x,
              value: alerts.filter((a) => a.state === x).length,
              action: () => go("alarms"),
            }))}
          />
        </section>
      </div>
      <div className="workbench-surface monitor-surface">
        <section>
          <div className="split">
            <h3>区域实时运行</h3>
            <span>{region}</span>
          </div>
          <MapCanvas
            points={s.points.filter(
              (p) =>
                region === "全部区域" ||
                s.maps.find((m) => m.id === p.mapId)?.region === region,
            )}
            robots={robots}
            onRobot={(id) => go("robot", id)}
            onSelect={(tid) =>
              go("point", s.points.find((p) => p.targetId === tid)?.id)
            }
          />
          <div className="status-legend">
            {Object.entries(robotColors)
              .slice(0, 6)
              .map(([n, c]) => (
                <span key={n}>
                  <i style={{ background: c }} />
                  {n}
                </span>
              ))}
          </div>
          <div className="robot-inline-list">
            {robots.map((r) => (
              <button key={r.id} onClick={() => go("robot", r.id)}>
                <b>{r.id}</b>
                <Badge>{r.state}</Badge>
                <span>{r.battery}%</span>
              </button>
            ))}
          </div>
        </section>
        <section className="attention-column">
          <h3>需要值班人员关注</h3>
          {robots
            .filter((r) => r.state === "离线" || r.battery < 25)
            .map((r) => (
              <button
                className="attention"
                key={r.id}
                onClick={() => go("robot", r.id)}
              >
                <i className="severity amber" />
                <div>
                  <b>
                    {r.id} ·{" "}
                    {r.state === "离线" ? "通信离线" : "电量低于调度门槛"}
                  </b>
                  <small>{r.region || "未分配区域"} · 查看能力与健康</small>
                </div>
                <span>→</span>
              </button>
            ))}
          {robots
            .filter((r) => {
              const m = s.maps.find((m) => m.id === r.mapId);
              return m && r.mapVersion !== m.version;
            })
            .map((r) => (
              <button
                className="attention"
                key={r.id}
                onClick={() => go("map-detail", r.mapId, "sync")}
              >
                <i className="severity amber" />
                <div>
                  <b>{r.id} 地图版本不一致</b>
                  <small>需要安排同步维护窗口</small>
                </div>
                <span>→</span>
              </button>
            ))}
          {tasks
            .filter((t) => t.failure || t.state === "失败")
            .map((t) => (
              <button
                className="attention"
                key={t.id}
                onClick={() => go("execution-monitor", t.id)}
              >
                <i className="severity red" />
                <div>
                  <b>{t.failure || "任务执行失败"}</b>
                  <small>{t.name}</small>
                </div>
                <span>→</span>
              </button>
            ))}
          {alerts.map((a) => (
            <button
              className="attention"
              key={a.id}
              onClick={() => go("alarm", a.id)}
            >
              <i className="severity red" />
              <div>
                <b>{a.name}</b>
                <small>
                  {a.state} · {a.time}
                </small>
              </div>
              <span>→</span>
            </button>
          ))}
        </section>
      </div>
      <Panel
        title="正在执行与暂停的任务"
        extra={<Btn onClick={() => go("tasks")}>全部任务</Btn>}
      >
        <div className="live-task-list">
          {running.map((t) => (
            <div className="live-task" key={t.id}>
              <div>
                <ObjectLink type="execution" id={t.id}>
                  {t.name}
                </ObjectLink>
                <small>
                  {t.id} · {s.maps.find((m) => m.id === t.mapId)?.region}
                </small>
              </div>
              <div>
                <ObjectLink type="robot" id={t.robotId} />
                <small>执行机器人</small>
              </div>
              <div>
                <ObjectLink type="point" id={t.items[t.index]?.id}>
                  {t.items[t.index]?.name || "—"}
                </ObjectLink>
                <small>{stageOf(t)}</small>
              </div>
              <div>
                <b>
                  {t.done.length}/{t.items.length} 检测项
                </b>
                <progress max={t.items.length} value={t.done.length} />
              </div>
              <div>
                <Badge>
                  {
                    s.results.filter((r) => r.taskId === t.id && r.abnormal)
                      .length
                  }{" "}
                  异常
                </Badge>
              </div>
              <Btn primary onClick={() => go("execution-monitor", t.id)}>
                执行监控 →
              </Btn>
            </div>
          ))}
        </div>
        {!running.length && <Note>当前区域没有执行中的任务。</Note>}
      </Panel>
    </>
  );
}

/**
 * 机器人详情 › 机器能力（原「机器人能力」页并入详情）
 * @description 一处汇总该机器人的硬件（机型 / 固件 / 约束）、软件与算法（本体部署）、
 *              能力与组件可用性、地图版本与上装配套；数据全部取自后台主数据，不另造口径
 *              面板排成卡片栅格（同类信息并排、标签—值多列），不再是 5 段纵向长条
 * @param robot 目标机器人
 */
/**
 * 机器参数里每张表的独立分页（页码 + 每页条数都按会话记忆）
 * @param key 视图状态前缀，如 "robot.ability.comp"
 */
function useTablePager(key: string, defaultSize = 5) {
  const [page, PAGE] = useViewState(`${key}.page`, 1);
  const [size, SIZE] = usePageSize(`${key}.size`, defaultSize);
  return { page, size, PAGE, SIZE };
}

function RobotCapabilityTab({ robot: r }: { robot: Robot }) {
  const { s, act } = useStore();
  /** 子标签：五块内容原本纵向堆成一条长页，按主题分开、一次只看一块 */
  const [capTab, SETCAPTAB] = useViewState("robot.ability.tab", "hw");
  /** 三张表格各自分页：与全站列表同一套 Pager（共 N 条 / 每页 / 上一页 · 下一页） */
  const comp = useTablePager("robot.ability.comp");
  const cap = useTablePager("robot.ability.cap");
  const payload = useTablePager("robot.ability.payload");
  const profile = profileOf(r.deviceType);
  /** 适用该机型且已启用的上装主数据 */
  const payloads = (s.robotPayloads || []).filter(
    (p) =>
      p.state === "启用" && (!p.models.length || p.models.includes(r.deviceType)),
  );
  /** 机型与硬件编辑：草稿字段 + 编辑中标记 + 保存二次确认 */
  const [editing, EDITING] = useState(false);
  const [ask, ASK] = useState(false);
  const [sn, SN] = useState(r.sn ?? "");
  const [deviceType, DT] = useState<DeviceType>(r.deviceType);
  const [region, REGION] = useState(r.region ?? "");
  const [firmware, FW] = useState(r.firmware ?? "");
  const [minBattery, MINB] = useState(r.constraints.minBattery);
  const [maxSpeed, MAXS] = useState(r.constraints.maxSpeed ?? 1.5);
  const [railSectionId, RAIL] = useState(r.constraints.railSectionId ?? "");
  /** 三张表的分页切片（数据源不变，只交付当前页；页码越界时按最后一页兜底） */
  const compAll = componentStatuses(r);
  const capAll = capabilityMatrix(s, r);
  const sliceOf = <T,>(all: T[], p: { page: number; size: number }) => {
    const max = Math.max(1, Math.ceil(all.length / p.size));
    const cur = Math.min(Math.max(1, p.page), max);
    return all.slice((cur - 1) * p.size, cur * p.size);
  };
  /**
   * 标签—值网格里的一格（多列自适应，见 styles.css › .cap-kv）
   * @param wide 取值较长时独占一整行，不与短项挤在一排
   */
  const kv = (k: string, v: ReactNode, wide = false) => (
    <div key={k} className={wide ? "wide" : undefined}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
  return (
    <div className="cap-grid">
      {/* 子标签条：机型与硬件 / 组件状态 / 能力与影响 / 地图与版本 / 上装与配套 */}
      <div className="cap-tabs segmented" role="tablist">
        {[
          ["hw", "机型与硬件"],
          ["comp", "组件状态"],
          ["cap", "能力与影响"],
          ["map", "地图与版本"],
          ["payload", "上装与配套"],
        ].map(([k, n]) => (
          <button
            key={k}
            role="tab"
            aria-selected={capTab === k}
            className={capTab === k ? "active" : ""}
            onClick={() => SETCAPTAB(k)}
          >
            {n}
          </button>
        ))}
      </div>
      {/* 机型与硬件：机型主数据（标签—值网格），通栏；可编辑，保存二次确认 */}
      {capTab === "hw" && (
        <Panel
          className="cap-span2"
          title="机型与硬件"
          extra={
            editing ? (
              <div className="actions">
                <Btn onClick={() => EDITING(false)}>取消</Btn>
                <Btn primary onClick={() => ASK(true)}>
                  保存
                </Btn>
              </div>
            ) : (
              <div className="actions">
                <span className="muted">更新于 {r.updatedAt ?? "—"}</span>
                <Btn
                  onClick={() => {
                    SN(r.sn ?? "");
                    DT(r.deviceType);
                    REGION(r.region ?? "");
                    FW(r.firmware ?? "");
                    MINB(r.constraints.minBattery);
                    MAXS(r.constraints.maxSpeed ?? 1.5);
                    RAIL(r.constraints.railSectionId ?? "");
                    EDITING(true);
                  }}
                >
                  编辑
                </Btn>
              </div>
            )
          }
        >
          <Note>{profile.summary}</Note>
          {editing ? (
            <dl className="cap-kv">
              {kv(
                "机器人编号（SN）",
                <input
                  value={sn}
                  placeholder="出厂硬件序列号"
                  onChange={(e) => SN(e.target.value)}
                />,
              )}
              {kv(
                "机型",
                <select
                  value={deviceType}
                  onChange={(e) => {
                    const t = e.target.value as DeviceType;
                    DT(t);
                    MINB(profileOf(t).constraints.minBattery);
                  }}
                >
                  {deviceTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>,
              )}
              {kv(
                "所属区域",
                <select
                  value={region}
                  onChange={(e) => REGION(e.target.value)}
                >
                  {areaOptions(s).map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>,
              )}
              {kv(
                "固件版本",
                <input
                  value={firmware}
                  onChange={(e) => FW(e.target.value)}
                />,
              )}
              {kv(
                "机型约束",
                <div className="edit-constraints">
                  <label>
                    最低派单电量（%）
                    <input
                      type="number"
                      value={minBattery}
                      onChange={(e) => MINB(Number(e.target.value))}
                    />
                  </label>
                  {deviceType === "四轮车" && (
                    <label>
                      限速（m/s）
                      <input
                        type="number"
                        step="0.1"
                        value={maxSpeed}
                        onChange={(e) => MAXS(Number(e.target.value))}
                      />
                    </label>
                  )}
                  {deviceType === "挂轨" && (
                    <label>
                      所在轨道区段
                      <input
                        value={railSectionId}
                        onChange={(e) => RAIL(e.target.value)}
                      />
                    </label>
                  )}
                </div>,
                true,
              )}
            </dl>
          ) : (
            <dl className="cap-kv">
              {kv("机器人编号（SN）", r.sn || "—")}
              {kv("机型", r.deviceType)}
              {kv("所属区域", r.region || "未分配区域")}
              {kv("固件版本", r.firmware)}
              {kv(
                "机型约束",
                `最低派单电量 ${r.constraints.minBattery}%` +
                  (r.constraints.railSectionId
                    ? ` · 所在区段 ${r.constraints.railSectionId}`
                    : "") +
                  (r.constraints.maxSpeed
                    ? ` · 限速 ${r.constraints.maxSpeed} m/s`
                    : ""),
                true,
              )}
            </dl>
          )}
          {/* 保存二次确认：挂在 Panel 内，点遮罩只关确认框 */}
          {ask && (
            <Confirm
              title="保存机型与硬件"
              message={`「${r.name}」的主数据保存后，更新时间会同步刷新。`}
              confirmText="保存"
              onClose={() => ASK(false)}
              onConfirm={() => {
                act({
                  type: "UPDATE_ROBOT",
                  id: r.id,
                  sn,
                  deviceType,
                  region,
                  firmware,
                  minBattery,
                  maxSpeed: deviceType === "四轮车" ? maxSpeed : undefined,
                  railSectionId:
                    deviceType === "挂轨" ? railSectionId : undefined,
                });
                ASK(false);
                EDITING(false);
              }}
            />
          )}
        </Panel>
      )}
      {/* 组件状态：机器人本体自检（组件 / 传感器健康），口径与能力表同源 */}
      {capTab === "comp" && (
      <Panel className="cap-span2" title="组件状态">
        {/* 手写 <table> 换成共享 Table：列宽、行高、表头底色与全站表格一致 */}
        <Table
          heads={["组件 / 传感器", "状态"]}
          rows={sliceOf(compAll, comp).map((c) => [
            c.name,
            <span
              className={`comp-status ${c.status === "正常" ? "ok" : "bad"}`}
            >
              {c.status}
            </span>,
          ])}
        />
        <Pager
          page={comp.page}
          count={compAll.length}
          size={comp.size}
          onChange={comp.PAGE}
          onSize={comp.SIZE}
        />
      </Panel>
      )}
      {capTab === "cap" && (
      <Panel className="cap-span2" title="能力、组件与业务影响">
        <Table
          heads={["能力 / 组件", "可用性", "配备上装", "业务影响"]}
          rows={sliceOf(capAll, cap).map((c) => [
            c.key,
            <Badge key={c.key}>{c.availability}</Badge>,
            c.payload || <span className="muted">—</span>,
            c.impact,
          ])}
        />
        <Pager
          page={cap.page}
          count={capAll.length}
          size={cap.size}
          onChange={cap.PAGE}
          onSize={cap.SIZE}
        />
      </Panel>
      )}
      {capTab === "map" && (
      <Panel className="cap-span2" title="地图与版本">
        <dl className="cap-kv">
          {kv(
            "地图",
            <ObjectLink type="maps" id={r.mapId} tab="detail">
              {r.mapId}
            </ObjectLink>,
          )}
          {kv("空间版本", `V${r.mapVersion}`)}
          {kv(
            "最近同步",
            <Badge>
              {s.syncs.find((x) => x.robotId === r.id)?.state || "初始激活副本"}
            </Badge>,
          )}
        </dl>
        <div className="actions">
          <Btn onClick={() => go("map-detail", r.mapId, "sync")}>
            版本同步工作台
          </Btn>
        </div>
      </Panel>
      )}
      {capTab === "payload" && (
      <Panel className="cap-span2" title="上装与配套">
        <Table
          heads={["上装", "采集方式", "支持动作"]}
          rows={sliceOf(payloads, payload).map((p) => [
            p.name,
            p.abilities.map((a) => a.kind).join(" / "),
            p.abilities.flatMap((a) => a.actions).join(" / "),
          ])}
        />
        {!payloads.length && <Empty>该机型暂无适用上装。</Empty>}
        {!!payloads.length && (
          <Pager
            page={payload.page}
            count={payloads.length}
            size={payload.size}
            onChange={payload.PAGE}
            onSize={payload.SIZE}
          />
        )}
      </Panel>
      )}
    </div>
  );
}
