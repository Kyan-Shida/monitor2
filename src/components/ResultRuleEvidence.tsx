import type { Result } from "../data/types";
import { evaluateRule } from "../data/alarmRules";
import { go } from "../data/navigation";
import { Btn, Badge } from "./UI";
export function ResultRuleEvidence({ result }: { result: Result }) {
  const rule = result.ruleSnapshot;
  const evaluation = evaluateRule(rule, result.recognized);
  return (
    <div className="result-rule-evidence">
      {rule ? (
        <>
          <b>
            {rule.name} · v{rule.version}
          </b>
          <p>{evaluation.reason}</p>
          <Badge>
            {!evaluation.valid
              ? "待复核"
              : evaluation.abnormal
                ? "触发告警"
                : "规则判定正常"}
          </Badge>
          <small>
            按采集时保存的规则与识别值解释；人工复核后的最终结论另行保留。
          </small>
        </>
      ) : (
        <p>历史结果未保存规则快照，无法追溯当次阈值；不以当前规则倒推。</p>
      )}
      <Btn onClick={() => go("point", result.pointId)}>查看点位 / 配置规则</Btn>
    </div>
  );
}
