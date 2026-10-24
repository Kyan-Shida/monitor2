/**
 * @file DeviceTargets.tsx
 * @description 设备巡检目标（内置页）：单台设备的检测项清单，支持就地新增 / 编辑 / 删除。
 * @interaction 由「设备台账」行内「巡检目标」进入；顶部摘要素复用 components/DeviceSummary；
 *              引擎 action：ADD_DEVICE_ITEM / UPDATE_DEVICE_ITEM / DELETE_DEVICE_ITEM
 * @description 采集方式与单位已从界面下线：检测项只维护 类型（实体 / 虚拟）/ 分类 / 检测目标名称，三项必填
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { Btn, Panel, Table, Field, Note, Modal } from "../components/UI";
import { DeviceSummary } from "../components/DeviceSummary";
import { DeleteConfirm } from "../components/ListDelete";
import {
  defaultCategoryOfTarget,
  defaultTargetKindOfTarget,
  itemTypeLabel,
  itemKindOfType,
} from "../data/deviceMaster";
import { itemCategories } from "../data/types";
import type { InspectItem } from "../data/types";

/** 检测项「类型」的界面两档（数据仍沿用仪表 / 区域，见 deviceMaster.itemKindOfType） */
const itemTypes = ["实体", "虚拟"] as const;

export function DeviceTargets({ id }: { id?: string }) {
  const { s, act } = useStore();
  const all = s.devices || [];
  /** 巡检目标归属设备：严格按路由上的设备 ID 绑定，查不到明确提示（不退化到第一台） */
  const dev = id ? all.find((d) => d.id === id) : undefined;
  /** 检测项表单：null=关闭；无 id=新增，有 id=编辑 */
  const [itemForm, ITEMFORM] = useState<{
    id?: string;
    /** 检测目标名称（如 出口压力表） */
    target: string;
    /** 类型（实体 / 虚拟） */
    type: (typeof itemTypes)[number];
    /** 分类（压力 / 温度 / 阀位 / 环境…）：下拉给建议、允许手填 */
    category: string;
    /** 用户是否手动改过类型 / 分类：改过之后不再被「检测目标名称」的输入自动覆盖 */
    typeLocked?: boolean;
    catLocked?: boolean;
  } | null>(null);
  /** 待删除的检测项（二次确认） */
  const [delItem, DELITEM] = useState<InspectItem | null>(null);
  // 未绑定到具体设备（缺 ID 或 ID 不存在）时直接说明，不展示别的设备的目标
  // 注：必须放在全部 Hook 之后，避免 Hook 调用数量随数据变化
  if (!dev)
    return (
      <Note>未找到设备{id ? ` ${id}` : ""}，请从「设备台账」进入。</Note>
    );
  /** 三项必填：任一为空则不可保存 */
  const formReady = !!itemForm?.target.trim() && !!itemForm?.category.trim();
  return (
    <>
      <div className="object-summary">
        <DeviceSummary key={dev.id} dev={dev} />
      </div>
      <Panel
        title="检测项"
        extra={
          <Btn
            primary
            onClick={() =>
              ITEMFORM({ target: "", type: "实体", category: "" })
            }
          >
            ＋ 新增检测项
          </Btn>
        }
      >
        <Table
          heads={["检测项 ID", "检测项名称", "类型", "分类", "操作"]}
          rows={dev.items.map((it) => [
            it.id,
            it.target,
            itemTypeLabel(it.targetKind),
            it.category || "—",
            <div className="actions">
              <Btn
                onClick={() =>
                  ITEMFORM({
                    id: it.id,
                    target: it.target,
                    type: itemTypeLabel(it.targetKind) as (typeof itemTypes)[number],
                    category: it.category || "",
                    typeLocked: true,
                    catLocked: true,
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
      </Panel>

      {itemForm && (
        <Modal
          title={itemForm.id ? "编辑检测项" : "新增检测项"}
          onClose={() => ITEMFORM(null)}
          footer={
            <>
              <Btn onClick={() => ITEMFORM(null)}>取消</Btn>
              <Btn
                primary
                disabled={!formReady}
                onClick={() => {
                  const payload = {
                    deviceId: dev.id,
                    target: itemForm.target.trim(),
                    // 类型（实体 / 虚拟）落库仍按仪表 / 区域两档，与台账 / 仪表同口径
                    targetKind: itemKindOfType(itemForm.type),
                    category: itemForm.category.trim(),
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
          <Field label="类型" required>
            <select
              value={itemForm.type}
              onChange={(e) =>
                ITEMFORM((f) =>
                  f
                    ? {
                        ...f,
                        type: e.target.value as (typeof itemTypes)[number],
                        typeLocked: true,
                      }
                    : f,
                )
              }
            >
              {itemTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="分类" required>
            {/* 下拉给常见分类建议，同时可直接手填清单外的值（来源 types.itemCategories） */}
            <input
              list="inspect-item-categories"
              value={itemForm.category}
              placeholder="如 压力 / 温度 / 环境"
              onChange={(e) =>
                ITEMFORM((f) =>
                  f ? { ...f, category: e.target.value, catLocked: true } : f,
                )
              }
            />
            <datalist id="inspect-item-categories">
              {itemCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="检测项名称" required>
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
                        // 未手改过时随检测目标名称推导：罐壁 / 管廊 → 虚拟，其余 → 实体
                        type: f.typeLocked
                          ? f.type
                          : (itemTypeLabel(
                              defaultTargetKindOfTarget(target),
                            ) as (typeof itemTypes)[number]),
                        category: f.catLocked
                          ? f.category
                          : target.trim()
                            ? defaultCategoryOfTarget(target)
                            : "",
                      }
                    : f,
                );
              }}
            />
          </Field>
        </Modal>
      )}

      {/* 删除检测项：二次确认（通用组件） */}
      <DeleteConfirm
        state={
          delItem
            ? {
                title: `删除检测项「${delItem.target}」`,
                text: (
                  <Note>
                    删除后该检测目标将从设备清单移除，并同步解绑对应的仪表、巡检目标台账与逻辑点引用；
                    此操作不可撤销。
                  </Note>
                ),
                run: () => {
                  act({
                    type: "DELETE_DEVICE_ITEM",
                    deviceId: dev.id,
                    itemId: delItem.id,
                  });
                },
              }
            : null
        }
        onClose={() => DELITEM(null)}
      />
    </>
  );
}
