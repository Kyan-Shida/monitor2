/**
 * @file RetryTaskModal.tsx
 * @description 超期任务「重新派单」确认框：原任务留档不动，基于它的快照新建一条补派任务
 * @interaction pages/Planning（任务列表超期行）、pages/DispatchDesk（右栏「待补派」）
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { retryDeadlineOf } from "../data/engine";
import { fmtDateTime, type Task } from "../data/types";
import { Btn, Modal } from "./UI";

export function RetryTaskModal({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  const { s, act } = useStore();
  /** 截止时间固定成打开弹窗那一刻的预览值，避免每秒重渲染把时间刷着跳 */
  const [due] = useState(() => new Date(retryDeadlineOf(s, task)));
  const robot = s.robots.find((r) => r.id === task.robotId);
  return (
    <Modal
      title="重新派单"
      slim
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>取消</Btn>
          <Btn
            primary
            onClick={() => {
              if (act({ type: "RETRY_TASK", id: task.id })) onClose();
            }}
          >
            生成补派任务
          </Btn>
        </>
      }
    >
      <dl className="retry-summary">
        <dt>原任务</dt>
        <dd>
          {task.id} · {task.name}
        </dd>
        <dt>新任务</dt>
        <dd>超期补派 · {robot ? `${robot.id} ${robot.name}` : "待分配"}</dd>
        <dt>截止时间</dt>
        <dd>{fmtDateTime(due.toISOString())}</dd>
      </dl>
    </Modal>
  );
}
