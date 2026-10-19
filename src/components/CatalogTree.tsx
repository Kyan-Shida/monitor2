/**
 * @file CatalogTree.tsx
 * @description 通用目录树：根节点 + 一层分组 + 可选叶子，与设备台账（DeviceTree）共用同一套
 *              节点样式与交互口径（.device-tree / .tree-node），不绑定具体业务数据模型。
 * @interaction components/DeviceTree.tsx 复用 TreeRoot / TreeGroup / TreeLeaf 渲染；
 *              pages/RobotAbilities.tsx 用 CatalogTree 渲染「能力类型」目录
 */
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";

/** 目录节点：不带 children 时为一层分组，带 children 时可折叠（支持多级） */
export interface CatalogNode {
  key: string;
  label: string;
  title?: string;
  count?: number;
  children?: CatalogNode[];
}

/** 递归收集可折叠节点的 key（默认全部展开） */
function collectExpandable(list: CatalogNode[]): string[] {
  return list.flatMap((n) =>
    n.children?.length ? [n.key, ...collectExpandable(n.children)] : [],
  );
}

/** 节点尾部附加内容：包一层挡住冒泡，避免勾选时连带切换选中节点 */
function NodeExtra({ children }: { children?: ReactNode }) {
  return children ? (
    <span className="tree-extra" onClick={(e) => e.stopPropagation()}>
      {children}
    </span>
  ) : null;
}

/** 树根节点：目录总览 */
export function TreeRoot({
  label,
  count,
  selected,
  onClick,
  extra,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
  extra?: ReactNode;
}) {
  return (
    <div
      className={"tree-node root" + (selected ? " sel" : "")}
      onClick={onClick}
    >
      <span className="tree-icon tree-folder">
        <Folder size={14} />
      </span>
      <span className="tree-label">{label}</span>
      {count !== undefined && <span className="tree-count">{count}</span>}
      <NodeExtra>{extra}</NodeExtra>
    </div>
  );
}

/** 分组节点：可折叠（expandable=false 时只作为可选中目录项） */
export function TreeGroup({
  label,
  count,
  selected,
  expanded = true,
  expandable = true,
  onClick,
  extra,
  children,
}: {
  label: string;
  count?: number;
  selected: boolean;
  expanded?: boolean;
  expandable?: boolean;
  onClick: () => void;
  extra?: ReactNode;
  children?: ReactNode;
}) {
  const open = expandable && expanded;
  return (
    <div className="tree-group">
      <div
        className={"tree-node group" + (selected ? " sel" : "")}
        onClick={onClick}
      >
        {expandable && (
          <span className="tree-chevron">
            {expanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </span>
        )}
        <span className="tree-icon tree-folder">
          {open ? <FolderOpen size={14} /> : <Folder size={14} />}
        </span>
        <span className="tree-label">{label}</span>
        {count !== undefined && <span className="tree-count">{count}</span>}
        <NodeExtra>{extra}</NodeExtra>
      </div>
      {open && children}
    </div>
  );
}

/** 叶子节点 */
export function TreeLeaf({
  label,
  title,
  count,
  selected,
  onClick,
  extra,
}: {
  label: string;
  title?: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
  extra?: ReactNode;
}) {
  return (
    <div
      className={"tree-node leaf" + (selected ? " sel" : "")}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title ?? label}
    >
      <span className="tree-dot" />
      <span className="tree-label">{label}</span>
      {count !== undefined && <span className="tree-count">{count}</span>}
      <NodeExtra>{extra}</NodeExtra>
    </div>
  );
}

/**
 * 通用目录树
 * @param rootLabel 根节点文案（如「能力类型」「全部区域」）
 * @param rootCount 根节点计数
 * @param rootSelectable 根节点是否可选（false 时只作标题，如无「全部」视图的目录）
 * @param nodes 一层目录节点；带 children 的节点可展开
 * @param value 选中节点的 key
 * @param onChange 选中变化回调
 */
export function CatalogTree({
  ariaLabel,
  rootLabel,
  rootCount,
  rootSelectable = true,
  nodes,
  value,
  onChange,
}: {
  ariaLabel?: string;
  rootLabel: string;
  rootCount?: number;
  rootSelectable?: boolean;
  nodes: CatalogNode[];
  value: string;
  onChange: (key: string) => void;
}) {
  /** 带子节点的目录默认全部展开 */
  const [expanded, SETEXPANDED] = useState<Set<string>>(
    () => new Set(collectExpandable(nodes)),
  );
  const toggle = (key: string) =>
    SETEXPANDED((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** 递归渲染：有子节点用可折叠分组，末级同样用分组（文件夹样式一致） */
  const render = (list: CatalogNode[]): ReactNode =>
    list.map((n) => {
      const expandable = !!n.children?.length;
      return (
        <TreeGroup
          key={n.key}
          label={n.label}
          count={n.count}
          selected={value === n.key}
          expandable={expandable}
          expanded={expanded.has(n.key)}
          onClick={() => {
            onChange(n.key);
            if (expandable) toggle(n.key);
          }}
        >
          {n.children?.length ? render(n.children) : null}
        </TreeGroup>
      );
    });

  return (
    <aside className="device-tree" aria-label={ariaLabel ?? rootLabel}>
      <TreeRoot
        label={rootLabel}
        count={rootCount}
        selected={rootSelectable && value === ""}
        onClick={() => rootSelectable && onChange("")}
      />
      {render(nodes)}
    </aside>
  );
}
