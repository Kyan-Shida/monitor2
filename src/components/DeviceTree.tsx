/**
 * @file DeviceTree.tsx
 * @description 「区域 › 设备」两级树形目录：设备台账 / 巡检目标台账 / 巡检点管理 / 巡检点选择器共用同一份树与选中口径。
 *              区域取 areaNameOf（与后台设备主数据同口径），默认全部展开，节点带计数。
 *              可选传入 countOf / hideEmpty / *Extra：按业务对象（如巡检点）计数、裁掉空节点、
 *              在节点尾部挂整组勾选框——供「巡检点选择器」复用，不改变各页默认表现。
 * @interaction pages/DeviceMaster.tsx、pages/BusinessTargets.tsx、pages/InspectionPoints.tsx、components/PointPicker.tsx；
 *              区域清单统一由 deviceTreeRegions 提供，各页不再各写一套
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { useStore } from "../data/store";
import { areaNameOf, areaOptions } from "../data/deviceMaster";
import type { DeviceAsset, State } from "../data/types";

/** 树选中值：""=全部，"r:区域"=区域，"d:设备ID"=单台设备 */
export type DeviceTreeValue = string;

/**
 * 设备树第一层区域清单
 * @description 区域主数据 ∪ 设备实际归属（areaNameOf）；有设备归不到区域时补「未分区」兜底，
 *              避免设备在树上"消失"。区域下拉与本树共用，保证同一份口径。
 * @param s 状态
 * @returns 区域名称列表
 */
export function deviceTreeRegions(s: State): string[] {
  const list = areaOptions(s);
  const unassigned = (s.devices || []).some(
    (d) => areaNameOf(s, d) === "未分区",
  );
  return unassigned ? [...list, "未分区"] : list;
}

/**
 * 「区域 › 设备」树
 * @param value 选中值：""=全部，"r:区域"=区域，"d:设备ID"=单台设备
 * @param onChange 选中变化回调（由调用方映射为该页自己的筛选维度）
 * @param ariaLabel 无障碍标签
 * @param rootLabel 根节点文案（默认「全部设备」）
 * @param rootCount 根节点计数（默认按设备台数；传入 countOf 时按其求和）
 * @param countOf 叶子计数口径（不传则叶子不显示计数，区域显示设备台数）
 * @param groupCountOf 区域计数口径（如按去重后的业务对象数）；不传则按叶子计数求和
 * @param hideEmpty 计数为 0 的设备 / 区域是否隐藏（仅在传入 countOf 时生效）
 * @param rootExtra 根节点尾部内容（如整组勾选框）
 * @param regionExtra 区域节点尾部内容，入参为该区域下的设备（已按 hideEmpty 裁剪）
 * @param deviceExtra 设备节点尾部内容
 * @param extraGroup 附加分组（如「空间区域巡检」）：排在区域之后，承载**不属于任何设备**的业务对象
 *                   （区域 / 环境类目标：罐区气体、区域红外、声纹、AI 行为、环境拍照）。
 *                   分组节点选中值 = `g:<分组名>`，叶子值由调用方给定；
 *                   `replaceArea` = 隐藏同名的区域节点（该分组本身就是它的容器，避免同名两处）
 */
export function DeviceTree({
  value,
  onChange,
  ariaLabel = "设备树",
  rootLabel = "全部区域",
  rootCount,
  countOf,
  groupCountOf,
  hideEmpty = false,
  rootExtra,
  regionExtra,
  deviceExtra,
  extraGroup,
}: {
  value: DeviceTreeValue;
  onChange: (next: DeviceTreeValue) => void;
  ariaLabel?: string;
  rootLabel?: string;
  rootCount?: number;
  countOf?: (d: DeviceAsset) => number;
  groupCountOf?: (devices: DeviceAsset[]) => number;
  hideEmpty?: boolean;
  rootExtra?: ReactNode;
  regionExtra?: (devices: DeviceAsset[]) => ReactNode;
  deviceExtra?: (d: DeviceAsset) => ReactNode;
  extraGroup?: {
    name: string;
    leaves: { value: DeviceTreeValue; label: string; title?: string }[];
    replaceArea?: boolean;
  };
}) {
  const { s } = useStore();
  const all = s.devices || [];
  const regions = useMemo(() => deviceTreeRegions(s), [s]);
  /** 树节点展开状态：默认全部展开 */
  const [expanded, SETEXPANDED] = useState<Set<string>>(() => new Set(regions));
  useEffect(() => {
    SETEXPANDED((prev) => {
      // 只补缺（返回 prev 时不触发重渲染，避免内联 extraGroup 每次渲染都改状态）
      const missing = [...regions, ...(extraGroup ? [extraGroup.name] : [])].filter(
        (n) => !prev.has(n),
      );
      if (!missing.length) return prev;
      const next = new Set(prev);
      missing.forEach((n) => next.add(n));
      return next;
    });
  }, [regions, extraGroup?.name]);
  /**
   * 折叠 / 展开某个区域
   * @param rg 区域名
   */
  const toggleRegion = (rg: string) =>
    SETEXPANDED((prev) => {
      const next = new Set(prev);
      if (next.has(rg)) next.delete(rg);
      else next.add(rg);
      return next;
    });
  /** 叶子计数：未传 countOf 时统一按 1（等价于"存在即计 1"） */
  const cntOf = (d: DeviceAsset) => (countOf ? countOf(d) : 1);
  /** 区域下的设备清单；传了 countOf + hideEmpty 时把 0 计数的设备裁掉 */
  const devicesIn = (rg: string) =>
    all.filter(
      (d) =>
        areaNameOf(s, d) === rg && !(hideEmpty && countOf && cntOf(d) === 0),
    );
  /** 根节点计数：不传 countOf 时是设备台数，传了则按业务对象数求和 */
  const total =
    rootCount ??
    all.reduce((n, d) => n + (countOf ? cntOf(d) : 1), 0);
  /** 节点尾部附加内容：包一层挡住冒泡，避免勾选时连带切换树的选中节点 */
  const extra = (node: ReactNode) =>
    node ? (
      <span className="tree-extra" onClick={(e) => e.stopPropagation()}>
        {node}
      </span>
    ) : null;
  return (
    <aside className="device-tree" aria-label={ariaLabel}>
      <div
        className={"tree-node root" + (value === "" ? " sel" : "")}
        onClick={() => onChange("")}
      >
        <span className="tree-icon tree-folder">
          <Folder size={14} />
        </span>
        <span className="tree-label">{rootLabel}</span>
        <span className="tree-count">{total}</span>
        {extra(rootExtra)}
      </div>
      {regions.map((rg) => {
        const inRg = devicesIn(rg);
        // 附加分组承担了同名区域的展示（该分组里的对象不挂设备），区域节点不再重复占位
        if (extraGroup?.replaceArea && rg === extraGroup.name) return null;
        // 传了计数口径时，空区域不占位（如"该区域下没有巡检点"）
        if (hideEmpty && countOf && !inRg.length) return null;
        const isExpanded = expanded.has(rg);
        const rgCount = countOf
          ? groupCountOf
            ? groupCountOf(inRg)
            : inRg.reduce((n, d) => n + cntOf(d), 0)
          : inRg.length;
        return (
          <div key={rg} className="tree-group">
            <div
              className={"tree-node group" + (value === "r:" + rg ? " sel" : "")}
              onClick={() => {
                onChange("r:" + rg);
                toggleRegion(rg);
              }}
            >
              <span className="tree-chevron">
                {isExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </span>
              <span className="tree-icon tree-folder">
                {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
              </span>
              <span className="tree-label">{rg}</span>
              <span className="tree-count">{rgCount}</span>
              {extra(regionExtra?.(inRg))}
            </div>
            {isExpanded &&
              inRg.map((d) => (
                <div
                  key={d.id}
                  className={
                    "tree-node leaf" + (value === "d:" + d.id ? " sel" : "")
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange("d:" + d.id);
                  }}
                  title={d.name}
                >
                  <span className="tree-dot" />
                  <span className="tree-label">{d.name}</span>
                  {countOf && <span className="tree-count">{cntOf(d)}</span>}
                  {extra(deviceExtra?.(d))}
                </div>
              ))}
          </div>
        );
      })}
      {/*
        附加分组（如「空间区域巡检」）：所有"不属于任何设备"的业务对象统一挂在这里，
        分组节点 = 看全部（g:<分组名>），叶子 = 单个对象（值由调用方给）
      */}
      {extraGroup && (
        <div className="tree-group">
          <div
            className={
              "tree-node group" +
              (value === "g:" + extraGroup.name ? " sel" : "")
            }
            onClick={() => {
              onChange("g:" + extraGroup.name);
              toggleRegion(extraGroup.name);
            }}
          >
            <span className="tree-chevron">
              {expanded.has(extraGroup.name) ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </span>
            <span className="tree-icon tree-folder">
              {expanded.has(extraGroup.name) ? (
                <FolderOpen size={14} />
              ) : (
                <Folder size={14} />
              )}
            </span>
            <span className="tree-label">{extraGroup.name}</span>
            <span className="tree-count">{extraGroup.leaves.length}</span>
          </div>
          {expanded.has(extraGroup.name) &&
            extraGroup.leaves.map((l) => (
              <div
                key={l.value}
                className={"tree-node leaf" + (value === l.value ? " sel" : "")}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(l.value);
                }}
                title={l.title || l.label}
              >
                <span className="tree-dot" />
                <span className="tree-label">{l.label}</span>
              </div>
            ))}
        </div>
      )}
    </aside>
  );
}
