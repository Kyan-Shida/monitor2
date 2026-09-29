import { useState } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { pointOf, fmtTime } from "../data/selectors";
import { Btn, Badge, Panel, Table, Field, Note, Empty, Modal } from "../components/UI";
/**
 * 巡检报表：分析与报表 › 巡检报表
 * 按任务聚合的巡检结果报表，支持关键词 / 任务 / 状态筛选（默认展示"完成"任务），
 * 每行可勾选并「预览」查看该任务全部点位明细文档；支持单选 / 多选任务后「导出 PDF / Word」（演示占位）。
 */
export function InspectionReport() {
  const { s } = useStore();
  const [q, Q] = useViewState("report.q", ""),
    [taskF, TF] = useViewState("report.task", "全部"),
    [statusF, SF] = useViewState("report.status", "完成");
  // 选中任务（用于导出）：支持单选（勾一个）与多选（勾多个）
  const [selected, SETSEL] = useState<string[]>([]);
  // 导出 / 预览弹窗：导出为演示占位（点击提示），预览为只读查看任务全部巡检结果明细
  const [exportOpen, EXPORT] = useState(false);
  const [exportKind, SETKIND] = useState<"PDF" | "Word">("PDF");
  const [previewId, PREVIEW] = useState<string | null>(null);

  // 有巡检结果的任务，按任务维度聚合
  const byTask = new Map<string, typeof s.results>();
  for (const r of s.results) {
    const g = byTask.get(r.taskId);
    if (g) g.push(r);
    else byTask.set(r.taskId, [r]);
  }
  const taskOptions = s.tasks.filter((t) => byTask.has(t.id));
  const statuses = [
    "全部",
    ...Array.from(new Set(s.tasks.map((t) => t.state).filter(Boolean))),
  ];
  const groups = [...byTask.entries()]
    .filter(([taskId]) => {
      const t = s.tasks.find((x) => x.id === taskId);
      return (
        (statusF === "全部" || t?.state === statusF) &&
        (taskF === "全部" || taskId === taskF) &&
        (q === "" ||
          [t?.name, taskId, t?.robotId].join(" ").includes(q))
      );
    })
    .sort((a, b) => {
      const ka = s.tasks.find((t) => t.id === a[0])?.finishedAt || "";
      const kb = s.tasks.find((t) => t.id === b[0])?.finishedAt || "";
      return kb.localeCompare(ka);
    });

  const ids = groups.map(([id]) => id);
  const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
  const toggle = (id: string) =>
    SETSEL((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const selectAll = () => SETSEL(allSelected ? [] : ids);
  const clearSel = () => SETSEL([]);
  // 导出范围：优先用勾选的任务；未勾选时默认导出当前筛选全部
  const exportIds = selected.length ? selected : ids;
  const exportNames = exportIds.map(
    (id) => s.tasks.find((t) => t.id === id)?.name || id,
  );

  return (
    <>
      <Panel
        title="巡检结果报表"
        extra={
          <div className="toolbar-actions">
            <Btn onClick={() => {
              SETKIND("PDF");
              EXPORT(true);
            }}>
              导出 PDF
            </Btn>
            <Btn onClick={() => {
              SETKIND("Word");
              EXPORT(true);
            }}>
              导出 Word
            </Btn>
          </div>
        }
      >
        <div className="report-tip">
          <Note>
            勾选任务后点「导出」生成报告（支持单选 / 多选）；不勾选则导出当前筛选全部。点「预览」查看该任务的完整结果文档。
          </Note>
        </div>
        <div className="filter-bar">
          <Field label="关键词（任务 / 编号 / 机器人）">
            <input
              value={q}
              onChange={(e) => Q(e.target.value)}
              placeholder="输入关键词"
            />
          </Field>
          <Field label="任务筛选">
            <select value={taskF} onChange={(e) => TF(e.target.value)}>
              <option value="全部">全部任务</option>
              {taskOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}（{t.id}）
                </option>
              ))}
            </select>
          </Field>
          <Field label="任务状态">
            <select value={statusF} onChange={(e) => SF(e.target.value)}>
              {statuses.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="select-bar">
          <span>
            已选 <b>{selected.length}</b> 个任务
          </span>
          <div className="toolbar-actions">
            <Btn onClick={selectAll}>
              {allSelected ? "取消全选" : "全选当前"}
            </Btn>
            {selected.length > 0 && (
              <Btn onClick={clearSel}>清空</Btn>
            )}
          </div>
        </div>
        {!groups.length ? (
          <Empty>没有符合筛选条件的巡检任务</Empty>
        ) : (
          <Table
            heads={["", "任务", "机器人", "结束时间", "检测项", "异常", "状态", "操作"]}
            rows={groups.map(([taskId, list]) => {
              const t = s.tasks.find((x) => x.id === taskId);
              const abn = list.filter((r) => r.abnormal).length;
              return [
                <input
                  type="checkbox"
                  aria-label={`选择 ${t?.name || taskId}`}
                  checked={selected.includes(taskId)}
                  onChange={() => toggle(taskId)}
                />,
                <>
                  <b>{t?.name || taskId}</b>
                  <small>{taskId}</small>
                </>,
                t?.robotId || "—",
                fmtTime(t?.finishedAt || t?.created),
                list.length,
                abn ? <Badge>{abn} 异常</Badge> : <Badge>0</Badge>,
                <Badge>{t?.state}</Badge>,
                <Btn onClick={() => PREVIEW(taskId)}>预览</Btn>,
              ];
            })}
          />
        )}
      </Panel>
      {/* 巡检结果文档预览：只读查看该任务全部点位明细，版式仿报告文档 */}
      {previewId && (() => {
        const pt = s.tasks.find((t) => t.id === previewId);
        const plist = s.results.filter((x) => x.taskId === previewId);
        const abn = plist.filter((r) => r.abnormal).length;
        return (
          <Modal
            title={`巡检结果报告 · ${pt?.name || previewId}`}
            drawer
            drawerWidth={700}
            onClose={() => PREVIEW(null)}
            footer={
              <>
                <Btn onClick={() => PREVIEW(null)}>关闭</Btn>
                <Btn
                  primary
                  onClick={() => {
                    PREVIEW(null);
                    go("results", previewId);
                  }}
                >
                  查看完整列表
                </Btn>
              </>
            }
          >
            <div className="report-doc">
              <header className="rd-head">
                <div>
                  <h4>智能机器巡检 · 巡检结果报告</h4>
                  <p className="rd-sub">
                    {pt?.name}（{previewId}）
                  </p>
                </div>
                <span className="rd-logo">巡检平台</span>
              </header>
              <div className="rd-meta">
                <span>机器人：{pt?.robotId || "—"}</span>
                <span>结束时间：{fmtTime(pt?.finishedAt || pt?.created)}</span>
                <span>生成时间：{new Date().toLocaleString("zh-CN")}</span>
                <span>数据范围：当前演示角色</span>
              </div>
              <div className="rd-summary">
                <div className="rd-stat">
                  <b>{plist.length}</b>
                  <span>检测项</span>
                </div>
                <div className="rd-stat ok">
                  <b>{plist.length - abn}</b>
                  <span>正常</span>
                </div>
                <div className="rd-stat warn">
                  <b>{abn}</b>
                  <span>异常</span>
                </div>
                <div className="rd-stat">
                  <b>{pt?.state}</b>
                  <span>任务状态</span>
                </div>
              </div>
              <h5 className="rd-sec">点位检测明细</h5>
              <Table
                heads={["设备 / 对象", "业务点位 / 检测项", "识别 → 最终值", "判断 / 状态", "采集时间"]}
                rows={plist.map((rr) => {
                  const pp = pointOf(s, rr);
                  return [
                    <>
                      {pp?.device}
                      <small>{pp?.object}</small>
                    </>,
                    <>
                      {pp?.name}
                      <small>{rr.item}</small>
                    </>,
                    `${rr.recognized} → ${rr.final} ${rr.unit}`,
                    <>
                      <Badge>{rr.abnormal ? "异常" : "正常"}</Badge>
                      <Badge>{rr.status}</Badge>
                    </>,
                    rr.time,
                  ];
                })}
              />
              <p className="rd-foot">
                本报告由演示环境生成，数据为模拟示例，仅供界面预览，不代表真实机器人采集结果。
              </p>
            </div>
          </Modal>
        );
      })()}
      {/* 导出占位：演示环境点击提示，生产环境将导出选中 / 当前筛选的巡检结果报告 */}
      {exportOpen && (
        <Modal title={`导出 ${exportKind} 报告`} onClose={() => EXPORT(false)}>
          <Note>
            将导出 <b>{exportIds.length}</b> 个任务的「巡检结果报告」（{exportKind}
            {selected.length ? "，按已勾选任务" : "，按当前筛选全部"}）：
            <ul className="export-list">
              {exportNames.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            演示环境暂不生成真实文件。生产环境将据此生成含任务概览、逐点位检测明细与证据链接的报告。
          </Note>
          <div className="actions">
            <Btn primary onClick={() => EXPORT(false)}>
              知道了
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
