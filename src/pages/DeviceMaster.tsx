/**
 * @file DeviceMaster.tsx
 * @description 设备主数据后台（阶段③）：左侧设备树 + 右侧设备台账；
 *              导入与审核改为右上角按钮 → 右侧抽屉；检测项按设备进入详情抽屉。
 * @interaction 路由沿用 `equipment`（/resources/equipment），不新增菜单项；
 *              引擎 action：IMPORT_DEVICES / REVIEW_DEVICE_IMPORT / SET_INSPECT_FLAG / SET_DEVICE_STATE
 */
import { useState, useEffect, useMemo } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { Btn, Badge, Panel, Table, Field, Note, Modal } from "../components/UI";
import { deviceStats } from "../data/deviceMaster";
import type { DeviceAsset } from "../data/types";
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";

/** 导入模板表头与示例（与 IMPORT_DEVICES 的校验口径一致） */
const CSV_HEADS = ["设备编码", "设备名称", "设备类型", "安装位置", "检测目标", "单位"];
const CSV_SAMPLE = `设备编码,设备名称,设备类型,安装位置,检测目标,单位
V010,V010 新增储罐,储罐,一期罐区北侧,液位计,m
V011,V011 在线分析仪,分析仪,一期装置区,读数/状态,`;

export function DeviceMaster() {
  const { s, act } = useStore();
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
  /** 左侧设备树选中：""=全部，"r:区域"=区域，"d:设备ID"=单台 */
  const [treeSel, TREE] = useViewState("device-master.tree", "");
  /** 详情抽屉：当前查看的设备 */
  const [detail, SETDETAIL] = useState<DeviceAsset | null>(null);
  /** 导入与审核抽屉开关 */
  const [auditOpen, SETAUDITOPEN] = useState(false);

  const stat = deviceStats(s);
  const all = s.devices || [];
  const pointsOf = (d: DeviceAsset) => s.points.filter((p) => p.device === d.name);
  const kw = q.trim();

  /** 设备所属区域（按安装位置前缀推导，保证设备树分组符合现场） */
  const regionOf = (d: DeviceAsset) =>
    d.locationDesc.startsWith("装置区")
      ? "装置区"
      : d.locationDesc.startsWith("一期罐区")
        ? "一期罐区"
        : "其他区域";
  const regions = useMemo(() => [...new Set(all.map(regionOf))].sort(), [all]);

  /** 树节点展开状态：默认全部展开 */
  const [expanded, SETEXPANDED] = useState<Set<string>>(() => new Set(regions));
  useEffect(() => {
    SETEXPANDED((prev) => {
      const next = new Set(prev);
      regions.forEach((r) => next.add(r));
      return next;
    });
  }, [regions]);
  const toggleRegion = (rg: string) => {
    SETEXPANDED((prev) => {
      const next = new Set(prev);
      if (next.has(rg)) next.delete(rg);
      else next.add(rg);
      return next;
    });
  };

  /** 分页 */
  const [page, PAGE] = useState(1);
  const [pageSize, PAGE_SIZE] = useState(5);
  const listed = useMemo(() => {
    return all.filter((d) => {
      if (treeSel.startsWith("d:")) return d.id === treeSel.slice(2);
      if (treeSel.startsWith("r:")) {
        if (regionOf(d) !== treeSel.slice(2)) return false;
      }
      if (kw && !(d.name + d.id + d.type).includes(kw)) return false;
      if (stateF === "全部") return true;
      if (stateF === "待审核" || stateF === "已驳回")
        return d.reviewState === stateF;
      return d.state === stateF;
    });
  }, [all, treeSel, stateF, kw]);
  useEffect(() => PAGE(1), [treeSel, stateF, kw]);
  const total = listed.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    if (page > totalPages) PAGE(totalPages);
  }, [page, totalPages]);
  const pageList = listed.slice((page - 1) * pageSize, page * pageSize);

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
    if (act({ type: "IMPORT_DEVICES", batch, devices })) {
      CSVSET(CSV_SAMPLE);
      IESET("导入成功，已加入待审核列表");
    }
  }

  /** 下载参考 Excel/CSV 模板 */
  function downloadTemplate() {
    const blob = new Blob(["\uFEFF" + CSV_SAMPLE], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "设备导入模板.csv";
    a.click();
    URL.revokeObjectURL(url);
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

      <div className="device-layout">
        <aside className="device-tree" aria-label="设备树">
          <div
            className={"tree-node root" + (treeSel === "" ? " sel" : "")}
            onClick={() => TREE("")}
          >
            <span className="tree-icon tree-folder">
              <Folder size={14} />
            </span>
            <span className="tree-label">全部设备</span>
            <span className="tree-count">{all.length}</span>
          </div>
          {regions.map((rg) => {
            const inRg = all.filter((d) => regionOf(d) === rg);
            const isExpanded = expanded.has(rg);
            return (
              <div key={rg} className="tree-group">
                <div
                  className={"tree-node group" + (treeSel === "r:" + rg ? " sel" : "")}
                  onClick={() => {
                    TREE("r:" + rg);
                    toggleRegion(rg);
                  }}
                >
                  <span className="tree-chevron">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                  <span className="tree-icon tree-folder">
                    {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                  </span>
                  <span className="tree-label">{rg}</span>
                  <span className="tree-count">{inRg.length}</span>
                </div>
                {isExpanded &&
                  inRg.map((d) => (
                    <div
                      key={d.id}
                      className={
                        "tree-node leaf" + (treeSel === "d:" + d.id ? " sel" : "")
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        TREE("d:" + d.id);
                      }}
                      title={d.name}
                    >
                      <span className="tree-dot" />
                      <span className="tree-label">{d.name}</span>
                    </div>
                  ))}
              </div>
            );
          })}
        </aside>

        <div className="device-main">
          <Panel
            title="设备台账"
            extra={
              <div className="actions">
                {treeSel && (
                  <button
                    className="link"
                    onClick={() => TREE("")}
                    style={{ marginRight: 8 }}
                  >
                    清除筛选：
                    {treeSel.startsWith("d:")
                      ? all.find((d) => d.id === treeSel.slice(2))?.name
                      : treeSel.slice(2)}
                  </button>
                )}
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
                <Btn primary onClick={() => SETAUDITOPEN(true)}>
                  导入与审核 {pending.length ? `(${pending.length})` : ""}
                </Btn>
              </div>
            }
          >
            <p className="muted">
              设备是「巡检什么」的唯一来源：巡检点的巡检项、任务指令集与「设备已停用」拦截都以本台账为准。
              点击左侧设备树可定位到具体设备的台账；点「详情」查看该设备的检测项。
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
              rows={pageList.map((d) => {
                const pts = pointsOf(d);
                return [
                  d.id,
                  <span>{d.name}</span>,
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
                    <Btn onClick={() => SETDETAIL(d)}>详情</Btn>
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
                      <Btn onClick={() => SETAUDITOPEN(true)}>去审核</Btn>
                    )}
                  </div>,
                ];
              })}
            />
            <div className="pagination">
              <span>
                共 {total} 条 / {totalPages} 页
              </span>
              <label className="inline-filter">
                <span>每页</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    PAGE_SIZE(Number(e.target.value));
                    PAGE(1);
                  }}
                >
                  {[5, 10, 20].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span>条</span>
              </label>
              <div className="page-btns">
                <Btn
                  onClick={() => PAGE(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  上一页
                </Btn>
                <span className="page-info">
                  {page} / {totalPages}
                </span>
                <Btn
                  onClick={() => PAGE(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                >
                  下一页
                </Btn>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {auditOpen && (
        <Modal
          title="导入与审核"
          drawer
          drawerWidth={620}
          onClose={() => SETAUDITOPEN(false)}
        >
          <Panel title="清单导入（Excel / CSV 粘贴）">
            <Note>
              支持从 Excel 直接整列复制后粘贴批量导入（适配千台设备级的日常维护）：导入后进入「待审核」，审核通过才生效——避免编码重复、单位缺失的清单直接污染任务口径。
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
              <p
                role="alert"
                className={importError.includes("成功") ? "muted" : "reference-upload-error"}
              >
                {importError}
              </p>
            )}
            <div className="actions">
              <Btn primary onClick={runImport}>
                导入并送审
              </Btn>
              <Btn onClick={downloadTemplate}>下载模板</Btn>
              <Btn onClick={() => CSVSET(CSV_SAMPLE)}>恢复示例</Btn>
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
        </Modal>
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

      {detail && (
        <Modal
          title={`${detail.name} · 设备详情`}
          drawer
          drawerWidth={560}
          onClose={() => SETDETAIL(null)}
        >
          <div className="detail-grid">
            <div>
              <span>设备编码</span>
              <strong>{detail.id}</strong>
            </div>
            <div>
              <span>设备类型</span>
              <strong>{detail.type}</strong>
            </div>
            <div>
              <span>安装位置</span>
              <strong>{detail.locationDesc || "—"}</strong>
            </div>
            <div>
              <span>运行状态</span>
              <strong>
                {detail.reviewState === "已通过" ? detail.state || "在用" : "—"}
              </strong>
            </div>
            <div>
              <span>审核状态</span>
              <strong>
                {detail.reviewState}
                {detail.reviewNote ? `（${detail.reviewNote}）` : ""}
              </strong>
            </div>
            <div>
              <span>导入批次</span>
              <strong>{detail.importBatch || "—"}</strong>
            </div>
            <div>
              <span>关联点位</span>
              <strong>
                {pointsOf(detail).length ? `${pointsOf(detail).length} 个` : "未落位"}
              </strong>
            </div>
            <div>
              <span>巡检项</span>
              <strong>
                {detail.items.filter((it) => it.inspect).length}/{detail.items.length} 参与
              </strong>
            </div>
          </div>

          <h4 className="drawer-sub">检测项（本设备）</h4>
          <p className="muted">
            关闭的检测目标不会进入任务指令集；「是否巡检」在此就地开关。
          </p>
          <Table
            heads={["检测目标", "采集方式", "单位", "周期", "优先级", "是否巡检"]}
            rows={detail.items.map((it) => [
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
                      deviceId: detail.id,
                      itemId: it.id,
                      inspect: e.target.checked,
                    })
                  }
                />
                <span>{it.inspect ? "参与巡检" : "已关闭"}</span>
              </label>,
            ])}
          />
        </Modal>
      )}
    </>
  );
}