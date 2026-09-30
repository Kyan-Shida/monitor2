import { ResultRuleEvidence } from "../components/ResultRuleEvidence";
import { useState } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { pointOf, fmtTime, parseTime } from "../data/selectors";
import { archiveIdOf } from "../data/deviceMaster";
import { Btn, Badge, Panel, Table, Field, Note, Steps, Modal } from "../components/UI";
import { ObjectLink, Pager } from "../components/Business";
import { Video } from "../components/Video";
import { ResultTrend } from "../components/ResultTrend";
import type { Result } from "../data/types";
import { ALARM_CATEGORIES } from "../data/types";
export function Results({ page, id }: { page: string; id?: string }) {
  const { s, act } = useStore();
  const [q, Q] = useViewState("results.q", ""),
    [taskF, TF] = useViewState("results.task", "全部"),
    [robotF, RF] = useViewState("results.robot", "全部"),
    /** 业务状态：全部 / 异常 / 待复核 / 正常（与顶部范围芯片同源） */
    [status, S] = useViewState("results.status", "全部"),
    /** 时间范围：全部 / 今日 / 近7天 / 近30天 / 自定义 */
    [range, RG] = useViewState("results.range", "全部"),
    [from, FR] = useViewState("results.from", ""),
    [to, TO] = useViewState("results.to", ""),
    /** 业务对象：区域 / 设备（设备来自结果里的点位所属设备） */
    [areaF, AF] = useViewState("results.area", "全部"),
    [devF, DF] = useViewState("results.device", "全部"),
    /** 视图：按任务（执行视角）/ 按巡检点（设备视角） */
    [group, GR] = useViewState("results.group", "按任务"),
    /** 更多筛选（任务 / 机器人 / 结果原始状态）折叠 */
    [more, MO] = useViewState("results.more", false),
    [raw, RA] = useViewState("results.raw", "全部"),
    [pn, PN] = useViewState("results.page", 1);
  const [value, V] = useState(""),
    [reason, R] = useState(""),
    [conclusion, C] = useState("确认"),
    [finalState, FS] = useState(""),
    [evidence, E] = useState("照片");
  const r = s.results.find((x) => x.id === id) || s.results[0];
  /**
   * 提交复核：结论写入结果，并作为审计记录追加到该结果
   * @returns 无当前结果或未填写依据时不提交
   */
  function submitReview() {
    if (!r || !reason) return;
    act({
      type: "REVIEW",
      id: r.id,
      value: conclusion === "修正" ? value : r.final,
      reason,
      conclusion,
      finalState: finalState || (r.abnormal ? "异常" : "正常"),
    });
  }

  if (page === "results") {
    /** 时间范围判定：按采集时间 */
    const inRange = (x: string) => {
      const v = parseTime(x);
      if (Number.isNaN(v)) return true;
      if (range === "今日")
        return new Date(v).toDateString() === new Date().toDateString();
      if (range === "近7天") return Date.now() - v <= 7 * 864e5;
      if (range === "近30天") return Date.now() - v <= 30 * 864e5;
      if (range === "自定义")
        return (
          (!from || v >= parseTime(from + " 00:00")) &&
          (!to || v <= parseTime(to + " 23:59"))
        );
      return true;
    };
    /** 点位所属区域（取该点位所在地图的区域） */
    const areaOfPoint = (p?: { mapId: string }) =>
      s.maps.find((m) => m.id === p?.mapId)?.region || "—";
    /**
     * 业务范围：时间 + 区域 + 设备 + 关键词
     * @description 顶部范围芯片的计数与列表**同源**（都基于 scoped），避免"芯片数字与列表不一致"
     */
    const scoped = s.results.filter((r) => {
      const p = pointOf(s, r);
      return (
        (!id || r.taskId === id) &&
        inRange(r.time) &&
        (areaF === "全部" || areaOfPoint(p) === areaF) &&
        (devF === "全部" || p?.device === devF) &&
        (!q.trim() ||
          [r.id, r.taskId, r.pointId, r.item, p?.device, p?.object]
            .join(" ")
            .includes(q.trim()))
      );
    });
    /** 结果状态（业务判断三选一）+ 更多筛选（任务 / 机器人 / 原始状态） */
    const filtered = scoped.filter((r) => {
      const t = s.tasks.find((x) => x.id === r.taskId);
      return (
        (status === "全部" ||
          (status === "异常"
            ? r.abnormal
            : status === "待复核"
              ? r.status === "待复核"
              : !r.abnormal && r.status !== "待复核")) &&
        (taskF === "全部" || r.taskId === taskF) &&
        (robotF === "全部" || t?.robotId === robotF) &&
        (raw === "全部" || r.status === raw)
      );
    });
    /** 顶部范围芯片：点一下即作为「结果状态」筛选 */
    const chips = [
      { key: "全部", label: "检测结果", n: scoped.length },
      {
        key: "异常",
        label: "判定异常",
        n: scoped.filter((r) => r.abnormal).length,
      },
      {
        key: "待复核",
        label: "待复核",
        n: scoped.filter((r) => r.status === "待复核").length,
      },
      {
        key: "正常",
        label: "判定正常",
        n: scoped.filter((r) => !r.abnormal && r.status !== "待复核").length,
      },
    ];
    // 业务对象候选：只列结果里真实出现过的设备 / 区域，避免"选了却查不到数据"
    const devicesInResults = [
      ...new Set(s.results.map((r) => pointOf(s, r)?.device).filter(Boolean)),
    ] as string[];
    const areasInResults = [
      ...new Set(
        devicesInResults.map((dv) =>
          areaOfPoint(s.points.find((p) => p.device === dv)),
        ),
      ),
    ];
    // 更多筛选的候选：仅列出有巡检结果的任务 / 机器
    const taskOptions = s.tasks.filter((t) =>
      s.results.some((r) => r.taskId === t.id),
    );
    const robotIds = [
      ...new Set(taskOptions.map((t) => t.robotId).filter(Boolean)),
    ];
    const robotOptions = s.robots.filter((rb) => robotIds.includes(rb.id));
    // 两种业务视角：按任务（执行视角）/ 按巡检点（设备视角）
    const byTask = new Map<string, Result[]>();
    const byPoint = new Map<string, Result[]>();
    for (const r of filtered) {
      const a = byTask.get(r.taskId);
      if (a) a.push(r);
      else byTask.set(r.taskId, [r]);
      const b = byPoint.get(r.pointId);
      if (b) b.push(r);
      else byPoint.set(r.pointId, [r]);
    }
    const taskGroups = [...byTask.entries()].sort((a, b) =>
      (s.tasks.find((t) => t.id === b[0])?.finishedAt || "").localeCompare(
        s.tasks.find((t) => t.id === a[0])?.finishedAt || "",
      ),
    );
    const pointGroups = [...byPoint.entries()].sort(
      (a, b) => parseTime(b[1][0].time) - parseTime(a[1][0].time),
    );
    // 每页展示若干「任务 / 巡检点」行，明细统一在「详情」里查看
    const pageSize = 10;
    const pageTaskGroups = taskGroups.slice((pn - 1) * pageSize, pn * pageSize);
    const pagePointGroups = pointGroups.slice((pn - 1) * pageSize, pn * pageSize);
    const total = group === "按任务" ? taskGroups.length : pointGroups.length;
    return (
      <>
      <Panel
        title="巡检结果 · 业务检测记录"
        extra={
          <div className="segmented">
            {["按任务", "按巡检点"].map((x) => (
              <button
                key={x}
                className={group === x ? "active" : ""}
                onClick={() => {
                  GR(x);
                  PN(1);
                }}
              >
                {x}
              </button>
            ))}
          </div>
        }
      >
        {/* 业务范围芯片：点一下即按该状态筛（计数与下方列表同源，不用二次理解口径） */}
        <div className="result-scope">
          {chips.map((c) => (
            <button
              key={c.key}
              className={status === c.key ? "on" : ""}
              onClick={() => {
                S(c.key);
                PN(1);
              }}
            >
              <span>{c.label}</span>
              <b>{c.n}</b>
            </button>
          ))}
        </div>
        <div className="filter-bar result-query-filters">
          <Field label="时间范围">
            <select
              value={range}
              onChange={(e) => {
                RG(e.target.value);
                PN(1);
              }}
            >
              {["全部", "今日", "近7天", "近30天", "自定义"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          {range === "自定义" && (
            <>
              <Field label="起始日期">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    FR(e.target.value);
                    PN(1);
                  }}
                />
              </Field>
              <Field label="截止日期">
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    TO(e.target.value);
                    PN(1);
                  }}
                />
              </Field>
            </>
          )}
          <Field label="区域">
            <select
              value={areaF}
              onChange={(e) => {
                AF(e.target.value);
                PN(1);
              }}
            >
              {["全部", ...areasInResults].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="设备">
            <select
              value={devF}
              onChange={(e) => {
                DF(e.target.value);
                PN(1);
              }}
            >
              {["全部", ...devicesInResults].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="关键词（设备 / 点位 / 检测项）">
            <input
              value={q}
              onChange={(e) => {
                Q(e.target.value);
                PN(1);
              }}
              placeholder="输入编号或业务名称"
            />
          </Field>
          <Btn onClick={() => MO(!more)}>{more ? "收起筛选" : "更多筛选"}</Btn>
          <Btn
            onClick={() => {
              Q("");
              TF("全部");
              RF("全部");
              S("全部");
              RG("全部");
              FR("");
              TO("");
              AF("全部");
              DF("全部");
              RA("全部");
              PN(1);
            }}
          >
            重置筛选
          </Btn>
        </div>
        {/* 更多筛选：任务 / 机器人 / 结果原始状态（日常复核不常用，默认收起） */}
        {more && (
          <div className="filter-bar result-query-filters">
            <Field label="任务">
              <select
                value={taskF}
                onChange={(e) => {
                  TF(e.target.value);
                  PN(1);
                }}
              >
                <option value="全部">全部任务</option>
                {taskOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}（{t.id}）
                  </option>
                ))}
              </select>
            </Field>
            <Field label="机器人">
              <select
                value={robotF}
                onChange={(e) => {
                  RF(e.target.value);
                  PN(1);
                }}
              >
                <option value="全部">全部机器</option>
                {robotOptions.map((rb) => (
                  <option key={rb.id} value={rb.id}>
                    {rb.name}（{rb.id}）
                  </option>
                ))}
              </select>
            </Field>
            <Field label="结果原始状态">
              <select
                value={raw}
                onChange={(e) => {
                  RA(e.target.value);
                  PN(1);
                }}
              >
                {["全部", "待复核", "已确认", "已识别", "无效"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
          </div>
        )}
        {!total ? (
          <Note>
            没有符合筛选条件的巡检结果，可放宽时间范围或点「重置筛选」。
          </Note>
        ) : (
          <div className="task-toolbar">
            <span className="muted">
              {group === "按任务"
                ? `共 ${taskGroups.length} 个任务 · ${filtered.length} 条检测结果`
                : `共 ${pointGroups.length} 个巡检点 · ${filtered.length} 条检测结果`}
            </span>
            <span className="muted">
              {group === "按任务"
                ? "「详情」看该任务的 AI 识别结果与复核"
                : "「点位详情」看历史结果与判定规则"}
            </span>
          </div>
        )}
        {group === "按任务"
          ? pageTaskGroups.map(([taskId, list]) => {
          const t = s.tasks.find((x) => x.id === taskId);
          const abn = list.filter((r) => r.abnormal).length;
          const pend = list.filter((r) => r.status === "待复核").length;
          // 任务判断：该任务存在任一异常结果即判为「异常」，否则判为「正常」
          const ok = abn === 0;
          return (
            <div className="task-group" key={taskId}>
              {/* 任务行只作概要展示：结果明细统一在「详情」弹窗的「表计识别」中查看 */}
              <div
                className={"task-group-head" + (ok ? " ok" : " abn")}
              >
                <span className={"tg-flag" + (ok ? " ok" : " abn")} />
                <span className="tg-main">
                  <span className="tg-title">
                    <b>{t?.name || taskId}</b>
                    <span className={"tg-judge" + (ok ? " ok" : " abn")}>
                      {ok ? "正常" : `异常 ${abn}`}
                    </span>
                    {t && <Badge>{t.state}</Badge>}
                  </span>
                  <span className="tg-meta">
                    <span>{taskId}</span>
                    {t?.robotId && (
                      <>
                        <i>·</i>
                        <span>机器人 {t.robotId}</span>
                      </>
                    )}
                    <i>·</i>
                    <span>结束 {fmtTime(t?.finishedAt || t?.created)}</span>
                  </span>
                </span>
                <span className="tg-stats">
                  <span className="tg-stat">
                    检测 <b>{list.length}</b>
                  </span>
                  <span className={"tg-stat" + (pend ? " warn" : "")}>
                    待复核 <b>{pend}</b>
                  </span>
                </span>
                <span
                  className="tg-detail"
                  role="button"
                  title="进入该任务的巡检结果详情内置页（任务概要 + AI 识别结果 + 复核）"
                  onClick={() =>
                    go("result-view", taskId, undefined, { page: "results" })
                  }
                >
                  详情
                </span>
              </div>
            </div>
          );
        })
          : pagePointGroups.map(([pid, list]) => {
              const p = s.points.find((x) => x.id === pid);
              const abn = list.filter((r) => r.abnormal).length;
              const pend = list.filter((r) => r.status === "待复核").length;
              const ok = abn === 0;
              return (
                <div className="task-group" key={pid}>
                  <div className={"task-group-head" + (ok ? " ok" : " abn")}>
                    <span className={"tg-flag" + (ok ? " ok" : " abn")} />
                    <span className="tg-main">
                      <span className="tg-title">
                        <b>{p?.name || pid}</b>
                        <span className={"tg-judge" + (ok ? " ok" : " abn")}>
                          {ok ? "正常" : `异常 ${abn}`}
                        </span>
                        {p && <Badge>{p.state}</Badge>}
                      </span>
                      <span className="tg-meta">
                        <span>{pid}</span>
                        <i>·</i>
                        <span>{p?.device}</span>
                        <i>·</i>
                        <span>最近 {list[0]?.time}</span>
                      </span>
                    </span>
                    <span className="tg-stats">
                      <span className="tg-stat">
                        检测 <b>{list.length}</b>
                      </span>
                      <span className={"tg-stat" + (pend ? " warn" : "")}>
                        待复核 <b>{pend}</b>
                      </span>
                    </span>
                    <span
                      className="tg-detail"
                      role="button"
                      title="进入该巡检点详情（最近检测结果）"
                      onClick={() => go("point", pid)}
                    >
                      点位详情
                    </span>
                  </div>
                  {/* 最近 3 条读数：按巡检点看变化，不必逐个点开任务 */}
                  <div className="point-result-strip">
                    {list.slice(0, 3).map((r) => (
                      <span key={r.id}>
                        {r.time} · {r.final}
                        {r.unit}{" "}
                        <Badge>
                          {r.status === "待复核"
                            ? "待判定"
                            : r.abnormal
                              ? "异常"
                              : "正常"}
                        </Badge>
                      </span>
                    ))}
                    <span className="muted">共 {list.length} 条</span>
                  </div>
                </div>
              );
            })}
        <Pager
          page={pn}
          count={total}
          size={pageSize}
          unit={group === "按任务" ? "个任务" : "个巡检点"}
          onChange={PN}
        />
      </Panel>
      </>
    );
  }
  // 「结果详情」内置页 + 「结果详情 / 复核」页（review）：
  // review 与 result-detail 共用同一套证据 / 值链路 / 复核表单渲染；
  // 此前 review 无分支处理，侧边栏与「进入复核」按钮进入后为空白页（闭环断链，2026-09-30 修复）。
  // review 态默认聚焦第一条待复核结果，并可在页头下拉切换。
  if (page === "result-detail" || page === "review") {
    const isReview = page === "review";
    const pending = s.results.filter((x) => x.status === "待复核");
    const rd = isReview
      ? s.results.find((x) => x.id === id) || pending[0]
      : s.results.find((x) => x.id === id);
    if (!rd)
      return isReview ? (
        <Note>暂无巡检结果可复核。</Note>
      ) : (
        <Note>未找到该巡检结果，请从设备巡检档案或巡检结果列表进入。</Note>
      );
    const p = pointOf(s, rd),
      t = s.tasks.find((x) => x.id === rd.taskId);
    return (
      <>
        <div className="context-bar">
          <b>{isReview ? "结果详情 / 复核" : "结果详情"}</b>
          <span className="bc-id">{rd.id}</span>
          <Badge>{rd.status === "待复核" ? "待判定" : rd.abnormal ? "异常" : "正常"}</Badge>
          <Badge>{rd.status}</Badge>
          <ObjectLink type="archive" id={p && archiveIdOf(s, p.device)}>
            {p?.device}
          </ObjectLink>
          <ObjectLink type="point" id={rd.pointId}>
            {p?.name}
          </ObjectLink>
          <ObjectLink type="task-detail" id={rd.taskId}>
            {t?.name || rd.taskId}
          </ObjectLink>
          <ObjectLink type="robot" id={t?.robotId} />
          <span className="muted">采集 {rd.time}</span>
          {isReview && (
            <span className="muted">待复核 {pending.length} 条</span>
          )}
          <div className="actions">
            {isReview && pending.length > 0 && (
              <select
                aria-label="切换待复核结果"
                value={rd.id}
                onChange={(e) => go("review", e.target.value)}
              >
                {pending.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.id} · {x.item}
                  </option>
                ))}
              </select>
            )}
            {!isReview && (
              <Btn primary onClick={() => go("review", rd.id)}>
                进入复核
              </Btn>
            )}
          </div>
        </div>
        <div className="grid two">
          <Panel title="原始采集证据">
            <div className="segmented">
              {["照片", "红外", "视频", "音频", "传感器"].map((x) => (
                <button
                  key={x}
                  className={evidence === x ? "active" : ""}
                  onClick={() => E(x)}
                >
                  {x}
                </button>
              ))}
            </div>
            {evidence === "照片" || evidence === "视频" ? (
              <Video label={p?.name} live={false} />
            ) : (
              <Note>
                {evidence === "传感器"
                  ? `原始采集值：${rd.raw} ${rd.unit}`
                  : evidence === "红外"
                    ? p?.kind === "红外"
                      ? `热像测温结果 ${rd.raw} ${rd.unit}（演示数据）`
                      : "本条结果未关联红外证据。"
                    : "本条结果未关联音频文件。"}
              </Note>
            )}
            <p>
              采集时间 <b>{rd.time}</b>
            </p>
            <p>{rd.source}</p>
            <small>证据为演示示意；原始采集值独立留存。</small>
          </Panel>
          <Panel title="结果链路 · 原始 → 识别 → 最终">
            <dl>
              <dt>原始采集</dt>
              <dd>
                {rd.raw} {rd.unit}
              </dd>
              <dt>机器人本地识别</dt>
              <dd>
                {p?.kind}目标 · {p?.targetId}（演示）
              </dd>
              <dt>外部 AI 识别值</dt>
              <dd>
                {rd.recognized} {rd.unit} · 置信度{" "}
                {Math.round(rd.confidence * 100)}%
              </dd>
              <dt>平台规则判断依据</dt>
              <dd><ResultRuleEvidence result={rd} /></dd>
              <dt>最终值</dt>
              <dd className="big-number">
                {rd.final} {rd.unit}
              </dd>
              <dt>业务判断</dt>
              <dd>
                <Badge>{rd.status === "待复核" ? "待判定" : rd.abnormal ? "异常" : "正常"}</Badge>
              </dd>
              <dt>复核状态</dt>
              <dd>
                <Badge>{rd.status}</Badge>
              </dd>
            </dl>
            <ResultTrend
              results={s.results.filter(
                (x) => x.pointId === rd.pointId && x.item === rd.item,
              )}
            />
          </Panel>
        </div>
        <div className="grid two">
          <Panel title="复核历史">
            <Table
              heads={["时间", "结论", "最终值 / 状态", "依据"]}
              rows={rd.reviews.map((x) => [
                x.time,
                x.conclusion || "确认",
                `${x.value} / ${x.finalState || "—"}`,
                x.reason,
              ])}
            />
          </Panel>
          <Panel title="关联告警">
            <Table
              heads={["告警", "状态", "处置"]}
              rows={s.alarms
                .filter((a) => a.resultId === rd.id)
                .map((a) => [
                  a.name,
                  <Badge>{a.state}</Badge>,
                  <ObjectLink type="alarm" id={a.id}>
                    处置与复查 →
                  </ObjectLink>,
                ])}
            />
          </Panel>
        </div>
      </>
    );
  }
  if (!r) return <Note>尚无巡检结果</Note>;
  const p = pointOf(s, r),
    t = s.tasks.find((t) => t.id === r.taskId);
  return (
    <>
      <div className="context-bar">
        <ObjectLink type="archive" id={p && archiveIdOf(s, p.device)}>
          {p?.device}
        </ObjectLink>
        <ObjectLink type="point" id={r.pointId}>
          {p?.name}
        </ObjectLink>
        <ObjectLink type="task-detail" id={r.taskId} />
        <ObjectLink type="robot" id={t?.robotId} />
        <Badge>{r.status}</Badge>
        <span className="muted">采集 {r.time}</span>
      </div>
      <div className="result-workbench">
        <Panel title="原始采集证据">
          <div className="segmented">
            {["照片", "红外", "视频", "音频", "传感器"].map((x) => (
              <button
                key={x}
                className={evidence === x ? "active" : ""}
                onClick={() => E(x)}
              >
                {x}
              </button>
            ))}
          </div>
          {evidence === "照片" || evidence === "视频" ? (
            <Video label={p?.name} live={false} />
          ) : (
            <Note>
              {evidence === "传感器"
                ? `原始采集值：${r.raw} ${r.unit}`
                : evidence === "红外"
                  ? p?.kind === "红外"
                    ? `热像测温结果 ${r.raw} ${r.unit}（Mock 数据）`
                    : "本条结果未关联红外证据。"
                  : "本条结果未关联音频文件。"}
            </Note>
          )}
          <p>
            采集时间 <b>{r.time}</b>
          </p>
          <p>{r.source}</p>
          <small>证据为 Mock 示意；原始采集值独立留存。</small>
        </Panel>
        <Panel title="结果链路 · 原始 → 识别 → 最终">
          <dl>
            <dt>原始采集</dt>
            <dd>
              {r.raw} {r.unit}
            </dd>
            <dt>机器人本地识别</dt>
            <dd>
              {p?.kind}目标 · {p?.targetId}（Mock）
            </dd>
            <dt>外部 AI 识别值</dt>
            <dd>
              {r.recognized} {r.unit} · 置信度 {Math.round(r.confidence * 100)}%
            </dd>
            <dt>平台规则判断依据</dt>
            <dd><ResultRuleEvidence result={r} /></dd>
            <dt>最终值</dt>
            <dd className="big-number">
              {r.final} {r.unit}
            </dd>
            <dt>业务判断</dt>
            <dd>
              <Badge>{r.status === "待复核" ? "待判定" : r.abnormal ? "异常" : "正常"}</Badge>
            </dd>
            <dt>复核状态</dt>
            <dd>
              <Badge>{r.status}</Badge>
            </dd>
          </dl>
          <ResultTrend
            results={s.results.filter(
              (x) => x.pointId === r.pointId && x.item === r.item,
            )}
          />
        </Panel>
        <Panel title="人工复核">
          <Note>
            复核结论将追加到该结果的审计记录中，原始值与识别值一并保留以便追溯。
          </Note>
          <Field label="复核结论">
            <select value={conclusion} onChange={(e) => C(e.target.value)}>
              {["确认", "修正", "标记无效"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="最终值">
            <input
              value={value}
              disabled={conclusion !== "修正"}
              placeholder={r.final}
              onChange={(e) => V(e.target.value)}
            />
          </Field>
          <Field label="最终业务状态">
            <select
              value={finalState || (r.abnormal ? "异常" : "正常")}
              onChange={(e) => FS(e.target.value)}
            >
              <option>正常</option>
              <option>异常</option>
            </select>
          </Field>
          <Field label="复核依据 / 无效原因（必填）">
            <textarea value={reason} onChange={(e) => R(e.target.value)} />
          </Field>
          <Note>
            保留原始值与识别值，复核追加审计记录。标记无效会重新计算任务有效检测项。
          </Note>
          <div className="actions">
            <Btn primary disabled={!reason} onClick={submitReview}>
              提交复核
            </Btn>
          </div>
        </Panel>
      </div>
      <div className="grid two">
        <Panel title="复核历史">
          <Table
            heads={["时间", "结论", "最终值 / 状态", "依据"]}
            rows={r.reviews.map((x) => [
              x.time,
              x.conclusion || "确认",
              `${x.value} / ${x.finalState || "—"}`,
              x.reason,
            ])}
          />
        </Panel>
        <Panel title="关联告警">
          <Table
            heads={["告警", "状态", "处置"]}
            rows={s.alarms
              .filter((a) => a.resultId === r.id)
              .map((a) => [
                a.name,
                <Badge>{a.state}</Badge>,
                <ObjectLink type="alarm" id={a.id}>
                  处置与复查 →
                </ObjectLink>,
              ])}
          />
        </Panel>
      </div>
    </>
  );
}
export function Alarms({ page, id }: { page: string; id?: string }) {
  const { s, act } = useStore();
  const [note, N] = useState(""),
    [filter, F] = useViewState("alarms.filter", "全部"),
    [catF, CF] = useViewState("alarms.cat", "全部");
  const [modal, setModal] = useState<null | "result" | "task">(null);
  // 告警分级口径统一：紧急→red（需立即处置）· 重要→amber（需关注）· 一般→blue（提示）
  const levelTone = (lv: string): "red" | "amber" | "blue" | undefined =>
    lv === "紧急" ? "red" : lv === "重要" ? "amber" : lv === "一般" ? "blue" : undefined;
  const levelClass = (lv: string): string =>
    lv === "紧急" ? "lv-urgent" : lv === "重要" ? "lv-important" : lv === "一般" ? "lv-minor" : "";
  /** 闭环阶段：顺序即流程（异常触发 → 确认处置 → 复查 → 恢复 → 关闭） */
  const ALARM_PHASES = ["待确认", "处理中", "待复查", "已恢复", "已关闭"];
  /** 未闭环 = 仍需动作（已关闭才是闭环终点） */
  const openStates = ["待确认", "处理中", "待复查", "已恢复"];
  const alarmsOpen = s.alarms.filter((a) => openStates.includes(a.state));
  /** 分类范围（阶段条计数与列表同一份口径，点阶段即筛选） */
  const alarmsInCat = s.alarms.filter(
    (a) => catF === "全部" || a.category === catF,
  );
  const alarmsAll = alarmsInCat.filter(
    (a) => filter === "全部" || a.state === filter,
  );
  // 告警事件列表：支持从驾驶舱「今日告警」下钻（URL 带告警 id），高亮目标行并给出上下文
  if (page === "alarms") {
    const focus = id ? s.alarms.find((x) => x.id === id) : undefined;
    return (
      <Panel
        title="告警事件"
        extra={
          <>
            <select value={catF} onChange={(e) => CF(e.target.value)} title="按分类筛选">
              {["全部", ...ALARM_CATEGORIES].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <select value={filter} onChange={(e) => F(e.target.value)} title="按状态筛选">
              {["全部", "待确认", "处理中", "待复查", "已恢复", "已关闭"].map(
                (x) => (
                  <option key={x}>{x}</option>
                ),
              )}
            </select>
          </>
        }
      >
        {/* 闭环阶段条：点任一阶段即筛选（计数与本页同一份口径，不用二次理解） */}
        <div className="alarm-scope">
          {["全部", "待确认", "处理中", "待复查", "已恢复", "已关闭"].map((x) => (
            <button
              key={x}
              className={filter === x ? "on" : ""}
              onClick={() => F(x)}
            >
              {x === "已关闭" ? "已闭环" : x}
              <b>{alarmsInCat.filter((a) => x === "全部" || a.state === x).length}</b>
            </button>
          ))}
        </div>
        <p className="alarm-note">
          闭环：异常触发 → <b>确认处置</b>（可一键派单）→ <b>创建复查任务</b> →{" "}
          <b>复查恢复</b> → <b>人工关闭</b>；分级决定处置机制 ——
          <i className="alarm-lv lv-urgent">紧急</i> 立即派单 ·
          <i className="alarm-lv lv-important">重要</i> 限时确认 ·
          <i className="alarm-lv lv-minor">一般</i> 批量复核。
        </p>
        {focus && (
          <div className="context-bar">
            <b>驾驶舱下钻</b>
            <span className="bc-id">{focus.id}</span>
            <Badge tone={levelTone(focus.level)}>{focus.level}</Badge>
            <Badge>{focus.state}</Badge>
            <span>{focus.name}</span>
            <span className="muted">
              {focus.time} · {focus.pointId}
            </span>
            <div className="actions">
              <Btn primary onClick={() => go("alarm", focus.id)}>
                处置 / 复查
              </Btn>
            </div>
          </div>
        )}
        <Table
          heads={[
            "告警 / 来源",
            "等级",
            "关联对象",
            "闭环进度",
            "处置与工单",
            "操作",
          ]}
          rows={alarmsAll.map((a) => {
            const wo = s.workOrders.find((w) => w.alarmId === a.id);
            const idx = ALARM_PHASES.indexOf(a.state);
            return [
              <>
                {a.id === id ? (
                  <b className="hl-row">{a.name}</b>
                ) : (
                  a.name
                )}
                <small>
                  {a.id} · {a.time} ·{" "}
                  <span
                    className={
                      "alarm-cat " +
                      (a.category === "机器人" ? "cat-robot" : "cat-biz")
                    }
                  >
                    {a.category}
                  </span>
                  {a.taskId && (
                    <>
                      {" "}
                      · 任务 <ObjectLink type="task-detail" id={a.taskId} />
                    </>
                  )}
                </small>
              </>,
              <span className={"alarm-lv lv-" + levelClass(a.level)}>
                <i />
                {a.level}
              </span>,
              a.category === "机器人" ? (
                a.robotId ? (
                  <ObjectLink type="robot" id={a.robotId} />
                ) : (
                  "—"
                )
              ) : a.pointId ? (
                <ObjectLink type="point" id={a.pointId} />
              ) : (
                "—"
              ),
              // 闭环进度：5 段点阵 + 当前阶段（一眼看出卡在哪一环）
              <span className="alarm-phase" title={a.state}>
                {ALARM_PHASES.map((x, i) => (
                  <i key={x} className={i <= idx ? "on" : ""} />
                ))}
                <em>
                  {a.state} · {idx + 1}/{ALARM_PHASES.length}
                </em>
              </span>,
              <>
                {wo ? (
                  <>
                    {wo.id} · {wo.state}
                    <small>
                      SLA 剩余 {wo.slaLeft} 分钟
                      {wo.assignee ? ` · ${wo.assignee}` : " · 待派单"}
                    </small>
                  </>
                ) : a.reviewTask ? (
                  <>
                    复查任务 {a.reviewTask}
                    <small>{s.tasks.find((t) => t.id === a.reviewTask)?.state}</small>
                  </>
                ) : (
                  <>
                    尚未派单
                    <small>{a.handle || "确认后可直接一键派单"}</small>
                  </>
                )}
              </>,
              <Btn onClick={() => go("alarm", a.id)}>
                {a.state === "已关闭" ? "查看" : "处置 / 复查"}
              </Btn>,
            ];
          })}
        />
      </Panel>
    );
  }
  // 「告警详情」内置页（设备巡检档案目录下）：只读展示告警上下文与处置轨迹；处置 / 复查操作在「告警详情 / 复查」页完成
  if (page === "alarm-detail") {
    const ad = s.alarms.find((x) => x.id === id);
    if (!ad)
      return <Note>未找到该告警，请从设备巡检档案的关联告警进入。</Note>;
    const p = s.points.find((x) => x.id === ad.pointId);
    const t = s.tasks.find((x) => x.id === ad.taskId);
    const rd = s.results.find((x) => x.id === ad.resultId);
    return (
      <>
        <div className="context-bar">
          <b>告警详情</b>
          <span className="bc-id">{ad.id}</span>
          <Badge>{ad.level}</Badge>
          <span
            className={
              "alarm-cat " + (ad.category === "机器人" ? "cat-robot" : "cat-biz")
            }
          >
            {ad.category}
          </span>
          <Badge>{ad.state}</Badge>
          <ObjectLink type="archive" id={p && archiveIdOf(s, p.device)}>
            {p?.device}
          </ObjectLink>
          <ObjectLink type="point" id={ad.pointId}>
            {p?.name}
          </ObjectLink>
          <ObjectLink type="task-detail" id={ad.taskId} />
          <span className="muted">{ad.time}</span>
          <div className="actions">
            <Btn primary onClick={() => go("alarm", ad.id)}>
              进入处置 / 复查
            </Btn>
          </div>
        </div>
        <Steps
          items={["异常触发", "确认处置", "复查任务", "恢复确认", "关闭"]}
          current={["待确认", "处理中", "待复查", "已恢复", "已关闭"].indexOf(
            ad.state,
          )}
        />
        <div className="grid two">
          <Panel title="触发证据与业务上下文">
            <Video live={false} label={p?.name} />
            <p>
              设备{" "}
              <ObjectLink type="archive" id={p && archiveIdOf(s, p.device)}>
                {p?.device}
              </ObjectLink>{" "}
              · 点位 <ObjectLink type="point" id={ad.pointId} />
            </p>
            <p>
              执行机器人 <ObjectLink type="robot" id={t?.robotId} />
            </p>
            <p>
              触发结果：{rd?.raw} {rd?.unit} · {rd?.source}
            </p>
            <div className="actions">
              <Btn onClick={() => go("result-detail", ad.resultId)}>
                查看原始结果
              </Btn>
            </div>
          </Panel>
          <Panel title="处置轨迹">
            {ad.notes.length ? (
              ad.notes.map((x, i) => (
                <p className="event" key={i}>
                  {x}
                </p>
              ))
            ) : (
              <Note>尚无处置记录，点击「进入处置 / 复查」开始处理。</Note>
            )}
          </Panel>
        </div>
      </>
    );
  }
  const a = s.alarms.find((a) => a.id === id) || s.alarms[0];
  if (!a) return <Note>尚无告警。</Note>;
  const r = s.results.find((r) => r.id === a.resultId);
  const t = s.tasks.find((x) => x.id === a.taskId);
  return (
    <>
      <div className="context-bar">
        <b>{a.name}</b>
        <Badge>{a.level}</Badge>
        <span
          className={
            "alarm-cat " + (a.category === "机器人" ? "cat-robot" : "cat-biz")
          }
        >
          {a.category}
        </span>
        <Badge>{a.state}</Badge>
        <span>
          {a.id} · {a.time}
        </span>
      </div>
      <Steps
        items={["异常触发", "确认处置", "复查任务", "恢复确认", "关闭"]}
        current={["待确认", "处理中", "待复查", "已恢复", "已关闭"].indexOf(
          a.state,
        )}
      />
      <div className="grid two">
        <Panel title="触发证据与业务上下文">
          <Video
            live={false}
            label={s.points.find((p) => p.id === a.pointId)?.name}
          />
          <p>
            设备{" "}
            <ObjectLink
              type="archive"
              id={
                s.points.find((p) => p.id === a.pointId) &&
                archiveIdOf(s, s.points.find((p) => p.id === a.pointId)!.device)
              }
            >
              {s.points.find((p) => p.id === a.pointId)?.device}
            </ObjectLink>{" "}
            · 点位 <ObjectLink type="point" id={a.pointId} />
          </p>
          <p>
            执行机器人{" "}
            <ObjectLink
              type="robot"
              id={s.tasks.find((t) => t.id === a.taskId)?.robotId}
            />
          </p>
          <p>
            触发结果：{r?.raw} {r?.unit} · {r?.source}
          </p>
          <div className="actions">
            <Btn onClick={() => setModal("result")}>原始结果</Btn>
            <Btn onClick={() => setModal("task")}>来源任务</Btn>
          </div>
        </Panel>
        <Panel title="告警处置工作台">
          <Btn
            primary
            disabled={a.state !== "待确认"}
            onClick={() => act({ type: "ALARM_ACK", id: a.id })}
          >
            确认告警
          </Btn>
          <Field label="处置说明 / 关闭依据">
            <textarea
              value={note}
              onChange={(e) => N(e.target.value)}
              placeholder="例如：已检查压力调节，申请机器人复查确认"
            />
          </Field>
          <div className="actions">
            <Btn
              onClick={() =>
                act({ type: "ALARM_NOTE", id: a.id, reason: note })
              }
            >
              保存处置记录
            </Btn>
            <Btn
              primary
              disabled={!["处理中", "已恢复"].includes(a.state)}
              onClick={() =>
                act({ type: "RECHECK", id: a.id }, (n) =>
                  go(
                    "dispatch",
                    n.alarms.find((x) => x.id === a.id)?.reviewTask,
                  ),
                )
              }
            >
              创建复查任务
            </Btn>
            <Btn
              disabled={a.state !== "已恢复"}
              onClick={() =>
                act({ type: "ALARM_CLOSE", id: a.id, reason: note })
              }
            >
              关闭告警
            </Btn>
          </div>
          {a.reviewTask && (
            <Note>
              复查任务 {a.reviewTask} ·{" "}
              {s.tasks.find((t) => t.id === a.reviewTask)?.state}
              <div className="actions">
                <Btn onClick={() => go("dispatch", a.reviewTask)}>进入调度</Btn>
                <Btn onClick={() => go("execution", a.reviewTask)}>
                  执行监控
                </Btn>
                <Btn onClick={() => go("results", a.reviewTask)}>复查结果</Btn>
              </div>
            </Note>
          )}
          <h4>处置轨迹</h4>
          {a.notes.map((x, i) => (
            <p className="event" key={i}>
              {x}
            </p>
          ))}
        </Panel>
      </div>
      {modal && (
        <Modal
          title={modal === "result" ? "原始结果" : "来源任务"}
          drawer
          drawerWidth={720}
          onClose={() => setModal(null)}
        >
          {modal === "result"
            ? r
              ? (
                <div className="grid two">
                  <Panel title="结果概要">
                    <Field label="结果 ID">{r.id}</Field>
                    <Field label="判定">
                      <Badge>{r.abnormal ? "异常" : "正常"}</Badge>
                    </Field>
                    <Field label="状态">{r.status}</Field>
                    <Field label="检测项">{r.item}</Field>
                    <Field label="采集时间">{r.time}</Field>
                    <Field label="设备">
                      {s.points.find((p) => p.id === r.pointId)?.device}
                    </Field>
                    <Field label="点位">
                      {s.points.find((p) => p.id === r.pointId)?.name ??
                        r.pointId}
                    </Field>
                    <Field label="所属任务">{r.taskId}</Field>
                  </Panel>
                  <Panel title="识别与来源">
                    <Field label="触发结果">{r.raw} {r.unit} · {r.source}</Field>
                    <Field label="识别结果">{r.recognized} → 最终 {r.final}</Field>
                    <Field label="置信度">{Math.round(r.confidence * 100)}%</Field>
                  </Panel>
                </div>
              )
              : <Note>未找到对应的巡检结果（{a.resultId}）。</Note>
            : t
              ? (
                <div className="grid two">
                  <Panel title="任务概要">
                    <Field label="任务 ID">{t.id}</Field>
                    <Field label="名称">{t.name}</Field>
                    <Field label="来源">{t.source}</Field>
                    <Field label="优先级"><Badge>{t.priority}</Badge></Field>
                    <Field label="类型">{t.taskType}</Field>
                    <Field label="状态"><Badge>{t.state}</Badge></Field>
                  </Panel>
                  <Panel title="执行与关联">
                    <Field label="原子动作">{t.atomicActions.join("、")}</Field>
                    <Field label="执行机器人">{t.robotId}</Field>
                    <Field label="关联计划">
                      {t.planId
                        ? `${t.planId}${t.planVersion ? `（v${t.planVersion}）` : ""}`
                        : "—"}
                    </Field>
                    <Field label="触发告警">{t.alarmId ?? "—"}</Field>
                    <Field label="创建时间">{t.created}</Field>
                    <Field label="开始 / 结束">{t.startedAt ?? "—"} / {t.finishedAt ?? "—"}</Field>
                  </Panel>
                </div>
              )
              : <Note>未找到对应的任务（{a.taskId}）。</Note>}
        </Modal>
      )}
    </>
  );
}
