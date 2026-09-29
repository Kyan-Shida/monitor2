import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { deviceCode, pointOf, terminal, fmtTime } from "../data/selectors";
import { Panel, Table, Badge, Note } from "../components/UI";
import { ObjectLink } from "../components/Business";
import { ResultTrend } from "../components/ResultTrend";
export function DeviceArchive({ id }: { id?: string; tab?: string }) {
  const { s } = useStore();
  const devices = [...new Set(s.points.map((p) => p.device))];
  const device = devices.find((x) => deviceCode(x) === id) || devices[0];
  const points = s.points.filter((p) => p.device === device),
    results = s.results.filter((r) => pointOf(s, r)?.device === device),
    alarms = s.alarms.filter((a) => points.some((p) => p.id === a.pointId)),
    tasks = s.tasks.filter((t) => t.items.some((p) => p.device === device));
  const [tab, T] = useViewState("archive." + device, "检测对象"),
    [pid, P] = useViewState("archive.point." + device, points[0]?.id || ""),
    [srcF, SF] = useViewState("archive.tasks.src." + device, "全部"),
    [robotF, RF] = useViewState("archive.tasks.robot." + device, "全部"),
    [stateF, STF] = useViewState("archive.tasks.state." + device, "全部"),
    [taskQ, TQ] = useViewState("archive.tasks.q." + device, ""),
    [fromD, FD] = useViewState("archive.tasks.from." + device, ""),
    [toD, TD] = useViewState("archive.tasks.to." + device, "");
  // 设备巡检任务筛选：来源 / 机器人 / 状态三个下拉 + 任务名称/编号关键词，选项从本设备任务动态派生
  const taskSrcOpts = ["全部", ...new Set(tasks.map((t) => t.source))];
  const taskRobotOpts = [
    "全部",
    "未分配",
    ...new Set(tasks.map((t) => t.robotId).filter(Boolean)),
  ];
  const taskStateOpts = ["全部", ...new Set(tasks.map((t) => t.state))];
  const taskRows = tasks.filter((t) => {
    if (taskQ && !(t.name + t.id).includes(taskQ)) return false;
    if (srcF !== "全部" && t.source !== srcF) return false;
    if (robotF !== "全部" && (t.robotId || "未分配") !== robotF) return false;
    if (stateF !== "全部" && t.state !== stateF) return false;
    // 时间区间：按任务结束时间比对，未结束的任务回落到生成时间（YYYY-MM-DD 可直接字符串比较）
    const day = (t.finishedAt || t.created).slice(0, 10);
    if (fromD && day < fromD) return false;
    if (toD && day > toD) return false;
    return true;
  });
  return (
    <>
      <div className="context-bar">
        <b>设备档案</b>
        <select
          aria-label="档案设备"
          value={deviceCode(device)}
          onChange={(e) => go("archive", e.target.value)}
        >
          {devices.map((x) => (
            <option key={x} value={deviceCode(x)}>
              {x}
            </option>
          ))}
        </select>
        <span>
          {points.length} 个检测对象 · {results.length} 条结果 · {alarms.length}{" "}
          个关联告警
        </span>
      </div>
      <div className="object-summary">
        <h2>{device}</h2>
        <p>
          所属区域：{s.maps.find((m) => m.id === points[0]?.mapId)?.region}
          　设备编码：{deviceCode(device)}
        </p>
        <small>按设备聚合对象、检测项、历史证据、告警与巡检任务。</small>
      </div>
      <div className="local-tabs">
        {["检测对象", "历史结果", "关联告警", "采集证据", "巡检任务"].map(
          (x) => (
            <button
              key={x}
              className={tab === x ? "active" : ""}
              onClick={() => T(x)}
            >
              {x}
            </button>
          ),
        )}
      </div>
      {tab === "检测对象" ? (
        <>
          <Panel title="设备检测对象与最新结果">
            <Table
              heads={[
                "检测对象",
                "业务点位",
                "检测项",
                "最新值",
                "最新检测时间",
                "状态",
                "结果",
              ]}
              rows={points.map((p) => {
                const r = results.find((x) => x.pointId === p.id);
                return [
                  p.object,
                  <ObjectLink type="point" id={p.id}>
                    {p.name}
                  </ObjectLink>,
                  p.item,
                  r ? `${r.final} ${r.unit}` : "尚未检测",
                  r?.time || "—",
                  <Badge>{r?.status || p.state}</Badge>,
                  r ? (
                    <ObjectLink type="review" id={r.id} to="result-detail">
                      {r.id}
                    </ObjectLink>
                  ) : (
                    "无结果"
                  ),
                ];
              })}
            />
          </Panel>
          <Panel
            title="设备历史趋势"
            extra={
              <select value={pid} onChange={(e) => P(e.target.value)}>
                {points.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.object} · {p.item}
                  </option>
                ))}
              </select>
            }
          >
            <ResultTrend results={results.filter((r) => r.pointId === pid)} />
          </Panel>
        </>
      ) : tab === "历史结果" || tab === "采集证据" ? (
        <Panel title={tab}>
          <Table
            heads={["时间", "检测项", "值 / 来源", "判断", "证据详情"]}
            rows={results.map((r) => [
              r.time,
              r.item,
              tab === "采集证据" ? r.source : `${r.final} ${r.unit}`,
              <Badge>{r.abnormal ? "异常" : "正常"}</Badge>,
              <ObjectLink type="review" id={r.id} to="result-detail" />,
            ])}
          />
        </Panel>
      ) : tab === "关联告警" ? (
        <Panel title="设备告警">
          <Table
            heads={["告警", "状态", "来源任务", "处置"]}
            rows={alarms.map((a) => [
              a.name,
              <Badge>{a.state}</Badge>,
              <ObjectLink type="task-detail" id={a.taskId} />,
              <ObjectLink type="alarm" id={a.id} to="alarm-detail">
                查看详情
              </ObjectLink>,
            ])}
          />
        </Panel>
      ) : (
        <Panel
          className="panel-filters-wrap"
          title="设备巡检任务"
          extra={
            <div className="actions">
              <label className="inline-filter">
                <span>来源：</span>
                <select value={srcF} onChange={(e) => SF(e.target.value)}>
                  {taskSrcOpts.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="inline-filter">
                <span>机器人：</span>
                <select value={robotF} onChange={(e) => RF(e.target.value)}>
                  {taskRobotOpts.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="inline-filter">
                <span>状态：</span>
                <select value={stateF} onChange={(e) => STF(e.target.value)}>
                  {taskStateOpts.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
              {/* 时间维度：按任务结束时间筛选，未结束任务回落到生成时间 */}
              <label
                className="inline-filter"
                title="按任务结束时间筛选；未结束的任务按生成时间"
              >
                <span>时间：</span>
                <input
                  type="date"
                  aria-label="起始日期"
                  value={fromD}
                  onChange={(e) => FD(e.target.value)}
                />
                <span>~</span>
                <input
                  type="date"
                  aria-label="结束日期"
                  value={toD}
                  onChange={(e) => TD(e.target.value)}
                />
              </label>
              <input
                placeholder="搜索任务名称 / 编号"
                value={taskQ}
                onChange={(e) => TQ(e.target.value)}
              />
            </div>
          }
        >
          <Table
            heads={["任务", "来源", "机器人", "状态", "时间（生成 / 结束）", "回放"]}
            rows={taskRows.map((t) => [
              <ObjectLink type="task-detail" id={t.id}>
                {t.name}
              </ObjectLink>,
              t.source,
              <ObjectLink type="robot" id={t.robotId} />,
              <Badge>{t.state}</Badge>,
              <>
                <span>{fmtTime(t.created)}</span>
                <small className="cell-muted">
                  {t.finishedAt ? `结束 ${fmtTime(t.finishedAt)}` : "尚未结束"}
                </small>
              </>,
              // 仅已结束任务存在执行回溯，才提供过程回放入口；未结束任务无可回放内容
              terminal.includes(t.state) ? (
                <ObjectLink type="replay" id={t.id} to="replay-detail">
                  过程回放
                </ObjectLink>
              ) : (
                <span className="muted">—</span>
              ),
            ])}
          />
        </Panel>
      )}
    </>
  );
}
