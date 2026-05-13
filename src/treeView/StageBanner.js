import React from 'react';

export default function StageBanner({ kind, caption, color, theme }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 4,
        left: '50%',
        transform: 'translateX(-50%)',
        color,
        background: theme.bannerBg,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontWeight: 700,
        fontSize: 13,
        padding: '6px 14px',
        borderRadius: 8,
        zIndex: 15,
        border: `1px solid ${color}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        maxWidth: '90%',
        textAlign: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
      }}
    >
      <span style={{ letterSpacing: 0.5 }}>{kind}</span>
      <span style={{ color: theme.bannerCaption, fontWeight: 500, fontSize: 11 }}>
        {caption}
      </span>
    </div>
  );
}
