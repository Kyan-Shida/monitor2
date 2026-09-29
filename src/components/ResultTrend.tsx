import type { Result } from "../data/types";
export function ResultTrend({ results }: { results: Result[] }) {
  const data = results
    .filter((r) => Number.isFinite(Number(r.final)))
    .slice(0, 20)
    .reverse();
  const values = data.map((r) => Number(r.final)),
    max = Math.max(...values, 1),
    min = Math.min(...values, 0);
  return (
    <div className="result-trend">
      <svg viewBox="0 0 600 140" aria-label="历史检测值趋势">
        <path d="M30 10V110H580" fill="none" stroke="#bccbdb" />
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M30 ${20 + i * 40}H580`} stroke="#e3eaf2" />
        ))}
        <polyline
          fill="none"
          stroke="#2775c1"
          strokeWidth="2"
          points={data
            .map(
              (r, i) =>
                `${40 + (i * 520) / Math.max(1, data.length - 1)},${100 - ((Number(r.final) - min) / (max - min || 1)) * 80}`,
            )
            .join(" ")}
        />
        {data.map((r, i) => (
          <g key={r.id}>
            <circle
              cx={40 + (i * 520) / Math.max(1, data.length - 1)}
              cy={100 - ((Number(r.final) - min) / (max - min || 1)) * 80}
              r="4"
              fill={r.abnormal ? "#ce554f" : "#2775c1"}
            />
            <text
              x={40 + (i * 520) / Math.max(1, data.length - 1)}
              y="132"
              fontSize="10"
              textAnchor="middle"
            >
              {r.id}
            </text>
          </g>
        ))}
      </svg>
      <small>
        {data.length < 2
          ? "历史样本不足，当前仅显示已有观测值。"
          : "按已有采集记录展示，不插值生成历史数据。"}
      </small>
    </div>
  );
}
