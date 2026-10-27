import { AlarmConfiguration } from "./AlarmConfiguration";
import { ParamCenter } from "./ParamCenter";
import { rulesOf } from "../data/alarmRules";
import { ObjectLink, Pager } from "../components/Business";
import { FilterPanel } from "../components/FilterPanel";
import { useState } from "react";
import { useStore } from "../data/store";
import { go, pages, usePageSize, useViewState } from "../data/navigation";
import {
  Btn,
  Badge,
  Panel,
  Table,
  Field,
  Note,
  Modal,
} from "../components/UI";
import { RoleAdmin } from "../components/RoleAdmin";
import { LogCenter } from "./LogCenter";
export function Supporting({ page }: { page: string }) {
  const { s, act } = useStore();
  const [rulePoint, setRulePoint] = useState("");
  const pointRules = rulesOf(s);
  const [q, Q] = useViewState("supporting." + page + ".query", ""),
    [edit, E] = useState<string | undefined>(),
    [modal, M] = useState(false),
    [name, N] = useState(""),
    [detail, D] = useState(""),
    [pDev, PD] = useViewState("supporting.points.device", "全部"),
    [pMap, PM] = useViewState("supporting.points.map", "全部"),
    [pState, PS] = useViewState("supporting.points.state", "全部"),
    [pPage, PP] = useViewState("supporting.points.page", 1);
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [pSize, SETPSIZE] = usePageSize("supporting.points.size");
  /** 巡检点列表筛选：展开态 + 草稿条件（点「查询」才写回生效值，与设备台账同款） */
  const [pFilterOpen, SETPFILTEROPEN] = useState(false);
  const [pDraft, PDRAFT] = useState({
    dev: pDev,
    map: pMap,
    state: pState,
    q,
  });
  /** 已生效的筛选条件数（「筛选」按钮上的计数） */
  const pFilterCount =
    (pDev !== "全部" ? 1 : 0) +
    (pMap !== "全部" ? 1 : 0) +
    (pState !== "全部" ? 1 : 0) +
    (q.trim() ? 1 : 0);
  /** 展开筛选面板：用当前生效值填充草稿 */
  function togglePointFilter() {
    if (!pFilterOpen) PDRAFT({ dev: pDev, map: pMap, state: pState, q });
    SETPFILTEROPEN(!pFilterOpen);
  }
  /** 查询：草稿写回生效值并收起面板（列表回到第 1 页） */
  function applyPointFilter() {
    PD(pDraft.dev);
    PM(pDraft.map);
    PS(pDraft.state);
    Q(pDraft.q);
    PP(1);
    SETPFILTEROPEN(false);
  }
  /** 重置：清空草稿并立即生效 */
  function resetPointFilter() {
    PDRAFT({ dev: "全部", map: "全部", state: "全部", q: "" });
    PD("全部");
    PM("全部");
    PS("全部");
    Q("");
    PP(1);
  }
  /** 点位明细表列头：巡检点列表与设备「对象与检测项」弹窗共用（已去掉无数据来源的「必检」列） */
  const POINT_HEADS = [
    "业务点位",
    "设备 / 对象",
    "检测项",
    "类型 / 单位",
    "状态 / 版本",
    "采集结果规则",
    "操作",
  ];
  /**
   * 把点位数组渲染为表格行
   * @param list 点位列表
   * @returns 表格行数组
   */
  const pointRows = (list: typeof s.points) =>
    list.map((p) => [
      <ObjectLink type="point" id={p.id}>
        {p.name}
      </ObjectLink>,
      <>
        <ObjectLink type="archive" id={p.device.split(" ")[0]} to="archive">
          {p.device}
        </ObjectLink>
        <small>{p.object}</small>
      </>,
      p.item,
      `${p.kind} / ${p.unit || "状态"}`,
      <>
        <Badge>{p.state}</Badge>
      </>,
      <>
        {(() => {
          const rule = pointRules.find((r) => r.pointId === p.id);
          return (
            <>
              <Badge>{rule?.enabled ? "已启用" : "待配置 / 停用"}</Badge>
              <small>
                {rule?.enabled
                  ? rule.type === "数值范围"
                    ? `${rule.min}–${rule.max} ${rule.unit}（含边界）`
                    : `期望：${rule.expected}`
                  : "不自动判为正常"}
              </small>
              <small>
                {rule?.level} · 第 {rule?.version} 版
              </small>
            </>
          );
        })()}
      </>,
      <div className="actions">
        <Btn
          onClick={() =>
            page === "points" ? setRulePoint(p.id) : go("point", p.id)
          }
        >
          查看告警规则
        </Btn>
        <Btn onClick={() => go("point-edit", p.id)}>编辑巡检点</Btn>
      </div>,
    ]);
  // 角色 / 权限：角色列表 + 权限配置抽屉 + 角色模拟 + 审计日志
  if (page === "roles") return <RoleAdmin />;

  // 日志中心：系统操作 / 任务运行 / 机器人操作（页内页签切换）
  if (page === "audit") return <LogCenter />;

  if (["dispatch-log", "replay"].includes(page)) {
    const logs = s.logs.filter(
      (l) =>
        page === "replay" ||
        ["ASSIGN", "DISPATCH", "PREEMPT", "WITHDRAW", "REORDER", "RECEIPT"].includes(
          l.action,
        ),
    );
    return (
      <Panel
        title={pages.find((p) => p.id === page)!.name}
        extra={
          <input
            placeholder="搜索对象 / 事件"
            value={q}
            onChange={(e) => Q(e.target.value)}
          />
        }
      >
        <Table
          heads={["时间", "事件", "业务对象", "详情 / 反馈"]}
          rows={logs
            .filter((l) => (l.object + l.action + l.detail).includes(q))
            .map((l) => [
              l.time,
              l.action,
              <button
                className="link"
                onClick={() =>
                  go(
                    s.tasks.some((t) => t.id === l.object) ? "tasks" : "maps",
                    l.object,
                  )
                }
              >
                {l.object}
              </button>,
              l.detail,
            ])}
        />
      </Panel>
    );
  }
  // 巡检点列表：点位量大，提供关键词 + 设备 / 地图 / 状态筛选与分页
  if (page === "points") {
    const deviceOpts = ["全部", ...new Set(s.points.map((p) => p.device))];
    const mapOpts = ["全部", ...new Set(s.points.map((p) => p.mapId))];
    const stateOpts = ["全部", ...new Set(s.points.map((p) => p.state))];
    const kw = q.trim();
    const list = s.points.filter((p) => {
      if (kw && !(p.id + p.name + p.device + p.object + p.item).includes(kw))
        return false;
      if (pDev !== "全部" && p.device !== pDev) return false;
      if (pMap !== "全部" && p.mapId !== pMap) return false;
      if (pState !== "全部" && p.state !== pState) return false;
      return true;
    });
    const pages = Math.max(1, Math.ceil(list.length / pSize));
    const cur = Math.min(pPage, pages);
    return (
      <Panel
        className="panel-filters-wrap"
        title="业务巡检点与版本"
        extra={
          <div className="actions">
            {/* 筛选：设备 / 地图 / 状态 / 关键词都收进筛选面板，默认收起（与设备台账同款） */}
            <Btn onClick={togglePointFilter}>
              {pFilterOpen ? "收起筛选" : "筛选"}
              {pFilterCount ? `（${pFilterCount}）` : ""}
            </Btn>
            <Btn primary onClick={() => go("annotation")}>
              巡检点管理
            </Btn>
          </div>
        }
      >
        {pFilterOpen && (
          <FilterPanel
            fields={[
              { key: "dev", label: "关联设备", options: deviceOpts },
              { key: "map", label: "来源地图", options: mapOpts },
              { key: "state", label: "状态", options: stateOpts },
              {
                key: "q",
                label: "搜索点位",
                placeholder: "名称 / 编号 / 检测项",
              },
            ]}
            value={pDraft}
            onChange={(next) => PDRAFT({ ...pDraft, ...next })}
            onSearch={applyPointFilter}
            onReset={resetPointFilter}
          />
        )}
        <Table
          heads={POINT_HEADS}
          rows={pointRows(list.slice((cur - 1) * pSize, cur * pSize))}
        />
        <Pager
          page={cur}
          count={list.length}
          size={pSize}
          onChange={PP}
          onSize={(n) => {
            SETPSIZE(n);
            PP(1);
          }}
        />
        {rulePoint && (
          <Modal
            title={`当前生效的判定与告警规则 · ${s.points.find((p) => p.id === rulePoint)?.name}`}
            wide
            onClose={() => setRulePoint("")}
          >
              {/* 只读：告警设置统一在「巡检目标台账 › 告警设置」维护 */}
              <AlarmConfiguration
                key={rulePoint}
                pointId={rulePoint}
                embedded
                readOnly
              />
          </Modal>
        )}
      </Panel>
    );
  }
  // 设备主数据（阶段③）已独立成页：见 pages/DeviceMaster.tsx（沿用 equipment 路由），
  // 本文件中不再保留"由点位反推设备"的第二套口径
  if (page === "analytics" || page === "archive") {
    const completed = s.tasks.filter((t) => t.state === "完成").length;
    const stats = [
      [
        "任务完整完成率",
        s.tasks.length ? Math.round((completed / s.tasks.length) * 100) : 0,
      ],
      [
        "异常结果占比",
        s.results.length
          ? Math.round(
              (s.results.filter((r) => r.abnormal).length / s.results.length) *
                100,
            )
          : 0,
      ],
    ];
    return (
      <>
        {/* RPT-01/02：本页定性为「统计类报表」——只放聚合统计，不下钻明细行；明细统一在巡检结果 */}
        <Note>
          <b>报表定位（RPT-01）</b>：本页只放<b>聚合统计</b>（完成率、异常 / 报警走势、区域 / 设备分布），
          <b>不下钻到明细行</b>；明细全部归「巡检结果」。
          <b>报表节奏（RPT-02）</b>：先做 1 张总览报表（巡检完成情况 + 异常 / 报警走势），
          后续按业务参考安全生产信息化平台的巡检 / 隐患治理报表逐步补充。
        </Note>
        <div className="grid two">
          <Panel title="任务与巡检质量">
            {stats.map(([n, v]) => (
              <div className="bar-stat" key={n}>
                <span>{n}</span>
                <progress value={+v} max={100} />
                <b>{v}%</b>
              </div>
            ))}
            <p>
              当前演示数据：{s.tasks.length} 个任务 / {s.results.length} 个结果
              / {s.alarms.length} 条告警。
            </p>
          </Panel>
          <Panel title="压力读数历史趋势">
            <svg className="chart" viewBox="0 0 500 190">
              <path d="M40 20V155H480" fill="none" stroke="#b9c8d8" />
              <path d="M40 60H480" stroke="#d88673" strokeDasharray="4 5" />
              <text x="400" y="50" fill="#a65b4b" fontSize="12">
                上限 0.8 MPa
              </text>
              <polyline
                points={s.results
                  .filter(
                    (r) => r.unit === "MPa" && Number.isFinite(Number(r.final)),
                  )
                  .slice()
                  .reverse()
                  .map(
                    (r, i, a) =>
                      `${60 + (i * 370) / Math.max(1, a.length - 1)},${155 - Number(r.final) * 100}`,
                  )
                  .join(" ")}
                fill="none"
                stroke="#236bc3"
                strokeWidth="3"
              />
              {s.results
                .filter(
                  (r) => r.unit === "MPa" && Number.isFinite(Number(r.final)),
                )
                .slice()
                .reverse()
                .map((r, i, a) => (
                  <circle
                    key={r.id}
                    cx={60 + (i * 370) / Math.max(1, a.length - 1)}
                    cy={155 - Number(r.final) * 100}
                    r="5"
                    fill="#236bc3"
                  />
                ))}
            </svg>
            <p className="muted">来自当前统一结果数据，按采集先后排列。</p>
          </Panel>
        </div>
        <Panel title="设备巡检档案">
          <Table
            heads={["设备 / 点位", "检测项", "结果", "时间", "详情"]}
            rows={s.results.map((r) => [
              s.points.find((p) => p.id === r.pointId)?.device,
              r.item,
              `${r.final} ${r.unit}`,
              r.time,
              <Btn onClick={() => go("result-detail", r.id)}>查看结果</Btn>,
            ])}
          />
        </Panel>
      </>
    );
  }
  // 参数配置中心：独立的双 Tab 页面（事件告警参数 / 字典与业务参数）
  if (page === "settings") return <ParamCenter />;

  const extras = s.extras.filter(
    (x) => x.category === page && (x.name + x.detail).includes(q),
  );
  return (
    <>
      <div>
        <Panel
          title={pages.find((p) => p.id === page)?.name || page}
          extra={
            <div className="actions">
              <input
                placeholder="搜索名称"
                value={q}
                onChange={(e) => Q(e.target.value)}
              />
              <Btn
                primary
                onClick={() => {
                  E(undefined);
                  N("");
                  D("");
                  M(true);
                }}
              >
                ＋ 新增
              </Btn>
            </div>
          }
        >
          <Table
            heads={["编号", "名称", "配置 / 业务范围", "状态", "操作"]}
            rows={extras.map((x) => [
              x.id,
              x.name,
              x.detail,
              <Badge>{x.status}</Badge>,
              <div className="actions">
                <Btn
                  onClick={() => {
                    E(x.id);
                    N(x.name);
                    D(x.detail);
                    M(true);
                  }}
                >
                  编辑
                </Btn>
                <Btn onClick={() => act({ type: "EXTRA_TOGGLE", id: x.id })}>
                  {x.status === "启用" ? "停用" : "启用"}
                </Btn>
              </div>,
            ])}
          />
          {page === "roles" && (
            <Note>
              权限配置为原型演示数据。当前演示账号为巡检主管，具备地图发布、任务调度、遥控和告警关闭权限。
            </Note>
          )}
          {page === "services" && (
            <Note>
              本地模型识别物体类别，业务身份由人员确认。外部 AI
              负责检测分析；本期不含模型训练。
            </Note>
          )}
        </Panel>
      </div>
      {modal && (
        <Modal
          title={edit ? "编辑配置" : "新增配置"}
          wide
          onClose={() => M(false)}
        >
          <Field label="名称">
            <input value={name} onChange={(e) => N(e.target.value)} />
          </Field>
          <Field label="说明 / 业务范围">
            <textarea
              rows={4}
              value={detail}
              onChange={(e) => D(e.target.value)}
            />
          </Field>
          <Btn
            primary
            onClick={() => {
              if (
                act({
                  type: "EXTRA_SAVE",
                  id: edit,
                  category: page,
                  name,
                  detail,
                })
              )
                M(false);
            }}
          >
            保存
          </Btn>
        </Modal>
      )}
    </>
  );
}
