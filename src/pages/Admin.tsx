/**
 * @file Admin.tsx
 * @description 后台管理：工厂**已有基础数据**的配置入口（区域）。
 *              区域是设备树分组与地图「区域」下拉的唯一来源；
 *              设备 / 仪表改由「资源与地图 › 设备台账」维护（含 Excel 清单导入），此处不再配置。
 *              算法（AI 能力）与巡检要求已合并为「后台管理 › 算法模板」（见 Requirements.tsx）。
 * @interaction 路由 `admin`（后台管理 › 工厂基础数据）；引擎动作：
 *              ADD_AREA / RENAME_AREA / DELETE_AREA。
 *              页面为左右分栏：左侧区域树目录（点选节点按子树筛选右侧表格），
 *              右侧区域配置表格。
 *              区域弹窗为宽版分栏：左侧参数（名称必填 / 父级区域 / 负责人 / 管理部门），
 *              右侧全厂区 2D 地图 + 绘制工具条（多边形 / 矩形 / 撤销 / 重做 / 清空）与标绘列表
 */
import { useState } from "react";
import {
  Pentagon,
  Square,
  Undo2,
  Redo2,
  Trash2,
  ChevronRight,
  FolderTree,
} from "lucide-react";
import { useStore } from "../data/store";
import { usePageSize, useViewState } from "../data/navigation";
import { Btn, Panel, Table, Field, Note, Modal } from "../components/UI";
import { Pager } from "../components/Business";
import { MapImageCanvas } from "../components/MapImageCanvas";
import { DeleteConfirm } from "../components/ListDelete";
import { SAMPLE_MAP_IMAGE } from "../data/sampleMap";
import { ROOT_AREA_ID, ROOT_AREA_NAME } from "../data/types";

/** 顶点（底图百分比坐标） */
type Pt = { x: number; y: number };
/** 区域表单：id 存在 = 编辑，否则新增；points = 全厂区 2D 底图上绘制的顶点 */
type AreaForm = {
  id?: string;
  name: string;
  /**
   * 父级区域文本：可下拉选已有区域，也可手填。
   * 空串 = 根区域；填了不存在的名称 = 保存时自动创建同名父级区域（由引擎解析）
   */
  parentText: string;
  /** 区域负责人 / 管理部门（非必填，从推送人员里选） */
  owner: string;
  department: string;
  /** 绘制中的顶点（闭合后随表单落库） */
  points: Pt[];
  /** 是否已闭合（点回首点 / 矩形两点 / 完成绘制）；闭合后才能保存范围 */
  closed: boolean;
  /** 绘制工具：多边形点选 / 矩形两点成框 */
  tool: "polygon" | "rect";
  /** 矩形第一点（rect 工具：两次点击确定对角） */
  rectAnchor: Pt | null;
  /** 撤销栈：顶点序列快照（最多 20 步） */
  history: Pt[][];
  /** 重做栈 */
  future: Pt[][];
};
/** 删除二次确认 */
type Confirm = { title: string; text: string; run: () => boolean };

/**
 * 父级区域组合框：既能下拉选已有区域，也能手输任意文本
 * @description 输入时按包含关系过滤候选；输入了候选里没有的名称时，
 *              底部出现「＋ 新建父级区域」项（实际创建由保存时引擎完成）；
 *              清空文本 = 无父级（根区域）
 */
function ParentCombo({
  text,
  options,
  onChange,
}: {
  text: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const q = text.trim();
  const matched = q ? options.filter((o) => o.includes(q)) : options;
  const showCreate = q.length > 0 && !options.includes(q);

  return (
    <div className="combo">
      <input
        value={text}
        placeholder="选择或输入父级区域，可留空"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {open && (
        <div className="combo-drop">
          {matched.map((o) => (
            <button
              type="button"
              key={o}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o);
                setOpen(false);
              }}
            >
              {o}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              className="new"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(q);
                setOpen(false);
              }}
            >
              ＋ 新建父级区域「{q}」
            </button>
          )}
          {!matched.length && !showCreate && (
            <p className="combo-empty">无匹配区域</p>
          )}
        </div>
      )}
    </div>
  );
}

export function Admin() {
  const { s, act } = useStore();
  const areas = s.areas || [];

  const [areaForm, setAreaForm] = useState<AreaForm | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  /** 树选中节点：空串 = 全部区域；选中后右侧表格只显示该节点子树 */
  const [treeSel, setTreeSel] = useState("");
  /** 树展开状态：默认全部展开 */
  const [openSet, setOpenSet] = useState<Record<string, boolean>>({});

  /** 打开区域弹窗（新增 / 编辑）：已有范围轮廓则回显到全厂区 2D 底图上 */
  const openForm = (a?: {
    id: string;
    name: string;
    parentId?: string;
    owner?: string;
    department?: string;
    polygon?: Pt[];
  }) =>
    setAreaForm({
      id: a?.id,
      name: a?.name || "",
      // 编辑回显：父级 id → 父级名称（组合框里显示名称）
      parentText: a?.parentId
        ? (s.areas || []).find((x) => x.id === a.parentId)?.name || ""
        : "",
      owner: a?.owner || "",
      department: a?.department || "",
      points: a?.polygon ? [...a.polygon] : [],
      closed: !!a?.polygon?.length,
      tool: "polygon",
      rectAnchor: null,
      history: [],
      future: [],
    });

  /** 展开/收起：未记录的节点按「有子节点默认展开」处理 */
  const isOpen = (id: string, hasKids: boolean) =>
    openSet[id] ?? hasKids;

  /** 子区域列表（按 parentId 归组） */
  const kidsOf = (pid: string) =>
    areas.filter((x) => x.parentId === pid);

  /** 区域 id → 名称（表格 / 弹窗回显用） */
  const areaName = (id: string) => areas.find((x) => x.id === id)?.name || "—";

  /** 选中节点的子树 id 集合（含自身）：表格筛选与树高亮共用 */
  const subtreeOf = (rootId: string): Set<string> => {
    const set = new Set<string>([rootId]);
    const walk = (pid: string) => {
      kidsOf(pid).forEach((k) => {
        set.add(k.id);
        walk(k.id);
      });
    };
    walk(rootId);
    return set;
  };
  /** 可配置区域：固定根「全厂区」不进右侧表格，它只是树的根 */
  const editableAreas = areas.filter((a) => a.id !== ROOT_AREA_ID);
  /** 表格数据：选中根（treeSel 为空）显示全部可配置区域；选中某节点只显示其子树 */
  const tableAreas = treeSel
    ? editableAreas.filter((a) => subtreeOf(treeSel).has(a.id))
    : editableAreas;
  const [pn, PN] = useViewState("admin.areas.page", 1);
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [pageSize, SETPAGESIZE] = usePageSize("admin.areas.size");
  // 分页切片：换选中节点后行数变化，当前页一律 clamp 到有效范围
  const areaPages = Math.max(1, Math.ceil(tableAreas.length / pageSize));
  const areaCur = Math.min(Math.max(1, pn), areaPages);
  const areaRows = tableAreas.slice(
    (areaCur - 1) * pageSize,
    areaCur * pageSize,
  );

  /** 树可见行：从固定根「全厂区」DFS 展开（id / 名称 / 深度 / 有无子节点） */
  const treeRows: { id: string; name: string; depth: number; hasKids: boolean }[] = [];
  const walkTree = (pid: string, depth: number) => {
    kidsOf(pid).forEach((a) => {
      const hasKids = kidsOf(a.id).length > 0;
      treeRows.push({ id: a.id, name: a.name, depth, hasKids });
      if (isOpen(a.id, hasKids)) walkTree(a.id, depth + 1);
    });
  };
  walkTree(ROOT_AREA_ID, 0);
  const rootHasKids = treeRows.length > 0;

  /** 弹窗父级区域候选：排除自身及后代（防环由前端先挡一道，引擎再兜底）；根正常可选 */
  const parentOptions = (selfId?: string) => {
    if (!selfId) return areas;
    const banned = subtreeOf(selfId);
    return areas.filter((a) => !banned.has(a.id));
  };

  /** 把当前顶点序列压入撤销栈（任何改动顶点的操作前调用），并清空重做栈 */
  const pushHistory = (f: AreaForm): Pick<AreaForm, "history" | "future"> => ({
    history: [...f.history, f.points].slice(-20),
    future: [],
  });

  /** 图面点击：多边形依次加点（点回首点闭合）/ 矩形两点成框 */
  const mapClick = (x: number, y: number) => {
    if (!areaForm || areaForm.closed) return;
    if (areaForm.tool === "rect") {
      // 第一次点击定 anchor；第二次点击取对角，生成 4 顶点矩形并直接闭合
      if (!areaForm.rectAnchor) {
        setAreaForm({ ...areaForm, rectAnchor: { x, y } });
        return;
      }
      const a = areaForm.rectAnchor;
      setAreaForm({
        ...areaForm,
        ...pushHistory(areaForm),
        points: [
          { x: a.x, y: a.y },
          { x, y: a.y },
          { x, y },
          { x: a.x, y },
        ],
        closed: true,
        rectAnchor: null,
      });
      return;
    }
    // 多边形：靠近首点（2% 内）且已有 ≥3 顶点 → 闭合轮廓
    const first = areaForm.points[0];
    if (
      first &&
      areaForm.points.length >= 3 &&
      Math.hypot(first.x - x, first.y - y) < 2
    ) {
      setAreaForm({ ...areaForm, closed: true });
      return;
    }
    setAreaForm({
      ...areaForm,
      ...pushHistory(areaForm),
      points: [...areaForm.points, { x, y }],
    });
  };

  /** 撤销：弹回上一步顶点序列（闭合态撤销即重新打开草稿） */
  const undoDraw = () => {
    if (!areaForm?.history.length) return;
    setAreaForm({
      ...areaForm,
      points: areaForm.history[areaForm.history.length - 1],
      history: areaForm.history.slice(0, -1),
      future: [areaForm.points, ...areaForm.future],
      closed: false,
      rectAnchor: null,
    });
  };

  /** 重做：恢复被撤销的顶点序列 */
  const redoDraw = () => {
    if (!areaForm?.future.length) return;
    setAreaForm({
      ...areaForm,
      points: areaForm.future[0],
      history: [...areaForm.history, areaForm.points],
      future: areaForm.future.slice(1),
    });
  };

  /** 清空范围：当前内容入撤销栈，可撤回 */
  const clearDraw = () => {
    if (!areaForm) return;
    setAreaForm({
      ...areaForm,
      ...pushHistory(areaForm),
      points: [],
      closed: false,
      rectAnchor: null,
    });
  };

  return (
    <>
      <div className="admin-split">
        {/* 左：区域树目录（点击节点筛选右侧表格；再次点击取消筛选） */}
        <Panel title="区域目录" className="area-tree-panel">
          <div className="area-tree">
            {/* 固定根「全厂区」：不可删 / 不可改名，只能在其下新增区域 */}
            <div
              className={`area-tree-node area-tree-root${
                treeSel === "" ? " sel" : ""
              }`}
              onClick={() => setTreeSel("")}
            >
              <i
                className={`tw${rootHasKids ? "" : " off"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!rootHasKids) return;
                  setOpenSet({
                    ...openSet,
                    [ROOT_AREA_ID]: !isOpen(ROOT_AREA_ID, true),
                  });
                }}
              >
                <ChevronRight
                  size={13}
                  style={{
                    transform: isOpen(ROOT_AREA_ID, rootHasKids)
                      ? "rotate(90deg)"
                      : "none",
                  }}
                />
              </i>
              <FolderTree size={14} />
              <span>{ROOT_AREA_NAME}</span>
            </div>
            {treeRows.map((r) => (
              <div
                key={r.id}
                className={`area-tree-node${treeSel === r.id ? " sel" : ""}`}
                style={{ paddingLeft: 26 + r.depth * 18 }}
                onClick={() => setTreeSel(treeSel === r.id ? "" : r.id)}
              >
                {/* 展开箭头：无子节点的占位对齐 */}
                <i
                  className={`tw${r.hasKids ? "" : " off"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!r.hasKids) return;
                    setOpenSet({ ...openSet, [r.id]: !isOpen(r.id, true) });
                  }}
                >
                  <ChevronRight
                    size={13}
                    style={{
                      transform: isOpen(r.id, r.hasKids)
                        ? "rotate(90deg)"
                        : "none",
                    }}
                  />
                </i>
                <span>{r.name}</span>
              </div>
            ))}
            {!treeRows.length && (
              <p className="area-tree-empty">暂无下级区域，可在右侧「＋ 新增区域」创建</p>
            )}
          </div>
        </Panel>

        {/* 右：区域配置表格（随树选中节点筛选） */}
        <Panel
          title={treeSel ? `区域配置 · ${areaName(treeSel)}` : "区域配置"}
          extra={
            <Btn primary onClick={() => openForm()}>
              ＋ 新增区域
            </Btn>
          }
        >
          <Note>
            区域树以固定根「全厂区」开始：左侧目录点选节点可按子树筛选；
            悬停节点可直接新增子级或删除。改名后，该区域下设备的安装位置前缀会同步更新，
            不会掉到「未分区」。
          </Note>
          <Table
            heads={["区域名称", "父级区域", "操作"]}
            rows={areaRows.map((a) => [
              <b>{a.name}</b>,
              a.parentId ? areaName(a.parentId) : <span className="dim">—</span>,
              <div className="actions">
                <Btn onClick={() => openForm(a)}>编辑</Btn>
                <Btn
                  onClick={() =>
                    setConfirm({
                      title: "删除区域",
                      text: `确认删除区域「${a.name}」？其下级区域会一并上移到它的上级。`,
                      run: () => act({ type: "DELETE_AREA", id: a.id }),
                    })
                  }
                >
                  删除
                </Btn>
              </div>,
            ])}
          />
          <Pager
            page={areaCur}
            count={tableAreas.length}
            size={pageSize}
            onChange={PN}
            onSize={(n) => {
              SETPAGESIZE(n);
              PN(1);
            }}
          />
        </Panel>
      </div>

      {/* 区域：新增 / 编辑（宽版分栏：左参数、右图上画范围） */}
      {areaForm && (
        <Modal
          title={areaForm.id ? "编辑区域" : "新增区域"}
          wide
          onClose={() => setAreaForm(null)}
        >
          <div className="area-split">
            {/* 左：参数填空 */}
            <div className="area-form">
              <Field label="区域名称" required>
                <input
                  value={areaForm.name}
                  maxLength={32}
                  placeholder="例如 二期罐区"
                  onChange={(e) =>
                    setAreaForm({ ...areaForm, name: e.target.value })
                  }
                />
                <i className="f-count">{areaForm.name.length}/32</i>
              </Field>

              <Field label="父级区域">
                <ParentCombo
                  text={areaForm.parentText}
                  options={parentOptions(areaForm.id).map((p) => p.name)}
                  onChange={(v) =>
                    setAreaForm({ ...areaForm, parentText: v })
                  }
                />
              </Field>

              {/* 负责人 / 管理部门：纯手填，非必填 */}
              {(
                [
                  ["owner", "区域负责人"],
                  ["department", "管理部门"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    value={areaForm[key]}
                    placeholder="可留空"
                    onChange={(e) =>
                      setAreaForm({ ...areaForm, [key]: e.target.value })
                    }
                  />
                </Field>
              ))}

              <Note>
                区域名称必填；父级区域可下拉选择或直接手填（新名称保存时会自动创建），
                留空即直属「全厂区」。负责人与管理部门可留空。改名后，该区域下设备的
                安装位置前缀会同步更新，不会掉到「未分区」。
              </Note>
            </div>

            {/* 右：全厂大地图 + 绘制工具条 + 标绘列表（标题在画布之上，不参与悬浮定位） */}
            <div className="area-canvas">
              <div className="area-canvas-title">全厂大地图</div>
              <div className="area-canvas-body">
              <MapImageCanvas
                image={SAMPLE_MAP_IMAGE}
                height={430}
                hint={
                  areaForm.closed
                    ? "范围已闭合 · 可撤销或点工具重画"
                    : areaForm.tool === "rect"
                      ? areaForm.rectAnchor
                        ? "矩形：再点一次取对角"
                        : "矩形：点击第一个角"
                      : "点击加顶点 · 靠近首点自动闭合"
                }
                onAdd={areaForm.closed ? undefined : mapClick}
                areas={[
                  {
                    id: "draft",
                    points: areaForm.points,
                    closed: areaForm.closed,
                    name: areaForm.name || undefined,
                  },
                ]}
              />

              {/* 绘制工具条：悬浮在地图右上（多边形 / 矩形 / 撤销 / 重做 / 清空） */}
              <div className="area-tools">
                <button
                  type="button"
                  title="多边形：依次点顶点，点回首点闭合"
                  className={areaForm.tool === "polygon" ? "on" : ""}
                  onClick={() =>
                    setAreaForm({ ...areaForm, tool: "polygon", rectAnchor: null })
                  }
                >
                  <Pentagon size={16} />
                </button>
                <button
                  type="button"
                  title="矩形：两次点击取对角"
                  className={areaForm.tool === "rect" ? "on" : ""}
                  onClick={() =>
                    setAreaForm({ ...areaForm, tool: "rect", rectAnchor: null })
                  }
                >
                  <Square size={16} />
                </button>
                <button
                  type="button"
                  title="撤销"
                  disabled={!areaForm.history.length}
                  onClick={undoDraw}
                >
                  <Undo2 size={16} />
                </button>
                <button
                  type="button"
                  title="重做"
                  disabled={!areaForm.future.length}
                  onClick={redoDraw}
                >
                  <Redo2 size={16} />
                </button>
                <button
                  type="button"
                  title="清空标绘"
                  disabled={!areaForm.points.length}
                  onClick={clearDraw}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* 标绘列表：当前草稿 / 成品一条记录 */}
              <div className="area-plots">
                <div className="area-plots-head">标绘列表</div>
                {areaForm.points.length ? (
                  <div className="area-plot-item">
                    <b>{areaForm.name.trim() || "未命名区域"}</b>
                    <span>
                      {areaForm.closed
                        ? `已闭合 · ${areaForm.points.length} 个顶点`
                        : `绘制中 · ${areaForm.points.length} 个顶点`}
                    </span>
                    <button
                      type="button"
                      title="删除该标绘"
                      onClick={clearDraw}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ) : (
                  <p className="area-plots-empty">暂无标绘，点工具开始在图上画范围</p>
                )}
              </div>
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <Btn onClick={() => setAreaForm(null)}>取消</Btn>
            <Btn
              primary
              disabled={!areaForm.name.trim()}
              onClick={() => {
                const name = areaForm.name.trim();
                const ok = act(
                  areaForm.id
                    ? {
                        type: "RENAME_AREA",
                        id: areaForm.id,
                        name,
                        parentText: areaForm.parentText,
                        owner: areaForm.owner,
                        department: areaForm.department,
                        polygon: areaForm.closed ? areaForm.points : [],
                      }
                    : {
                        type: "ADD_AREA",
                        name,
                        parentText: areaForm.parentText,
                        owner: areaForm.owner,
                        department: areaForm.department,
                        polygon: areaForm.closed ? areaForm.points : [],
                      },
                );
                if (ok) setAreaForm(null);
              }}
            >
              保存
            </Btn>
          </div>
        </Modal>
      )}

      {/* 删除二次确认（通用组件） */}
      <DeleteConfirm state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
