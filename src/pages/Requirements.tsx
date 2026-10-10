/**
 * @file Requirements.tsx
 * @description 后台管理 › 巡检要求管理：平台「看什么、怎么判」的标准表达（模板库）的唯一维护入口。
 *              一条巡检要求 = 要求分类 + 适用目标类型 + 默认采集方式 + 检测类型 + 算法 + 判定方式（阈值 / 期望状态）。
 *              巡检目标台账 = 仪表 / 区域 + 一条巡检要求 + 算法 + 阈值 + 判定；台账按目标类型与采集方式匹配到对应要求。
 * @interaction 路由 `requirements`（后台管理）；引擎动作 SAVE_REQUIREMENT；引用方「巡检目标台账」
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { Badge, Btn, Field, Modal, Note, Panel, Table } from "../components/UI";
import {
  captureKinds,
  requirementKinds,
  type CaptureKind,
  type JudgeType,
  type Requirement,
  type RequirementKind,
} from "../data/types";
import { APPLY_KINDS, type ApplyKind } from "../data/alarmTemplates";

/** 适用目标类型（TGT-01 口径）：仪表 / 环境 / 区域 */
const TARGET_KINDS: Requirement["targetKinds"] = ["仪表", "环境", "区域"];
/** 判定方式清单 */
const JUDGE_TYPES: JudgeType[] = ["数值范围", "期望状态", "有无目标", "等级评分"];

/**
 * 空表单（新增态）
 * @description id 留空，引擎保存时自动生成 REQ- 前缀 id
 */
const emptyRequirement = (): Requirement => ({
  id: "",
  name: "",
  kind: "可见异常",
  description: "",
  targetKinds: ["仪表"],
  capture: "可见光",
  detectKind: "外观",
  algorithm: "",
  judge: "数值范围",
  unit: "",
  min: 0,
  max: 1,
  expected: "",
  needPhoto: true,
  needVideo: false,
  needReview: false,
  cycle: "每日",
});

export function Requirements() {
  const { s, act } = useStore();
  const requirements = s.requirements || [];
  const targets = s.businessTargets || [];
  const [req, SETREQ] = useState<Requirement | null>(null);
  /**
   * 巡检要求被引用的处数 = 巡检目标台账按 requirementId 引用
   * @description 引用数 = 改动影响面；被引用后只影响后续新台账，已落库的台账保留当时快照
   */
  const refCountOf = (id: string) =>
    targets.filter((t) => t.requirementId === id).length;

  return (
    <>
      <Note>
        这里是平台维护<strong>巡检要求</strong>（"看什么、怎么判"的标准表达）的唯一入口：一条要求包含
        <strong>要求分类、适用目标类型、默认采集方式、检测类型、算法、判定方式（阈值 / 期望状态）</strong>。
        巡检目标台账 = 仪表 / 区域 + 一条巡检要求 + 算法 + 阈值 + 判定；
        台账按目标类型与采集方式匹配到对应要求。已落库的台账保留保存时的口径快照，不会被改写。
      </Note>
      <Panel
        title="巡检要求 · 看什么 + 怎么判（模板库）"
        extra={
          <Btn
            primary
            disabled={s.roleId !== "admin"}
            onClick={() => SETREQ(emptyRequirement())}
          >
            ＋ 新增巡检要求
          </Btn>
        }
      >
        <Table
          heads={[
            "要求名称 / 分类",
            "适用目标类型",
            "采集方式 / 检测类型",
            "判定口径",
            "采集与复核",
            "版本 / 更新时间",
            "被引用",
            "操作",
          ]}
          rows={requirements.map((r) => [
            <>
              <b>{r.name}</b>
              <small>{r.kind}</small>
            </>,
            <span>
              {r.targetKinds.map((k) => (
                <Badge key={k}>{k}</Badge>
              ))}
            </span>,
            <>
              <Badge tone="blue">{r.capture}</Badge>
              <small>{r.detectKind || "—"}</small>
            </>,
            judgeText(r),
            <span>
              {r.needPhoto && <Badge>拍照</Badge>}
              {r.needVideo && <Badge>录像</Badge>}
              {r.needReview && <Badge tone="amber">复核</Badge>}
              {!r.needPhoto && !r.needVideo && !r.needReview && "—"}
            </span>,
            <>
              <small>v{r.version || 1}</small>
              <small>{r.updatedAt || "—"}</small>
            </>,
            <Badge tone={refCountOf(r.id) ? "blue" : undefined}>
              {refCountOf(r.id)} 处
            </Badge>,
            <Btn disabled={s.roleId !== "admin"} onClick={() => SETREQ({ ...r })}>
              修改
            </Btn>,
          ])}
        />
        <p className="muted">
          被引用数 = 当前有多少巡检目标台账引用了本要求。保存修改后立即生效，仅影响后续新建 / 编辑的台账；
          已落库的台账保留保存时的要求快照，不会回溯改写。
        </p>
      </Panel>

      {req && (
        <Modal
          title={req.id ? "修改巡检要求" : "新增巡检要求"}
          wide
          onClose={() => SETREQ(null)}
        >
          <div className="form-grid">
            <Field label="巡检要求名称">
              <input
                value={req.name}
                placeholder="如 看区域气体浓度"
                onChange={(e) => SETREQ({ ...req, name: e.target.value })}
              />
            </Field>
            <Field label="要求分类">
              <select
                value={req.kind}
                onChange={(e) =>
                  SETREQ({ ...req, kind: e.target.value as RequirementKind })
                }
              >
                {requirementKinds.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
            <Field label="默认采集方式">
              <select
                value={req.capture}
                onChange={(e) =>
                  SETREQ({ ...req, capture: e.target.value as CaptureKind })
                }
              >
                {captureKinds.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
            <Field label="检测类型">
              <select
                value={req.detectKind || ""}
                onChange={(e) =>
                  SETREQ({
                    ...req,
                    detectKind: (e.target.value || undefined) as
                      | ApplyKind
                      | undefined,
                  })
                }
              >
                <option value="">（按单位换算）</option>
                {APPLY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="说明">
            <input
              value={req.description || ""}
              placeholder="如 沿参照物锚点泵吸采样，读取区域可燃气体浓度"
              onChange={(e) =>
                SETREQ({ ...req, description: e.target.value })
              }
            />
          </Field>

          <Field label="适用目标类型（可多选）">
            <div className="check-row">
              {TARGET_KINDS.map((k) => (
                <label key={k}>
                  <input
                    type="checkbox"
                    checked={req.targetKinds.includes(k)}
                    onChange={(e) =>
                      SETREQ({
                        ...req,
                        targetKinds: e.target.checked
                          ? [...req.targetKinds, k]
                          : req.targetKinds.filter((x) => x !== k),
                      })
                    }
                  />
                  {k}
                </label>
              ))}
            </div>
            <p className="muted">
              仪表类目标不出现"看区域气体浓度"；区域 / 环境类目标不出现"看仪表读数"。
            </p>
          </Field>

          <Field label="算法 / AI 表达方式">
            <input
              value={req.algorithm}
              placeholder="如 区域气体浓度判读 v1.0"
              onChange={(e) => SETREQ({ ...req, algorithm: e.target.value })}
            />
          </Field>

          <Field label="判定方式">
            <select
              value={req.judge}
              onChange={(e) =>
                SETREQ({ ...req, judge: e.target.value as JudgeType })
              }
            >
              {JUDGE_TYPES.map((j) => (
                <option key={j}>{j}</option>
              ))}
            </select>
          </Field>

          {/* 判定方式决定下半部分口径：数值范围需单位 + 上下限；期望状态需期望状态 */}
          {req.judge === "数值范围" && (
            <div className="form-grid">
              <Field label="单位">
                <input
                  value={req.unit || ""}
                  placeholder="如 MPa / ℃ / ppm"
                  onChange={(e) => SETREQ({ ...req, unit: e.target.value })}
                />
              </Field>
              <Field label="下限（含）">
                <input
                  type="number"
                  step="any"
                  value={req.min ?? 0}
                  onChange={(e) =>
                    SETREQ({ ...req, min: +e.target.value })
                  }
                />
              </Field>
              <Field label="上限（含）">
                <input
                  type="number"
                  step="any"
                  value={req.max ?? 1}
                  onChange={(e) =>
                    SETREQ({ ...req, max: +e.target.value })
                  }
                />
              </Field>
            </div>
          )}
          {req.judge === "期望状态" && (
            <Field label="期望状态">
              <input
                value={req.expected || ""}
                placeholder="如 开启 / 无异常"
                onChange={(e) => SETREQ({ ...req, expected: e.target.value })}
              />
            </Field>
          )}

          <Field label="采集与复核要求">
            <div className="check-row">
              <label>
                <input
                  type="checkbox"
                  checked={!!req.needPhoto}
                  onChange={(e) =>
                    SETREQ({ ...req, needPhoto: e.target.checked })
                  }
                />
                需拍照
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!req.needVideo}
                  onChange={(e) =>
                    SETREQ({ ...req, needVideo: e.target.checked })
                  }
                />
                需录像
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!req.needReview}
                  onChange={(e) =>
                    SETREQ({ ...req, needReview: e.target.checked })
                  }
                />
                需人工复核
              </label>
            </div>
          </Field>

          <Field label="周期">
            <input
              value={req.cycle || ""}
              placeholder="如 每日 / 每班 / 每周"
              onChange={(e) => SETREQ({ ...req, cycle: e.target.value })}
            />
          </Field>

          <div className="modal-actions">
            <Btn onClick={() => SETREQ(null)}>取消</Btn>
            <Btn
              primary
              onClick={() => {
                if (act({ type: "SAVE_REQUIREMENT", requirement: req }))
                  SETREQ(null);
              }}
            >
              保存巡检要求
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * 判定口径摘要（列表展示）
 * @param r 巡检要求
 * @returns 中文口径串
 */
function judgeText(r: Requirement) {
  if (r.judge === "数值范围")
    return `${r.unit || ""} ${r.min ?? "—"}~${r.max ?? "—"}`;
  if (r.judge === "期望状态") return `期望：${r.expected || "—"}`;
  return r.judge;
}
