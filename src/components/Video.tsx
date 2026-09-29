export function Video({
  label = "V001 出口压力表",
  live = true,
  pan = 0,
  /** 画面归属机器：驾驶舱按选中设备展示实时画面时标注来源 */
  robotId,
}: {
  label?: string;
  live?: boolean;
  pan?: number;
  robotId?: string;
}) {
  const thermal = /温度|罐壁|热像/.test(label),
    valve = /阀门/.test(label);
  return (
    <div className="video">
      <div className="video-top">
        <span>● {live ? "模拟实时画面" : "原始证据示意"}</span>
        <span>
          {robotId ? `${robotId} · ` : ""}CAM 01 · 1080P
        </span>
      </div>
      <svg viewBox="0 0 600 310">
        <path
          d="M0 220L600 200M80 0V310M490 0V310"
          stroke="#586673"
          strokeWidth="25"
        />
        <path d="M0 65H600" stroke="#7b858c" strokeWidth="18" />
        {thermal ? (
          <g>
            <rect
              x="200"
              y="54"
              width="180"
              height="220"
              rx="55"
              fill="#cc7648"
              stroke="#e4b75a"
              strokeWidth="8"
            />
            <ellipse cx="290" cy="155" rx="58" ry="82" fill="#e6aa58" />
            <ellipse cx="285" cy="145" rx="28" ry="38" fill="#f5da88" />
            <path d="M270 145H300M285 130V160" stroke="white" />
            <text x="330" y="142" fill="white" fontSize="17">
              热像示意
            </text>
          </g>
        ) : valve ? (
          <g>
            <path d="M160 160H430" stroke="#93a1a5" strokeWidth="45" />
            <path
              d="M235 110L335 190V110L235 190Z"
              fill="#6ea094"
              stroke="#acc4be"
              strokeWidth="5"
            />
            <path d="M285 65V115" stroke="#acbcbc" strokeWidth="10" />
            <ellipse
              cx="285"
              cy="60"
              rx="56"
              ry="15"
              fill="none"
              stroke="#b5654f"
              strokeWidth="9"
            />
          </g>
        ) : (
          <g transform={`translate(${pan} 0)`}>
            <rect x="262" y="174" width="45" height="155" fill="#81898e" />
            <circle
              cx="285"
              cy="132"
              r="88"
              fill="#a8b0b2"
              stroke="#4b5860"
              strokeWidth="9"
            />
            <circle cx="285" cy="132" r="73" fill="#e7e7d9" />
            {Array.from({ length: 11 }, (_, i) => (
              <path
                key={i}
                d="M285 69V80"
                stroke="#58636a"
                strokeWidth="3"
                transform={`rotate(${i * 27 - 135} 285 132)`}
              />
            ))}
            <path d="M285 132L328 100" stroke="#b94232" strokeWidth="4" />
            <circle cx="285" cy="132" r="7" fill="#555" />
            <text x="285" y="171" textAnchor="middle" fontSize="15" fill="#566">
              MPa
            </text>
          </g>
        )}
        <path
          d="M175 65V40H200M370 40H395V65M175 212V237H200M370 237H395V212"
          fill="none"
          stroke="#61d1b2"
          strokeWidth="2"
        />
        <text x="183" y="28" fill="#70dbc0" fontSize="13">
          目标身份已关联 · {label}
        </text>
      </svg>
      <div className="video-bottom">
        <span>{label}</span>
        <span>演示视频 · 非真实视频流</span>
      </div>
    </div>
  );
}
