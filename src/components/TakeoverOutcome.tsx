import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Badge, Btn, Panel, Table } from "./UI";

/** Retain the outcome after the active session disappears; evidence stays separate from control completion. */
export function TakeoverOutcome({ robotId, taskId }: { robotId?: string; taskId?: string }) {
  const { s } = useStore();
  const sessions = s.sessions.filter(x => (!robotId || x.robotId === robotId) && (!taskId || x.taskId === taskId));
  if (!sessions.length) return null;
  return <Panel title="人工接管记录与处理结果">
    {sessions.slice(0, 5).map(x => {
      const task = s.tasks.find(t => t.id === x.taskId);
      const evidence = s.results.filter(r => r.source.includes(x.id));
      const logs = s.logs.filter(l => l.object === x.id || l.detail.includes(x.id));
      const outcome = x.resumedAt ? "已恢复自主执行" : x.state === "已释放" ? (x.taskId ? (task?.state === "暂停" ? "已释放控制权 · 原任务待恢复" : "已释放控制权 · 请核对原任务状态") : "已释放控制权 · 无原任务") : x.state;
      return <section className="takeover-outcome" key={x.id}>
        <div className="context-bar"><b>{x.id}</b><Badge>{outcome}</Badge></div>
        <p>机器人 {x.robotId} · 原任务 {task?.name || x.taskId || "无"}{task && ` · 当前${task.state}`}</p>
        <p className="muted">申请：{x.startedAt ? new Date(x.startedAt).toLocaleString("zh-CN") : "历史记录未保存时间"} · 释放：{x.releasedAt ? new Date(x.releasedAt).toLocaleString("zh-CN") : "—"} · 恢复：{x.resumedAt ? new Date(x.resumedAt).toLocaleString("zh-CN") : "—"}</p>
        <p>本次采集 {evidence.length} 条证据，{evidence.filter(r => r.status === "待复核").length} 条待复核。人工证据独立留档，不覆盖自主巡检结果。</p>
        {!!evidence.length && <Table heads={["证据 / 检测项", "处理状态", "结果", "操作"]} rows={evidence.map(r => [r.id + " · " + r.item, <Badge>{r.status}</Badge>, r.final, <Btn onClick={() => go("review", r.id)}>查看与复核</Btn>])}/>}
        {task && <Btn onClick={() => go("execution", task.id)}>查看原任务执行状态</Btn>}
        <details><summary>操作回执（{logs.length} 条）</summary><Table heads={["时间", "操作反馈"]} rows={logs.map(l => [l.time, l.detail || l.action])}/></details>
      </section>;
    })}
  </Panel>;
}
