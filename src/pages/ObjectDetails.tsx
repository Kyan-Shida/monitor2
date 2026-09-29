import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { ObjectLink, Pager } from "../components/Business";
import { ReplayDetail } from "../components/ReplayDetail";
import { ResultView } from "../components/ResultView";
import { Panel, Table, Badge, Btn, Note } from "../components/UI";
import { TaskDetailPanel } from "../components/TaskDetailPanel";
import { stageOf, fmtTime, queueFor, terminal } from "../data/selectors";
import { archiveIdOf } from "../data/deviceMaster";
export function ObjectDetails({ page, id }: { page: string; id?: string }) {
  const { s } = useStore();
  const [replayKw, setReplayKw] = useState("");
  const [replayFilter, setReplayFilter] = useState("all");
  const [replayFrom, setReplayFrom] = useState("");
  const [replayTo, setReplayTo] = useState("");
  const [replayPage, setReplayPage] = useState(1);
  if (page === "point") {
    const p = s.points.find((p) => p.id === id);
    if (!p) return <Note>请选择具体巡检点。</Note>;
    const results = s.results.filter((r) => r.pointId === p.id);
    return (
      <>
        <div className="object-summary object-bar">
          <div className="os-title">
            <strong>
              {p.id} · {p.name}
            </strong>
            <Badge>{p.state}</Badge>
          </div>
          <span className="os-meta">
            <span>
              <i>所属设备</i>
              <ObjectLink type="archive" id={archiveIdOf(s, p.device)}>
                {p.device}
              </ObjectLink>
            </span>
            <span>
              <i>巡检项</i>
              {p.inspectItems?.length || 1} 项
            </span>
            <span>
              <i>点位版本</i>v{p.version}
            </span>
          </span>
          <div className="actions os-actions">
            <Btn onClick={() => go("point-edit", p.id)}>编辑巡检点</Btn>
          </div>
        </div>
        {/* 巡检点详情只展示最近检测结果：判定规则 / 告警设置在业务巡检目标里维护 */}
        <Panel
          title="最近检测结果"
          extra={<span>{results.length} 条</span>}
        >
          {results.length ? (
            <Table
              heads={["任务", "时间", "结果", "判定", "详情"]}
              rows={results.slice(0, 10).map((r) => [
                <ObjectLink
                  type="replay"
                  id={r.taskId}
                  to="replay-detail"
                  from={{ page: "point", id: p.id }}
                />,
                r.time,
                r.final + r.unit,
                <Badge>
                  {r.status === "待复核" ? "待判定" : r.abnormal ? "异常" : "正常"}
                </Badge>,
                <ObjectLink type="review" id={r.id} />,
              ])}
            />
          ) : (
            <Note>该巡检点还没有检测结果。</Note>
          )}
        </Panel>
      </>
    );
  }
  // 「巡检结果详情」内置页（设备巡检档案目录下，非弹窗）：任务概要 + AI 识别结果（表计识别 / 云台动作）+ 复核
  if (page === "result-view") {
    const tk = s.tasks.find((x) => x.id === id);
    if (!tk) return <Note>未找到该任务。</Note>;
    return <ResultView task={tk} />;
  }
  // 「执行回溯」内置页（设备巡检档案目录下）：与「巡检结果详情」同版式——
  // 左侧「可见光 + 红外」双画面 + 导航地图（点位与巡检路径），右侧任务汇总 + 巡检结果 / 风险记录 / 执行事件
  if (page === "replay-detail") {
    const tk = s.tasks.find((x) => x.id === id);
    if (!tk) return <Note>未找到该任务。</Note>;
    return <ReplayDetail task={tk} />;
  }
  const t =
    s.tasks.find((t) => t.id === id) ||
    s.tasks.find((t) => t.state === "执行中") ||
    s.tasks[0];
  // 执行回溯：独立主从视图——左侧已结束任务列表（支持搜索/状态/时间筛选/分页），右侧选中后的记录详情
  if (page === "replay") {
    const ended = s.tasks.filter((x) => terminal.includes(x.state));
    const states = Array.from(new Set(ended.map((x) => x.state)));
    const q = replayKw.trim().toLowerCase();
    // 以结束日期（YYYY-MM-DD）做区间比对，无结束时间的任务不参与时间过滤
    const inRange = (fin?: string) => {
      if (!fin) return true;
      const d = fin.slice(0, 10);
      if (replayFrom && d < replayFrom) return false;
      if (replayTo && d > replayTo) return false;
      return true;
    };
    const filtered = ended.filter(
      (x) =>
        (replayFilter === "all" || x.state === replayFilter) &&
        (!q || x.id.toLowerCase().includes(q) || x.name.toLowerCase().includes(q)) &&
        inRange(x.finishedAt),
    );
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const setRange = (days: number | null) => {
      if (days === null) {
        setReplayFrom("");
        setReplayTo("");
      } else {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - days);
        setReplayTo(ymd(to));
        setReplayFrom(ymd(from));
      }
      setReplayPage(1);
    };
    const size = 6;
    const pages = Math.max(1, Math.ceil(filtered.length / size));
    const curPage = Math.min(replayPage, pages);
    const pageItems = filtered.slice((curPage - 1) * size, curPage * size);

    const picked = s.tasks.find((x) => x.id === id);
    const cur = picked && terminal.includes(picked.state) ? picked : ended[0];
    return (
      <div className="replay-layout">
        <Panel title="任务回溯列表">
          <div className="replay-tools">
            <input
              className="filter-input"
              placeholder="搜索任务编号 / 名称"
              value={replayKw}
              onChange={(e) => {
                setReplayKw(e.target.value);
                setReplayPage(1);
              }}
            />
            <select
              className="filter-select"
              value={replayFilter}
              onChange={(e) => {
                setReplayFilter(e.target.value);
                setReplayPage(1);
              }}
            >
              <option value="all">全部状态</option>
              {states.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
          <div className="replay-time">
            <button type="button" className="chip" onClick={() => setRange(7)}>
              近7天
            </button>
            <button type="button" className="chip" onClick={() => setRange(30)}>
              近30天
            </button>
            <button type="button" className="chip" onClick={() => setRange(null)}>
              全部时间
            </button>
            <span className="rt-field">
              起
              <input
                type="date"
                className="filter-date"
                value={replayFrom}
                onChange={(e) => {
                  setReplayFrom(e.target.value);
                  setReplayPage(1);
                }}
              />
            </span>
            <span className="rt-field">
              止
              <input
                type="date"
                className="filter-date"
                value={replayTo}
                onChange={(e) => {
                  setReplayTo(e.target.value);
                  setReplayPage(1);
                }}
              />
            </span>
          </div>
          {!filtered.length && (
            <Note>没有符合搜索 / 状态 / 时间筛选条件的已结束任务。</Note>
          )}
          <div className="replay-list">
            {pageItems.map((x) => (
              <button
                key={x.id}
                type="button"
                className={"replay-item" + (cur?.id === x.id ? " selected" : "")}
                onClick={() => go("replay", x.id)}
              >
                <span className="ri-row">
                  <b>{x.id}</b>
                  <Badge>{x.state}</Badge>
                </span>
                <span className="ri-name">{x.name}</span>
                <span className="ri-time">结束 {fmtTime(x.finishedAt)}</span>
              </button>
            ))}
          </div>
          <Pager page={curPage} count={filtered.length} size={size} onChange={setReplayPage} />
        </Panel>
        <div className="replay-detail">
          {cur ? (
            <ReplayDetail task={cur} />
          ) : (
            <Note>请选择左侧已结束的任务，查看其执行回溯记录。</Note>
          )}
        </div>
      </div>
    );
  }
  // 详情内容已抽到 components/TaskDetailPanel.tsx：内置页与任务列表的详情抽屉共用同一实现
  return <TaskDetailPanel task={t} />;
}
