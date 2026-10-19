import { useState, type ReactNode } from "react";
import { useStore } from "../data/store";
import { go, usePageSize, useViewState } from "../data/navigation";
import { Btn, Badge, Panel, Table, Note, Empty } from "../components/UI";
import { profileOf } from "../data/deviceProfile";
import { capabilityMatrix, componentStatuses } from "../data/robotCapabilities";
import { ObjectLink, Kpis, Pager } from "../components/Business";
import { FilterPanel } from "../components/FilterPanel";
import { MapCanvas } from "../components/MapCanvas";
import { Operations as Legacy } from "./OperationsLegacy";
import { ControlConsole } from "./Execution";
import type { Robot } from "../data/types";
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
export function Operations({
  page,
  id,
  tab = "tasks",
}: {
  page: string;
  id?: string;
  tab?: string;
}) {
  const { s } = useStore();
  const [region, REG] = useViewState("monitor.region", "一期罐区");
  const [q, Q] = useViewState("robots.query", ""),
    [status, ST] = useViewState("robots.status", "全部"),
    [pn, PN] = useViewState("robots.page", 1);
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [pageSize, SETPAGESIZE] = usePageSize("robots.size");
  /** 筛选草稿：复用全站 FilterPanel，点「查询」才写回生效值 */
  const [draft, DRAFT] = useState({ q, status });
  /** 筛选面板展开态：默认收起，由 panel 头部的「筛选」按钮切换 */
  const [filterOpen, SETFILTEROPEN] = useState(false);
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
          title="机器人实时状态"
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
                heads={["任务", "来源", "状态", "时间（生成 / 结束）", "回放"]}
                rows={s.tasks
                  .filter(
                    (t) => t.robotId === r.id && terminal.includes(t.state),
                  )
                  .map((t) => [
                    <ObjectLink type="task-detail" id={t.id}>
                      {t.name}
                    </ObjectLink>,
                    t.source,
                    <Badge>{t.state}</Badge>,
                    <>
                      <span>{fmtTime(t.created)}</span>
                      <small className="cell-muted">
                        {t.finishedAt
                          ? `结束 ${fmtTime(t.finishedAt)}`
                          : "尚未结束"}
                      </small>
                    </>,
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
            </Panel>
          </>
        )}
        {rTab === "ability" && <RobotCapabilityTab robot={r} />}
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
            items={["新告警", "未确认", "处理中", "已恢复"].map((x) => ({
              label: x,
              value: alerts.filter(
                (a) =>
                  a.state === (x === "新告警" || x === "未确认" ? "待确认" : x),
              ).length,
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
function RobotCapabilityTab({ robot: r }: { robot: Robot }) {
  const { s } = useStore();
  const profile = profileOf(r.deviceType);
  /** 适用该机型且已启用的上装主数据 */
  const payloads = (s.robotPayloads || []).filter(
    (p) =>
      p.state === "启用" && (!p.models.length || p.models.includes(r.deviceType)),
  );
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
      {/* 机型与硬件：机型主数据（标签—值网格），通栏 */}
      <Panel className="cap-span2" title="机型与硬件">
        <Note>{profile.summary}</Note>
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
      </Panel>
      {/* 组件状态：机器人本体自检（组件 / 传感器健康），口径与能力表同源 */}
      <Panel className="cap-span2" title="组件状态">
        <div className="table-scroll">
          <table className="comp-table">
            <thead>
              <tr>
                <th>组件 / 传感器</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {componentStatuses(r).map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td>
                    <span
                      className={`comp-status ${c.status === "正常" ? "ok" : "bad"}`}
                    >
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="能力、组件与业务影响">
        <Table
          heads={["能力 / 组件", "可用性", "配备上装", "业务影响"]}
          rows={capabilityMatrix(s, r).map((c) => [
            c.key,
            <Badge key={c.key}>{c.availability}</Badge>,
            c.payload || <span className="muted">—</span>,
            c.impact,
          ])}
        />
      </Panel>
      <Panel title="地图与版本">
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
      <Panel title="上装与配套">
        <Table
          heads={["上装", "采集方式", "支持动作"]}
          rows={payloads.map((p) => [
            p.name,
            p.abilities.map((a) => a.kind).join(" / "),
            p.abilities.flatMap((a) => a.actions).join(" / "),
          ])}
        />
        {!payloads.length && <Empty>该机型暂无适用上装。</Empty>}
      </Panel>
    </div>
  );
}
