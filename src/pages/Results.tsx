import { ResultRuleEvidence } from "../components/ResultRuleEvidence";
import { ResultReviewDrawer } from "../components/ResultReviewDrawer";
import { useEffect, useState } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import {
  pointOf,
  fmtTime,
  parseTime,
  judgeOf,
  isAbnormal,
  isPending,
} from "../data/selectors";
import { archiveIdOf } from "../data/deviceMaster";
import { metricValue } from "../data/metrics";
import { Btn, Badge, Panel, Table, Field, Note, Steps, Modal } from "../components/UI";
import { ObjectLink, Pager } from "../components/Business";
import { Video } from "../components/Video";
import { ResultTrend } from "../components/ResultTrend";
import type { Result } from "../data/types";
import { ALARM_CATEGORIES } from "../data/types";
export function Results({ page, id }: { page: string; id?: string }) {
  const { s, act } = useStore();
  const [q, Q] = useViewState("results.q", ""),
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
    [pn, PN] = useViewState("results.page", 1);
  /** 结果详情（白盒）内置页：采集证据种类切换 */
  const [evidence, E] = useState("照片");
  /** 人工复核抽屉：复核入口（工作台待办 / 详情页行内「复核」/ review 深链）统一以抽屉打开 */
  const [reviewId, setReviewId] = useState<string | null>(null);
  /** 结果详情（白盒）内置页里发起的人工复核 */
  const [detailReview, setDetailReview] = useState<string | null>(null);
  // 深链 / 外部入口直达 review：严格按 URL 上的结果 ID 打开抽屉，
  // 没有 ID（或 ID 查不到）就不打开，绝不退化成"第一条待复核"
  useEffect(() => {
    setReviewId(page === "review" && id ? id : null);
  }, [page, id]);
  /** 关闭复核抽屉：从 review 路由进来时退回结果查询列表，避免路由停在已无页面的状态 */
  const closeReview = () => {
    setReviewId(null);
    if (page === "review") go("results");
  };

  if (page === "results" || page === "review") {
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
    /** 结果状态（业务判断三选一）+ 机器人（任务 / 原始状态等低频维度不再单列筛选行） */
    const filtered = scoped.filter((r) => {
      const t = s.tasks.find((x) => x.id === r.taskId);
      return (
        (status === "全部" ||
          (status === "异常"
            ? isAbnormal(r)
            : status === "待复核"
              ? isPending(r)
              : judgeOf(r) === "正常")) &&
        (robotF === "全部" || t?.robotId === robotF)
      );
    });
    /** 顶部范围芯片：点一下即作为「结果状态」筛选（判定口径与列表、详情页同源） */
    const chips = [
      { key: "全部", label: "检测结果", n: scoped.length },
      {
        key: "异常",
        label: "判定异常",
        n: scoped.filter(isAbnormal).length,
      },
      {
        key: "待复核",
        label: "待复核",
        n: scoped.filter(isPending).length,
      },
      {
        key: "正常",
        label: "判定正常",
        n: scoped.filter((r) => judgeOf(r) === "正常").length,
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
    // 机器人候选：只列「有巡检结果的任务」实际用到的机器，避免选了却查不到数据
    const taskOptions = s.tasks.filter((t) =>
      s.results.some((r) => r.taskId === t.id),
    );
    const robotIds = [
      ...new Set(taskOptions.map((t) => t.robotId).filter(Boolean)),
    ];
    const robotOptions = s.robots.filter((rb) => robotIds.includes(rb.id));
    // 两种业务视角：按任务（执行视角）/ 按巡检点（设备视角）
    // filtered 只决定"哪些任务 / 巡检点入列表"；行内统计一律取该对象的**全量**结果，
    // 否则筛选后列表与「详情」页的数字必然对不上
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
    // 全量分组：与「巡检结果详情 / 巡检点详情」页取数完全一致
    const fullByTask = new Map<string, Result[]>();
    const fullByPoint = new Map<string, Result[]>();
    for (const r of s.results) {
      const a = fullByTask.get(r.taskId);
      if (a) a.push(r);
      else fullByTask.set(r.taskId, [r]);
      const b = fullByPoint.get(r.pointId);
      if (b) b.push(r);
      else fullByPoint.set(r.pointId, [r]);
    }
    /**
     * 行内统计与判定：按该任务 / 巡检点的全量结果算，异常只算"已判定异常"
     * @param key 任务 ID 或巡检点 ID
     * @param full 全量分组表
     * @returns 检测数、异常数、待复核数与该行是否整体正常
     */
    const rowStat = (key: string, full: Map<string, Result[]>) => {
      const all = full.get(key) || [];
      const abn = all.filter(isAbnormal).length;
      return {
        total: all.length,
        abn,
        pend: all.filter(isPending).length,
        ok: abn === 0,
      };
    };
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
        title="巡检结果 · 历史查询与追溯"
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
        {/* RES-01：本页只做历史查询 / 追溯；异常 vs 告警口径压成一行，不再占整块首屏 */}
        <p className="res-hint">
          <b>异常</b> = 机器人判定不确定、需人工复核；<b>告警</b> = 触发阈值 / 规则、需处置。日常待办在「工作台 · 待我处理」，本页只做历史查询与追溯。
        </p>
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
          <Btn
            onClick={() => {
              Q("");
              RF("全部");
              S("全部");
              RG("全部");
              FR("");
              TO("");
              AF("全部");
              DF("全部");
              PN(1);
            }}
          >
            重置筛选
          </Btn>
        </div>
        {!total ? (
          <Note>
            没有符合筛选条件的巡检结果，可放宽时间范围或点「重置筛选」。
          </Note>
        ) : (
          <div className="task-toolbar">
            <span className="muted">
              {group === "按任务"
                ? `共 ${taskGroups.length} 个任务 · 当前筛选命中 ${filtered.length} 条检测结果`
                : `共 ${pointGroups.length} 个巡检点 · 当前筛选命中 ${filtered.length} 条检测结果`}
            </span>
            <small className="muted">
              行内数字为该任务 / 巡检点的全量统计，与「详情」页一致
            </small>
          </div>
        )}
        {/* 列表只到「任务 / 巡检点」这一层：检测明细、证据链路与人工复核统一进「详情」查看 */}
        <div className="tg-list">
          <table className="rt-table">
            <thead>
              <tr>
                {(group === "按任务"
                  ? ["任务ID", "任务名称", "机器人", "时间", "待复核", "操作"]
                  : ["巡检点ID", "巡检点名称", "设备", "最近时间", "待复核", "操作"]
                ).map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group === "按任务"
                ? pageTaskGroups.map(([taskId]) => {
                    const t = s.tasks.find((x) => x.id === taskId);
                    const { abn, pend, ok } = rowStat(taskId, fullByTask);
                    return (
                      <tr key={taskId} className={ok ? "" : "abn"}>
                        <td className="rt-id">{taskId}</td>
                        <td>
                          <span className="rt-title">
                            <b>{t?.name || taskId}</b>
                            <span
                              className={"rt-judge" + (ok ? " ok" : " abn")}
                            >
                              {ok ? "正常" : `异常 ${abn}`}
                            </span>
                            {t && <Badge>{t.state}</Badge>}
                          </span>
                        </td>
                        <td className="rt-robot">{t?.robotId || "—"}</td>
                        {/* RES-02：时间 = 开始 / 结束 */}
                        <td className="rt-time">
                          开始 {fmtTime(t?.startedAt || t?.created)} · 结束{" "}
                          {fmtTime(t?.finishedAt || t?.created)}
                        </td>
                        <td className={"rt-pend" + (pend ? " warn" : "")}>
                          待复核 <b>{pend}</b>
                        </td>
                        <td className="rt-actions">
                          <button
                            className="rt-link"
                            title="进入该任务的巡检结果详情（检测明细 + 人工复核）"
                            onClick={() =>
                              go("result-view", taskId, undefined, {
                                page: "results",
                              })
                            }
                          >
                            详情
                          </button>
                        </td>
                      </tr>
                    );
                  })
                : pagePointGroups.map(([pid]) => {
                    const p = s.points.find((x) => x.id === pid);
                    const { abn, pend, ok } = rowStat(pid, fullByPoint);
                    return (
                      <tr key={pid} className={ok ? "" : "abn"}>
                        <td className="rt-id">{pid}</td>
                        <td>
                          <span className="rt-title">
                            <b>{p?.name || pid}</b>
                            <span
                              className={"rt-judge" + (ok ? " ok" : " abn")}
                            >
                              {ok ? "正常" : `异常 ${abn}`}
                            </span>
                            {p && <Badge>{p.state}</Badge>}
                          </span>
                        </td>
                        <td className="rt-robot">{p?.device || "—"}</td>
                        <td className="rt-time">
                          最近 {fullByPoint.get(pid)?.[0]?.time}
                        </td>
                        <td className={"rt-pend" + (pend ? " warn" : "")}>
                          待复核 <b>{pend}</b>
                        </td>
                        <td className="rt-actions">
                          <button
                            className="rt-link"
                            title="进入该巡检点详情（历史读数与判定依据）"
                            onClick={() => go("point", pid)}
                          >
                            点位详情
                          </button>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
        <Pager
          page={pn}
          count={total}
          size={pageSize}
          unit={group === "按任务" ? "个任务" : "个巡检点"}
          onChange={PN}
        />
      </Panel>
      {/* 直达 review 路由但没带结果 ID（或该 ID 已不存在）时给出说明，避免"点了入口却没反应" */}
      {page === "review" && !reviewId && (
        <Note>
          未指定要复核的巡检结果（缺少结果 ID），请从「巡检结果查询」列表或工作台待办进入。
        </Note>
      )}
      {reviewId && (
        <ResultReviewDrawer id={reviewId} onClose={closeReview} />
      )}
      </>
    );
  }
  // 「结果详情」内置页（白盒只读）：REV-02 —— 人工复核改为抽屉，
  // 不再单独开「结果详情 / 复核」内置页（review 路由落到结果查询列表 + 复核抽屉，见上方分支）。
  if (page === "result-detail") {
    const rd = s.results.find((x) => x.id === id);
    if (!rd)
      return (
        <Note>未找到该巡检结果，请从设备巡检档案或巡检结果列表进入。</Note>
      );
    const p = pointOf(s, rd),
      t = s.tasks.find((x) => x.id === rd.taskId);
    return (
      <>
        <div className="context-bar">
          {/* REV-01：正常结果 = 详情（白盒只读）；异常 / 待复核 = 人工复核（抽屉内完成判定） */}
          <b>结果详情（白盒）</b>
          <span className="bc-id">{rd.id}</span>
          <Badge>{judgeOf(rd)}</Badge>
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
          <div className="actions">
            {/* REV-02：复核以抽屉就地打开，本页保持白盒详情上下文 */}
            {(rd.abnormal || rd.status === "待复核") && (
              <Btn primary onClick={() => setDetailReview(rd.id)}>
                人工复核
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
            {/* RES-05：视频留存走工厂 NVR，平台只做回放入口与关键帧截图 */}
            <small>
              证据为演示示意；巡检视频留存与回放对接工厂 NVR，平台仅提供回放入口与关键帧截图。
            </small>
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
                <Badge>{judgeOf(rd)}</Badge>
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
                  <ObjectLink
                    type="alarm"
                    to="alarm"
                    id={a.id}
                    from={{ page, id: rd.id }}
                  >
                    处置 →
                  </ObjectLink>,
                ])}
            />
          </Panel>
        </div>
        {/* REV-02：人工复核改为抽屉，页内不再重复铺一套复核表单 */}
        {detailReview && (
          <ResultReviewDrawer
            id={detailReview}
            onClose={() => setDetailReview(null)}
          />
        )}
      </>
    );
  }
  return null;
}

export function Alarms({ page, id }: { page: string; id?: string }) {
  const { s, act } = useStore();
  const [note, N] = useState(""),
    /** ALM-05：处置时可选标注「有效 / 无效」告警 */
    [validity, VAL] = useState<"" | "有效" | "无效">(""),
    [filter, F] = useViewState("alarms.filter", "全部"),
    [catF, CF] = useViewState("alarms.cat", "全部"),
    [drawer, setDrawer] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "result" | "task">(null);
  // 告警分级口径统一：紧急→red（需立即处置）· 重要→amber（需关注）· 一般→blue（提示）
  const levelTone = (lv: string): "red" | "amber" | "blue" | undefined =>
    lv === "紧急" ? "red" : lv === "重要" ? "amber" : lv === "一般" ? "blue" : undefined;
  const levelClass = (lv: string): string =>
    lv === "紧急" ? "lv-urgent" : lv === "重要" ? "lv-important" : lv === "一般" ? "lv-minor" : "";
  /** 闭环阶段（ALM-02/03 简化）：异常触发 → 确认处置 → 已消警关闭；复查为可选，不进主流程 */
  const ALARM_PHASES = ["待确认", "处置中", "已关闭"];
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
        {/* ALM-05：有效 / 无效人工标注 → 报警准确率与标注覆盖率（产品成熟度信号），口径取自指标中心 */}
        <div className="metric-strip">
          <div>
            <span>告警总数</span>
            <strong>{s.alarms.length}</strong>
          </div>
          <div>
            <span>已标注有效 / 无效</span>
            <strong>
              {
                s.alarms.filter(
                  (a) => a.validity === "有效" || a.validity === "无效",
                ).length
              }
            </strong>
          </div>
          <div>
            <span>报警准确率</span>
            <strong>{metricValue(s, "alarmAccuracy")}%</strong>
          </div>
          <div>
            <span>告警标注率</span>
            <strong>{metricValue(s, "alarmLabelRate")}%</strong>
          </div>
        </div>
        {/* ALM-01：告警与异常的定义、闭环与分级口径 —— 收进「口径说明」，正文区只留可操作内容 */}
        <details className="spec-note">
          <summary>口径说明：告警 vs 异常 · 闭环流程 · 分级处置机制</summary>
          <b>告警 vs 异常</b>：<b>异常</b> = 机器人判定不确定，需人工复核（见「巡检结果」）；{" "}
          <b>告警</b> = 明确触发阈值 / 规则，需处置（本页）。
          <br />
          闭环（ALM-02/03/06 已简化）：异常触发 → <b>处理 / 消警</b>
          （填写处理意见，可选标注「有效 / 无效」）即终态；<b>不产生复查任务闭环</b>。
          分级决定处置机制 ——
          <i className="alarm-lv lv-urgent">紧急</i> 立即处置并升级 ·
          <i className="alarm-lv lv-important">重要</i> 限时确认 ·
          <i className="alarm-lv lv-minor">一般</i> 批量复核。
        </details>
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
                去处置
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
            // 简化闭环进度：待确认=0；处置中/待复查/已恢复=1；已关闭=2
            const idx =
              a.state === "待确认" ? 0 : a.state === "已关闭" ? 2 : 1;
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
                ) : (
                  <>
                    尚未派单
                    <small>{a.handle || "确认后可直接一键派单"}</small>
                  </>
                )}
              </>,
              <Btn onClick={() => setDrawer(a.id)}>
                {a.state === "已关闭" ? "查看" : "处置"}
              </Btn>,
            ];
          })}
        />
        {drawer && (
          <Modal
            title="告警详情"
            drawer
            drawerWidth={900}
            onClose={() => setDrawer(null)}
          >
            {(() => {
              const ad = s.alarms.find((x) => x.id === drawer)!;
              const p = s.points.find((x) => x.id === ad.pointId);
              const t = s.tasks.find((x) => x.id === ad.taskId);
              const rd = s.results.find((x) => x.id === ad.resultId);
              const wo = s.workOrders.find((w) => w.alarmId === ad.id);
              return (
                <>
                  <div className="context-bar" style={{ marginTop: -4 }}>
                    <b>告警详情</b>
                    <span className="bc-id">{ad.id}</span>
                    <Badge tone={levelTone(ad.level)}>{ad.level}</Badge>
                    <span
                      className={
                        "alarm-cat " +
                        (ad.category === "机器人" ? "cat-robot" : "cat-biz")
                      }
                    >
                      {ad.category}
                    </span>
                    <Badge>{ad.state}</Badge>
                    <span>{p?.device}</span>
                    <span>{p?.name}</span>
                    <span className="muted">{ad.time}</span>
                    <div className="actions">
                      <Btn
                        primary
                        onClick={() => {
                          setDrawer(null);
                          go("alarm", ad.id);
                        }}
                      >
                        进入处置
                      </Btn>
                    </div>
                  </div>
                  <Steps
                    items={["异常触发", "确认处置", "已消警关闭"]}
                    current={ad.state === "待确认" ? 0 : ad.state === "已关闭" ? 2 : 1}
                  />
                  <div className="grid two">
                    <Panel title="触发证据与业务上下文">
                      <Video live={false} label={p?.name} robotId={t?.robotId} />
                      <p>
                        <b>设备</b>{" "}
                        <ObjectLink
                          type="archive"
                          id={p && archiveIdOf(s, p.device)}
                        >
                          {p?.device || "—"}
                        </ObjectLink>
                        {" "}· <b>点位</b>{" "}
                        <ObjectLink type="point" id={ad.pointId}>
                          {p?.name || "—"}
                        </ObjectLink>
                      </p>
                      <p>
                        <b>执行机器人</b>{" "}
                        <ObjectLink type="robot" id={t?.robotId || ad.robotId}>
                          {t?.robotId || ad.robotId || "—"}
                        </ObjectLink>
                      </p>
                      <p>
                        <b>触发结果</b>{" "}
                        {rd
                          ? `${rd.raw} ${rd.unit} · ${rd.source}`
                          : "—"}
                      </p>
                      <div className="actions">
                        {/* 严格按 ID 绑定：没有关联结果 / 任务 ID 时按钮置灰，避免跳到"猜出来的"记录 */}
                        <Btn
                          disabled={!ad.resultId}
                          onClick={() => {
                            setDrawer(null);
                            go("result-detail", ad.resultId);
                          }}
                        >
                          查看原始结果
                        </Btn>
                        <Btn
                          disabled={!ad.taskId}
                          onClick={() => {
                            setDrawer(null);
                            go("task-detail", ad.taskId);
                          }}
                        >
                          来源任务
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
                        <Note>
                          尚无处置记录，点击「进入处置 / 复查」开始处理。
                        </Note>
                      )}
                      {wo && (
                        <Field label="关联工单">
                          <p>
                            {wo.id} · {wo.state} · SLA 剩余 {wo.slaLeft} 分钟 ·{" "}
                            {wo.assignee || "待派单"}
                          </p>
                        </Field>
                      )}
                    </Panel>
                  </div>
                </>
              );
            })()}
          </Modal>
        )}
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
              进入处置
            </Btn>
          </div>
        </div>
        <Steps
          items={["异常触发", "确认处置", "已消警关闭"]}
          current={ad.state === "待确认" ? 0 : ad.state === "已关闭" ? 2 : 1}
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
              <Btn
                disabled={!ad.resultId}
                onClick={() => go("result-detail", ad.resultId)}
              >
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
              <Note>尚无处置记录，点击「进入处置」开始处理。</Note>
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
        items={["异常触发", "确认处置", "已消警关闭"]}
        current={a.state === "待确认" ? 0 : a.state === "已关闭" ? 2 : 1}
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
          <Field label="处置说明 / 消警依据">
            <textarea
              value={note}
              onChange={(e) => N(e.target.value)}
              placeholder="例如：已现场确认压力恢复正常，无需复查，直接消警"
            />
          </Field>
          {/* ALM-05：可选标注「有效 / 无效」，汇总到指标中心统计报警准确率 / 误报率 */}
          <Field label="告警有效性（可选，用于统计报警准确率与产品成熟度）">
            <select
              value={validity}
              onChange={(e) =>
                VAL(e.target.value as "" | "有效" | "无效")
              }
            >
              <option value="">未标注</option>
              <option value="有效">有效告警</option>
              <option value="无效">无效告警（误报）</option>
            </select>
          </Field>
          {/* ALM-04：处置意见可推送第三方工单系统，平台不做工单闭环 */}
          <Note>
            处置意见经中间件可推送第三方工单系统（隐患治理 / 维修 / 作业票等），接口在「系统设置 ›
            上层任务服务 · 接口配置」；平台<b>不做工单流转与 SLA 闭环</b>。
          </Note>
          {/* ALM-02/03/06：处置简化为「处理 / 消警」+ 处理意见文本，不做复查任务闭环 */}
          <div className="actions">
            <Btn
              primary
              disabled={a.state === "已关闭" || !note.trim()}
              title={!note.trim() ? "请先填写处理意见 / 消警依据" : "处理并消警"}
              onClick={() =>
                act({
                  type: "ALARM_RESOLVE",
                  id: a.id,
                  reason: note,
                  validity: validity || undefined,
                })
              }
            >
              处理 / 消警
            </Btn>
          </div>
          {a.state === "已关闭" && (
            <Note>
              已消警闭环
              {a.validity ? ` · 有效性标注：${a.validity}` : " · 未标注有效性"}
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
                      <Badge>{judgeOf(r)}</Badge>
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
