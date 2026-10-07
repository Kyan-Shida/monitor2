/**
 * @file ResultReviewDrawer.tsx
 * @description 人工复核抽屉：单条巡检结果的证据链路 + 复核表单，就地完成判定
 *              （原「结果详情 / 复核」内置页改为抽屉，身后的列表 / 详情上下文不丢失）
 * @interaction pages/Results.tsx（巡检结果查询列表行「复核」、review 深链）、
 *              pages/Results.tsx 的 result-detail 内置页、components/ResultView.tsx（巡检结果详情）
 */
import { useEffect, useState } from "react";
import { useStore } from "../data/store";
import { pointOf, judgeOf } from "../data/selectors";
import { Badge, Btn, Field, Modal, Note, Table } from "./UI";
import { ResultRuleEvidence } from "./ResultRuleEvidence";
import { ResultTrend } from "./ResultTrend";
import { Video } from "./Video";

/** 采集证据种类：与结果详情内置页保持一致 */
const EVIDENCES = ["照片", "红外", "视频", "音频", "传感器"];

/**
 * 人工复核抽屉
 * @param id 结果 ID
 * @param onClose 关闭回调（从 review 路由进入时由调用方负责回退路由）
 */
export function ResultReviewDrawer({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { s, act } = useStore();
  const [evidence, E] = useState("照片");
  const [value, V] = useState(""),
    [reason, R] = useState(""),
    [conclusion, C] = useState("确认"),
    [finalState, FS] = useState("");
  // 切换到另一条结果时清空表单，避免上一条填写的依据被提交到下一条
  useEffect(() => {
    V("");
    R("");
    C("确认");
    FS("");
  }, [id]);

  // 严格按传入的结果 ID 取数：抽屉内不切换对象，查不到就明确提示
  const pending = s.results.filter((x) => x.status === "待复核");
  const rd = s.results.find((x) => x.id === id);
  if (!rd)
    return (
      <Modal title="人工复核" onClose={onClose} drawer>
        <Note>未找到巡检结果 {id}，请从巡检结果列表重新进入。</Note>
      </Modal>
    );
  const p = pointOf(s, rd),
    t = s.tasks.find((x) => x.id === rd.taskId);
  /** 异常 / 待复核需人工判定；正常结果只读（白盒详情，无需复核） */
  const needReview = rd.abnormal || rd.status === "待复核";
  const judge = judgeOf(rd);
  const relatedAlarms = s.alarms.filter((a) => a.resultId === rd.id);

  /**
   * 提交复核：结论写入结果并追加审计记录，提交后关闭抽屉（不跳到别的结果）
   * @returns 未填写依据时不提交
   */
  function submit() {
    if (!reason.trim()) return;
    act({
      type: "REVIEW",
      id: rd.id,
      value: conclusion === "修正" ? value : rd.final,
      reason,
      conclusion,
      finalState: finalState || (rd.abnormal ? "异常" : "正常"),
    });
    onClose();
  }

  return (
    <Modal
      title={`${needReview ? "人工复核" : "结果详情（白盒）"} · ${rd.id}`}
      onClose={onClose}
      drawer
      drawerWidth={680}
      footer={
        needReview ? (
          <>
            <span className="rvd-foot-hint">
              待复核共 {pending.length} 条{rd.status === "待复核" ? "（含本条）" : ""}
            </span>
            <Btn onClick={onClose}>取消</Btn>
            <Btn primary disabled={!reason.trim()} onClick={submit}>
              提交复核
            </Btn>
          </>
        ) : (
          <Btn onClick={onClose}>关闭</Btn>
        )
      }
    >
      {/* 上下文：这条结果"是谁、什么时候、由哪台机器采集" */}
      <div className="rd-grid">
        <span>
          业务判断
          <b>
            <Badge>{judge}</Badge>
          </b>
        </span>
        <span>
          复核状态
          <b>
            <Badge>{rd.status}</Badge>
          </b>
        </span>
        <span>
          设备
          <b>{p?.device || "—"}</b>
        </span>
        <span>
          巡检点
          <b>{p?.name || rd.pointId}</b>
        </span>
        <span>
          任务
          <b>{t?.name || rd.taskId}</b>
        </span>
        <span>
          机器人
          <b>{t?.robotId || "—"}</b>
        </span>
        <span>
          采集时间
          <b>{rd.time}</b>
        </span>
        <span>
          检测项
          <b>{rd.item}</b>
        </span>
      </div>
      <div className="rvd-sec">
        <h5>原始采集证据</h5>
        <div className="segmented">
          {EVIDENCES.map((x) => (
            <button
              key={x}
              className={evidence === x ? "active" : ""}
              onClick={() => E(x)}
            >
              {x}
            </button>
          ))}
        </div>
        {evidence === "照片" || evidence === "视频" ? (
          <Video label={p?.name} live={false} />
        ) : (
          <Note>
            {evidence === "传感器"
              ? `原始采集值：${rd.raw} ${rd.unit}`
              : evidence === "红外"
                ? p?.kind === "红外"
                  ? `热像测温结果 ${rd.raw} ${rd.unit}（演示数据）`
                  : "本条结果未关联红外证据。"
                : "本条结果未关联音频文件。"}
          </Note>
        )}
        <p className="rvd-hint">
          {rd.source} · 采集时间 {rd.time}；巡检视频留存与回放对接工厂 NVR，平台仅提供回放入口与关键帧截图。
        </p>
      </div>

      {/* 结果链路：原始 → 识别 → 平台规则 → 最终值，解释"为什么是这个判定" */}
      <div className="rvd-sec">
        <h5>结果链路 · 原始 → 识别 → 最终</h5>
        <dl className="rvd-chain">
          <dt>原始采集</dt>
          <dd>
            {rd.raw} {rd.unit}
          </dd>
          <dt>外部 AI 识别值</dt>
          <dd>
            {rd.recognized} {rd.unit} · 置信度 {Math.round(rd.confidence * 100)}%
          </dd>
          <dt>平台规则判断依据</dt>
          <dd>
            <ResultRuleEvidence result={rd} />
          </dd>
          <dt>最终值</dt>
          <dd className="big-number">
            {rd.final} {rd.unit}
          </dd>
          <dt>业务判断</dt>
          <dd>
            <Badge>{judge}</Badge>
          </dd>
        </dl>
        <ResultTrend
          results={s.results.filter(
            (x) => x.pointId === rd.pointId && x.item === rd.item,
          )}
        />
      </div>

      <div className="rvd-sec">
        <h5>复核历史</h5>
        <Table
          heads={["时间", "结论", "最终值 / 状态", "依据"]}
          rows={rd.reviews.map((x) => [
            x.time,
            x.conclusion || "确认",
            `${x.value} / ${x.finalState || "—"}`,
            x.reason,
          ])}
        />
      </div>

      <div className="rvd-sec">
        <h5>
          关联告警<small>{relatedAlarms.length} 条</small>
        </h5>
        <Table
          heads={["告警", "状态"]}
          rows={relatedAlarms.map((a) => [a.name, <Badge>{a.state}</Badge>])}
        />
      </div>

      {needReview ? (
        <div className="rvd-sec">
          <h5>人工复核 · 判定与依据</h5>
          <Note>
            复核结论将追加到该结果的审计记录；原始值与识别值一并保留以便追溯（多次复核形成历史链）。
          </Note>
          <Field label="复核结论">
            <select value={conclusion} onChange={(e) => C(e.target.value)}>
              {["确认", "修正", "标记无效"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="最终值">
            <input
              value={value}
              disabled={conclusion !== "修正"}
              placeholder={rd.final}
              onChange={(e) => V(e.target.value)}
            />
          </Field>
          <Field label="最终业务状态">
            <select
              value={finalState || (rd.abnormal ? "异常" : "正常")}
              onChange={(e) => FS(e.target.value)}
            >
              <option>正常</option>
              <option>异常</option>
            </select>
          </Field>
          <Field label="复核依据 / 无效原因（必填）">
            <textarea value={reason} onChange={(e) => R(e.target.value)} />
          </Field>
        </div>
      ) : (
        <Note>该结果判定为正常，仅需查看详情（白盒），无需复核。</Note>
      )}
    </Modal>
  );
}
