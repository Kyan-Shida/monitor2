import { AlarmConfiguration } from "./AlarmConfiguration";
import { rulesOf } from "../data/alarmRules";
import { SystemAlarmParameters } from "../components/SystemAlarmParameters";
import { ObjectLink, Pager } from "../components/Business";
import { useState } from "react";
import { useStore } from "../data/store";
import { go, pages, useViewState } from "../data/navigation";
import {
  Btn,
  Badge,
  Panel,
  Table,
  Field,
  Note,
  Modal,
} from "../components/UI";
import { RoleMatrix } from "../components/RoleMatrix";
export function Supporting({ page }: { page: string }) {
  const { s, act } = useStore();
  const [rulePoint, setRulePoint] = useState("");
  const pointRules = rulesOf(s);
  const [q, Q] = useViewState("supporting." + page + ".query", ""),
    [edit, E] = useState<string | undefined>(),
    [modal, M] = useState(false),
    [name, N] = useState(""),
    [detail, D] = useState(""),
    [bid, B] = useState("BIZ-20260922-001"),
    /** 设备资源页「对象与检测项」弹窗开关：就地查看，不跳转离开当前页 */
    [objectsOpen, OO] = useState(false),
    /** 「对象与检测项」弹窗对应的设备（统一取自点位所属设备） */
    [objDevice, OD] = useState(""),
    /** 设备资源树选中的设备；空串表示全部设备 */
    [eqSel, ES] = useState(""),
    [pDev, PD] = useViewState("supporting.points.device", "全部"),
    [pMap, PM] = useViewState("supporting.points.map", "全部"),
    [pState, PS] = useViewState("supporting.points.state", "全部"),
    [pPage, PP] = useViewState("supporting.points.page", 1);
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
        <Badge>{p.state}</Badge> v{p.version}
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
                {rule?.level} · v{rule?.version}
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
          结果与告警规则
        </Btn>
        <Btn onClick={() => go("annotation", p.mapId)}>编辑标注</Btn>
      </div>,
    ]);
  // 角色权限矩阵：管理员 / 非管理员 × 权限五要素，替代原通用配置表
  if (page === "roles") return <RoleMatrix />;

  if (["audit", "interface-log", "dispatch-log", "replay"].includes(page)) {
    const logs = s.logs.filter(
      (l) =>
        page === "audit" ||
        page === "replay" ||
        (page === "interface-log" &&
          ["EXTERNAL", "SYNC", "SYNC_STEP", "DISPATCH", "RECEIPT"].includes(
            l.action,
          )) ||
        (page === "dispatch-log" &&
          [
            "ASSIGN",
            "DISPATCH",
            "PREEMPT",
            "WITHDRAW",
            "REORDER",
            "RECEIPT",
          ].includes(l.action)),
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
    const size = 10;
    const pages = Math.max(1, Math.ceil(list.length / size));
    const cur = Math.min(pPage, pages);
    return (
      <Panel
        className="panel-filters-wrap"
        title="业务巡检点与版本"
        extra={
          <div className="actions">
            <label className="inline-filter">
              <span>设备：</span>
              <select
                value={pDev}
                onChange={(e) => {
                  PD(e.target.value);
                  PP(1);
                }}
              >
                {deviceOpts.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="inline-filter">
              <span>地图：</span>
              <select
                value={pMap}
                onChange={(e) => {
                  PM(e.target.value);
                  PP(1);
                }}
              >
                {mapOpts.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="inline-filter">
              <span>状态：</span>
              <select
                value={pState}
                onChange={(e) => {
                  PS(e.target.value);
                  PP(1);
                }}
              >
                {stateOpts.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <input
              placeholder="搜索点位名称 / 编号 / 检测项"
              value={q}
              onChange={(e) => {
                Q(e.target.value);
                PP(1);
              }}
            />
            <Btn primary onClick={() => go("annotation")}>
              业务标注工作台
            </Btn>
          </div>
        }
      >
        <Table
          heads={POINT_HEADS}
          rows={pointRows(list.slice((cur - 1) * size, cur * size))}
        />
        <Pager page={cur} count={list.length} size={size} onChange={PP} />
        {rulePoint && (
          <Modal
            title={`采集结果与告警规则 · ${s.points.find((p) => p.id === rulePoint)?.name}`}
            drawer
            drawerWidth={700}
            onClose={() => setRulePoint("")}
          >
              <AlarmConfiguration
                key={rulePoint}
                pointId={rulePoint}
                embedded
              />
          </Modal>
        )}
      </Panel>
    );
  }
  // 设备资源：树与台账统一以「点位所属设备」为唯一数据源，只读浏览 + 对象下钻，不再提供通用配置 CRUD
  if (page === "equipment") {
    const devices = [...new Set(s.points.map((p) => p.device))].map(
      (devName) => {
        const pts = s.points.filter((p) => p.device === devName);
        return {
          code: devName.split(" ")[0],
          name: devName,
          region: s.maps.find((m) => m.id === pts[0]?.mapId)?.region || "—",
          objects: [...new Set(pts.map((p) => p.object))],
          pointCount: pts.length,
          enabled: pts.filter((p) => p.state === "已启用").length,
        };
      },
    );
    const regions = [...new Set(devices.map((d) => d.region))];
    const kw = q.trim();
    const rows = devices
      .filter((d) => !eqSel || d.name === eqSel)
      .filter((d) => !kw || (d.name + d.code).includes(kw));
    return (
      <>
        <div className="grid template-layout">
          <Panel
            title="设备资源树"
            extra={<Btn onClick={() => ES("")}>全部设备</Btn>}
          >
            {/* 层级由数据派生（区域 → 设备），不再写死企业 / 装置 / 罐区三级 */}
            <div className="resource-tree">
              {regions.map((rg) => (
                <div key={rg}>
                  <div className="rt-node rt-l1">{rg}</div>
                  {devices
                    .filter((d) => d.region === rg)
                    .map((d) => (
                      <button
                        key={d.code}
                        className={
                          "rt-node rt-l3" + (eqSel === d.name ? " active" : "")
                        }
                        onClick={() => ES(d.name)}
                      >
                        {d.name}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </Panel>
          <Panel
            title="设备台账"
            extra={
              <input
                placeholder="搜索设备名称 / 编码"
                value={q}
                onChange={(e) => Q(e.target.value)}
              />
            }
          >
            <Table
              heads={[
                "设备编码",
                "设备名称",
                "所属区域",
                "关联对象",
                "关联点位",
                "点位启用",
                "操作",
              ]}
              rows={rows.map((d) => [
                d.code,
                <ObjectLink type="archive" id={d.code} to="archive">
                  {d.name}
                </ObjectLink>,
                d.region,
                d.objects.join(" / "),
                `${d.pointCount} 项`,
                `${d.enabled} / ${d.pointCount}`,
                <Btn
                  onClick={() => {
                    OD(d.name);
                    OO(true);
                  }}
                >
                  对象与检测项
                </Btn>,
              ])}
            />
          </Panel>
        </div>
        {objectsOpen && (
          <Modal
            title={`${objDevice || "全部设备"} · 对象与检测项`}
            drawer
            drawerWidth={860}
            footer={
              <>
                <Btn onClick={() => OO(false)}>关闭</Btn>
                <Btn primary onClick={() => go("annotation")}>
                  业务标注工作台
                </Btn>
              </>
            }
            onClose={() => OO(false)}
          >
            <Table
              heads={POINT_HEADS}
              rows={pointRows(
                s.points.filter((p) => !objDevice || p.device === objDevice),
              )}
            />
          </Modal>
        )}
      </>
    );
  }
  if (page === "integration")
    return (
      <>
        <div className="grid two">
          <Panel title="上层任务服务 · 演示调用方">
            <Field label="来源系统">
              <input readOnly value="企业巡检系统 DEMO" />
            </Field>
            <Field label="业务编号（幂等键）">
              <input value={bid} onChange={(e) => B(e.target.value)} />
            </Field>
            <Note>
              相同来源和业务编号返回同一任务，不重复生成。目标引用默认巡检模板。
            </Note>
            <Btn
              primary
              onClick={() => act({ type: "EXTERNAL", businessId: bid })}
            >
              模拟提交业务任务
            </Btn>
            <Btn onClick={() => go("dispatch")}>统一调度</Btn>
          </Panel>
          <Panel title="标准接口契约">
            <pre>
              {JSON.stringify(
                {
                  sourceSystem: "DEMO",
                  businessId: bid,
                  templateId: s.templates[0].id,
                  priority: "普通",
                  callback: "Mock 本地回调",
                },
                null,
                2,
              )}
            </pre>
            <p>提交 / 查询 / 取消任务 · 状态回传 · 结果回传</p>
            <Badge>Mock 接入 · 不连接真实系统</Badge>
          </Panel>
        </div>
        <Panel title="业务编号映射">
          <Table
            heads={["来源", "业务编号", "平台任务", "状态", "操作"]}
            rows={s.requests.map((x) => [
              "DEMO",
              x.businessId,
              x.taskId,
              s.tasks.find((t) => t.id === x.taskId)?.state,
              <Btn onClick={() => go("tasks", x.taskId)}>查询任务</Btn>,
            ])}
          />
        </Panel>
      </>
    );
  if (page === "analytics" || page === "archive") {
    const completed = s.tasks.filter((t) => t.state === "完成").length;
    const stats = [
      [
        "任务完整完成率",
        s.tasks.length ? Math.round((completed / s.tasks.length) * 100) : 0,
      ],
      [
        "有效结果占比",
        s.results.length
          ? Math.round(
              (s.results.filter((r) => r.status !== "待复核").length /
                s.results.length) *
                100,
            )
          : 0,
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
              <Btn onClick={() => go("review", r.id)}>追溯结果</Btn>,
            ])}
          />
        </Panel>
      </>
    );
  }
  const extras = s.extras.filter(
    (x) => x.category === page && (x.name + x.detail).includes(q),
  );
  return (
    <>
      <div>
        {page === "settings" && <SystemAlarmParameters />}
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
              权限配置为原型演示数据。当前演示账号为巡检管理员，具备地图发布、任务调度、遥控、结果复核和告警关闭权限。
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
          drawer
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
