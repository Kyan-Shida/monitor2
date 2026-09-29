/**
 * @file DeviceMaster.tsx
 * @description 设备主数据后台（阶段③）：清单导入 → 待审核 → 通过 / 驳回 → 启停与「是否巡检」。
 *              定位说明（v3 定案）：**这不是每个点位都要走的前置页面**——
 *              标注页可直接选设备或「＋快速新建」即时生效；本页只负责批量维护与审核。
 * @interaction 路由沿用 `equipment`（/resources/equipment），不新增菜单项；
 *              引擎 action：IMPORT_DEVICES / REVIEW_DEVICE_IMPORT / SET_INSPECT_FLAG / SET_DEVICE_STATE
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { Btn, Badge, Panel, Table, Field, Note, Modal } from "../components/UI";
import { deviceStats, codeOfDeviceName } from "../data/deviceMaster";
import type { DeviceAsset } from "../data/types";

/** 导入模板表头与示例（与 IMPORT_DEVICES 的校验口径一致） */
const CSV_HEADS = ["设备编码", "设备名称", "设备类型", "安装位置", "检测目标", "单位"];
const CSV_SAMPLE = `设备编码,设备名称,设备类型,安装位置,检测目标,单位
V010,V010 新增储罐,储罐,一期罐区北侧,液位计,m
V011,V011 在线分析仪,分析仪,一期装置区,读数/状态,`;

export function DeviceMaster() {
  const { s, act } = useStore();
  const [tab, T] = useViewState("device-master.tab", "设备清单");
  const [q, Q] = useViewState("device-master.q", "");
  const [stateF, STF] = useViewState("device-master.state", "全部");
  const [csv, CSVSET] = useState(CSV_SAMPLE);
  const [batch, BSET] = useState("IMP-20260929-02");
  const [importError, IESET] = useState("");
  /** 待二次确认的停用设备 */
  const [stopping, STOPSET] = useState<DeviceAsset | null>(null);
  /** 待填写驳回理由的设备 */
  const [rejecting, REJSET] = useState<DeviceAsset | null>(null);
  const [rejectNote, RNSET] = useState("");

  const stat = deviceStats(s);
  const all = s.devices || [];
  const pointsOf = (d: DeviceAsset) => s.points.filter((p) => p.device === d.name);
  const kw = q.trim();
  const listed = all.filter(
    (d) =>
      (!kw || (d.name + d.id + d.type).includes(kw)) &&
      (stateF === "全部" ||
        (stateF === "待审核" || stateF === "已驳回"
          ? d.reviewState === stateF
          : d.state === stateF)),
  );
  const pending = all.filter((d) => d.reviewState === "待审核");
  const rejected = all.filter((d) => d.reviewState === "已驳回");

  /** 解析粘贴的 CSV 并提交导入；校验失败由引擎给出具体原因 */
  function runImport() {
    IESET("");
    const rows = csv
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => !CSV_HEADS.some((h) => x.startsWith(h)));
    if (!rows.length) {
      IESET("请粘贴至少一行设备数据（可复制上方示例修改）。");
      return;
    }
    const devices = rows.map((line) => {
      const [code, name, type, locationDesc, target, unit] = line
        .split(",")
        .map((x) => (x || "").trim());
      return {
        id: code,
        name,
        type: type || "未分类",
        regionCode: "R-A03",
        locationDesc: locationDesc || "",
        items: target
          ? [
              {
                id: `II-${code}-1`,
                target,
                kind: "可见光",
                unit: unit || "",
                inspect: true,
                cycle: "每日",
                priority: "普通",
              },
            ]
          : [],
      };
    });
    if (act({ type: "IMPORT_DEVICES", batch, devices })) T("待审核");
  }

  return (
    <>
      <div className="metric-strip">
        <div>
          <span>设备总数</span>
          <strong>{stat.total}</strong>
        </div>
        <div>
          <span>在用（已通过）</span>
          <strong>{stat.inUse}</strong>
        </div>
        <div>
          <span>停用</span>
          <strong>{stat.stopped}</strong>
        </div>
        <div>
          <span>待审核</span>
          <strong>{stat.pending}</strong>
        </div>
        <div>
          <span>已驳回</span>
          <strong>{stat.rejected}</strong>
        </div>
        <div>
          <span>巡检项（开启）</span>
          <strong>
            {stat.itemTotal - stat.itemOff}/{stat.itemTotal}
          </strong>
        </div>
      </div>
      <div className="local-tabs">
        {["设备清单", "导入与审核", "检测项"].map((x) => (
          <button key={x} className={tab === x ? "active" : ""} onClick={() => T(x)}>
            {x}
            {x === "导入与审核" && pending.length ? ` (${pending.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "设备清单" && (
        <Panel
          title="设备台账"
          extra={
            <div className="actions">
              <label className="inline-filter">
                <span>状态：</span>
                <select value={stateF} onChange={(e) => STF(e.target.value)}>
                  {["全部", "在用", "停用", "待审核", "已驳回"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <input
                placeholder="搜索编码 / 名称 / 类型"
                value={q}
                onChange={(e) => Q(e.target.value)}
              />
            </div>
          }
        >
          <p className="muted">
            设备是「巡检什么」的唯一来源：巡检点的巡检项、任务指令集与「设备已停用」拦截都以本台账为准。
          </p>
          <Table
            heads={[
              "编码",
              "设备名称",
              "类型 / 位置",
              "检测目标",
              "关联点位",
              "状态",
              "审核",
              "操作",
            ]}
            rows={listed.map((d) => {
              const pts = pointsOf(d);
              return [
                d.id,
                <button className="link" onClick={() => go("archive", codeOfDeviceName(d.name))}>
                  {d.name}
                </button>,
                <>
                  {d.type}
                  <small>{d.locationDesc || "—"}</small>
                </>,
                <>
                  {d.items.map((it) => it.target).join(" / ") || "—"}
                  <small>
                    {d.items.filter((it) => it.inspect).length}/{d.items.length} 项参与巡检
                  </small>
                </>,
                pts.length ? (
                  <button className="link" onClick={() => go("annotation")}>
                    {pts.length} 个
                  </button>
                ) : (
                  <span className="muted">未落位</span>
                ),
                <Badge>{d.reviewState === "已通过" ? d.state || "在用" : "—"}</Badge>,
                <>
                  <Badge>{d.reviewState}</Badge>
                  {d.reviewNote && <small>{d.reviewNote}</small>}
                </>,
                <div className="actions">
                  {d.reviewState === "已通过" ? (
                    <Btn
                      onClick={() =>
                        d.state === "停用"
                          ? act({ type: "SET_DEVICE_STATE", deviceId: d.id, state: "在用" })
                          : STOPSET(d)
                      }
                    >
                      {d.state === "停用" ? "启用" : "停用"}
                    </Btn>
                  ) : (
                    <Btn onClick={() => T("导入与审核")}>去审核</Btn>
                  )}
                </div>,
              ];
            })}
          />
        </Panel>
      )}

      {tab === "导入与审核" && (
        <>
          <Panel title="清单导入（Excel / CSV 粘贴）">
            <Note>
              导入后进入「待审核」，审核通过才生效——避免编码重复、单位缺失的清单直接污染任务口径。
              单次最多 200 台；数值类检测目标必须带单位。现场少量补录可直接在
              <button className="link" onClick={() => go("point-annotate")}>
                地图标注工作台
              </button>
              用「＋快速新建设备」。
            </Note>
            <Field label="导入批次">
              <input value={batch} onChange={(e) => BSET(e.target.value)} />
            </Field>
            <Field label="清单内容（每行一台：编码,名称,类型,位置,检测目标,单位）">
              <textarea
                rows={6}
                value={csv}
                onChange={(e) => CSVSET(e.target.value)}
                spellCheck={false}
              />
            </Field>
            {importError && (
              <p role="alert" className="reference-upload-error">
                {importError}
              </p>
            )}
            <div className="actions">
              <Btn primary onClick={runImport}>
                导入并送审
              </Btn>
              <Btn onClick={() => CSVSET(CSV_SAMPLE)}>恢复示例</Btn>
              <Btn onClick={() => Q("")}>清空搜索</Btn>
            </div>
          </Panel>
          <Panel title="待审核" extra={<span>{pending.length} 台</span>}>
            <Table
              heads={["批次", "编码", "设备名称", "检测目标", "导入时间", "操作"]}
              rows={pending.map((d) => [
                d.importBatch || "—",
                d.id,
                d.name,
                d.items.map((it) => `${it.target}${it.unit ? `(${it.unit})` : ""}`).join(" / ") ||
                  "—",
                d.importedAt || "—",
                <div className="actions">
                  <Btn primary onClick={() => act({ type: "REVIEW_DEVICE_IMPORT", ids: [d.id], pass: true })}>
                    通过
                  </Btn>
                  <Btn
                    onClick={() => {
                      RNSET("");
                      REJSET(d);
                    }}
                  >
                    驳回
                  </Btn>
                </div>,
              ])}
            />
          </Panel>
          {rejected.length > 0 && (
            <Panel title="已驳回" extra={<span>{rejected.length} 台</span>}>
              <Table
                heads={["编码", "设备名称", "驳回原因", "批次", "操作"]}
                rows={rejected.map((d) => [
                  d.id,
                  d.name,
                  d.reviewNote || "—",
                  d.importBatch || "—",
                  // 重新导入即把该设备放回「待审核」，核对无误后再审核通过
                  <Btn
                    onClick={() =>
                      act({
                        type: "IMPORT_DEVICES",
                        batch: d.importBatch || "IMP-RESUBMIT",
                        devices: [
                          {
                            id: d.id,
                            name: d.name,
                            type: d.type,
                            regionCode: d.regionCode,
                            locationDesc: d.locationDesc,
                            coord: d.coord,
                            coordSys: d.coordSys,
                            height: d.height,
                            remark: d.remark,
                            items: d.items,
                          },
                        ],
                      })
                    }
                  >
                    重新导入送审
                  </Btn>,
                ])}
              />
            </Panel>
          )}
        </>
      )}

      {tab === "检测项" && (
        <Panel
          title="检测项与「是否巡检」"
          extra={<span>关闭的检测目标不会进入任务指令集</span>}
        >
          <Table
            heads={["设备", "检测目标", "采集方式", "单位", "周期", "优先级", "是否巡检"]}
            rows={all
              .filter((d) => !kw || (d.name + d.id).includes(kw))
              .flatMap((d) =>
                d.items.map((it) => [
                  <>
                    {d.name}
                    <small>{d.id}</small>
                  </>,
                  it.target,
                  it.kind,
                  it.unit || "—",
                  it.cycle,
                  <Badge>{it.priority}</Badge>,
                  <label className="inline-filter">
                    <input
                      type="checkbox"
                      checked={it.inspect}
                      onChange={(e) =>
                        act({
                          type: "SET_INSPECT_FLAG",
                          deviceId: d.id,
                          itemId: it.id,
                          inspect: e.target.checked,
                        })
                      }
                    />
                    <span>{it.inspect ? "参与巡检" : "已关闭"}</span>
                  </label>,
                ]),
              )}
          />
        </Panel>
      )}

      {stopping && (
        <Modal
          title={`停用 ${stopping.name}`}
          onClose={() => STOPSET(null)}
          footer={
            <>
              <Btn onClick={() => STOPSET(null)}>取消</Btn>
              <Btn
                primary
                onClick={() => {
                  act({
                    type: "SET_DEVICE_STATE",
                    deviceId: stopping.id,
                    state: "停用",
                    confirmed: true,
                  });
                  STOPSET(null);
                }}
              >
                确认停用
              </Btn>
            </>
          }
        >
          <Note>
            停用后，包含该设备点位的任务将被拦截（新建 / 派单都会提示「所属设备已停用」）。
            已在执行或已排队的任务不会自动回收，请在调度页人工处置。
          </Note>
          <p>
            涉及点位：{pointsOf(stopping).length} 个
            {pointsOf(stopping).length
              ? `（${pointsOf(stopping).map((p) => p.name).join("、")}）`
              : ""}
          </p>
        </Modal>
      )}

      {rejecting && (
        <Modal
          title={`驳回 ${rejecting.name}`}
          /* 驳回理由回写台账，导入方据此核对后重新导入 */
          onClose={() => REJSET(null)}
          footer={
            <>
              <Btn onClick={() => REJSET(null)}>取消</Btn>
              <Btn
                primary
                onClick={() => {
                  act({
                    type: "REVIEW_DEVICE_IMPORT",
                    ids: [rejecting.id],
                    pass: false,
                    note: rejectNote || "资料不完整，请补充后重新导入",
                  });
                  REJSET(null);
                }}
              >
                确认驳回
              </Btn>
            </>
          }
        >
          <Field label="驳回原因（回写台账，供导入方核对）">
            <textarea
              rows={3}
              value={rejectNote}
              placeholder="例如：编码与现场铭牌不一致，请核对后重新导入"
              onChange={(e) => RNSET(e.target.value)}
            />
          </Field>
        </Modal>
      )}
    </>
  );
}
