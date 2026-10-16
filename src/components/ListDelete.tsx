/**
 * @file ListDelete.tsx
 * @description 列表通用删除：工具栏「删除」按钮 + 多选勾选列 + 二次确认弹窗。
 *              行内单行删除也复用同一个确认弹窗，全站只留一套删除交互。
 * @interaction 设备台账 / 巡检目标台账 / 计划任务 / 区域配置 / 机器人负载 /
 *              机器人能力 / 设备巡检目标 / 地图管理
 */
import { useState, type ReactNode } from "react";
import { Btn, Modal } from "./UI";

/** 确认弹窗的待执行内容 */
interface ConfirmState {
  title: string;
  text: ReactNode;
  /** 待删 id：用户点「确认删除」后原样交给 onDelete */
  ids: string[];
}

/** 多选批量删除配置：不传则本页只用行内单行删除 */
export interface ListDeleteBatch {
  /** 当前页可被「全选本页」命中的 id（勾选集合本身跨页保留） */
  pageIds: string[];
  /**
   * 常驻勾选列：不点「删除」就常显复选框（默认 false：点「删除」才进入多选态）
   * @description 巡检目标台账这类「勾选即批量操作」的页面用 true，可保持原有观感
   */
  alwaysOn?: boolean;
  /** 确认弹窗标题，默认「删除选中的 N 项」 */
  title?: (n: number) => string;
  /** 确认弹窗正文，默认列出待删项的名字 */
  text?: (n: number) => ReactNode;
  /** id → 展示名（仅用于默认正文） */
  nameOf?: (id: string) => string;
}

export interface ListDeleteOptions {
  /**
   * 执行删除
   * @returns 返回 false 表示被引擎拦截（弹窗不关闭、保留勾选，便于先解绑再删）
   */
  onDelete: (ids: string[]) => boolean | void;
  batch?: ListDeleteBatch;
}

export interface ListDeleteApi {
  /** 多选态：null = 未进入多选；数组 = 已勾选 id */
  sel: string[] | null;
  /** 工具栏按钮组；未配置 batch 时为 null */
  bar: ReactNode;
  /** 二次确认弹窗（无确认任务时为 null） */
  modal: ReactNode;
  /** 表头首列「全选本页」；非多选态为 null */
  head: ReactNode | null;
  /** 行首列勾选框；非多选态为 null */
  cell: (id: string, label?: string) => ReactNode | null;
  /** 多选态下传给 <Table className> 的类名（首列收窄） */
  tableClass?: string;
  /** 行内单行删除：弹出同一个确认弹窗 */
  ask: (ids: string[], o: { title: string; text: ReactNode }) => void;
}

/**
 * 列表删除状态与视图
 * @param o.onDelete 删除执行函数（批量与单行共用，单行时 ids 只有一个元素）
 * @param o.batch 多选批量配置；不传即本页只有行内删除
 * @returns 工具栏按钮、确认弹窗、勾选列与表格类名
 */
export function useListDelete(o: ListDeleteOptions): ListDeleteApi {
  const b = o.batch;
  /** 多选态：alwaysOn 的页面一开始就进多选，其余点「删除」才进 */
  const [sel, SETSEL] = useState<string[] | null>(
    b?.alwaysOn ? [] : null,
  );
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const pageIds = b?.pageIds ?? [];
  const picked = sel ?? [];
  const on = sel !== null;

  /** 全选本页：跨页勾选保留，本页整批增删 */
  const pageAllChecked =
    pageIds.length > 0 && pageIds.every((x) => picked.includes(x));

  const togglePage = (checked: boolean) =>
    SETSEL(
      checked
        ? [...new Set([...picked, ...pageIds])]
        : picked.filter((x) => !pageIds.includes(x)),
    );
  const toggleOne = (id: string, checked: boolean) =>
    SETSEL(checked ? [...picked, id] : picked.filter((x) => x !== id));

  /** 批量删除入口：先弹确认，确认后走 onDelete */
  const askBatch = () =>
    setConfirm({
      title: b?.title?.(picked.length) ?? `删除选中的 ${picked.length} 项`,
      text:
        b?.text?.(picked.length) ??
        picked.map((id) => b?.nameOf?.(id) ?? id).join("、"),
      ids: picked,
    });

  const bar = !b ? null : b.alwaysOn ? (
    <Btn danger disabled={!picked.length} onClick={askBatch}>
      删除{picked.length ? `（${picked.length}）` : ""}
    </Btn>
  ) : sel === null ? (
    <Btn onClick={() => SETSEL([])}>删除</Btn>
  ) : (
    <>
      <Btn danger disabled={!picked.length} onClick={askBatch}>
        删除（{picked.length}）
      </Btn>
      <Btn onClick={() => SETSEL(null)}>取消</Btn>
    </>
  );

  const modal = confirm ? (
    <Modal title={confirm.title} onClose={() => setConfirm(null)}>
      {/* 正文允许直接给节点（如带 Note 的删除说明），字符串则套一层段落 */}
      {typeof confirm.text === "string" ? <p>{confirm.text}</p> : confirm.text}
      <div className="modal-actions">
        <Btn onClick={() => setConfirm(null)}>取消</Btn>
        <Btn
          primary
          onClick={() => {
            if (o.onDelete(confirm.ids) === false) return;
            setConfirm(null);
            // 删除成功后退出多选（alwaysOn 的页面退回到空勾选）
            SETSEL(b ? (b.alwaysOn ? [] : null) : null);
          }}
        >
          确认删除
        </Btn>
      </div>
    </Modal>
  ) : null;

  return {
    sel,
    bar,
    modal,
    head: on ? (
      <input
        type="checkbox"
        aria-label="全选本页"
        checked={pageAllChecked}
        onChange={(e) => togglePage(e.target.checked)}
      />
    ) : null,
    cell: (id, label) =>
      on ? (
        <input
          type="checkbox"
          aria-label={`选择 ${label ?? id}`}
          checked={picked.includes(id)}
          onChange={(e) => toggleOne(id, e.target.checked)}
        />
      ) : null,
    tableClass: on ? "list-table-select" : undefined,
    ask: (ids, x) => setConfirm({ ids, ...x }),
  };
}

/** 单行删除确认的入参：页面自己持有「待删哪一项」的状态 */
export interface DeleteConfirmState {
  title: string;
  text: ReactNode;
  /** 执行删除；返回 false 表示被引擎拦截，弹窗不关闭 */
  run: () => boolean | void;
}

/**
 * 单行删除确认弹窗
 * @param state 待确认内容（null 表示不显示）
 * @param onClose 关闭回调（取消 / 删除成功后调用）
 * @description 各页「行内删除」原来各自复制了一份确认弹窗 JSX，这里收敛成一处；
 *              页面的删除触发与状态保持原样，只把弹窗换成这个组件。
 */
export function DeleteConfirm({
  state,
  onClose,
}: {
  state: DeleteConfirmState | null;
  onClose: () => void;
}) {
  if (!state) return null;
  return (
    <Modal title={state.title} onClose={onClose}>
      {typeof state.text === "string" ? <p>{state.text}</p> : state.text}
      <div className="modal-actions">
        <Btn onClick={onClose}>取消</Btn>
        <Btn
          primary
          onClick={() => {
            // 引擎拦截时（如被引用不能删）保留弹窗，错误提示由 store 统一弹出
            if (state.run() !== false) onClose();
          }}
        >
          确认删除
        </Btn>
      </div>
    </Modal>
  );
}
