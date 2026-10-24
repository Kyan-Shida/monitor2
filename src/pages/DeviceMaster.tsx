/**
 * @file DeviceMaster.tsx
 * @description 设备主数据后台（阶段③）：左侧设备树 + 右侧设备台账；
 *              设备可在此就地建档 / 删除，检测项维护在「设备巡检目标」内置页。
 * @interaction 路由沿用 `equipment`（/resources/equipment），不新增菜单项；
 *              清单导入**只接受 Excel 文件**（.xlsx / .xls，先解析预览再落库）；
 *              引擎 action：IMPORT_DEVICES / ADD_DEVICE / DELETE_DEVICES（多选批量删除）
 */
import { useState, useEffect, useMemo } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { Btn, Panel, Table, Field, Note, Modal, Drawer } from "../components/UI";
import { FilterPanel } from "../components/FilterPanel";
import { useListDelete } from "../components/ListDelete";
import { Pager } from "../components/Business";
import { DeviceTree } from "../components/DeviceTree";
import { MapImageCanvas, type ImageMarker } from "../components/MapImageCanvas";
import {
  deviceStats,
  deviceKindOf,
  archiveIdOf,
  areaNameOf,
  areaOptions,
  defaultTargetKindOfTarget,
  defaultDeviceKindOfType,
  parseDeviceKind,
} from "../data/deviceMaster";
import { readSheetRows, downloadXlsx } from "../data/excel";
import { fmtDateTime } from "../data/types";
import { deviceKinds } from "../data/types";
import type { DeviceAsset, DeviceKind } from "../data/types";

/**
 * 导入模板表头与示例：**一行为一台设备**（编码 / 名称 / 形态 / 区域 / 位置 / 巡检项）
 * @description 巡检项一列可用「、」「,」「;」「/」分隔多个检测目标；
 *              采集方式与单位不再由导入填写（检测项页同样不填），落库取默认值。
 */
/** 标准列名：解析位置映射与表头识别的统一口径（保持简短稳定，不随提示文字变化） */
const HEAD_COLS = ["设备编码", "设备名称", "设备形态", "所属区域", "安装位置", "巡检项"];
/** 每列填写提示：用于模板表头的括号说明，让用户打开 Excel 即懂怎么填 */
const HEAD_HINTS: Record<string, string> = {
  "设备编码": "必填，重复则更新已有设备",
  "设备名称": "必填",
  "设备形态": "选填，留空按类型自动判定",
  "所属区域": "选填",
  "安装位置": "选填，可底图打点",
  "巡检项": "必填，多个用「、」分隔",
};
/** 下载模板与预览用的友好表头（标准名 + 括号提示） */
const TEMPLATE_HEADS = HEAD_COLS.map((c) => `${c}（${HEAD_HINTS[c]}）`);
/** 模板示例数据（二维数组，避免逗号歧义）：覆盖实体/虚拟、形态留空、多巡检项等场景 */
const TEMPLATE_SAMPLE: string[][] = [
  ["V010", "V010 新增储罐", "", "一期罐区", "一期罐区东侧", "液位计、罐壁温度"],
  ["V011", "V011 在线分析仪", "实体设备", "装置区", "装置区 A 段管廊", "出口压力表"],
  ["V012", "V012 罐区周界", "虚拟设备", "一期罐区", "", "周界入侵、罐区气体"],
];
/** 导入行：Excel 解析共用的字段口径（一行 = 一台设备） */
type ImportRow = {
  id: string;
  name: string;
  /** 设备形态（可留空 → 按设备类型自动判定） */
  deviceKind: string;
  /** 所属区域（落到设备主数据的显式区域字段） */
  region: string;
  location: string;
  /** 巡检项原文（多个检测目标以顿号 / 逗号 / 分号 / 斜杠分隔） */
  targets: string;
};
/** 巡检项列 → 检测目标数组（去空、去重） */
const splitTargets = (raw: string) =>
  [...new Set(raw.split(/[、,，;；/]/).map((x) => x.trim()).filter(Boolean))];

export function DeviceMaster() {
  const { s, act } = useStore();
  const [q, Q] = useViewState("device-master.q", "");
  /** 设备形态筛选：全部 / 实体设备 / 虚拟设备 */
  const [kindF, KF] = useViewState("device-master.kind", "全部");
  /** 筛选面板展开态 + 草稿条件（点「查询」才写回生效值） */
  const [filterOpen, SETFILTEROPEN] = useState(false);
  const [draft, DRAFT] = useState({ q, kind: kindF });
  /** 左侧设备树选中：""=全部，"r:区域"=区域，"d:设备ID"=单台 */
  const [treeSel, TREE] = useViewState("device-master.tree", "");
  /** 导入抽屉：仅支持 Excel 文件导入 */
  const [auditOpen, SETAUDITOPEN] = useState(false);
  const [impName, IMPNAME] = useState("");
  const [impRows, IMPROWS] = useState<ImportRow[]>([]);
  const [impErr, IMPERR] = useState("");
  /** 设备表单：就地建档（设备主数据由「设备台账」独家维护） */
  const [devForm, DEVFORM] = useState<{
    id: string;
    name: string;
    /** 设备形态（实体设备 / 虚拟设备） */
    deviceKind: DeviceKind;
    /** 所属区域（必填） */
    region: string;
    /** 厂区坐标文本：点地图自动代入，或用户手动输入（x, y） */
    coordInput: string;
    /** 安装位置：全厂区 2D 底图上打点得到的厂区坐标（底图百分比口径） */
    x?: number;
    y?: number;
  } | null>(null);
  /** 安装位置底图：全厂区 2D 地图（各分区地图当前共用同一张厂区底图） */
  const plantMapImage = (s.maps || []).find((m) => m.image)?.image;
  /** 打点后的厂区坐标文本：自动代入「安装位置」，未打点为空 */
  const coordText =
    devForm?.x != null && devForm?.y != null ? `${devForm.x}, ${devForm.y}` : "";
  /** 安装位置选点标记：仅当已打点时显示 */
  const pickMarkers: ImageMarker[] =
    devForm && devForm.x != null && devForm.y != null
      ? [
          {
            id: "pick",
            x: devForm.x,
            y: devForm.y,
            label: devForm.name || "新设备",
          },
        ]
      : [];

  const stat = deviceStats(s);
  const all = s.devices || [];
  const kw = q.trim();

  /**
   * 设备所属区域：统一走区域主数据口径（areaNameOf）——
   * 区域清单在「后台管理」里维护，设备按显式厂区 / 安装位置前缀归属。
   */
  const regionOf = (d: DeviceAsset) => areaNameOf(s, d);

  /** 分页 */
  const [page, PAGE] = useState(1);
  const [pageSize, PAGE_SIZE] = useState(5);
  /** 已生效的筛选条件数（用于「筛选」按钮上的计数） */
  const filterCount = (kindF !== "全部" ? 1 : 0) + (kw ? 1 : 0);
  /** 展开筛选面板：用当前生效值填充草稿 */
  function toggleFilter() {
    if (!filterOpen) DRAFT({ q, kind: kindF });
    SETFILTEROPEN(!filterOpen);
  }
  /** 查询：草稿写回生效值并收起面板 */
  function applyFilter() {
    Q(draft.q);
    KF(draft.kind);
    SETFILTEROPEN(false);
  }
  /** 重置：清空草稿并立即生效 */
  function resetFilter() {
    DRAFT({ q: "", kind: "全部" });
    Q("");
    KF("全部");
  }
  const listed = useMemo(() => {
    return all.filter((d) => {
      if (treeSel.startsWith("d:")) return d.id === treeSel.slice(2);
      if (treeSel.startsWith("r:")) {
        if (regionOf(d) !== treeSel.slice(2)) return false;
      }
      if (kw && !(d.name + d.id + d.type).includes(kw)) return false;
      if (kindF !== "全部" && deviceKindOf(d) !== kindF) return false;
      return true;
    });
  }, [all, treeSel, kindF, kw]);
  useEffect(() => PAGE(1), [treeSel, kindF, kw]);
  const total = listed.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    if (page > totalPages) PAGE(totalPages);
  }, [page, totalPages]);
  const pageList = listed.slice((page - 1) * pageSize, page * pageSize);
  /** 多选删除：勾选集合跨页保留；「全选」只作用于当前页 */
  const pageIds = pageList.map((d) => d.id);
  /** 列表删除（通用组件）：多选批量删除 + 二次确认 */
  const del = useListDelete({
    onDelete: (ids) => act({ type: "DELETE_DEVICES", ids }),
    batch: {
      pageIds,
      title: (n) => `删除 ${n} 台设备`,
      nameOf: (id) => all.find((d) => d.id === id)?.name || id,
    },
  });
  /**
   * 是否处于多选态（表头勾选列与行勾选列必须同时出现）
   * @description 行内的 `del.cell(...)` 未进多选时返回 null —— 若照旧铺进 rows，
   *              就比 heads 多出一个空单元格，整行数据左移一列（「编码」列空白、编码跑到「设备名称」列）
   */
  const multi = del.sel !== null;

  /**
   * 导入行 → 设备对象（一行一台设备）
   * @description 巡检项列内的多个检测目标拆分后落为该设备的检测项（编号 II-{设备编码}-{序号}）；
   *   采集方式与单位不再由导入填写，检测项统一落默认值（可见光 / 无单位）。
   * @param rows 解析出的导入行
   * @returns 可直接交给 IMPORT_DEVICES 的设备数组
   */
  const rowsToDevices = (rows: ImportRow[]) => {
    const map = new Map<string, DeviceAsset>();
    rows.forEach((r) => {
      const code = r.id.trim();
      if (!code) return;
      const type = "未分类";
      map.set(code, {
        id: code,
        name: r.name.trim(),
        type,
        // 设备形态：导入列优先（简写也认），识别不出按设备类型推导
        deviceKind:
          parseDeviceKind(r.deviceKind) || defaultDeviceKindOfType(type),
        regionCode: "",
        region: r.region.trim() || undefined,
        locationDesc: r.location.trim(),
        items: splitTargets(r.targets).map((target, i) => ({
          id: `II-${code}-${i + 1}`,
          target,
          targetKind: defaultTargetKindOfTarget(target),
          kind: "可见光",
          unit: "",
          // 「是否巡检」「巡检周期」「优先级」已从界面下线，导入统一落默认值
          inspect: true,
          cycle: "每日",
          priority: "普通",
        })),
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
        // 表头识别：去掉括号说明后与标准列名匹配（兼容旧无括号表头与新友好表头）
        .filter(
          (r) =>
            !HEAD_COLS.some(
              (h) =>
                (r[0] || "")
                  .replace(/（[^）]*）/g, "")
                  .replace(/\([^)]*\)/g, "")
                  .trim() === h,
            ),
        )
        .map(([id, name, dkind, region, location, targets]) => ({
          id: id || "",
          name: name || "",
          deviceKind: dkind || "",
          region: region || "",
          location: location || "",
          targets: targets || "",
        }))
        .filter((r) => r.id.trim() || r.name.trim());
      if (!parsed.length) {
        IMPROWS([]);
        IMPERR(
          `未解析到有效数据行，请检查表头与内容（${TEMPLATE_HEADS.join(" / ")}）`,
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

  /** 下载带「填写说明」工作表的 Excel 模板，让用户打开即懂怎么填 */
  function downloadTemplate() {
    const guide: (string | number)[][] = [
      ["列名", "是否必填", "填写说明", "示例"],
      ["设备编码", "必填", "业务唯一键；与已有设备编码重复时按编码更新（覆盖）该设备", "V010"],
      ["设备名称", "必填", "设备显示名称", "V010 新增储罐"],
      ["设备形态", "选填", "留空时按名称/类型自动判定（含罐区/管廊/围堰等→虚拟设备，其余→实体设备）", "实体设备 / 虚拟设备"],
      ["所属区域", "选填", "设备归属区域；留空时按安装位置前缀推导", "一期罐区"],
      ["安装位置", "选填", "安装位置描述；也可在台账内底图打点生成坐标", "一期罐区东侧"],
      ["巡检项", "必填", "一台设备的多个检测目标，用「、」分隔；采集方式与单位系统按默认填", "液位计、罐壁温度"],
      ["", "", "", ""],
      ["以下由系统自动生成，无需填写", "", "", ""],
      ["检测项ID / 类型 / 分类 / 更新时间", "系统生成", "导入后由平台按检测项名称自动判定，不与模板列对应", "—"],
    ];
    downloadXlsx(
      [TEMPLATE_HEADS, ...TEMPLATE_SAMPLE],
      "设备导入模板",
      "设备导入模板.xlsx",
      [{ name: "填写说明", aoa: guide }],
    );
  }

  return (
    <>
      <div className="metric-strip">
        <div>
          <span>设备总数</span>
          <strong>{stat.total}</strong>
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
            className="panel-filters-wrap"
            title="设备台账"
            extra={
              <div className="actions">
                {/* 关键词搜索收进「筛选」面板，工具栏只留动作按钮 */}
                <Btn onClick={toggleFilter}>
                  {filterOpen ? "收起筛选" : "筛选"}
                  {filterCount ? `（${filterCount}）` : ""}
                </Btn>
                {/* 删除入口：点一次进入多选模式，勾选后回到此按钮批量删除（通用组件） */}
                {del.bar}
                <Btn
                  onClick={() =>
                    DEVFORM({
                      id: "",
                      name: "",
                      // 缺省实体设备（大多数装置有形；区域 / 空间类目标由用户改选虚拟设备）
                      deviceKind: "实体设备",
                      // 已按区域筛选时预填该区域，减少一次重复选择
                      region: treeSel.startsWith("r:") ? treeSel.slice(2) : "",
                      // 安装位置统一用坐标：默认空，点地图自动代入或手动输入
                      coordInput: "",
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
            {filterOpen && (
              <FilterPanel
                fields={[
                  {
                    key: "q",
                    label: "关键词",
                    placeholder: "编码 / 名称 / 类型",
                  },
                  {
                    key: "kind",
                    label: "设备形态",
                    options: ["全部", ...deviceKinds],
                  },
                ]}
                value={draft}
                onChange={(next) => DRAFT({ ...draft, ...next })}
                onSearch={applyFilter}
                onReset={resetFilter}
              />
            )}
            <Table
              className={del.tableClass}
              heads={[
                ...(multi ? [del.head] : []),
                "编码",
                "设备名称",
                "设备形态",
                "检测项数",
                "更新时间",
                "操作",
              ]}
              rows={pageList.map((d) => [
                // 多选模式：首列勾选框（删除入口收在工具栏，行内只留查看类操作）
                ...(multi ? [del.cell(d.id, d.name)] : []),
                d.id,
                <span>{d.name}</span>,
                deviceKindOf(d),
                // 检测项数即入口：点数字进该设备的检测项页（原操作列「巡检目标」按钮已收掉）
                <button
                  type="button"
                  className="rt-link"
                  title="查看该设备的检测项"
                  onClick={() => go("device-targets", d.id)}
                >
                  {(d.items || []).length} 项
                </button>,
                fmtDateTime(d.updatedAt),
                <div className="actions">
                  {/* EQ-01：设备档案入口移入设备台账详情（以设备为主线看全生命周期） */}
                  <Btn onClick={() => go("archive", archiveIdOf(s, d.name))}>
                    设备档案
                  </Btn>
                </div>,
              ])}
            />
            {/* 分页统一走全站 Pager 组件（默认每页 5 条，可切 10 / 20） */}
            <Pager
              page={page}
              count={total}
              size={pageSize}
              onChange={PAGE}
              onSize={(n) => {
                PAGE_SIZE(n);
                PAGE(1);
              }}
            />
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
            表头（已含填写提示）：{TEMPLATE_HEADS.join("　/　")}。
            <b>一行为一台设备，先「下载 Excel 模板」按提示填写最稳妥</b>；
            巡检项可用「、」分隔多个检测目标；设备形态留空时按类型自动判定；
            编码重复时按编码更新已有设备；检测项ID / 类型 / 分类 / 更新时间由系统自动生成，无需填写。
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
                      {TEMPLATE_HEADS.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {impRows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <td>{r.id}</td>
                        <td>{r.name}</td>
                        <td>{r.deviceKind || "自动"}</td>
                        <td>{r.region || "—"}</td>
                        <td>{r.location || "—"}</td>
                        <td>{r.targets || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* 新增设备：就地建档（设备主数据由「设备台账」独家维护） */}
      {devForm && (
        <Drawer
          title="新增设备"
          subtitle={devForm.id ? `${devForm.id} · ${devForm.name || "未命名"}` : undefined}
          onClose={() => DEVFORM(null)}
          footer={
            <>
              <Btn onClick={() => DEVFORM(null)}>取消</Btn>
              <Btn
                primary
                disabled={
                  !devForm.id.trim() || !devForm.name.trim() || !devForm.region
                }
                onClick={() => {
                  // 安装位置统一使用厂区坐标：以输入框为准（点地图会写入，也可手动改）
                  const coord = devForm.coordInput.trim() || coordText;
                  const ok = act({
                    type: "ADD_DEVICE",
                    id: devForm.id.trim(),
                    name: devForm.name.trim(),
                    deviceKind: devForm.deviceKind,
                    region: devForm.region,
                    coord: coord || undefined,
                    coordSys: coord ? "厂区局部坐标" : undefined,
                  });
                  if (ok) DEVFORM(null);
                }}
              >
                保存
              </Btn>
            </>
          }
        >
          <div className="device-form-split">
            <div>
              <Field label="设备编码" required>
                <input
                  value={devForm.id}
                  placeholder="例如 V012"
                  onChange={(e) => DEVFORM({ ...devForm, id: e.target.value })}
                />
              </Field>
              <Field label="设备名称" required>
                <input
                  value={devForm.name}
                  placeholder="例如 V012 新增储罐"
                  onChange={(e) => DEVFORM({ ...devForm, name: e.target.value })}
                />
              </Field>
              <Field label="设备形态" required>
                <select
                  value={devForm.deviceKind}
                  onChange={(e) =>
                    DEVFORM({
                      ...devForm,
                      deviceKind: e.target.value as DeviceKind,
                    })
                  }
                >
                  {deviceKinds.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </Field>
              <Field label="所属区域" required>
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
            </div>

            <div className="device-form-map">
              <Field label="安装位置">
                <input
                  value={devForm.coordInput}
                  placeholder="点击下方地图自动代入，或手动输入厂区坐标（x, y）"
                  onChange={(e) =>
                    DEVFORM({ ...devForm, coordInput: e.target.value })
                  }
                />
              </Field>
              <MapImageCanvas
                image={plantMapImage}
                markers={pickMarkers}
                selected="pick"
                onAdd={(x, y) =>
                  DEVFORM({ ...devForm, x, y, coordInput: `${x}, ${y}` })
                }
                height={360}
              />
            </div>
          </div>
        </Drawer>
      )}

      {/* 批量删除设备：二次确认（通用组件）；已关联巡检点位的设备由引擎拦截并提示 */}
      {del.modal}

    </>
  );
}