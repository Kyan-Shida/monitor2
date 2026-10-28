/**
 * @file PlanRobotBinding.tsx
 * @description 计划绑定执行机器人：一个级联选择器字段（机型 › 机器人），**必填**；
 *              没有「暂不绑定」选项（任务计划必须绑定机器人；临时任务不经过本字段），
 *              选到不可绑定的机器人时不落这次选择，改用弹窗说明原因
 * @interaction Planning.tsx（新建 / 编辑计划弹窗、计划编辑内置页）；机型与检测能力口径来自 data/planSchedule
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { bindingReasons, requiredKinds } from "../data/planSchedule";
import { Cascader, type CascaderOption } from "./Cascader";
import { Btn, Field, Modal } from "./UI";
import type { Robot } from "../data/types";

export function PlanRobotBinding({
  value,
  onChange,
  templateId,
}: {
  value: string;
  onChange: (id: string) => void;
  templateId: string;
}) {
  const { s } = useStore();
  /** 被拦下的机器人：说清为什么绑不上，但不改变当前选择 */
  const [blocked, SETBLOCKED] = useState<{
    robot: Robot;
    why: string[];
  } | null>(null);
  /** 抽象原因展开成可读文案（与旧卡片上的提示同一口径，缺什么写什么） */
  const explain = (robot: Robot, reasons: string[]) =>
    reasons.map((x) => {
      if (x === "检测能力不足") {
        const missing = requiredKinds(s, templateId).filter(
          (k) => !robot.capabilities.includes(k),
        );
        return `检测能力不足（缺 ${missing.join(" / ")}）`;
      }
      return x;
    });
  /** 一级为各机型，二级为该机型下的机器人（不再提供「暂不绑定」：计划必须绑定机器人） */
  const options: CascaderOption[] = [...new Set(s.robots.map((r) => r.deviceType))].map(
    (dt) => ({
      value: `dt:${dt}`,
      label: dt,
      children: s.robots
        .filter((r) => r.deviceType === dt)
        .map((r) => ({ value: r.id, label: `${r.id} · ${r.name}` })),
    }),
  );
  const pick = (v: string) => {
    const robot = s.robots.find((r) => r.id === v);
    if (!robot) return;
    const reasons = bindingReasons(s, templateId, robot);
    // 不可绑定：弹窗把原因说清即可，选择保持原样
    if (reasons.length) return SETBLOCKED({ robot, why: explain(robot, reasons) });
    onChange(robot.id);
  };
  return (
    <>
      <Field label="执行机器人" required>
        <Cascader
          options={options}
          value={value}
          onChange={pick}
          placeholder="请选择"
        />
      </Field>
      {blocked && (
        <Modal
          title={`不可绑定 · ${blocked.robot.id}`}
          slim
          onClose={() => SETBLOCKED(null)}
          footer={
            <Btn primary onClick={() => SETBLOCKED(null)}>
              知道了
            </Btn>
          }
        >
          <ul className="bind-reasons">
            {blocked.why.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}
