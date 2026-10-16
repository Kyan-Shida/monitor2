/**
 * @file RobotPayloads.tsx
 * @description 后台管理 › 机器人上装能力：维护机器人可挂载的采集载荷主数据
 *              （上装编码 / 名称 / 采集能力（可多组：采集方式 + 支持动作）/ 适用机型 / 启用停用）。
 *              一个上装可**再定义多种采集方式**，机器人能力、任务指令集与派单校验都按
 *              「上装 → 采集能力组 → 采集方式 → 原子动作」反查，这里是上游口径。
 * @interaction 路由 `payloads`（后台管理 › 机器人上装能力）；引擎动作：
 *              ADD_ROBOT_PAYLOAD / UPDATE_ROBOT_PAYLOAD / SET_ROBOT_PAYLOAD_STATE / DELETE_ROBOT_PAYLOAD
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { usePageSize, useViewState } from "../data/navigation";
import { Btn, Badge, Panel, Table, Field, Modal } from "../components/UI";
import { Pager } from "../components/Business";
import { DeleteConfirm } from "../components/ListDelete";
import { atomicActions, atomicActionCapability, captureKinds } from "../data/types";
import { deviceTypes } from "../data/deviceProfile";
import type {
  CaptureKind,
  DeviceType,
  RobotPayloadAbility,
} from "../data/types";

/** 上装表单：编码在编辑态不可改（是业务唯一身份）；abilities 至少 1 组 */
type PayloadForm = {
  mode: "add" | "edit";
  id: string;
  name: string;
  /** 采集能力组：一个上装可覆盖多种采集方式，每组各自声明支持动作 */
  abilities: RobotPayloadAbility[];
  models: DeviceType[];
};
/** 删除二次确认 */
type Confirm = { title: string; text: string; run: () => boolean };

export function RobotPayloads() {
  const { s, act } = useStore();
  const list = s.robotPayloads || [];
  const [form, FORM] = useState<PayloadForm | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [pn, PN] = useViewState("payloads.page", 1);
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [pageSize, SETPAGESIZE] = usePageSize("payloads.size");
  // 分页切片：当前页一律 clamp 到有效范围
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const cur = Math.min(Math.max(1, pn), pages);
  const pageRows = list.slice((cur - 1) * pageSize, cur * pageSize);
  /**
   * 采集方式 → 可选动作
   * @description 动作归哪类采集由 `atomicActionCapability` 唯一决定，
   *              避免上装声明「红外」却挂「拍照」这种自相矛盾的配置。
   * @param k 采集方式
   * @returns 该采集方式下的原子动作
   */
  const actionsOfKind = (k: CaptureKind) =>
    atomicActions.filter((x) => atomicActionCapability[x] === k);

  /** 表单内已占用的采集方式（同一种采集方式不允许重复配置） */
  const usedKinds = form ? form.abilities.map((ab) => ab.kind) : [];
  const hasDupKind = new Set(usedKinds).size !== usedKinds.length;
  const formValid =
    !!form &&
    !!form.id.trim() &&
    !!form.name.trim() &&
    form.abilities.length > 0 &&
    form.abilities.every((ab) => ab.actions.length > 0) &&
    !hasDupKind;

  /** 改某一组采集能力（采集方式 / 支持动作） */
  const setAbility = (i: number, patch: Partial<RobotPayloadAbility>) =>
    form &&
    FORM({
      ...form,
      abilities: form.abilities.map((ab, j) => (j === i ? { ...ab, ...patch } : ab)),
    });
  /** 移除某一组采集能力（至少保留一组） */
  const removeAbility = (i: number) =>
    form && FORM({ ...form, abilities: form.abilities.filter((_, j) => j !== i) });
  /** 新增一组采集能力：默认取「尚未使用的采集方式」，都用完则退回第一个 */
  const addAbility = () => {
    if (!form) return;
    const free =
      captureKinds.find((k) => !usedKinds.includes(k)) || captureKinds[0];
    FORM({
      ...form,
      abilities: [...form.abilities, { kind: free, actions: actionsOfKind(free) }],
    });
  };

  return (
    <>
      <Panel
        title="机器人上装能力"
        extra={
          <Btn
            primary
            onClick={() =>
              FORM({
                mode: "add",
                id: "",
                name: "",
                abilities: [{ kind: "可见光", actions: actionsOfKind("可见光") }],
                models: [...deviceTypes],
              })
            }
          >
            ＋ 新增上装
          </Btn>
        }
      >
        <Table
          heads={[
            "上装编码",
            "上装名称",
            "采集能力（采集方式 / 支持动作）",
            "适用机型",
            "状态",
            "操作",
          ]}
          rows={pageRows.map((p) => [
            p.id,
            <b>{p.name}</b>,
            <div className="payload-abilities">
              {p.abilities.map((ab) => (
                <div key={ab.kind}>
                  <Badge>{ab.kind}</Badge>
                  <span className="muted">{ab.actions.join(" / ")}</span>
                </div>
              ))}
            </div>,
            p.models.length ? p.models.join(" / ") : "机型无关",
            <Badge>{p.state}</Badge>,
            <div className="actions">
              <Btn
                onClick={() =>
                  FORM({
                    mode: "edit",
                    id: p.id,
                    name: p.name,
                    abilities: p.abilities.map((ab) => ({
                      kind: ab.kind,
                      actions: [...ab.actions],
                    })),
                    models: [...p.models],
                  })
                }
              >
                编辑
              </Btn>
              <Btn
                onClick={() =>
                  act({
                    type: "SET_ROBOT_PAYLOAD_STATE",
                    id: p.id,
                    state: p.state === "启用" ? "停用" : "启用",
                  })
                }
              >
                {p.state === "启用" ? "停用" : "启用"}
              </Btn>
              <Btn
                danger
                onClick={() =>
                  setConfirm({
                    title: "删除上装",
                    text: `确认删除上装「${p.name}」？`,
                    run: () => act({ type: "DELETE_ROBOT_PAYLOAD", id: p.id }),
                  })
                }
              >
                删除
              </Btn>
            </div>,
          ])}
        />
        <Pager
          page={cur}
          count={list.length}
          size={pageSize}
          onChange={PN}
          onSize={(n) => {
            SETPAGESIZE(n);
            PN(1);
          }}
        />
      </Panel>

      {/* 上装：新增 / 编辑 */}
      {form && (
        <Modal
          title={form.mode === "edit" ? "编辑上装" : "新增上装"}
          onClose={() => FORM(null)}
        >
          <Field label="上装编码">
            <input
              value={form.id}
              disabled={form.mode === "edit"}
              placeholder="例如 PL-LIDAR"
              onChange={(e) => FORM({ ...form, id: e.target.value })}
            />
          </Field>
          <Field label="上装名称">
            <input
              value={form.name}
              placeholder="例如 三维激光雷达"
              onChange={(e) => FORM({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="采集能力（可配置多种采集方式）">
            <div className="ability-groups">
              {form.abilities.map((ab, i) => (
                <div className="ability-group" key={i}>
                  <div className="ability-group-head">
                    <select
                      value={ab.kind}
                      onChange={(e) => {
                        const kind = e.target.value as CaptureKind;
                        // 采集方式变了，本组支持动作按新口径重选，避免残留不匹配的动作
                        setAbility(i, { kind, actions: actionsOfKind(kind) });
                      }}
                    >
                      {captureKinds.map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                    {form.abilities.length > 1 && (
                      <Btn onClick={() => removeAbility(i)}>移除</Btn>
                    )}
                  </div>
                  <div className="actions">
                    {actionsOfKind(ab.kind).map((x) => (
                      <label key={x} className="inline-filter">
                        <input
                          type="checkbox"
                          checked={ab.actions.includes(x)}
                          onChange={(e) =>
                            setAbility(i, {
                              actions: e.target.checked
                                ? [...ab.actions, x]
                                : ab.actions.filter((y) => y !== x),
                            })
                          }
                        />
                        <span>{x}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <Btn onClick={addAbility}>＋ 新增采集方式</Btn>
              </div>
              {hasDupKind && (
                <p role="alert" className="reference-upload-error">
                  同一种采集方式不能重复配置
                </p>
              )}
            </div>
          </Field>
          <Field label="适用机型">
            <div className="actions">
              {deviceTypes.map((m) => (
                <label key={m} className="inline-filter">
                  <input
                    type="checkbox"
                    checked={form.models.includes(m)}
                    onChange={(e) =>
                      FORM({
                        ...form,
                        models: e.target.checked
                          ? [...form.models, m]
                          : form.models.filter((y) => y !== m),
                      })
                    }
                  />
                  <span>{m}</span>
                </label>
              ))}
            </div>
          </Field>
          <div className="modal-actions">
            <Btn onClick={() => FORM(null)}>取消</Btn>
            <Btn
              primary
              disabled={!formValid}
              onClick={() => {
                const ok = act({
                  type:
                    form.mode === "edit"
                      ? "UPDATE_ROBOT_PAYLOAD"
                      : "ADD_ROBOT_PAYLOAD",
                  id: form.id.trim(),
                  name: form.name.trim(),
                  abilities: form.abilities,
                  models: form.models,
                });
                if (ok) FORM(null);
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
