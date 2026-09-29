import { useState } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { Btn, Badge, Panel, Table, Note } from "../components/UI";
import { profileOf } from "../data/deviceProfile";
import { capabilityMatrix } from "../data/robotCapabilities";
import { ObjectLink, Kpis, EventTimeline, Pager } from "../components/Business";
import { MapCanvas } from "../components/MapCanvas";
import { Video } from "../components/Video";
import { Operations as Legacy } from "./OperationsLegacy";
import { ControlConsole } from "./Execution";
import {
  currentTask,
  queueFor,
  robotAvailability,
  stageOf,
  minutesLeft,
  timeAt,
  fmtTime,
  schedule,
  robotColors,
  terminal,
} from "../data/selectors";
export function Operations({
  page,
  id,
  tab = "monitor",
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
  const [mode, MO] = useViewState("robots.mode", "cards");
  const r = s.robots.find((r) => r.id === id) || s.robots[0];
  const t = currentTask(s, r);
  const queued = queueFor(s, r.id);
  if (page === "calendar")
    return <Legacy page={page} id={id} />;
  if (page === "robots") {
    const rows = s.robots.filter(
      (r) =>
        (r.id + r.name + r.region).includes(q) &&
        (status === "全部" || r.state === status),
    );
    return (
      <>
        <div className="filter-bar">
          <input
            aria-label="机器人搜索"
            placeholder="机器人 / 区域"
            value={q}
            onChange={(e) => {
              Q(e.target.value);
              PN(1);
            }}
          />
          <select
            aria-label="机器人状态"
            value={status}
            onChange={(e) => {
              ST(e.target.value);
              PN(1);
            }}
          >
            {["全部", "空闲", "执行中", "充电", "人工接管", "故障", "离线"].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
          <span>实时状态 · 模拟通信</span>
          <div className="segmented">
            <button
              onClick={() => MO("cards")}
              className={mode === "cards" ? "active" : ""}
            >
              运行视图
            </button>
            <button
              onClick={() => MO("list")}
              className={mode === "list" ? "active" : ""}
            >
              列表视图
            </button>
          </div>
        </div>
        {mode === "cards" ? (
          <div className="robot-monitor-grid">
            {rows.slice((pn - 1) * 6, pn * 6).map((r) => {
              const t = currentTask(s, r);
              return (
                <section className="robot-monitor" key={r.id}>
                  <div className="robot-monitor-head">
                    <i style={{ background: robotColors[r.state] }} />
                    <ObjectLink type="robot" id={r.id}>
                      {r.id} · {r.name}
                    </ObjectLink>
                    <Badge>{r.deviceType}</Badge>
                    <Badge>{r.state}</Badge>
                  </div>
                  <div className="robot-monitor-body">
                    <div className="split">
                      <span>
                        {r.deviceType} · {r.region} ·{" "}
                        {r.state === "离线" ? "离线" : "在线"}
                      </span>
                      <b>{r.state === "人工接管" ? "MANUAL" : "AUTO"}</b>
                    </div>
                    <div className="battery-line">
                      <span>电量 {r.battery}%</span>
                      <progress max={100} value={r.battery} />
                    </div>
                    <dl>
                      <dt>当前任务</dt>
                      <dd>
                        <ObjectLink type="execution" id={t?.id}>
                          {t?.name || "无当前任务"}
                        </ObjectLink>
                      </dd>
                      <dt>当前巡检点</dt>
                      <dd>
                        <ObjectLink type="point" id={t?.items[t.index]?.id}>
                          {t?.items[t.index]?.name || "—"}
                        </ObjectLink>
                      </dd>
                      <dt>自主阶段</dt>
                      <dd>{stageOf(t)}</dd>
                      <dt>待执行任务</dt>
                      <dd>
                        <ObjectLink type="queue" id={r.id}>
                          {queueFor(s, r.id).length} 个 · 查看队列
                        </ObjectLink>
                      </dd>
                      <dt>预计可用</dt>
                      <dd>{robotAvailability(s, r)}</dd>
                      <dt>激活版本</dt>
                      <dd>
                        m{r.mapVersion} / p{r.pointSet}
                      </dd>
                      <dt>健康提示</dt>
                      <dd>
                        {r.battery < r.constraints.minBattery
                          ? `电量低于本机型门槛 ${r.constraints.minBattery}%，充电完成前禁止调度`
                          : `关键能力正常 · 健康度 ${r.health} · 固件 ${r.firmware}`}
                      </dd>
                      <dt>最后通信</dt>
                      <dd>
                        {r.state === "离线"
                          ? "无新心跳"
                          : "演示连接在线 · 页面采样"}
                      </dd>
                    </dl>
                    <div className="tags">
                      {/* 载荷能力 + 移动能力双标签：移动能力决定任务能否下发到本机型 */}
                      {[...r.mobility, ...r.capabilities].map((c) => (
                        <Badge key={c}>{c}</Badge>
                      ))}
                    </div>
                  </div>
                  <button
                    className="robot-monitor-footer"
                    onClick={() => go("robot", r.id)}
                  >
                    进入机器人运行监测 →
                  </button>
                </section>
              );
            })}
          </div>
        ) : (
          <Panel title="机器人实时状态">
            <Table
              heads={[
                "机器人",
                "机型",
                "区域 / 状态",
                "电量 / 控制",
                "当前任务 / 阶段",
                "待执行 / 预计可用",
                "版本 / 健康",
              ]}
              rows={rows.slice((pn - 1) * 6, pn * 6).map((r) => [
                <ObjectLink type="robot" id={r.id}>
                  {r.name}
                </ObjectLink>,
                <Badge>{r.deviceType}</Badge>,
                <>
                  {r.region}
                  <small>
                    <Badge>{r.state}</Badge>
                  </small>
                </>,
                `${r.battery}% / ${r.state === "人工接管" ? "MANUAL" : "AUTO"}`,
                <>
                  <ObjectLink type="execution" id={r.current} />
                  <small>{stageOf(currentTask(s, r))}</small>
                </>,
                <ObjectLink type="queue" id={r.id}>
                  {queueFor(s, r.id).length} 个 / {robotAvailability(s, r)}
                </ObjectLink>,
                `m${r.mapVersion} / p${r.pointSet} · ${
                  r.battery < r.constraints.minBattery ? "低电量" : "正常"
                } · 健康 ${r.health}`,
              ])}
            />
          </Panel>
        )}
        <Pager page={pn} count={rows.length} onChange={PN} />
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
            {cur.deviceType} · {cur.region}
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
    if (page === "health")
      return (
        <>
          {common}
          <Panel title="能力、组件与业务影响">
            {/* 可用性口径来自 data/robotCapabilities，与计划绑定机器人页共用 */}
            <Table
              heads={["能力 / 组件", "可用性", "业务影响"]}
              rows={capabilityMatrix(cur).map((c) => [
                c.key,
                <Badge key={c.key}>{c.availability}</Badge>,
                c.impact,
              ])}
            />
          </Panel>
        </>
      );
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
              <dd>m{cur.mapVersion}</dd>
              <dt>点位版本</dt>
              <dd>p{cur.pointSet}</dd>
              <dt>最近同步</dt>
              <dd>
                <Badge>
                  {s.syncs.find((x) => x.robotId === cur.id)?.state ||
                    "初始激活副本"}
                </Badge>
              </dd>
            </dl>
            <Btn onClick={() => go("maps", cur.mapId, "sync")}>
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
                ["移动能力", cur.mobility.join(" / ")],
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
  if (page === "robot")
    return (
      <>
        <div className="robot-fixed-summary">
          <div className="robot-glyph">{r.id}</div>
          <div>
            <h2>{r.name}</h2>
            <span>
              {r.deviceType} · {r.region} ·{" "}
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
          <span>
            m{r.mapVersion} / p{r.pointSet}
          </span>
          <span>
            预计可用 <b>{robotAvailability(s, r)}</b>
          </span>
        </div>
        <div className="object-tabs">
          {[
            ["monitor", "运行监测"],
            ["tasks", "任务"],
            ["records", "运行记录"],
          ].map(([k, n]) => (
            <button
              className={tab === k ? "active" : ""}
              key={k}
              onClick={() => go("robot", r.id, k)}
            >
              {n}
            </button>
          ))}
        </div>
        {tab === "monitor" && (
          <>
            <div className="workbench-surface robot-live">
              <section>
                <h3>实时位置 / {r.region}</h3>
                <MapCanvas
                  points={s.points.filter((p) => p.mapId === r.mapId)}
                  robots={[r]}
                  onRobot={(id) => go("robot", id)}
                  onSelect={(tid) =>
                    go("point", s.points.find((p) => p.targetId === tid)?.id)
                  }
                />
              </section>
              <section>
                <h3>实时视频 / 当前目标</h3>
                <Video label={t?.items[t.index]?.name || "现场巡视画面"} />
              </section>
              <section>
                <h3>当前执行上下文</h3>
                <dl>
                  <dt>任务</dt>
                  <dd>
                    <ObjectLink type="execution" id={t?.id}>
                      {t?.name || "当前无任务"}
                    </ObjectLink>
                  </dd>
                  <dt>业务点位</dt>
                  <dd>
                    <ObjectLink type="point" id={t?.items[t.index]?.id}>
                      {t?.items[t.index]?.name || "—"}
                    </ObjectLink>
                  </dd>
                  <dt>执行阶段</dt>
                  <dd>
                    <Badge>{stageOf(t)}</Badge>
                  </dd>
                  <dt>有效检测项</dt>
                  <dd>
                    {t?.done.length || 0} / {t?.items.length || 0}
                  </dd>
                  <dt>预计结束</dt>
                  <dd>{t ? timeAt(minutesLeft(t)) : "—"}</dd>
                  <dt>排队</dt>
                  <dd>
                    <ObjectLink type="queue" id={r.id}>
                      {queued.length} 项待执行
                    </ObjectLink>
                  </dd>
                </dl>
                <Btn
                  primary
                  disabled={!t}
                  onClick={() => go("execution", t?.id)}
                >
                  进入实时执行监控
                </Btn>
              </section>
            </div>
          </>
        )}
        {tab === "tasks" && (
          <>
            <Panel
              title="当前任务与待执行队列"
              extra={
                <Btn onClick={() => go("queue", r.id)}>管理机器人未来队列</Btn>
              }
            >
              {/* 与「设备巡检任务」列表同口径（任务 / 来源 / 状态），并保留队列专属的优先级、完成度、预计时段 */}
              <Table
                heads={["任务", "来源", "优先级", "状态", "完成度", "预计时段"]}
                rows={schedule(s, r)
                  .filter((w) => w.task)
                  .map((w) => [
                    <ObjectLink type="task-detail" id={w.task!.id}>
                      {w.task!.name}
                    </ObjectLink>,
                    w.task!.source,
                    w.task!.priority,
                    <Badge>{w.task!.state}</Badge>,
                    `${w.task!.done.length}/${w.task!.items.length}`,
                    `${timeAt(w.start)}—${timeAt(w.end)}`,
                  ])}
              />
            </Panel>
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
        {tab === "records" && (
          <Panel title="故障、接管与任务事件">
            <EventTimeline robotId={r.id} />
          </Panel>
        )}
      </>
    );
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
          {["全部区域", ...new Set(s.robots.map((r) => r.region))].map((x) => (
            <option key={x}>{x}</option>
          ))}
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
                    ST(st === "在线" ? "全部" : st);
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
            items={["新告警", "未确认", "处理中", "待复查"].map((x) => ({
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
                  <small>{r.region} · 查看能力与健康</small>
                </div>
                <span>→</span>
              </button>
            ))}
          {robots
            .filter((r) => {
              const m = s.maps.find((m) => m.id === r.mapId);
              return (
                m && (r.mapVersion !== m.version || r.pointSet !== m.pointSet)
              );
            })
            .map((r) => (
              <button
                className="attention"
                key={r.id}
                onClick={() => go("maps", r.mapId, "sync")}
              >
                <i className="severity amber" />
                <div>
                  <b>{r.id} 地图 / 点位版本不一致</b>
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
                onClick={() => go("execution", t.id)}
              >
                <i className="severity red" />
                <div>
                  <b>{t.failure || "任务执行失败"}</b>
                  <small>{t.name}</small>
                </div>
                <span>→</span>
              </button>
            ))}
          {s.results
            .filter(
              (r) =>
                r.status === "待复核" && tasks.some((t) => t.id === r.taskId),
            )
            .map((r) => (
              <button
                className="attention"
                key={r.id}
                onClick={() => go("review", r.id)}
              >
                <i className="severity blue" />
                <div>
                  <b>{r.item} · 等待人工复核</b>
                  <small>
                    {r.pointId} / {r.taskId}
                  </small>
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
                <small>预计 {timeAt(minutesLeft(t))} 结束</small>
              </div>
              <Btn primary onClick={() => go("execution", t.id)}>
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
