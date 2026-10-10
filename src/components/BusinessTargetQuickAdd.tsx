/**
 * @file BusinessTargetQuickAdd.tsx
 * @description 「快速新建巡检目标台账」抽屉（现场补录入口）：
 *              巡检目标台账 = 业务目标与要求 + 仪表 + 巡检要求 + 算法 + 阈值 + 判断标准 + 告警设置。
 *              提交即人工新增、直接生效；由「添加 / 编辑巡检点」与「现场采集新增巡检点」共用。
 * @interaction 引擎 action：ADD_BUSINESS_TARGET；被 pages/PointEdit.tsx、pages/PointOnsite.tsx 消费
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { Btn, Field, Modal, Note } from "./UI";
import type { BusinessTarget, JudgeType, State } from "../data/types";
import { defaultRangeOfUnit } from "../data/alarmRules";
import { defaultRequirementOfInstrument } from "../data/deviceMaster";

/** 快速新建表单（字段与 ADD_BUSINESS_TARGET 入参对齐） */
interface QuickForm {
  instrumentId: string;
  requirementId: string;
  algorithm: string;
  judge: JudgeType;
  unit: string;
  min: number;
  max: number;
  expected: string;
  criteria: string;
}

/**
 * 取初始表单：按预选仪表 + 其默认巡检要求带出算法 / 判定 / 阈值 / 单位 / 判断标准
 * @param s 状态
 * @param instrumentId 预选仪表 id；缺省用第一个仪表
 * @returns 初始表单
 */
function initForm(s: State, instrumentId?: string): QuickForm {
  const insId = instrumentId || s.instruments?.[0]?.id || "";
  const ins = s.instruments?.find((x) => x.id === insId);
  const rid = ins ? defaultRequirementOfInstrument(ins) : "";
  const req = (s.requirements || []).find((r) => r.id === rid);
  const range =
    req?.judge === "数值范围"
      ? defaultRangeOfUnit(req.unit || ins?.unit) || { min: 0, max: 1 }
      : undefined;
  return {
    instrumentId: insId,
    requirementId: rid,
    algorithm: req?.algorithm || "",
    judge: req?.judge || "数值范围",
    unit: req?.unit || ins?.unit || "",
    min: range?.min ?? 0,
    max: range?.max ?? 1,
    expected: req?.expected || "",
    criteria: req?.description || "",
  };
}

/**
 * 快速新建巡检目标台账抽屉
 * @description 由调用方按需挂载（`{open && <BusinessTargetQuickAdd …/>}`），
 *              因此表单初值在挂载时一次性算好，无需外部同步
 * @param onClose 关闭回调
 * @param instrumentId 预选仪表（一般取当前巡检项已选的业务目标所属仪表）
 */
export function BusinessTargetQuickAdd({
  onClose,
  instrumentId,
}: {
  onClose: () => void;
  instrumentId?: string;
}) {
  const { s, act } = useStore();
  const [bt, BT] = useState<QuickForm>(() => initForm(s, instrumentId));

  /** 选巡检要求：带出算法 / 判定 / 阈值 / 单位 / 判断标准 */
  function applyReq(rid: string, insId: string) {
    const req = (s.requirements || []).find((r) => r.id === rid);
    const ins = s.instruments?.find((x) => x.id === insId);
    const range =
      req?.judge === "数值范围"
        ? defaultRangeOfUnit(req.unit || ins?.unit) || { min: 0, max: 1 }
        : undefined;
    BT((o) => ({
      ...o,
      requirementId: rid,
      algorithm: req?.algorithm || "",
      judge: req?.judge || "数值范围",
      unit: req?.unit || ins?.unit || "",
      min: range?.min ?? 0,
      max: range?.max ?? 1,
      expected: req?.expected || "",
      criteria: req?.description || "",
    }));
  }

  /** 提交（人工新增、直接生效） */
  function save() {
    const ok = act({
      type: "ADD_BUSINESS_TARGET",
      instrumentId: bt.instrumentId,
      requirementId: bt.requirementId,
      algorithm: bt.algorithm,
      judge: bt.judge,
      unit: bt.unit,
      min: Number(bt.min),
      max: Number(bt.max),
      expected: bt.expected,
      criteria: bt.criteria,
      needPhoto: true,
      needVideo: false,
      needReview: false,
      cycle: "每日",
      priority: "普通" as BusinessTarget["priority"],
      inspect: true,
    });
    if (ok) onClose();
  }

  return (
    <Modal
      title="快速新建巡检目标台账"
      wide
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>取消</Btn>
          <Btn
            primary
            disabled={!bt.instrumentId || !bt.requirementId || !bt.algorithm.trim()}
            onClick={save}
          >
            创建并生效
          </Btn>
        </>
      }
    >
      <Note>
        巡检目标台账 = 仪表 + 巡检要求 + 算法 + 告警模板。
        此处为现场补录入口，建完提交即人工新增、直接生效。
        <br />
        新建默认<b>二级告警（通知设备岗）</b>；判定异常即告警，平台没有"告警开关"，
        告警等级 / 通知 / 关联告警模板统一在「巡检目标台账 › 3、告警规则」维护。
      </Note>
      <Field label="检测目标（仪表）">
        <select
          value={bt.instrumentId}
          onChange={(e) => {
            const insId = e.target.value;
            const ins = s.instruments?.find((x) => x.id === insId);
            const rid = ins ? defaultRequirementOfInstrument(ins) : "";
            BT((o) => ({ ...o, instrumentId: insId }));
            if (rid) applyReq(rid, insId);
          }}
        >
          <option value="">请选择仪表</option>
          {(s.instruments || []).map((x) => {
            const dev = s.devices?.find((d) => d.id === x.deviceId);
            return (
              <option key={x.id} value={x.id}>
                {dev?.region || "—"} › {dev?.name || "—"} › {x.name}（
                {x.capture}
                {x.unit ? ` · ${x.unit}` : ""}）
              </option>
            );
          })}
        </select>
      </Field>
      <Field label="巡检要求（决定看什么）">
        <select
          value={bt.requirementId}
          onChange={(e) => applyReq(e.target.value, bt.instrumentId)}
        >
          {(s.requirements || [])
            // 现场补录的都是仪表类目标：只列适用于仪表的巡检要求
            .filter((r) => (r.targetKinds || ["仪表"]).includes("仪表"))
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}（{r.kind}）
              </option>
            ))}
        </select>
      </Field>
      <p className="muted">
        {(s.requirements || []).find((r) => r.id === bt.requirementId)?.description}
      </p>
      {/* 算法值来自「后台管理 › 算法模板管理」，不再手填（打通联动） */}
      <Field label="算法 / AI 表达方式（来源：后台管理 › 算法模板管理）">
        <select
          value={bt.algorithm}
          onChange={(e) => BT({ ...bt, algorithm: e.target.value })}
        >
          <option value="">请选择算法</option>
          {[
            ...(s.algoConfigs || [])
              .filter((a) => a.state !== "停用")
              .map((a) => a.name),
            ...(bt.algorithm &&
            !(s.algoConfigs || []).some((a) => a.name === bt.algorithm)
              ? [bt.algorithm]
              : []),
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </Field>
      <Field label="判定方式">
        <select
          value={bt.judge}
          onChange={(e) => BT({ ...bt, judge: e.target.value as JudgeType })}
        >
          {(["数值范围", "期望状态", "有无目标", "等级评分"] as JudgeType[]).map((j) => (
            <option key={j}>{j}</option>
          ))}
        </select>
      </Field>
      {bt.judge === "数值范围" && (
        <Field label="阈值（判断标准）">
          <div className="actions">
            <input
              type="number"
              step="0.01"
              aria-label="下限"
              value={bt.min}
              onChange={(e) => BT({ ...bt, min: Number(e.target.value) })}
            />
            <span>–</span>
            <input
              type="number"
              step="0.01"
              aria-label="上限"
              value={bt.max}
              onChange={(e) => BT({ ...bt, max: Number(e.target.value) })}
            />
            <input
              aria-label="单位"
              placeholder="单位"
              value={bt.unit}
              onChange={(e) => BT({ ...bt, unit: e.target.value })}
            />
          </div>
        </Field>
      )}
      {bt.judge === "期望状态" && (
        <Field label="期望状态">
          <input
            value={bt.expected}
            placeholder="例如 开启"
            onChange={(e) => BT({ ...bt, expected: e.target.value })}
          />
        </Field>
      )}
      <Field label="判断标准补充说明">
        <textarea
          rows={2}
          value={bt.criteria}
          placeholder="例如 以罐体上半部最高温为准"
          onChange={(e) => BT({ ...bt, criteria: e.target.value })}
        />
      </Field>
    </Modal>
  );
}
