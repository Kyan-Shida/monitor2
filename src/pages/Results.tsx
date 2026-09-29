import { ResultRuleEvidence } from "../components/ResultRuleEvidence";
import { useState } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { pointOf, deviceCode, fmtTime } from "../data/selectors";
import { Btn, Badge, Panel, Table, Field, Note, Steps, Modal } from "../components/UI";
import { ObjectLink, Pager } from "../components/Business";
import { Video } from "../components/Video";
import { ResultTrend } from "../components/ResultTrend";
import type { Result } from "../data/types";
export function Results({ page, id }: { page: string; id?: string }) {
  const { s, act } = useStore();
  const [q, Q] = useViewState("results.q", ""),
    [taskF, TF] = useViewState("results.task", "全部"),
    [robotF, RF] = useViewState("results.robot", "全部"),
    [status, S] = useViewState("results.status", "全部"),
    [judgment, J] = useViewState("results.judgment", "全部"),
    [date, D] = useViewState("results.date", ""),
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
    const filtered = s.results.filter((r) => {
      const p = pointOf(s, r),
        t = s.tasks.find((t) => t.id === r.taskId);
      return (
        (!id || r.taskId === id) &&
        (taskF === "全部" || r.taskId === taskF) &&
        (robotF === "全部" || t?.robotId === robotF) &&
        [r.id, r.taskId, r.pointId, r.item, p?.device, p?.object, t?.robotId]
          .join(" ")
          .includes(q) &&
        (status === "全部" || r.status === status) &&
        (judgment === "全部" || (r.abnormal ? "异常" : "正常") === judgment) &&
        (!date ||
          r.time.includes(date) ||
          r.time.includes(date.replaceAll("-", "/")))
      );
    });
    // 筛选下拉的候选：仅列出「有巡检结果的任务 / 机器」，避免出现选了却查不到数据的空选项
    const taskOptions = s.tasks.filter((t) =>
      s.results.some((r) => r.taskId === t.id),
    );
    const robotIds = [
      ...new Set(taskOptions.map((t) => t.robotId).filter(Boolean)),
    ];
    const robotOptions = s.robots.filter((rb) => robotIds.includes(rb.id));
    // 按任务维度聚合：每个任务归为一组，组头展示任务与汇总，组内为该任务的检测项结果
    const byTask = new Map<string, Result[]>();
    for (const r of filtered) {
      const g = byTask.get(r.taskId);
      if (g) g.push(r);
      else byTask.set(r.taskId, [r]);
    }
    const groups = [...byTask.entries()].sort((a, b) => {
      const ka = s.tasks.find((t) => t.id === a[0])?.finishedAt || "";
      const kb = s.tasks.find((t) => t.id === b[0])?.finishedAt || "";
      return kb.localeCompare(ka);
    });
    // 任务作为外层：每页展示若干「任务行」，明细统一在「详情」弹窗的「表计识别」中查看
    const pageSize = 10;
    const pageGroups = groups.slice((pn - 1) * pageSize, pn * pageSize);
    return (
      <>
      <Panel title="巡检结果 · 业务检测记录">
        <div className="filter-bar result-query-filters">
          <Field label="关键词（设备 / 对象 / 检测项）">
            <input
              value={q}
              onChange={(e) => {
                Q(e.target.value);
                PN(1);
              }}
              placeholder="输入编号或业务名称"
            />
          </Field>
          <Field label="任务筛选">
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
          <Field label="机器筛选">
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
          <Field label="结果状态">
            <select
              value={status}
              onChange={(e) => {
                S(e.target.value);
                PN(1);
              }}
            >
              {["全部", "待复核", "已确认", "已识别", "无效"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="业务判断">
            <select
              value={judgment}
              onChange={(e) => {
                J(e.target.value);
                PN(1);
              }}
            >
              {["全部", "正常", "异常"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="采集日期">
            <input
              type="date"
              value={date}
              onChange={(e) => {
                D(e.target.value);
                PN(1);
              }}
            />
          </Field>
          <Btn
            onClick={() => {
              Q("");
              TF("全部");
              RF("全部");
              S("全部");
              J("全部");
              D("");
              PN(1);
            }}
          >
            重置筛选
          </Btn>
        </div>
        {!groups.length ? (
          <Note>没有符合筛选条件的巡检结果。</Note>
        ) : (
          <div className="task-toolbar">
            <span className="muted">
              共 {groups.length} 个任务 · {filtered.length} 条检测结果
            </span>
            <span className="muted">
              点任务行「详情」查看该任务的巡检结果详情与 AI 识别结果
            </span>
          </div>
        )}
        {pageGroups.map(([taskId, list]) => {
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
        })}
        <Pager
          page={pn}
          count={groups.length}
          size={pageSize}
          unit="个任务"
          onChange={PN}
        />
      </Panel>
      </>
    );
  }
  // 「结果详情」内置页：只读展示单个结果的证据、值链路、复核历史与关联告警；复核操作在「结果详情 / 复核」页完成
  if (page === "result-detail") {
    const rd = s.results.find((x) => x.id === id);
    if (!rd)
      return <Note>未找到该巡检结果，请从设备巡检档案或巡检结果列表进入。</Note>;
    const p = pointOf(s, rd),
      t = s.tasks.find((x) => x.id === rd.taskId);
    return (
      <>
        <div className="context-bar">
          <b>结果详情</b>
          <span className="bc-id">{rd.id}</span>
          <Badge>{rd.status === "待复核" ? "待判定" : rd.abnormal ? "异常" : "正常"}</Badge>
          <Badge>{rd.status}</Badge>
          <ObjectLink type="archive" id={p && deviceCode(p.device)}>
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
          <div className="actions">
            <Btn primary onClick={() => go("review", rd.id)}>
              进入复核
            </Btn>
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
        <ObjectLink type="archive" id={p && deviceCode(p.device)}>
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
    [filter, F] = useViewState("alarms.filter", "全部");
  const [modal, setModal] = useState<null | "result" | "task">(null);
  // 告警事件列表：支持从驾驶舱「今日告警」下钻（URL 带告警 id），高亮目标行并给出上下文
  if (page === "alarms") {
    const focus = id ? s.alarms.find((x) => x.id === id) : undefined;
    return (
      <Panel
        title="告警事件"
        extra={
          <select value={filter} onChange={(e) => F(e.target.value)}>
            {["全部", "待确认", "处理中", "待复查", "已恢复", "已关闭"].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
        }
      >
        {focus && (
          <div className="context-bar">
            <b>驾驶舱下钻</b>
            <span className="bc-id">{focus.id}</span>
            <Badge>{focus.level}</Badge>
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
            "告警名称",
            "等级",
            "业务点位",
            "任务",
            "开始时间",
            "状态",
            "操作",
          ]}
          rows={s.alarms
            .filter((a) => filter === "全部" || a.state === filter)
            .map((a) => [
              a.id === id ? <b className="hl-row">{a.name}</b> : a.name,
              <Badge>{a.level}</Badge>,
              <ObjectLink type="point" id={a.pointId} />,
              <ObjectLink type="task-detail" id={a.taskId} />,
              a.time,
              <Badge>{a.state}</Badge>,
              <Btn onClick={() => go("alarm", a.id)}>处置 / 复查</Btn>,
            ])}
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
          <Badge>{ad.state}</Badge>
          <ObjectLink type="archive" id={p && deviceCode(p.device)}>
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
              <ObjectLink type="archive" id={p && deviceCode(p.device)}>
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
                s.points.find((p) => p.id === a.pointId)?.device.split(" ")[0]
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
