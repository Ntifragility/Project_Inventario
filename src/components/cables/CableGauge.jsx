import React from 'react';

/**
 * CableGauge — SVG-based circular/semi-circle gauge component.
 * 
 * Props:
 * - value: number (0-100, percentage)
 * - label: string (text below the gauge)
 * - sublabel: string (secondary text, e.g. count)
 * - size: number (px, default 160)
 * - strokeWidth: number (px, default 12)
 * - color: string (CSS color for the filled arc)
 * - bgColor: string (CSS color for the background arc)
 * - type: 'donut' | 'semi' (default 'donut')
 */
export default function CableGauge({
  value = 0,
  label = '',
  sublabel = '',
  size = 160,
  strokeWidth = 12,
  color = '#10b981',
  bgColor = 'rgba(255,255,255,0.1)',
  type = 'donut',
}) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const center = size / 2;
  const radius = center - strokeWidth;

  if (type === 'semi') {
    // Semi-circle gauge (180 degrees)
    const circumference = Math.PI * radius;
    const filled = (clampedValue / 100) * circumference;

    return (
      <div className="cable-gauge" style={{ width: size, textAlign: 'center' }}>
        <svg width={size} height={size / 2 + strokeWidth + 20} viewBox={`0 0 ${size} ${size / 2 + strokeWidth + 20}`}>
          {/* Background arc */}
          <path
            d={describeArc(center, center, radius, 180, 360)}
            fill="none"
            stroke={bgColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Filled arc */}
          <path
            d={describeArc(center, center, radius, 180, 180 + (clampedValue / 100) * 180)}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 1s ease-in-out',
            }}
          />
          {/* Value text */}
          <text
            x={center}
            y={center - 4}
            textAnchor="middle"
            fill="var(--text-primary)"
            fontSize={size * 0.15}
            fontWeight="600"
            fontFamily="var(--font-sans)"
          >
            {clampedValue.toFixed(1)}%
          </text>
        </svg>
        {label && (
          <div
            className="cable-gauge-label"
            style={{
              color: 'var(--text-secondary)',
              fontSize: '0.75rem',
              fontWeight: 500,
              marginTop: -10,
            }}
          >
            {label}
          </div>
        )}
        {sublabel && (
          <div
            className="cable-gauge-sublabel"
            style={{
              color: color,
              fontSize: '1.4rem',
              fontWeight: 700,
              marginTop: 2,
            }}
          >
            {sublabel}
          </div>
        )}
      </div>
    );
  }

  // Donut gauge (full circle)
  const circumference = 2 * Math.PI * radius;
  const filled = (clampedValue / 100) * circumference;
  const gap = circumference - filled;

  return (
    <div className="cable-gauge" style={{ width: size, textAlign: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
        />
        {/* Filled arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${gap}`}
          strokeDashoffset={circumference * 0.25}
          style={{
            transition: 'stroke-dasharray 1s ease-in-out',
            transform: 'rotate(-90deg)',
            transformOrigin: 'center',
          }}
        />
        {/* Center value */}
        <text
          x={center}
          y={center - 6}
          textAnchor="middle"
          fill="var(--text-primary)"
          fontSize={size * 0.18}
          fontWeight="700"
          fontFamily="var(--font-sans)"
        >
          {clampedValue.toFixed(1)}%
        </text>
        {/* Center label */}
        {label && (
          <text
            x={center}
            y={center + size * 0.11}
            textAnchor="middle"
            fill="var(--text-secondary)"
            fontSize={size * 0.075}
            fontWeight="400"
            fontFamily="var(--font-sans)"
          >
            {label}
          </text>
        )}
      </svg>
      {sublabel && (
        <div
          className="cable-gauge-sublabel"
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
            fontWeight: 600,
            marginTop: 4,
          }}
        >
          {sublabel}
        </div>
      )}
    </div>
  );
}

// ─── SVG Arc Helper ──────────────────────────────────────────────────────────
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}
