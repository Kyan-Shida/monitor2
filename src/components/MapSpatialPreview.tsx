import { useState } from "react";
import type { MapAsset, Point } from "../data/types";
import { MapCanvas } from "./MapCanvas";
import { Badge } from "./UI";
export function MapSpatialPreview({
  map,
  points,
  onSelect,
}: {
  map: MapAsset;
  points: Point[];
  onSelect?: (id: string) => void;
}) {
  const [mode, M] = useState("二维业务图"),
    [angle, A] = useState(25),
    [picked, P] = useState("");
  const project = (x: number, y: number, z = 0) => {
    const a = (angle * Math.PI) / 180;
    return [
      250 + (x - 50) * Math.cos(a) * 4 - (y - 50) * Math.sin(a) * 4,
      190 + (x - 50) * Math.sin(a) * 1.6 + (y - 50) * Math.cos(a) * 1.6 - z,
    ];
  };
  return (
    <div className="spatial-preview">
      <div className="spatial-toolbar">
        <div className="segmented">
          {["二维业务图", "三维点云示意"].map((m) => (
            <button
              key={m}
              className={mode === m ? "active" : ""}
              onClick={() => M(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <Badge>
          m{map.version}/p{map.pointSet}
        </Badge>
      </div>
      {mode === "二维业务图" ? (
        <MapCanvas
          points={points}
          targets={map.targets}
          onSelect={(id) => {
            P(id);
            onSelect?.(id);
          }}
        />
      ) : (
        <>
          <svg viewBox="0 0 500 300" aria-label="三维点云示意图">
            <rect width="500" height="300" fill="#102b42" />
            {Array.from({ length: 20 }, (_, i) => {
              const a = project(i * 5, 0),
                b = project(i * 5, 100),
                c = project(0, i * 5),
                d = project(100, i * 5);
              return (
                <g key={i} stroke="#275066" strokeWidth=".5">
                  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
                  <line x1={c[0]} y1={c[1]} x2={d[0]} y2={d[1]} />
                </g>
              );
            })}
            {[
              [25, 30],
              [70, 30],
              [25, 70],
              [70, 70],
            ].map(([x, y], idx) => (
              <g key={idx}>
                {Array.from({ length: 144 }, (_, i) => {
                  const a = ((i % 24) / 24) * Math.PI * 2;
                  const p = project(
                    x + Math.cos(a) * 10,
                    y + Math.sin(a) * 10,
                    Math.floor(i / 24) * 10,
                  );
                  return (
                    <circle
                      key={i}
                      cx={p[0]}
                      cy={p[1]}
                      r="1.3"
                      fill="#6bbbcf"
                    />
                  );
                })}
              </g>
            ))}
            {points.map((p) => {
              const q = project(p.x, p.y, 35);
              return (
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={p.name}
                  key={p.id}
                  onClick={() => P(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") P(p.id);
                  }}
                >
                  <circle
                    cx={q[0]}
                    cy={q[1]}
                    r="6"
                    fill={picked === p.id ? "#ffcb5a" : "#51d5d0"}
                  />
                  <text x={q[0] + 9} y={q[1] - 5} fill="white" fontSize="10">
                    {p.id}
                  </text>
                </g>
              );
            })}
            <text x="14" y="24" fill="#94b5c8" fontSize="12">
              模拟点云 · 非真实地图文件解析
            </text>
          </svg>
          <label>
            观察角度
            <input
              type="range"
              min="-60"
              max="60"
              value={angle}
              onChange={(e) => A(+e.target.value)}
            />
          </label>
        </>
      )}
      <small>
        {points.find((p) => p.id === picked)?.name ||
          "两种视图共享业务点位身份与地图版本。实际坐标与格式待厂商接入。"}
      </small>
    </div>
  );
}
