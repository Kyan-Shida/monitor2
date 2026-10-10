import { useState } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import {
  pointOf,
  fmtTime,
  parseTime,
  judgeOf,
  hasAlarm,
  aiStateOf,
  riskReasonOf,
  thresholdOf,
  verifyStateOf,
  VERIFY_DAYS,
} from "../data/selectors";
import { archiveIdOf } from "../data/deviceMaster";
import { metricValue } from "../data/metrics";
import { Btn, Badge, Panel, Table, Field, Note, Modal } from "../components/UI";
import { ObjectLink, Pager } from "../components/Business";
import { Video } from "../components/Video";
import { ResultTrend } from "../components/ResultTrend";
import type { Result } from "../data/types";
import { ALARM_CATEGORIES, ALARM_LEVELS } from "../data/types";
import {
  alarmText,
  logicText,
  templatesOf,
  triggerText,
} from "../data/alarmTemplates";
export function Results({ page, id }: { page: string; id?: string }) {
  const { s, act } = useStore();
  const [q, Q] = useViewState("results.q", ""),
    [robotF, RF] = useViewState("results.robot", "全部"),
    /** 判定口径：全部 / 风险异常 / AI 异常 / 正常（与顶部范围芯片同源） */
    [status, S] = useViewState("results.status", "全部"),
    /** 时间范围：全部 / 今日 / 近7天 / 近30天 / 自定义 */
    [range, RG] = useViewState("results.range", "全部"),
    [from, FR] = useViewState("results.from", ""),
    [to, TO] = useViewState("results.to", ""),
    /** 业务对象：区域 / 设备（设备来自结果里的点位所属设备） */
    [areaF, AF] = useViewState("results.area", "全部"),
    [devF, DF] = useViewState("results.device", "全部"),
    /** 是否告警：全部 / 是 / 否（按任务是否触发告警，与列表「触发告警」列同口径） */
    [alarmF, ALF] = useViewState("results.alarm", "全部"),
    /** 视图：按任务（执行视角）/ 按巡检点（设备视角） */
    [group, GR] = useViewState("results.group", "按任务"),
    [pn, PN] = useViewState("results.page", 1);
  /** 结果详情（白盒）内置页：采集证据种类切换 */
  const [evidence, E] = useState("照片");
  /**
   * 任务触发的告警事件：异常即告警（AI 状态异常 / 风险信息异常），一个任务可能触发多条；
   * 正常检测项不计入，避免"识别结果正常却有告警"
   */
  const alarmsOfTask = (taskId: string) =>
    s.alarms.filter(
      (a) =>
        a.taskId === taskId &&
        s.results.some((r) => r.id === a.resultId && hasAlarm(r)),
    );
  /** 单条结果关联的告警事件（按结果 ID 精确匹配，不做按点位猜告警的模糊回退） */
  const alarmOf = (r: Result) => s.alarms.find((a) => a.resultId === r.id);

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
    /** 状态筛选键：老缓存可能存着已下线的口径（异常 / 待复核），统一归一为「全部」 */
    const statusKey = ["风险异常", "AI异常", "正常"].includes(status)
      ? status
      : "全部";
    /** 结果状态（业务判断三选一）+ 机器人 + 是否告警（任务 / 原始状态等低频维度不再单列筛选行） */
    const filtered = scoped.filter((r) => {
      const t = s.tasks.find((x) => x.id === r.taskId);
      // 是否告警按任务口径：该任务存在关联告警即为「是」，与任务行「触发告警」列一致
      const taskHasAlarm = alarmsOfTask(r.taskId).length > 0;
      return (
        (statusKey === "全部" ||
          (statusKey === "风险异常"
            ? r.abnormal
            : statusKey === "AI异常"
              ? !!r.aiAbnormal
              : !r.abnormal && !r.aiAbnormal)) &&
        (robotF === "全部" || t?.robotId === robotF) &&
        (alarmF === "全部" ||
          (alarmF === "是" ? taskHasAlarm : !taskHasAlarm))
      );
    });
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
     * 行内统计与判定：按该任务 / 巡检点的全量结果算
     * @param key 任务 ID 或巡检点 ID
     * @param full 全量分组表
     * @returns 检测数、风险异常数与该行是否整体正常（行底色按风险异常淡红）
     */
    const rowStat = (key: string, full: Map<string, Result[]>) => {
      const all = full.get(key) || [];
      const abn = all.filter((r) => r.abnormal).length;
      return {
        total: all.length,
        abn,
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
          <Field label="是否告警">
            <select
              value={alarmF}
              onChange={(e) => {
                ALF(e.target.value);
                PN(1);
              }}
            >
              {["全部", "是", "否"].map((x) => (
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
              ALF("全部");
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
          </div>
        )}
        {/* 列表只到「任务 / 巡检点」这一层：检测明细、证据链路与人工复核统一进「详情」查看 */}
        <div className="tg-list">
          <table className="rt-table">
            <thead>
              <tr>
                {(group === "按任务"
                  ? [
                      "任务ID",
                      "任务名称",
                      "开始时间",
                      "结束时间",
                      "触发告警",
                      "操作",
                    ]
                  : [
                      "巡检点ID",
                      "巡检点名称",
                      "设备",
                      "最近时间",
                      "触发告警",
                      "操作",
                    ]
                ).map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group === "按任务"
                ? pageTaskGroups.map(([taskId]) => {
                    const t = s.tasks.find((x) => x.id === taskId);
                    const { ok } = rowStat(taskId, fullByTask);
                    const al = alarmsOfTask(taskId);
                    return (
                      <tr key={taskId} className={ok ? "" : "abn"}>
                        <td className="rt-id">{taskId}</td>
                        <td>
                          <span className="rt-title">
                            <b>{t?.name || taskId}</b>
                          </span>
                        </td>
                        {/* RES-02：开始 / 结束分列，便于与其它系统对账 */}
                        <td className="rt-time">
                          {fmtTime(t?.startedAt || t?.created)}
                        </td>
                        <td className="rt-time">
                          {fmtTime(t?.finishedAt || t?.created)}
                        </td>
                        {/* 触发告警：只用颜色区分是 / 否，告警明细在「详情」里看 */}
                        <td className="rt-alarms">
                          <span className={al.length ? "rt-alarm-yes" : "rt-alarm-no"}>
                            {al.length ? "是" : "否"}
                          </span>
                        </td>
                        <td className="rt-actions">
                          <button
                            className="rt-link"
                            title="进入该任务的巡检结果详情（检测明细 + 关联告警）"
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
                    const { ok } = rowStat(pid, fullByPoint);
                    const al = s.alarms.filter(
                      (x) =>
                        x.pointId === pid &&
                        s.results.some(
                          (r) => r.id === x.resultId && hasAlarm(r),
                        ),
                    );
                    return (
                      <tr key={pid} className={ok ? "" : "abn"}>
                        <td className="rt-id">{pid}</td>
                        <td>
                          <span className="rt-title">
                            <b>{p?.name || pid}</b>
                          </span>
                        </td>
                        <td className="rt-robot">{p?.device || "—"}</td>
                        <td className="rt-time">
                          最近 {fullByPoint.get(pid)?.[0]?.time}
                        </td>
                        {/* 触发告警：只用颜色区分是 / 否 */}
                        <td className="rt-alarms">
                          <span className={al.length ? "rt-alarm-yes" : "rt-alarm-no"}>
                            {al.length ? "是" : "否"}
                          </span>
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
      </>
    );
  }
  // 「结果详情」内置页（白盒只读）：纯展示，异常结果直接给出关联告警入口（处理在告警页完成）
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
            {/* 异常即告警：只有 AI 状态异常 / 风险信息异常才有告警，点进告警页检查受理 */}
            {hasAlarm(rd) && alarmOf(rd) && (
              <Btn primary onClick={() => go("alarm", alarmOf(rd)!.id)}>
                查看关联告警
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
      </>
    );
  }
  return null;
}

export function Alarms({ page, id }: { page: string; id?: string }) {
  const { s, act } = useStore();
  const [note, N] = useState(""),
    /** ALM-05：处理结果（受理 / 忽略） */
    [result, RES] = useState<"" | "受理" | "忽略">(""),
    /** ALM-05：是否误报（人工判定，计入报警准确率） */
    [falsePositive, FP] = useState<"" | "是" | "否">(""),
    [filter, F] = useViewState("alarms.filter", "全部"),
    [catF, CF] = useViewState("alarms.cat", "全部"),
    [devF, DF] = useViewState("alarms.dev", "全部"),
    [lvF, LF] = useViewState("alarms.lv", "全部"),
    [alFrom, AFR] = useViewState("alarms.from", ""),
    [alTo, ATO] = useViewState("alarms.to", "");
  const [showOpen, SETOPEN] = useState(false);
  const [modal, setModal] = useState<null | "result" | "task">(null);
  /** 保存处理前的二次确认（处理结果保存后不可二次编辑） */
  const [sure, SETSURE] = useState(false);
  /** 复检步骤勾选（按告警 ID 隔离；未操作时回显告警里已保存的完成情况） */
  const [vEdit, VEDIT] = useState<{ id: string; done: number[] } | null>(null);
  const [vNote, VNOTE] = useState("");
  // 告警分级口径统一：一级→red（需立即处置）· 二级→amber（需关注）· 三级→blue（提示）
  const levelTone = (lv: string): "red" | "amber" | "blue" | undefined =>
    lv === "一级" ? "red" : lv === "二级" ? "amber" : lv === "三级" ? "blue" : undefined;
  const levelClass = (lv: string): string =>
    lv === "一级" ? "lv-urgent" : lv === "二级" ? "lv-important" : lv === "三级" ? "lv-minor" : "";
  // 告警处理现状：仅实现「处理结果（受理 / 忽略）+ 是否误报」人工处理（ALM-05），未做处置闭环
  /** 未处理 = 尚无人工处理（以处理时间为准；告警当前只做处理，不做处置推进） */
  const openStates = ["待确认", "处理中", "待复查", "已恢复"];
  const alarmsOpen = s.alarms.filter((a) => openStates.includes(a.state));
  /** 分类范围（阶段条计数与列表同一份口径，点阶段即筛选） */
  const alarmsInCat = s.alarms.filter(
    (a) => catF === "全部" || a.category === catF,
  );
  const alarmsAll = alarmsInCat.filter(
    (a) => filter === "全部" || a.state === filter,
  );
  // 设备 / 等级筛选：仅列告警里真实出现过的设备，避免"选了查不到数据"
  const devicesInAlarms = [
    ...new Set(
      s.alarms.map(
        (a) => s.points.find((x) => x.id === a.pointId)?.device,
      ),
    ),
  ].filter(Boolean) as string[];
  const alarmsFiltered = alarmsAll.filter((a) => {
    if (!a.taskId) return false; // 过滤没有关联任务的孤儿告警
    const p = s.points.find((x) => x.id === a.pointId);
    const v = parseTime(a.time);
    return (
      (devF === "全部" || p?.device === devF) &&
      (lvF === "全部" || a.level === lvF) &&
      (!alFrom || (!Number.isNaN(v) && v >= parseTime(alFrom + " 00:00"))) &&
      (!alTo || (!Number.isNaN(v) && v <= parseTime(alTo + " 23:59")))
    );
  });
  // 分级三档（一级 / 二级 / 三级，与告警规则、驾驶舱同源）；计数与列表同源
  const countByLevel = Object.fromEntries(
    ALARM_LEVELS.map((lv) => [
      lv,
      alarmsAll.filter((a) => a.taskId && a.level === lv).length,
    ]),
  ) as Record<string, number>;
  // 告警事件列表：支持从驾驶舱「今日告警」下钻（URL 带告警 id），高亮目标行并给出上下文
  if (page === "alarms") {
    const focus = id ? s.alarms.find((x) => x.id === id) : undefined;
    return (
      <Panel
        title="告警管理"
      >
        {/* ALM-05：处理结果 + 是否误报 → 报警准确率与处理覆盖率（产品成熟度信号），口径取自指标中心 */}
        <div className="metric-strip">
          <div>
            <span>告警总数</span>
            <strong>{s.alarms.filter(a => a.taskId).length}</strong>
          </div>
          <div
            className={"clickable" + (showOpen ? " on" : "")}
            onClick={() => SETOPEN(!showOpen)}
            title={showOpen ? "点击取消筛选" : "点击只看未处理告警"}
          >
            <span>未处理</span>
            <div className="metric-vals">
              <strong>
                {s.alarms.filter((a) => a.taskId && !a.handledAt).length}
              </strong>
              <i className="metric-hint">
                {showOpen ? "已筛选 · 点击取消" : "点击筛选"}
              </i>
            </div>
          </div>
          <div>
            <span>报警准确率</span>
            <strong>{metricValue(s, "alarmAccuracy")}%</strong>
          </div>
          <div>
            <span>告警处理率</span>
            <strong>{metricValue(s, "alarmLabelRate")}%</strong>
          </div>
        </div>
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
        <div className="task-toolbar" style={{ marginTop: 12 }}>
          <Field label="分类">
            <select
              value={catF}
              onChange={(e) => {
                CF(e.target.value);
              }}
            >
              {["全部", "业务", "机器人"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="设备">
            <select
              value={devF}
              onChange={(e) => {
                DF(e.target.value);
              }}
            >
              {["全部", ...devicesInAlarms].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="起始日期">
            <input
              type="date"
              value={alFrom}
              onChange={(e) => AFR(e.target.value)}
            />
          </Field>
          <Field label="截止日期">
            <input
              type="date"
              value={alTo}
              onChange={(e) => ATO(e.target.value)}
            />
          </Field>
          <Field label="等级">
            <select value={lvF} onChange={(e) => LF(e.target.value)}>
              <option value="全部">
                全部（{alarmsAll.filter((a) => a.taskId).length}）
              </option>
              {ALARM_LEVELS.map((lv) => (
                <option key={lv} value={lv}>
                  {lv}（{countByLevel[lv]}）
                </option>
              ))}
            </select>
          </Field>
          <Btn
            onClick={() => {
              CF("全部");
              DF("全部");
              LF("全部");
              AFR("");
              ATO("");
            }}
          >
            重置筛选
          </Btn>
        </div>
        <Table
          heads={[
            "告警编号",
            "设备",
            "目标",
            "告警等级",
            "风险信息",
            "发生时间",
            "处理状态",
            "处理时间",
            "操作",
          ]}
          rows={(
            showOpen
              ? alarmsFiltered.filter((a) => !a.handledAt)
              : alarmsFiltered
          )
            // 未处理置顶、已处理自动下移（sort 稳定，同组内保持原时序）
            .sort((x, y) => Number(!!x.handledAt) - Number(!!y.handledAt))
            .map((a) => {
            /** 复检状态：受理后进入复检，超 30 天未闭环自动判无效（派生值） */
            const vs = verifyStateOf(a);
            const p = s.points.find((x) => x.id === a.pointId);
            // 与巡检结果打通：风险原因取自该告警关联的结果（按快照口径）
            const rd = s.results.find((x) => x.id === a.resultId);
            const robot = s.robots.find((rb) => rb.id === a.robotId);
            return [
              // 告警编号即处理入口：直接进告警详情页（检查受理），不再弹窗
              <button
                className="rt-link"
                title={a.handledAt ? "查看告警处理情况" : "处理该告警（检查受理）"}
                onClick={() => go("alarm", a.id, undefined, { page: "alarms" })}
              >
                {a.id}
              </button>,
              p?.device ? (
                <ObjectLink type="archive" id={archiveIdOf(s, p.device)}>
                  {p.device}
                </ObjectLink>
              ) : robot ? (
                <ObjectLink type="robot" id={robot.id}>
                  {robot.name}
                </ObjectLink>
              ) : (
                "—"
              ),
              // 目标 = 对象 · 检测项（设备之下的被检目标）
              p ? `${p.object} · ${p.item}` : "—",
              <span className={"alarm-lv lv-" + levelClass(a.level)}>
                <i />
                {a.level}
              </span>,
              // 风险信息：正常 / 异常（原因）——原因来自采集时保存的规则快照
              <span className={rd && hasAlarm(rd) ? "risk-abn" : "muted"}>
                {riskReasonOf(rd)}
              </span>,
              <span className="muted">{a.time}</span>,
              // 处理状态：未处理 / 受理 / 忽略（误报单独标注，口径进报警准确率）
              // 复核：受理的告警再带一行复检状态（待反馈剩 N 天 / 有效闭环 / 无效闭环）
              <>
                <Badge
                  tone={
                    a.handleResult === "受理"
                      ? "amber"
                      : a.handleResult === "忽略"
                        ? "green"
                        : undefined
                  }
                >
                  {a.handledAt
                    ? `${a.handleResult ?? "已处理"}${a.falsePositive ? " · 误报" : ""}`
                    : "未处理"}
                </Badge>
                {a.verify && (
                  <small
                    className={
                      vs.state === "有效闭环"
                        ? "verify-ok"
                        : vs.state === "无效闭环"
                          ? "verify-bad"
                          : "verify-open"
                    }
                  >
                    复检 {vs.state}
                    {vs.state === "待反馈" ? `（剩 ${vs.leftDays} 天）` : ""}
                  </small>
                )}
              </>,
              <span className="muted">{a.handledAt || "—"}</span>,
              // 操作列：处理 / 查看（已处理只能查看，处理结果不可二次编辑）
              // 直接进告警详情页，不再弹窗
              <Btn
                onClick={() => go("alarm", a.id, undefined, { page: "alarms" })}
              >
                {a.handledAt ? "查看" : "处理"}
              </Btn>,
            ];
          })}
        />
      </Panel>
    );
  }
  // 「告警详情」内置页（设备巡检档案目录下）：只读展示告警证据与处理记录
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
          <ObjectLink type="archive" id={p && archiveIdOf(s, p.device)}>
            {p?.device}
          </ObjectLink>
          <ObjectLink type="point" id={ad.pointId}>
            {p?.name}
          </ObjectLink>
          <ObjectLink type="task-detail" id={ad.taskId} />
          <span className="muted">{ad.time}</span>
          <div className="actions">
            <Btn primary={!ad.handledAt} onClick={() => go("alarm", ad.id)}>
              {ad.handledAt ? "查看" : "进行处理"}
            </Btn>
          </div>
        </div>
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
          <Panel title="处理记录">
            {ad.notes.length ? (
              ad.notes.map((x, i) => (
                <p className="event" key={i}>
                  {x}
                </p>
              ))
            ) : (
              <Note>尚无处理记录，可处理该告警（受理 / 忽略）。</Note>
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
  const p = s.points.find((x) => x.id === a.pointId);
  /**
   * 处置流程的来源模板：按结果快照里引用的模板 ID 取
   * @description 用快照而不是当前规则 → 历史告警展示的是当时的处置流程口径
   */
  const flowTpl = templatesOf(s).find(
    (x) => x.id === r?.ruleSnapshot?.templateId,
  );
  /** 复检状态（派生值：待反馈 / 有效闭环 / 无效闭环，超 30 天自动判无效） */
  const vState = verifyStateOf(a);
  /** 已闭环或已超期：复检步骤只读，不再接受回馈 */
  const vClosed = !!a.verify && (a.verify.state !== "待反馈" || vState.overdue);
  /** 复检步骤勾选：用户改动优先，否则回显告警里已保存的完成情况 */
  const vDone =
    vEdit && vEdit.id === a.id
      ? vEdit.done
      : (a.verify?.steps || [])
          .map((x, i) => (x.done ? i : -1))
          .filter((i) => i >= 0);
  return (
    <>
      <div className="context-bar">
        <b>{a.name}</b>
        <Badge>{a.level}</Badge>
        <span>
          {a.id} · {a.time}
        </span>
      </div>
      <div className="grid two">
        <div className="alarm-col">
          {/* 风险信息：这条告警"是什么风险、有多严重、从哪来" */}
          <Panel title="风险信息">
            <dl className="risk-dl">
              {/* 告警等级 / 触发时间已在页头上，块内不再重复；块内按「是什么 → 在哪 → 判定 → 读数」组织 */}
              <dt>告警分类</dt>
              <dd>{a.category}</dd>
              <dt>当前状态</dt>
              <dd>
                <Badge>{a.state}</Badge>
              </dd>
              <dt>关联设备</dt>
              <dd>
                <ObjectLink type="archive" id={p && archiveIdOf(s, p.device)}>
                  {p?.device || "—"}
                </ObjectLink>
              </dd>
              <dt>点位 / 检测项</dt>
              <dd>
                <ObjectLink type="point" id={a.pointId}>
                  {p?.name || "—"}
                </ObjectLink>
                {" · "}
                {r?.item || "—"}
              </dd>
              <dt>执行机器人</dt>
              <dd>
                <ObjectLink type="robot" id={t?.robotId || a.robotId} />
              </dd>
              {/* 判定与读数：AI 状态 / 风险原因 / 读数（原始值不同才带出）/ 阈值（无快照不显示空行） */}
              <dt>AI 状态</dt>
              <dd>
                <Badge tone={r?.aiAbnormal ? "red" : undefined}>
                  {r ? aiStateOf(r) : "—"}
                </Badge>
              </dd>
              <dt>风险信息</dt>
              <dd className={r && hasAlarm(r) ? "risk-abn" : undefined}>
                {riskReasonOf(r)}
              </dd>
              <dt>读数</dt>
              <dd className="risk-value">
                {r ? `${r.final} ${r.unit}` : "—"}
                {r && r.raw !== r.final && (
                  <small>
                    原始采集 {r.raw} {r.unit}
                  </small>
                )}
              </dd>
              {r?.ruleSnapshot && (
                <>
                  <dt>告警阈值</dt>
                  <dd>{thresholdOf(r)}</dd>
                  {/* 触发来源：这条告警是哪条判定规则、哪个告警模板触发的（一处看清链路） */}
                  <dt>触发规则</dt>
                  <dd>
                    {r.ruleSnapshot.id} · {r.ruleSnapshot.name}
                    <small>
                      第 {r.ruleSnapshot.version} 版 ·{" "}
                      {r.ruleSnapshot.triggerMode || "单次即触发"}
                    </small>
                  </dd>
                </>
              )}
              <dt>关联告警模板</dt>
              <dd>
                {flowTpl ? (
                  <>
                    {flowTpl.name}
                    <small>
                      {flowTpl.id} · {flowTpl.flow.length} 步处置流程
                    </small>
                  </>
                ) : (
                  "未关联（机器人本体事件按级别处置建议执行）"
                )}
              </dd>
              {a.handle && (
                <>
                  <dt>建议处置</dt>
                  <dd>{a.handle}</dd>
                </>
              )}
            </dl>
            <div className="actions">
              <Btn onClick={() => setModal("task")}>来源任务</Btn>
            </div>
          </Panel>
          {/* 现场记录：证据画面 + 采集信息 + 现场处理留痕 */}
          <Panel title="现场记录">
            <Video
              live={false}
              label={p?.name}
              robotId={t?.robotId || a.robotId}
            />
            <p>
              采集时间 <b>{r?.time || a.time}</b> · {r?.source || "平台自检"}
            </p>
          </Panel>
          {/* 处置流程：来源按结果快照判定——引用模板的按模板展示，手动输入的按台账手填流程展示 */}
          <Panel
            title="处置流程 · 来自告警规则"
            extra={<Btn onClick={() => go("alarm-templates")}>模板配置 →</Btn>}
          >
            {flowTpl || r?.ruleSnapshot?.flow?.length ? (
              <>
                <p className="muted">
                  {flowTpl ? (
                    <>
                      引用告警模板 <b>{flowTpl.name}</b>（{flowTpl.id}）· 触发条件{" "}
                      {triggerText(flowTpl.trigger)} · 触发逻辑{" "}
                      {logicText(flowTpl.trigger)} · {alarmText(flowTpl.alarmSeconds)}
                    </>
                  ) : (
                    <>
                      告警规则为「手动输入」· 触发逻辑{" "}
                      {r?.ruleSnapshot?.triggerMode || "单次即触发"} ·{" "}
                      {alarmText(r?.ruleSnapshot?.alarmSeconds)}
                    </>
                  )}
                </p>
                <ol className="flow-steps">
                  {(flowTpl?.flow || r?.ruleSnapshot?.flow || []).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ol>
              </>
            ) : a.handle ? (
              <>
                <Note>
                  本告警未关联点位判定规则（机器人本体事件），按级别处置建议执行：
                </Note>
                <ol className="flow-steps">
                  <li>{a.handle}</li>
                </ol>
              </>
            ) : (
              <Note>
                未引用告警模板，暂无处置流程；可在「后台管理 › 告警模板管理」为对应检测类型配置模板后重新采集。
              </Note>
            )}
          </Panel>
        </div>
        {/* 处理情况 + 反馈（复检）同列堆叠：受理保存后，复检块就出现在「处理情况」正下方 */}
        <div className="alarm-col">
        <Panel title="处理情况">
          {/* ALM-05：处理结果（受理 / 忽略）+ 是否误报，汇总到指标中心统计报警准确率 */}
          {a.handledAt ? (
            /* 已处理只读：处理结果计入报警准确率口径，处理之后不能再处理 */
            <>
              <Field label="处理时间">{a.handledAt}</Field>
              <Field label="处理结果">{a.handleResult || "—"}</Field>
              <Field label="是否误报">{a.falsePositive ? "是" : "否"}</Field>
              <Field label="处理说明 / 依据">{a.handleNote || "—"}</Field>
              <Note>
                该告警已处理，处理结果不可二次编辑；如需更正请联系管理员。
              </Note>
            </>
          ) : (
            <>
              <Field label="处理时间">保存时自动记录</Field>
              <Field label="处理结果">
                <div className="radio-row">
                  {(["受理", "忽略"] as const).map((x) => (
                    <label key={x}>
                      <input
                        type="radio"
                        name="alarm-result"
                        checked={result === x}
                        onChange={() => RES(x)}
                      />
                      {x}
                    </label>
                  ))}
                </div>
              </Field>
              {result === "受理" && (
                <Note>
                  选择「受理」并保存后自动进入反馈（复检）流程（本块下方）：按处置流程逐条回馈，没反馈或超过
                  {" "}
                  {VERIFY_DAYS} 天 = 无效闭环。
                </Note>
              )}
              <Field label="是否误报">
                <div className="radio-row">
                  {(["否", "是"] as const).map((x) => (
                    <label key={x}>
                      <input
                        type="radio"
                        name="alarm-false-positive"
                        checked={falsePositive === x}
                        onChange={() => FP(x)}
                      />
                      {x}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="处理说明 / 依据">
                <textarea
                  value={note}
                  onChange={(e) => N(e.target.value)}
                  placeholder="例如：现场确认阀位已关闭到位，告警属实"
                />
              </Field>
              <div className="actions">
                <Btn
                  primary
                  disabled={!result || !falsePositive || !note.trim()}
                  title={!note.trim() ? "请先填写处理说明 / 依据" : "保存处理"}
                  onClick={() => SETSURE(true)}
                >
                  保存处理
                </Btn>
              </div>
            </>
          )}
        </Panel>
        {/*
          反馈（复检）：只有「受理」的告警进入（受理 = 需要现场处置），紧跟「处理情况」下方。
          复检清单 = 受理时落库的处置流程（引用告警模板）；逐条勾选完成情况并保存，
          系统判定闭环：全部勾选完成 = 有效闭环；没反馈 / 超 30 天 = 无效闭环（派生值，见 verifyStateOf）
        */}
        {a.verify && (
          <Panel title="反馈（复检）· 基于处置流程">
          <>
            <div className="verify-head">
              <Badge
                tone={
                  vState.state === "有效闭环"
                    ? "green"
                    : vState.state === "无效闭环" ||
                        vState.state === "未进入复检"
                      ? "red"
                      : "amber"
                }
              >
                {vState.state}
              </Badge>
              <span className="muted">
                受理时间 {a.verify.startedAt} ·{" "}
                {vState.state === "待反馈"
                  ? `距自动无效闭环还有 ${vState.leftDays} 天（时限 ${VERIFY_DAYS} 天）`
                  : vState.overdue
                    ? `已超过 ${VERIFY_DAYS} 天未闭环，自动判定为无效闭环`
                    : `闭环时间 ${a.verify.closedAt || "—"}`}
              </span>
            </div>
            <ol className="verify-steps">
              {a.verify.steps.map((x, i) => (
                <li key={i} className={vDone.includes(i) ? "done" : ""}>
                  <label>
                    <input
                      type="checkbox"
                      disabled={vClosed}
                      checked={vDone.includes(i)}
                      onChange={() =>
                        VEDIT({
                          id: a.id,
                          done: vDone.includes(i)
                            ? vDone.filter((y) => y !== i)
                            : [...vDone, i],
                        })
                      }
                    />
                    {x.text}
                  </label>
                  <small>
                    {vDone.includes(i) ? `已完成 · ${x.at || "待记录"}` : "未完成"}
                  </small>
                </li>
              ))}
            </ol>
            {vClosed ? (
              <Note>
                复检已闭环（{vState.state}
                {vState.overdue
                  ? ` · 未反馈或超 ${VERIFY_DAYS} 天未闭环，系统自动判定`
                  : " · 处置流程全部完成，系统判定"}
                ）
                {a.verify.closedAt ? ` · ${a.verify.closedAt}` : ""}
                {a.verify.note ? ` · ${a.verify.note}` : ""}；闭环结果不可重复提交。
              </Note>
            ) : (
              <>
                <Field label="复检说明（可选）">
                  <textarea
                    value={vNote}
                    onChange={(e) => VNOTE(e.target.value)}
                    placeholder="例如：现场确认阀门已复位，复测读数恢复正常"
                  />
                </Field>
                {/* 只有「保存」一个动作：闭环由系统判定（全部勾选 = 有效；未反馈 / 超 30 天 = 无效） */}
                <div className="actions">
                  <Btn
                    primary
                    onClick={() =>
                      act({
                        type: "ALARM_VERIFY",
                        id: a.id,
                        done: vDone,
                        reason: vNote,
                      })
                    }
                  >
                    保存反馈
                  </Btn>
                  <span className="muted">
                    已勾选 {vDone.length}/{a.verify.steps.length} 步 · 系统判定：处置流程全部勾选完成 =
                    有效闭环；未反馈或受理起超过 {VERIFY_DAYS} 天 = 无效闭环
                  </span>
                </div>
              </>
            )}
          </>
          </Panel>
        )}
        </div>
      </div>
      {sure && (
        <Modal title="确认提交处理结果" onClose={() => SETSURE(false)}>
          <p>
            <b>{a.id}</b> · {a.name}
          </p>
          <p>
            处理结果记为「{result}」，是否误报「{falsePositive}
            」，处理时间由系统记录；保存后<b>不可二次编辑</b>，如需更正请联系管理员。
          </p>
          <div className="actions">
            <Btn onClick={() => SETSURE(false)}>取消</Btn>
            <Btn
              primary
              onClick={() => {
                act({
                  type: "ALARM_LABEL",
                  id: a.id,
                  reason: note,
                  result,
                  falsePositive: falsePositive === "是",
                });
                SETSURE(false);
              }}
            >
              确认提交
            </Btn>
          </div>
        </Modal>
      )}
      {modal && (
        <Modal
          title={modal === "result" ? "原始结果" : "来源任务"}
          wide
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
                    <Field label="类型">{t.taskType}</Field>
                    <Field label="状态"><Badge>{t.state}</Badge></Field>
                  </Panel>
                  <Panel title="执行与关联">
                    {/* 字段按「谁执行 → 做什么 → 关联来源 → 时间」排列；无值的关联字段不占位 */}
                    <Field label="执行机器人">{t.robotId}</Field>
                    <Field label="原子动作">{t.atomicActions.join("、")}</Field>
                    {t.planId && (
                      <Field label="关联计划">
                        {t.planId}
                        {t.planVersion ? `（v${t.planVersion}）` : ""}
                      </Field>
                    )}
                    {t.alarmId && (
                      <Field label="触发告警">{t.alarmId}</Field>
                    )}
                    <Field label="创建时间">{t.created}</Field>
                    <Field label="开始时间">{fmtTime(t.startedAt)}</Field>
                    <Field label="结束时间">
                      {t.finishedAt ? fmtTime(t.finishedAt) : "—"}
                    </Field>
                  </Panel>
                </div>
              )
              : <Note>未找到对应的任务（{a.taskId}）。</Note>}
        </Modal>
      )}
    </>
  );
}
