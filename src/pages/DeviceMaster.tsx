/**
 * @file DeviceMaster.tsx
 * @description 设备主数据后台（阶段③）：左侧设备树 + 右侧设备台账；
 *              设备可在此就地建档 / 删除，检测项按设备进入详情抽屉，并支持就地新增 / 编辑 / 删除。
 * @interaction 路由沿用 `equipment`（/resources/equipment），不新增菜单项；
 *              清单导入**只接受 Excel 文件**（.xlsx / .xls，先解析预览再落库）；
 *              引擎 action：IMPORT_DEVICES / ADD_DEVICE / DELETE_DEVICE /
 *              SET_DEVICE_STATE / ADD_DEVICE_ITEM / UPDATE_DEVICE_ITEM / DELETE_DEVICE_ITEM
 */
import { useState, useEffect, useMemo } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { Btn, Badge, Panel, Table, Field, Note, Modal } from "../components/UI";
import { DeviceTree } from "../components/DeviceTree";
import {
  deviceStats,
  archiveIdOf,
  areaNameOf,
  areaOptions,
  defaultTargetKindOfTarget,
  defaultUnitOfCapture,
} from "../data/deviceMaster";
import { readSheetRows, downloadXlsx } from "../data/excel";
import { captureKinds } from "../data/types";
import type { CaptureKind, DeviceAsset, InspectItem } from "../data/types";

/**
 * 导入模板表头与示例：**设备字段 + 检测项字段**
 * 前 3 列是设备身份，后 3 列是检测项；同一设备编码可占多行，每行一个检测项。
 * 与 IMPORT_DEVICES 口径一致：数值类检测目标必须带单位。
 */
const CSV_HEADS = [
  "设备编码",
  "设备名称",
  "设备类型",
  "检测目标",
  "采集方式",
  "单位",
];
const CSV_SAMPLE = `设备编码,设备名称,设备类型,检测目标,采集方式,单位
V010,V010 新增储罐,储罐,液位计,可见光,m
V010,V010 新增储罐,储罐,罐壁温度,红外,℃
V011,V011 在线分析仪,分析仪,出口压力表,可见光,MPa`;
/** 导入行：Excel 解析共用的字段口径（一行 = 一台设备的一个检测项） */
type ImportRow = {
  id: string;
  name: string;
  type: string;
  target: string;
  kind: string;
  unit: string;
};

export function DeviceMaster() {
  const { s, act } = useStore();
  const [q, Q] = useViewState("device-master.q", "");
  const [stateF, STF] = useViewState("device-master.state", "全部");
  /** 待二次确认的停用设备 */
  const [stopping, STOPSET] = useState<DeviceAsset | null>(null);
  /** 左侧设备树选中：""=全部，"r:区域"=区域，"d:设备ID"=单台 */
  const [treeSel, TREE] = useViewState("device-master.tree", "");
  /** 详情抽屉：当前查看的设备（存 id，随 store 实时派生，检测项增删改后即时刷新） */
  const [detailId, SETDETAIL] = useState<string | null>(null);
  /** 导入抽屉：仅支持 Excel 文件导入 */
  const [auditOpen, SETAUDITOPEN] = useState(false);
  const [impName, IMPNAME] = useState("");
  const [impRows, IMPROWS] = useState<ImportRow[]>([]);
  const [impErr, IMPERR] = useState("");
  /** 检测项表单：null=关闭；无 id=新增，有 id=编辑 */
  const [itemForm, ITEMFORM] = useState<{
    id?: string;
    target: string;
    /** 检测项分类（仪表 / 区域） */
    targetKind: "仪表" | "区域";
    /** 用户是否手动改过分类：改过之后不再被「检测目标」的输入自动覆盖 */
    kindLocked?: boolean;
    kind: CaptureKind;
    unit: string;
  } | null>(null);
  /** 待删除的检测项（二次确认） */
  const [delItem, DELITEM] = useState<InspectItem | null>(null);
  /** 新增设备表单：就地建档，字段与「后台管理 › 设备配置」同口径 */
  const [devForm, DEVFORM] = useState<{
    id: string;
    name: string;
    type: string;
    region: string;
    locationDesc: string;
  } | null>(null);
  /** 待删除的设备（二次确认） */
  const [delDev, DELDEV] = useState<DeviceAsset | null>(null);

  const stat = deviceStats(s);
  const all = s.devices || [];
  /** 详情抽屉当前设备：按 id 从 store 实时派生，检测项增删改后立即反映 */
  const detail = detailId ? all.find((d) => d.id === detailId) : undefined;
  const pointsOf = (d: DeviceAsset) => s.points.filter((p) => p.device === d.name);
  const kw = q.trim();

  /**
   * 设备所属区域：统一走区域主数据口径（areaNameOf）——
   * 区域清单在「后台管理」里维护，设备按显式厂区 / 安装位置前缀归属。
   */
  const regionOf = (d: DeviceAsset) => areaNameOf(s, d);

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

  /**
   * 导入行 → 设备对象（按设备编码聚合）
   * @description 模板一行 = 一个检测项，同一设备编码占多行即该设备有多个检测项，
   *   这里按编码合并成一台设备，检测项编码按出现顺序编号 II-{编码}-{序号}。
   * @param rows 解析出的导入行
   * @returns 可直接交给 IMPORT_DEVICES 的设备数组
   */
  const rowsToDevices = (rows: ImportRow[]) => {
    const map = new Map<string, DeviceAsset>();
    rows.forEach((r) => {
      const code = r.id.trim();
      if (!code) return;
      if (!map.has(code)) {
        map.set(code, {
          id: code,
          name: r.name.trim(),
          type: r.type.trim() || "未分类",
          regionCode: "R-A03",
          locationDesc: "",
          items: [],
        });
      }
      const dev = map.get(code)!;
      // 设备身份取首个非空值，检测项逐行追加
      if (!dev.name.trim()) dev.name = r.name.trim();
      const target = r.target.trim();
      if (!target) return;
      // 同检测目标去重：模板里同设备同目标重复行不再追加
      if (dev.items.some((it) => it.target === target)) return;
      dev.items.push({
        id: `II-${code}-${dev.items.length + 1}`,
        target,
        targetKind: defaultTargetKindOfTarget(target),
        kind: captureKinds.includes(r.kind as CaptureKind)
          ? (r.kind as CaptureKind)
          : "可见光",
        unit: r.unit.trim(),
        // 「是否巡检」「巡检周期」「优先级」已从界面下线，导入统一落默认值
        inspect: true,
        cycle: "每日",
        priority: "普通",
      });
    });
    return [...map.values()];
  };
  /** 读取选中的 Excel 文件并解析为导入行（仅预览，不落库） */
  async function pickImport(f: File | undefined) {
    if (!f) return;
    IMPERR("");
    IMPNAME(f.name);
    try {
      const rows = await readSheetRows(f);
      const parsed = rows
        .filter((r) => r.some((c) => c))
        .filter((r) => !CSV_HEADS.some((h) => (r[0] || "").startsWith(h)))
        .map(([id, name, type, target, kind, unit]) => ({
          id: id || "",
          name: name || "",
          type: type || "",
          target: target || "",
          kind: kind || "",
          unit: unit || "",
        }))
        .filter((r) => r.id.trim() || r.name.trim());
      if (!parsed.length) {
        IMPROWS([]);
        IMPERR(
          `未解析到有效数据行，请检查表头与内容（${CSV_HEADS.join(" / ")}）`,
        );
        return;
      }
      IMPROWS(parsed);
    } catch {
      IMPROWS([]);
      IMPERR("文件解析失败，请确认是 Excel 文件（.xlsx / .xls）");
    }
  }
  /** 确认导入：把预览行按设备聚合后落库，成功后关闭抽屉并复位 */
  function importExcel() {
    if (act({ type: "IMPORT_DEVICES", devices: rowsToDevices(impRows) })) {
      IMPROWS([]);
      IMPNAME("");
      SETAUDITOPEN(false);
    }
  }

  /** 下载 Excel 模板（与导入口径一致：设备身份 3 列 + 检测项 5 列，一设备多行即多检测项） */
  function downloadTemplate() {
    const sample = CSV_SAMPLE.split("\n")
      .slice(1)
      .map((line) => line.split(","));
    downloadXlsx([CSV_HEADS, ...sample], "设备清单", "设备导入模板.xlsx");
  }

  return (
    <>
      <div className="metric-strip">
        <div>
          <span>设备总数</span>
          <strong>{stat.total}</strong>
        </div>
        <div>
          <span>在用</span>
          <strong>{stat.inUse}</strong>
        </div>
        <div>
          <span>停用</span>
          <strong>{stat.stopped}</strong>
        </div>
        <div>
          <span>巡检项</span>
          <strong>{stat.itemTotal}</strong>
        </div>
      </div>

      <div className="device-layout">
        <DeviceTree value={treeSel} onChange={TREE} ariaLabel="设备树" />

        <div className="device-main">
          <Panel
            title="设备台账"
            extra={
              <div className="actions">
                <label className="inline-filter">
                  <span>状态：</span>
                  <select value={stateF} onChange={(e) => STF(e.target.value)}>
                    {["全部", "在用", "停用"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <input
                  placeholder="搜索编码 / 名称 / 类型"
                  value={q}
                  onChange={(e) => Q(e.target.value)}
                />
                <Btn
                  onClick={() =>
                    DEVFORM({
                      id: "",
                      name: "",
                      type: "",
                      // 已按区域筛选时预填该区域，减少一次重复选择
                      region: treeSel.startsWith("r:") ? treeSel.slice(2) : "",
                      locationDesc: "",
                    })
                  }
                >
                  ＋ 新增设备
                </Btn>
                <Btn
                  primary
                  onClick={() => {
                    IMPROWS([]);
                    IMPERR("");
                    IMPNAME("");
                    SETAUDITOPEN(true);
                  }}
                >
                  导入
                </Btn>
              </div>
            }
          >
            <Table
              heads={["编码", "设备名称", "类型", "检测目标", "状态", "操作"]}
              rows={pageList.map((d) => {
                return [
                  d.id,
                  <span>{d.name}</span>,
                  d.type,
                  d.items.map((it) => it.target).join(" / ") || "—",
                  <Badge>{d.state || "在用"}</Badge>,
                  <div className="actions">
                    <Btn onClick={() => SETDETAIL(d.id)}>详情</Btn>
                    {/* EQ-01：设备档案入口移入设备台账详情（以设备为主线看全生命周期） */}
                    <Btn onClick={() => go("archive", archiveIdOf(s, d.name))}>
                      设备档案
                    </Btn>
                    <Btn
                      onClick={() =>
                        d.state === "停用"
                          ? act({ type: "SET_DEVICE_STATE", deviceId: d.id, state: "在用" })
                          : STOPSET(d)
                      }
                    >
                      {d.state === "停用" ? "启用" : "停用"}
                    </Btn>
                    <Btn onClick={() => DELDEV(d)}>删除</Btn>
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
          title="设备清单导入"
          wide
          onClose={() => SETAUDITOPEN(false)}
          footer={
            <>
              <Btn onClick={() => SETAUDITOPEN(false)}>取消</Btn>
              <Btn primary disabled={!impRows.length} onClick={importExcel}>
                导入
                {impRows.length ? `（${rowsToDevices(impRows).length} 台）` : ""}
              </Btn>
            </>
          }
        >
          <Field label="选择 Excel 文件（仅支持 .xlsx / .xls）">
            <input
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              aria-label="选择设备清单 Excel 文件"
              onChange={(e) => {
                void pickImport(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </Field>
          <Note>
            表头：{CSV_HEADS.join(" / ")}。前 3 列为设备身份，后 3 列为检测项；
            <b>同一设备编码可占多行</b>，每行一个检测项；数值类检测目标必须带单位。
            导入只读取 Excel，不支持手工填写；编码重复时按编码更新已有设备。
          </Note>
          <div className="actions" style={{ marginTop: 10 }}>
            <Btn onClick={downloadTemplate}>下载 Excel 模板</Btn>
          </div>

          {impErr && (
            <Note>
              <b>{impErr}</b>
            </Note>
          )}

          {!!impRows.length && (
            <>
              <p className="muted" style={{ marginTop: 12 }}>
                已解析「{impName || "所选文件"}」：<b>{impRows.length}</b> 行 /{" "}
                <b>{rowsToDevices(impRows).length}</b> 台设备
                {impRows.length > 5 ? "（预览前 5 条）" : ""}
              </p>
              <div className="table-scroll">
                <table className="import-table">
                  <thead>
                    <tr>
                      <th>设备编码</th>
                      <th>设备名称</th>
                      <th>设备类型</th>
                      <th>检测目标</th>
                      <th>采集方式</th>
                      <th>单位</th>
                    </tr>
                  </thead>
                  <tbody>
                    {impRows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <td>{r.id}</td>
                        <td>{r.name}</td>
                        <td>{r.type}</td>
                        <td>{r.target || "—"}</td>
                        <td>{r.kind || "可见光"}</td>
                        <td>{r.unit || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* 新增设备：就地建档，身份字段与「后台管理 › 设备配置」同口径 */}
      {devForm && (
        <Modal
          title="新增设备"
          onClose={() => DEVFORM(null)}
          footer={
            <>
              <Btn onClick={() => DEVFORM(null)}>取消</Btn>
              <Btn
                primary
                disabled={!devForm.id.trim() || !devForm.name.trim()}
                onClick={() => {
                  const ok = act({
                    type: "ADD_DEVICE",
                    id: devForm.id.trim(),
                    name: devForm.name.trim(),
                    // 设备类型用独立字段，避免与动作名 Action.type 冲突
                    deviceType: devForm.type.trim(),
                    region: devForm.region,
                    locationDesc: devForm.locationDesc.trim(),
                  });
                  if (ok) DEVFORM(null);
                }}
              >
                保存
              </Btn>
            </>
          }
        >
          <Field label="设备编码">
            <input
              value={devForm.id}
              placeholder="例如 V012"
              onChange={(e) => DEVFORM({ ...devForm, id: e.target.value })}
            />
          </Field>
          <Field label="设备名称">
            <input
              value={devForm.name}
              placeholder="例如 V012 新增储罐"
              onChange={(e) => DEVFORM({ ...devForm, name: e.target.value })}
            />
          </Field>
          <Field label="设备类型">
            <input
              value={devForm.type}
              placeholder="例如 储罐"
              onChange={(e) => DEVFORM({ ...devForm, type: e.target.value })}
            />
          </Field>
          <Field label="所属区域">
            <select
              value={devForm.region}
              onChange={(e) => DEVFORM({ ...devForm, region: e.target.value })}
            >
              <option value="">（未指定）</option>
              {areaOptions(s).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="安装位置">
            <input
              value={devForm.locationDesc}
              placeholder="例如 二期罐区北侧"
              onChange={(e) =>
                DEVFORM({ ...devForm, locationDesc: e.target.value })
              }
            />
          </Field>
        </Modal>
      )}

      {/* 删除设备：二次确认；已关联巡检点位的设备由引擎拦截并提示 */}
      {delDev && (
        <Modal
          title={`删除设备「${delDev.name}」`}
          onClose={() => DELDEV(null)}
          footer={
            <>
              <Btn onClick={() => DELDEV(null)}>取消</Btn>
              <Btn
                danger
                onClick={() => {
                  act({ type: "DELETE_DEVICE", id: delDev.id });
                  DELDEV(null);
                }}
              >
                确认删除
              </Btn>
            </>
          }
        >
          <p>
            检测项 {delDev.items.length} 个
            {delDev.items.length
              ? `（${delDev.items.map((it) => it.target).join("、")}）`
              : ""}
          </p>
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

      {detail && (
        <Modal
          title={`${detail.name} · 设备详情`}
          wide
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
              <strong>{detail.state || "在用"}</strong>
            </div>
            <div>
              <span>关联点位</span>
              <strong>
                {pointsOf(detail).length ? `${pointsOf(detail).length} 个` : "未落位"}
              </strong>
            </div>
            <div>
              <span>巡检项</span>
              <strong>{detail.items.length} 项</strong>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 14,
            }}
          >
            <h4 className="drawer-sub" style={{ margin: 0 }}>
              检测项（本设备）
            </h4>
            <Btn
              primary
              onClick={() =>
                ITEMFORM({
                  target: "",
                  targetKind: "仪表",
                  kind: "可见光",
                  unit: "",
                })
              }
            >
              ＋ 新增检测项
            </Btn>
          </div>
          <p className="muted">检测项支持新增 / 编辑 / 删除。</p>
          <Table
            heads={["检测目标", "分类", "采集方式", "单位", "操作"]}
            rows={detail.items.map((it) => [
              it.target,
              it.targetKind || "仪表",
              it.kind,
              it.unit || "—",
              <div className="actions">
                <Btn
                  onClick={() =>
                    ITEMFORM({
                      id: it.id,
                      target: it.target,
                      targetKind: it.targetKind || "仪表",
                      kindLocked: true,
                      kind: it.kind,
                      unit: it.unit,
                    })
                  }
                >
                  编辑
                </Btn>
                <Btn danger onClick={() => DELITEM(it)}>
                  删除
                </Btn>
              </div>,
            ])}
          />
        </Modal>
      )}

      {detail && itemForm && (
        <Modal
          title={itemForm.id ? "编辑检测项" : "新增检测项"}
          onClose={() => ITEMFORM(null)}
          footer={
            <>
              <Btn onClick={() => ITEMFORM(null)}>取消</Btn>
              <Btn
                primary
                onClick={() => {
                  const payload = {
                    deviceId: detail.id,
                    target: itemForm.target,
                    targetKind: itemForm.targetKind,
                    kind: itemForm.kind,
                    unit: itemForm.unit,
                  };
                  const ok = itemForm.id
                    ? act({
                        type: "UPDATE_DEVICE_ITEM",
                        itemId: itemForm.id,
                        ...payload,
                      })
                    : act({ type: "ADD_DEVICE_ITEM", ...payload });
                  if (ok) ITEMFORM(null);
                }}
              >
                保存
              </Btn>
            </>
          }
        >
          <Field label="分类">
            <select
              value={itemForm.targetKind}
              onChange={(e) =>
                ITEMFORM((f) =>
                  f
                    ? {
                        ...f,
                        targetKind: e.target.value as "仪表" | "区域",
                        kindLocked: true,
                      }
                    : f,
                )
              }
            >
              {(["仪表", "区域"] as const).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="检测目标">
            <input
              value={itemForm.target}
              placeholder="如 出口压力表"
              onChange={(e) => {
                const target = e.target.value;
                ITEMFORM((f) =>
                  f
                    ? {
                        ...f,
                        target,
                        // 未手动改过分类时随检测目标推导（罐壁 / 管廊 → 区域）
                        targetKind: f.kindLocked
                          ? f.targetKind
                          : defaultTargetKindOfTarget(target),
                      }
                    : f,
                );
              }}
            />
          </Field>
          <Field label="采集方式">
            <select
              value={itemForm.kind}
              onChange={(e) => {
                const kind = e.target.value as CaptureKind;
                ITEMFORM((f) =>
                  f
                    ? {
                        ...f,
                        kind,
                        // 单位随采集方式自动匹配；人工填过的（非空且非默认值）保留
                        unit:
                          !f.unit ||
                          Object.values(defaultUnitOfCapture).includes(f.unit)
                            ? defaultUnitOfCapture[kind]
                            : f.unit,
                      }
                    : f,
                );
              }}
            >
              {captureKinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="单位（数值类必填，如 MPa / ℃）">
            <input
              value={itemForm.unit}
              onChange={(e) =>
                ITEMFORM((f) => (f ? { ...f, unit: e.target.value } : f))
              }
            />
          </Field>
        </Modal>
      )}

      {detail && delItem && (
        <Modal
          title={`删除检测项「${delItem.target}」`}
          onClose={() => DELITEM(null)}
          footer={
            <>
              <Btn onClick={() => DELITEM(null)}>取消</Btn>
              <Btn
                danger
                onClick={() => {
                  act({
                    type: "DELETE_DEVICE_ITEM",
                    deviceId: detail.id,
                    itemId: delItem.id,
                  });
                  DELITEM(null);
                }}
              >
                确认删除
              </Btn>
            </>
          }
        >
          <Note>
            删除后该检测目标将从设备清单移除，并同步解绑对应的仪表、巡检目标台账与逻辑点引用；
            此操作不可撤销。
          </Note>
        </Modal>
      )}
    </>
  );
}