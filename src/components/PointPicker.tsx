/**
 * @file PointPicker.tsx
 * @description 巡检点选择器三栏布局：左「区域 › 设备」目录树（与设备台账同一棵树，节点可整组勾选 / 取消）、
 *              中「巡检点列表」（由调用方渲染）、右「已选清单」（可就地移除）
 * @interaction Planning.tsx（模板 / 计划弹窗的勾选表）、QuickTaskDrawer.tsx（临时任务）
 */
import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useStore } from "../data/store";
import { DeviceTree, type DeviceTreeValue } from "./DeviceTree";
import { Btn } from "./UI";
import { areaNameOf, devicesOfPoint } from "../data/deviceMaster";
import type { DeviceAsset, Point } from "../data/types";

/**
 * 去重（同一巡检点覆盖多台设备时会被重复收集）
 * @param items 巡检点集合
 * @returns 按 id 去重后的集合
 */
function uniq(items: Point[]): Point[] {
  return [...new Map(items.map((p) => [p.id, p])).values()];
}

export function PointPicker({
  points,
  selected,
  onToggle,
  onClear,
  children,
}: {
  /** 候选巡检点（调用方已按搜索 / 状态等前置条件筛选） */
  points: Point[];
  /** 已选巡检点 id */
  selected: string[];
  /** 单点勾选 / 取消 */
  onToggle: (id: string) => void;
  /** 清空已选 */
  onClear: () => void;
  /** 中栏：调用方渲染列表，入参为目录树裁剪后的巡检点 */
  children: (rows: Point[]) => ReactNode;
}) {
  const { s } = useStore();
  /** 目录树选中节点：与设备台账同口径（""=全部 / "r:区域" / "d:设备ID"） */
  const [node, setNode] = useState<DeviceTreeValue>("");
  /**
   * 设备下的候选巡检点
   * @description 覆盖设备口径与「巡检点管理」一致（`devicesOfPoint`），
   *              保证树上的计数、上一级的区域计数与列表筛选结果对得上
   */
  const pointsOfDevice = (deviceId: string) =>
    points.filter((p) => devicesOfPoint(s, p).some((d) => d.id === deviceId));
  /** 区域下的候选巡检点（一个点覆盖同区域多台设备时只算一次） */
  const pointsOfRegion = (devs: DeviceAsset[]) =>
    uniq(devs.flatMap((d) => pointsOfDevice(d.id)));
  /** 树节点 → 中栏候选：区域命中任一覆盖设备即算命中 */
  const matches = (p: Point) => {
    if (!node) return true;
    const covers: DeviceAsset[] = devicesOfPoint(s, p);
    return node.startsWith("d:")
      ? covers.some((d) => d.id === node.slice(2))
      : covers.some((d) => areaNameOf(s, d) === node.slice(2));
  };
  const rows = points.filter(matches);
  /** 已选清单取全量巡检点：避免前置筛选把已选项藏掉，出现"选了却看不到" */
  const picked = selected
    .map((id) => s.points.find((p) => p.id === id))
    .filter(Boolean) as Point[];
  /** 一组巡检点是否已全部选中 */
  const allPicked = (items: Point[]) =>
    items.length > 0 && items.every((p) => selected.includes(p.id));
  /** 整组勾选 / 整组取消：已全选则取消，否则补齐未选项 */
  const toggleGroup = (items: Point[]) => {
    const clear = allPicked(items);
    items.forEach((p) => {
      if (clear === selected.includes(p.id)) onToggle(p.id);
    });
  };
  /** 节点尾部整组勾选框（根 / 区域 / 设备共用） */
  const groupBox = (items: Point[], label: string) => (
    <input
      type="checkbox"
      aria-label={label}
      checked={allPicked(items)}
      onChange={() => toggleGroup(items)}
    />
  );
  return (
    <div className="pick-3col">
      {/* 左栏：与设备台账同一棵「区域 › 设备」树，计数按候选巡检点统计 */}
      <DeviceTree
        value={node}
        onChange={setNode}
        ariaLabel="巡检点树"
        rootLabel="全部巡检点"
        rootCount={points.length}
        countOf={(d) => pointsOfDevice(d.id).length}
        groupCountOf={(devs) => pointsOfRegion(devs).length}
        hideEmpty
        rootExtra={groupBox(points, "全选全部巡检点")}
        regionExtra={(devs) => groupBox(pointsOfRegion(devs), "全选该区域的巡检点")}
        deviceExtra={(d) => groupBox(pointsOfDevice(d.id), `全选 ${d.name} 的巡检点`)}
      />
      <div className="pick-main">{children(rows)}</div>
      <aside className="pick-picked">
        <div className="pick-picked-head">
          <span>
            已选 <b>{picked.length}</b>
          </span>
          {!!picked.length && <Btn onClick={onClear}>清空</Btn>}
        </div>
        <ul>
          {picked.map((p) => (
            <li key={p.id}>
              {/* 长点位名换行显示（不截断成难辨认的片段），并补点位编码以便区分同名设备下的点 */}
              <div>
                <span>{p.name}</span>
                <small>{p.id}</small>
              </div>
              <button aria-label={`移除 ${p.name}`} onClick={() => onToggle(p.id)}>
                <X size={13} />
              </button>
            </li>
          ))}
          {!picked.length && <li className="pick-empty">未选择</li>}
        </ul>
      </aside>
    </div>
  );
}
