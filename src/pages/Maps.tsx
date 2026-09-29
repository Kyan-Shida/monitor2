import { MapOnboarding } from "../components/MapOnboarding";
import { useState } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import {
  Btn,
  Badge,
  Panel,
  Table,
  Field,
  Note,
  Modal,
  Steps,
  Download,
} from "../components/UI";
import { MapSpatialPreview } from "../components/MapSpatialPreview";
import { MapCanvas } from "../components/MapCanvas";
export function Maps({ tab = "list", id }: { tab?: string; id?: string }) {
  const { s, act } = useStore();
  const m = s.maps.find((x) => x.id === id) || s.maps[0];
  const [modal, M] = useState(""),
    [step, S] = useState(0),
    [name, N] = useState("罐区补充采集地图"),
    [file, F] = useState(""),
    [cloud, C] = useState(""),
    [video, V] = useState(""),
    [source, SO] = useState("手持仪器"),
    [rid, R] = useState("R02"),
    [note, NO] = useState(""),
    [kind, K] = useState("仅业务属性变更"),
    [pid, P] = useState("P002"),
    [query, Q] = useViewState("maps.query", "");
  const pts = s.points.filter((p) => p.mapId === m.id);
  const tabs = [
    ["list", "地图列表"],
    ["workflow", "地图上线工作台"],
    ["detail", "地图详情"],
    ["archive", "原始资料"],
    ["sync", "地图版本与机器人同步"],
    ["changes", "地图 / 点位变化管理"],
  ];
  return (
    <>
      <div className="toolbar">
        <div className="tabs">
          {tabs.map(([k, n]) => (
            <button
              className={tab === k ? "active" : ""}
              onClick={() => go("maps", m.id, k)}
              key={k}
            >
              {n}
            </button>
          ))}
        </div>
        <Btn
          primary
          onClick={() => {
            M("import");
            S(0);
          }}
        >
          ＋ 导入地图
        </Btn>
      </div>
      {tab === "workflow" && <MapOnboarding key={m.id} mapId={m.id} />}
      {tab === "list" ? (
        <Panel
          title="地图资产"
          extra={
            <input
              placeholder="搜索名称 / 区域"
              value={query}
              onChange={(e) => Q(e.target.value)}
            />
          }
        >
          <Table
            heads={[
              "地图 / 区域",
              "版本",
              "原始资料",
              "候选 / 业务点位",
              "发布状态",
              "操作",
            ]}
            rows={s.maps
              .filter((m) => (m.name + m.region).includes(query))
              .map((m) => [
                <b>
                  {m.name}
                  <small>
                    {m.id} · {m.region}
                  </small>
                </b>,
                `m${m.version} / p${m.pointSet}`,
                m.cloud && m.video ? "点云 + 视频已归档" : "资料待补齐",
                `${m.targets.length} / ${s.points.filter((p) => p.mapId === m.id).length}`,
                <Badge>{m.state}</Badge>,
                <div className="actions"><Btn primary onClick={() => go("maps", m.id, "workflow")}>继续上线配置</Btn><Btn onClick={() => go("maps", m.id, "detail")}>档案</Btn></div>,
              ])}
          />
        </Panel>
      ) : (
        <>
          {tab === "detail" && (
            <div className="context-bar">
              <div>
                <b>{m.name}</b>
                <span>
                  {m.id} · {m.region} · m{m.version} / p{m.pointSet}
                </span>
              </div>
              <Badge>{m.state}</Badge>
              <div className="actions">
                <Download
                  name={`${m.id}-m${m.version}.json`}
                  data={{ ...m, points: pts }}
                />
                <Btn onClick={() => go("annotation", m.id)}>点位标注</Btn>
                <Btn primary onClick={() => M("publish")}>
                  发布版本
                </Btn>
              </div>
            </div>
          )}
          {tab === "detail" && (
            <Panel title="地图文件与展示关系">
              <div className="map-artifacts">
                <div>
                  <b>原始采集资料</b>
                  <p>
                    {m.cloud}
                    <br />
                    {m.video}
                  </p>
                  <small>
                    批次 {m.batch} · {m.source} · 原始资料保留
                  </small>
                </div>
                <div>
                  <b>机器人地图包</b>
                  <p>{m.file}</p>
                  <small>
                    局部坐标系（模拟） · 厂商格式待接入
                    <br />
                    校验 {m.checksum}
                  </small>
                </div>
                <div>
                  <b>平台展示视图</b>
                  <p>二维业务图 / 三维点云示意</p>
                  <small>
                    共用点位身份与版本。当前不解析真实厂商点云格式。
                  </small>
                </div>
              </div>
            </Panel>
          )}
          {tab === "detail" && (
            <div className="grid two">
              <Panel title="地图预览与业务目标">
                <MapSpatialPreview
                  map={m}
                  points={pts}
                  onSelect={() => go("annotation", m.id)}
                />
              </Panel>
              <Panel title="版本与来源">
                <dl>
                  <dt>空间地图版本</dt>
                  <dd>m{m.version}</dd>
                  <dt>点位集合版本</dt>
                  <dd>p{m.pointSet}</dd>
                  <dt>来源批次</dt>
                  <dd>
                    {m.batch} · {m.source}
                  </dd>
                  <dt>地图文件</dt>
                  <dd>{m.file}</dd>
                </dl>
                <h4>版本历史</h4>
                {m.history.map((h, i) => (
                  <p className="event" key={i}>
                    {h}
                  </p>
                ))}
                <h4>点位版本清单</h4>
                {pts.map((p) => (
                  <p key={p.id}>
                    {p.name} · v{p.version} <Badge>{p.state}</Badge>
                  </p>
                ))}
                <Btn onClick={() => go("maps", m.id, "sync")}>
                  查看机器人同步 →
                </Btn>
              </Panel>
            </div>
          )}
          {tab === "archive" && (
            <Panel title="采集批次原始资料 · 保留原文件">
              <Note>
                采集批次 {m.batch} · {m.source}
                。此原型登记文件元信息，不上传真实大文件。
              </Note>
              <Table
                heads={["类型", "文件名", "校验", "归档状态"]}
                rows={[
                  [
                    "激光 + 视觉点云",
                    m.cloud || "未提供",
                    m.cloud ? m.checksum : "待校验",
                    m.cloud ? "已留档" : "缺失",
                  ],
                  [
                    "原始建图视频",
                    m.video || "未提供",
                    m.video ? m.checksum : "待校验",
                    m.video ? "已留档" : "缺失",
                  ],
                  ["生成地图", m.file, m.checksum, "独立版本存储"],
                ]}
              />
              <Btn
                onClick={() => {
                  C(m.cloud);
                  V(m.video);
                  M("archive");
                }}
              >
                补充归档资料
              </Btn>
            </Panel>
          )}
          {tab === "sync" && (
            <>
              <Note>
                传输完成不等于已同步。只有激活回执确认版本一致后才更新机器人实际版本。任务执行中须等待维护窗口。
              </Note>
              <Panel
                title="按机器人同步"
                extra={
                  <div className="actions">
                    <select value={rid} onChange={(e) => R(e.target.value)}>
                      {s.robots.map((r) => (
                        <option key={r.id}>{r.id}</option>
                      ))}
                    </select>
                    <Btn
                      primary
                      onClick={() =>
                        act({ type: "SYNC", mapId: m.id, robotId: rid })
                      }
                    >
                      下发当前版本
                    </Btn>
                  </div>
                }
              >
                <Table
                  heads={[
                    "机器人",
                    "当前状态",
                    "期望版本",
                    "实际版本",
                    "维护窗口",
                  ]}
                  rows={s.robots.map((r) => [
                    r.name,
                    <Badge>{r.state}</Badge>,
                    `m${m.version} / p${m.pointSet}`,
                    `${r.mapId} / m${r.mapVersion} / p${r.pointSet}`,
                    r.region !== m.region
                      ? "不适用区域"
                      : r.current
                        ? "任务结束后"
                        : r.state === "空闲"
                          ? "当前可维护"
                          : "等待空闲",
                  ])}
                />
              </Panel>
              <Panel title="下发记录与模拟回执">
                <Table
                  heads={[
                    "同步编号",
                    "机器人",
                    "目标版本",
                    "阶段",
                    "反馈",
                    "操作",
                  ]}
                  rows={s.syncs
                    .filter((x) => x.mapId === m.id)
                    .map((x) => [
                      x.id,
                      x.robotId,
                      `m${x.mapVersion} / p${x.pointSet}`,
                      <Badge>{x.state}</Badge>,
                      x.reason || "—",
                      <div className="actions">
                        <Btn
                          disabled={x.state === "已同步"}
                          onClick={() => act({ type: "SYNC_STEP", id: x.id })}
                        >
                          {x.state === "失败"
                            ? "重试"
                            : x.state === "待激活"
                              ? "确认激活回执"
                              : "模拟下一阶段回执"}
                        </Btn>
                        <Btn
                          disabled={x.state === "已同步" || x.state === "失败"}
                          onClick={() =>
                            act({ type: "SYNC_STEP", id: x.id, fail: true })
                          }
                        >
                          模拟失败
                        </Btn>
                      </div>,
                    ])}
                />
              </Panel>
            </>
          )}
          {tab === "changes" && (
            <Panel
              title="现场变化与影响处理"
              extra={
                <Btn primary onClick={() => M("change")}>
                  登记变化
                </Btn>
              }
            >
              <Table
                heads={["编号 / 来源", "类型 / 证据", "状态", "影响", "操作"]}
                rows={s.changes
                  .filter((c) => c.mapId === m.id)
                  .map((c) => [
                    <>
                      {c.id}
                      <small>{c.source}</small>
                    </>,
                    <>
                      {c.type}
                      <small>{c.note}</small>
                    </>,
                    <Badge>{c.state}</Badge>,
                    c.pointId,
                    <div className="actions">
                      <Btn
                        disabled={c.state !== "待确认"}
                        onClick={() =>
                          act({ type: "CHANGE_CONFIRM", id: c.id })
                        }
                      >
                        确认影响
                      </Btn>
                      <Btn
                        disabled={c.state !== "维护中"}
                        onClick={() => {
                          P(c.id);
                          F("");
                          M("revision");
                        }}
                      >
                        提交修订
                      </Btn>
                      <Btn
                        disabled={c.state !== "待同步"}
                        onClick={() => act({ type: "CHANGE_CLOSE", id: c.id })}
                      >
                        核对并关闭
                      </Btn>
                    </div>,
                  ])}
              />
            </Panel>
          )}
        </>
      )}
      {modal && (
        <Modal
          title={
            modal === "import"
              ? "地图导入向导"
              : modal === "publish"
                ? "版本发布与影响检查"
                : modal === "change"
                  ? "登记现场变化"
                  : modal === "revision"
                    ? "修订地图与点位版本"
                    : "原始资料归档"
          }
          drawer
          drawerWidth={780}
          onClose={() => M("")}
        >
          {modal === "import" ? (
            <>
              <Steps
                items={["来源与区域", "地图文件", "原始资料", "校验与导入"]}
                current={step}
              />
              {step === 0 && (
                <>
                  <Field label="地图名称">
                    <input value={name} onChange={(e) => N(e.target.value)} />
                  </Field>
                  <Field label="采集来源">
                    <select value={source} onChange={(e) => SO(e.target.value)}>
                      <option>手持仪器</option>
                      <option>机器人首次走行</option>
                    </select>
                  </Field>
                  <Field label="区域">
                    <input value="一期罐区" readOnly />
                  </Field>
                </>
              )}
              {step === 1 && (
                <>
                  <Field label="地图文件（本地文件元信息）">
                    <input
                      type="file"
                      onChange={(e) => F(e.target.files?.[0]?.name || "")}
                    />
                  </Field>
                  <p>{file || "尚未选择"}</p>
                  <Btn
                    onClick={() => {
                      F("sample-map-v1.map");
                      C("sample-multimodal.pcd");
                      V("sample-video.mp4");
                    }}
                  >
                    使用完整示例采集包
                  </Btn>
                </>
              )}
              {step === 2 && (
                <>
                  <Field label="原始点云">
                    <input value={cloud} onChange={(e) => C(e.target.value)} />
                  </Field>
                  <Field label="原始视频">
                    <input value={video} onChange={(e) => V(e.target.value)} />
                  </Field>
                  <Note>缺少资料允许暂存草稿，但不能正式发布。</Note>
                </>
              )}
              {step === 3 && (
                <>
                  <p>地图：{file || "缺失"} · 2 个候选目标</p>
                  <p>
                    点云：{cloud || "缺失"} / 视频：{video || "缺失"}
                  </p>
                  <Note>
                    演示校验：仅检查元信息完整性，实际文件格式校验由后续接入实现。
                  </Note>
                </>
              )}
              <div className="modal-actions">
                <Btn disabled={step === 0} onClick={() => S(step - 1)}>
                  上一步
                </Btn>
                {step < 3 ? (
                  <Btn primary onClick={() => S(step + 1)}>
                    下一步
                  </Btn>
                ) : (
                  <Btn
                    primary
                    onClick={() => {
                      if (
                        act({
                          type: "IMPORT",
                          name,
                          file,
                          cloud,
                          video,
                          source,
                        })
                      ) {
                        M("");
                        go("maps", undefined, "workflow");
                      }
                    }}
                  >
                    导入草稿
                  </Btn>
                )}
              </div>
            </>
          ) : modal === "publish" ? (
            <>
              <Note>
                影响 {pts.length} 个点位、
                {
                  s.templates.filter((t) =>
                    t.points.some((p) => pts.some((q) => q.id === p)),
                  ).length
                }{" "}
                个模板。历史任务快照保持不变。
              </Note>
              {pts.map((p) => (
                <p key={p.id}>
                  {p.name} v{p.version} <Badge>{p.state}</Badge>
                </p>
              ))}
              <p>原始资料：{m.cloud && m.video ? "完整" : "不完整"}</p>
              <div className="actions">
                <Btn
                  onClick={() => {
                    if (act({ type: "PUBLISH", id: m.id, trial: true })) {
                      M("");
                      go("maps", m.id, "sync");
                    }
                  }}
                >
                  发布试验版本
                </Btn>
                <Btn
                  primary
                  onClick={() => {
                    if (act({ type: "PUBLISH", id: m.id })) {
                      M("");
                      go("maps", m.id, "sync");
                    }
                  }}
                >
                  正式发布，进入同步
                </Btn>
              </div>
            </>
          ) : modal === "change" ? (
            <>
              <Field label="变化类型">
                <select value={kind} onChange={(e) => K(e.target.value)}>
                  <option>仅业务属性变更</option>
                  <option>目标移动/新增/移除</option>
                  <option>通道/结构变化</option>
                </select>
              </Field>
              <Field label="关联点位">
                <select value={pid} onChange={(e) => P(e.target.value)}>
                  {pts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="变化说明与证据">
                <textarea value={note} onChange={(e) => NO(e.target.value)} />
              </Field>
              <Btn
                primary
                onClick={() => {
                  if (
                    act({
                      type: "CHANGE_ADD",
                      mapId: m.id,
                      pointId: pid,
                      kind,
                      reason: note,
                    })
                  )
                    M("");
                }}
              >
                登记
              </Btn>
            </>
          ) : modal === "revision" ? (
            <>
              <Field label="外部修订地图文件">
                <input
                  type="file"
                  onChange={(e) => F(e.target.files?.[0]?.name || "")}
                />
              </Field>
              <Btn onClick={() => F("revised-map-demo.map")}>
                使用修订地图示例
              </Btn>
              <p>{file}</p>
              <Note>
                提交后重新发布试验版本、同步验证、正式发布，再核对区域机器人完成变化关闭。
              </Note>
              <Btn
                primary
                onClick={() => {
                  if (act({ type: "CHANGE_REVISION", id: pid, file })) M("");
                }}
              >
                保存修订版本
              </Btn>
            </>
          ) : (
            <>
              <Field label="点云归档文件">
                <input value={cloud} onChange={(e) => C(e.target.value)} />
              </Field>
              <Field label="视频归档文件">
                <input value={video} onChange={(e) => V(e.target.value)} />
              </Field>
              <Btn
                primary
                onClick={() => {
                  if (act({ type: "ARCHIVE", id: m.id, cloud, video })) M("");
                }}
              >
                保存归档
              </Btn>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
