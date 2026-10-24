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
import { useStore } from "../data/store";
import { usePageSize, useViewState } from "../data/navigation";
import { CatalogTree, type CatalogNode } from "../components/CatalogTree";
import {
  Btn,
  Drawer,
  InnerPage,
  Panel,
  Table,
  Field,
  Note,
} from "../components/UI";
import { Pager } from "../components/Business";
import { AreaSketch } from "../components/AreaSketch";
import { MapImageCanvas } from "../components/MapImageCanvas";
import { SAMPLE_MAP_IMAGE } from "../data/sampleMap";
import {
  DeleteConfirm,
  type DeleteConfirmState,
} from "../components/ListDelete";
import {
  ROOT_AREA_ID,
  ROOT_AREA_NAME,
  nextAreaCode,
  type Area,
} from "../data/types";

/** 顶点（底图百分比坐标） */
type Pt = { x: number; y: number };
/** 区域表单：id 存在 = 编辑，否则新增；points = 全厂区 2D 底图上绘制的顶点 */
type AreaForm = {
  id?: string;
  /** 区域编码：系统顺延分配，表单里只读展示 */
  code: string;
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
};


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
  /** 二次确认：删除与保存共用同一个确认弹窗 */
  const [confirm, setConfirm] = useState<DeleteConfirmState | null>(null);
  /** 树选中节点：空串 = 全部区域；选中后右侧表格只显示该节点子树 */
  const [treeSel, setTreeSel] = useState("");
  /** 只读查看的区域 */
  const [viewArea, setViewArea] = useState<Area | null>(null);

  /** 打开区域弹窗（新增 / 编辑）：已有范围轮廓则回显到全厂区 2D 底图上 */
  const openForm = (a?: {
    id: string;
    code?: string;
    name: string;
    parentId?: string;
    owner?: string;
    department?: string;
    polygon?: Pt[];
  }) =>
    setAreaForm({
      id: a?.id,
      // 编码由系统分配：编辑沿用原值，新增按现有最大值顺延
      code: a?.code || nextAreaCode(areas),
      name: a?.name || "",
      // 编辑回显：父级 id → 父级名称（组合框里显示名称）
      parentText: a?.parentId
        ? (s.areas || []).find((x) => x.id === a.parentId)?.name || ""
        : "",
      owner: a?.owner || "",
      department: a?.department || "",
      points: a?.polygon ? [...a.polygon] : [],
      closed: !!a?.polygon?.length,
    });

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

  /** 树数据：从固定根「全厂区」递归展开（展开 / 收起由通用目录树内部管理） */
  const areaNodes = (pid: string): CatalogNode[] =>
    kidsOf(pid).map((a) => ({
      key: a.id,
      label: a.name,
      children: areaNodes(a.id),
    }));

  /** 弹窗父级区域候选：排除自身及后代（防环由前端先挡一道，引擎再兜底）；根正常可选 */
  const parentOptions = (selfId?: string) => {
    if (!selfId) return areas;
    const banned = subtreeOf(selfId);
    return areas.filter((a) => !banned.has(a.id));
  };

  /** 保存区域：新增走 ADD_AREA，编辑走 RENAME_AREA（同一套字段） */
  const saveArea = () => {
    if (!areaForm) return false;
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
    if (ok) {
      setAreaForm(null);
      // 新增的区域可能挂在任意父级下：回到「全部区域」并翻回第一页，否则刚建完就看不见它
      if (!areaForm.id) {
        setTreeSel("");
        PN(1);
      }
    }
    return ok;
  };

  /* 区域编辑：左参数 + 右全厂地图画范围，两块要同屏对照，走内置页而不是浮层 */
  if (areaForm)
    return (
      <>
        <InnerPage
          title={areaForm.id ? "编辑区域" : "新增区域"}
          subtitle={areaForm.name.trim() || undefined}
          className="admin-area-page"
          actions={
            <>
              <Btn onClick={() => setAreaForm(null)}>取消</Btn>
              <Btn
                primary
                disabled={!areaForm.name.trim()}
                onClick={() => {
                  const editing = !!areaForm.id;
                  const name = areaForm.name.trim();
                  setConfirm({
                    title: editing ? "保存区域修改" : "新增区域",
                    okText: "确认保存",
                    text: editing ? (
                      <>
                        保存后「<b>{name}</b>」的区域参数更新；
                        若改了名称，该区域下设备的安装位置前缀会同步刷新。
                      </>
                    ) : (
                      <>
                        保存后新建区域「<b>{name}</b>」，可在设备台账里选用。
                      </>
                    ),
                    run: saveArea,
                  });
                }}
              >
                保存
              </Btn>
            </>
          }
        >
        <div className="area-split">
          {/* 左：参数填空 */}
          <div className="area-form">
            {/* 编码是系统的唯一标识：系统分配，用户不可改 */}
            <Field label="区域编码">
              <input value={areaForm.code} disabled readOnly />
            </Field>
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
                onChange={(v) => setAreaForm({ ...areaForm, parentText: v })}
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

          </div>

          {/* 右：全厂大地图 + 绘制工具条 + 标绘列表（标绘逻辑收在 AreaSketch，与锚点绘制共用） */}
          <AreaSketch
            label={areaForm.name}
            fill
            value={{ points: areaForm.points, closed: areaForm.closed }}
            onChange={(next) =>
              setAreaForm({ ...areaForm, ...next })
            }
          />
        </div>
        </InnerPage>

        {/* 保存二次确认：与列表删除共用同一个确认弹窗 */}
        <DeleteConfirm state={confirm} onClose={() => setConfirm(null)} />
      </>
    );

  return (
    <>
      <div className="admin-split">
        {/* 左：区域树目录（与设备台账同一套目录树；点击节点筛选右侧表格，再点取消） */}
        <CatalogTree
          ariaLabel="区域目录"
          rootLabel={ROOT_AREA_NAME}
          rootCount={editableAreas.length}
          nodes={areaNodes(ROOT_AREA_ID)}
          value={treeSel}
          onChange={(v) => setTreeSel(treeSel === v ? "" : v)}
        />

        {/* 右：区域配置表格（随树选中节点筛选） */}
        <Panel
          title={treeSel ? `区域配置 · ${areaName(treeSel)}` : "区域配置"}
          extra={
            <Btn primary onClick={() => openForm()}>
              ＋ 新增区域
            </Btn>
          }
        >
          <Table
            heads={["区域编码", "区域名称", "父级区域", "更新时间", "操作"]}
            rows={areaRows.map((a) => [
              <span>{a.code || "—"}</span>,
              <b>{a.name}</b>,
              a.parentId ? areaName(a.parentId) : <span className="dim">—</span>,
              <span className="muted">{a.updatedAt || "—"}</span>,
              <div className="actions">
                <Btn onClick={() => setViewArea(a)}>查看</Btn>
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

      {/* 区域详情：只读（含范围轮廓回显），改参数走「编辑」内置页 */}
      {viewArea && (
        <Drawer
          title={viewArea.name}
          subtitle={
            viewArea.parentId ? areaName(viewArea.parentId) : ROOT_AREA_NAME
          }
          onClose={() => setViewArea(null)}
          footer={<Btn onClick={() => setViewArea(null)}>关闭</Btn>}
        >
          <div className="form-grid">
            <Field label="区域编码">
              <input value={viewArea.code || "—"} disabled readOnly />
            </Field>
            <Field label="区域名称">
              <input value={viewArea.name} disabled readOnly />
            </Field>
            <Field label="父级区域">
              <input
                value={
                  viewArea.parentId
                    ? areaName(viewArea.parentId)
                    : ROOT_AREA_NAME
                }
                disabled
                readOnly
              />
            </Field>
            <Field label="区域负责人">
              <input value={viewArea.owner || "—"} disabled readOnly />
            </Field>
            <Field label="管理部门">
              <input value={viewArea.department || "—"} disabled readOnly />
            </Field>
            <Field label="更新时间">
              <input value={viewArea.updatedAt || "—"} disabled readOnly />
            </Field>
            <Field label="范围轮廓">
              <input
                value={
                  viewArea.polygon?.length
                    ? `已绘制 · ${viewArea.polygon.length} 个顶点`
                    : "未绘制"
                }
                disabled
                readOnly
              />
            </Field>
          </div>
          {/* 全厂大地图常驻：画过范围的区域直接高亮，没画过就看它在厂区里的相对位置 */}
          <MapImageCanvas
            image={SAMPLE_MAP_IMAGE}
            height={420}
            areas={
              viewArea.polygon?.length
                ? [
                    {
                      id: viewArea.id,
                      points: viewArea.polygon,
                      closed: true,
                      name: viewArea.name,
                    },
                  ]
                : []
            }
          />
        </Drawer>
      )}

      {/* 删除二次确认（通用组件） */}
      <DeleteConfirm state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
