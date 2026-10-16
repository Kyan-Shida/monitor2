import { useState } from "react";
import { useStore } from "../data/store";
import { go, usePageSize, useViewState } from "../data/navigation";
import { pointOf, fmtTime, judgeOf, isAbnormal } from "../data/selectors";
import { Btn, Badge, Panel, Table, Field, Note, Empty, Modal } from "../components/UI";
import { Pager } from "../components/Business";
import type { Result } from "../data/types";
/**
 * 巡检报表：分析与报表 › 巡检报表
 * 按任务聚合的巡检结果报表，支持关键词 / 任务 / 状态筛选（默认展示"完成"任务），
 * 每行可勾选并「预览」查看该任务全部点位明细文档；**勾选任务后才出现「导出 PDF」**（仅 PDF，演示占位）。
 * 报表口径：有巡检结果的任务即进报表；「异常」列按 judgeOf 唯一判定口径统计
 *（异常即告警，明细可在告警事件页检查受理）；
 * 导出条件：该任务有巡检结果即可导出，异常结果照常入报表。
 */
export function InspectionReport() {
  const { s } = useStore();
  const [q, Q] = useViewState("report.q", ""),
    [taskF, TF] = useViewState("report.task", "全部"),
    [statusF, SF] = useViewState("report.status", "完成"),
    [pn, PN] = useViewState("report.page", 1);
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [pageSize, SETPAGESIZE] = usePageSize("report.size");
  // 选中任务（用于导出）：支持单选（勾一个）与多选（勾多个）
  const [selected, SETSEL] = useState<string[]>([]);
  // 多选模式：默认关闭；点顶部「多选」按钮才进入，此时才显示 checkbox 列和全选条
  const [multi, SETMULTI] = useState(false);
  // 筛选条件展开态：默认收起，点「筛选」才显示（与设备台账同款）
  const [qOpen, QOPEN] = useState(false);
  // 导出 / 预览弹窗：导出为演示占位（点击提示），预览为只读查看任务全部巡检结果明细
  const [exportOpen, EXPORT] = useState(false);
  const [previewId, PREVIEW] = useState<string | null>(null);

  // 有巡检结果的任务，按任务维度聚合
  const byTask = new Map<string, typeof s.results>();
  for (const r of s.results) {
    const g = byTask.get(r.taskId);
    if (g) g.push(r);
    else byTask.set(r.taskId, [r]);
  }
  /** 报表口径：有结果的任务即进报表（结果判定即结论，异常结果照常入报表） */
  const byTaskFinal = byTask;
  const taskOptions = s.tasks.filter((t) => byTaskFinal.has(t.id));
  const statuses = [
    "全部",
    ...Array.from(new Set(s.tasks.map((t) => t.state).filter(Boolean))),
  ];
  const groups = [...byTaskFinal.entries()]
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

  // 分页切片：筛选后页数可能变少，当前页一律 clamp 到有效范围
  const pages = Math.max(1, Math.ceil(groups.length / pageSize));
  const cur = Math.min(Math.max(1, pn), pages);
  const pageRows = groups.slice((cur - 1) * pageSize, cur * pageSize);

  const ids = groups.map(([id]) => id);
  /** 任务可导出条件：有巡检结果即可导出（异常结果如实入报表） */
  const canExportOf = (list: Result[]) => list.length > 0;
  /** 不可导出的原因（用于勾选框提示）：无结果 */
  const blockReasonOf = (list: Result[]) =>
    list.length ? "" : "无巡检结果，不可导出（可预览查看）";
  /** 当前筛选中可导出的任务：异常或未复核的不可导出（但可「预览」查看） */
  const exportableIds = ids.filter((id) => canExportOf(byTaskFinal.get(id) || []));
  const allSelected =
    exportableIds.length > 0 &&
    exportableIds.every((id) => selected.includes(id));
  const toggle = (id: string) =>
    SETSEL((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const selectAll = () => SETSEL(allSelected ? [] : exportableIds);
  const clearSel = () => SETSEL([]);
  // 导出范围：只导出勾选的任务（无勾选不显示导出按钮）
  const exportIds = selected.filter((id) =>
    canExportOf(byTaskFinal.get(id) || []),
  );
  const exportNames = exportIds.map(
    (id) => s.tasks.find((t) => t.id === id)?.name || id,
  );

  return (
    <>
      <Panel
        className="panel-filters-wrap"
        title="巡检结果报表"
        extra={
          <div className="actions">
            {/* 筛选：条件默认收起，点「筛选」才展开（与设备台账同款） */}
            <Btn onClick={() => QOPEN(!qOpen)}>
              {qOpen ? "收起筛选" : "筛选"}
            </Btn>
            <Btn
              onClick={() => {
                SETMULTI((m) => !m);
                SETSEL([]);
              }}
            >
              {multi ? "退出多选" : "多选"}
            </Btn>
            {multi && exportIds.length > 0 && (
              <Btn primary onClick={() => EXPORT(true)}>
                导出 PDF（{exportIds.length}）
              </Btn>
            )}
          </div>
        }
      >
        {qOpen && (
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
        )}
        {multi && (
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
        )}
        {!groups.length ? (
          <Empty>没有符合筛选条件的巡检任务</Empty>
        ) : (
          <Table
            heads={
              multi
                ? ["", "任务", "机器人", "结束时间", "检测项", "异常", "状态", "操作"]
                : ["任务", "机器人", "结束时间", "检测项", "异常", "状态", "操作"]
            }
            rows={pageRows.map(([taskId, list]) => {
              const t = s.tasks.find((x) => x.id === taskId);
              const abn = list.filter(isAbnormal).length;
              const canExport = canExportOf(list);
              const base = [
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
              return multi
                ? [
                    <input
                      type="checkbox"
                      aria-label={`选择 ${t?.name || taskId}`}
                      checked={selected.includes(taskId)}
                      disabled={!canExport}
                      title={canExport ? undefined : blockReasonOf(list)}
                      onChange={() => toggle(taskId)}
                    />,
                    ...base,
                  ]
                : base;
            })}
          />
        )}
        {!!groups.length && (
          <Pager
            page={cur}
            count={groups.length}
            size={pageSize}
            onChange={PN}
            onSize={(n) => {
              SETPAGESIZE(n);
              PN(1);
            }}
          />
        )}
      </Panel>
      {/* 巡检结果文档预览：只读查看该任务全部点位明细，版式仿报告文档 */}
      {previewId && (() => {
        const pt = s.tasks.find((t) => t.id === previewId);
        const plist = s.results.filter((x) => x.taskId === previewId);
        const abn = plist.filter(isAbnormal).length;
        return (
          <Modal
            title={`巡检结果报告 · ${pt?.name || previewId}`}
            wide
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
                      <Badge>{judgeOf(rr)}</Badge>
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
      {/* 导出占位：演示环境点击提示，生产环境将导出已勾选任务的巡检结果报告（仅 PDF） */}
      {exportOpen && (
        <Modal title="导出 PDF 报告" onClose={() => EXPORT(false)}>
          <Note>
            将导出 <b>{exportIds.length}</b> 个任务的「巡检结果报告」（PDF，按已勾选任务）：
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
