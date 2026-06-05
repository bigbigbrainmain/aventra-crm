import { useMemo } from 'react';

const NODE_W = 16;
const NODE_PAD = 14;

function validDate(v) { return v && v.length > 10 && !isNaN(new Date(v)); }

function linkPath({ sx, sy1, sy2, tx, ty1, ty2 }) {
  const cx = (sx + tx) / 2;
  return `M${sx},${sy1} C${cx},${sy1} ${cx},${ty1} ${tx},${ty1} L${tx},${ty2} C${cx},${ty2} ${cx},${sy2} ${sx},${sy2}Z`;
}

function layout(rawNodes, rawLinks, w, h) {
  const nodes = rawNodes.filter(n => n.value > 0).map(n => ({ ...n }));
  const ids = new Set(nodes.map(n => n.id));
  const links = rawLinks.filter(l => l.value > 0 && ids.has(l.source) && ids.has(l.target)).map(l => ({ ...l }));

  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const cols = [...new Set(nodes.map(n => n.col))].sort((a, b) => a - b);
  const step = cols.length > 1 ? (w - NODE_W) / (cols.length - 1) : w / 2;

  // x positions
  nodes.forEach(n => { n.x = cols.indexOf(n.col) * step; });

  // y positions per column
  cols.forEach(col => {
    const cn = nodes.filter(n => n.col === col);
    const total = cn.reduce((s, n) => s + n.value, 0);
    const avail = h - NODE_PAD * (cn.length - 1);
    let y = 0;
    cn.forEach(n => {
      n.h = Math.max(4, (n.value / total) * avail);
      n.y = y;
      y += n.h + NODE_PAD;
    });
  });

  // link geometry
  const su = {}, tu = {};
  nodes.forEach(n => { su[n.id] = 0; tu[n.id] = 0; });

  const cl = links.map(l => {
    const s = byId[l.source], t = byId[l.target];
    const sh = (l.value / s.value) * s.h;
    const th = (l.value / t.value) * t.h;
    const out = { ...l, sx: s.x + NODE_W, tx: t.x, sy1: s.y + su[s.id], sy2: s.y + su[s.id] + sh, ty1: t.y + tu[t.id], ty2: t.y + tu[t.id] + th };
    su[s.id] += sh;
    tu[t.id] += th;
    return out;
  });

  return { nodes, links: cl };
}

export default function OutreachFlow({ leads = [] }) {
  const data = useMemo(() => {
    const total     = leads.length;
    const withEmail = leads.filter(l => l.email).length;
    const noEmail   = total - withEmail;
    const emailed   = leads.filter(l => l.outreachCount > 0).length;
    const backlog   = Math.max(0, withEmail - emailed);
    const opened    = leads.filter(l => validDate(l.emailOpenedAt)).length;
    const notOpened = Math.max(0, emailed - opened);
    const replied   = leads.filter(l => l.status === 'Replied').length;
    const noReply   = Math.max(0, opened - replied);
    const won       = leads.filter(l => l.status === 'Closed Won').length;
    const proposal  = leads.filter(l => l.status === 'Proposal Requested').length;
    const warmWork  = Math.max(0, replied - won - proposal);

    // Build columns — skip last col if both values are 0
    const showReply  = replied > 0 || noReply > 0;
    const showWon    = won > 0 || proposal > 0 || warmWork > 0;

    const rawNodes = [
      { id: 'all',       col: 0, label: 'All Leads',   sub: total,      value: total,      color: '#334155' },
      { id: 'email',     col: 1, label: 'Has Email',   sub: withEmail,  value: withEmail,  color: '#3b82f6' },
      { id: 'noemail',   col: 1, label: 'No Email',    sub: noEmail,    value: noEmail,    color: '#cbd5e1' },
      { id: 'emailed',   col: 2, label: 'Emailed',     sub: emailed,    value: emailed,    color: '#3b82f6' },
      { id: 'backlog',   col: 2, label: 'Backlog',     sub: backlog,    value: backlog,    color: '#fbbf24' },
      { id: 'opened',    col: 3, label: 'Opened',      sub: opened,     value: opened,     color: '#10b981' },
      { id: 'notopened', col: 3, label: 'Not Opened',  sub: notOpened,  value: notOpened,  color: '#cbd5e1' },
      ...(showReply ? [
        { id: 'replied',  col: 4, label: 'Replied',    sub: replied,    value: replied,    color: '#10b981' },
        { id: 'noreply',  col: 4, label: 'No Reply',   sub: noReply,    value: noReply,    color: '#fbbf24' },
      ] : []),
      ...(showWon ? [
        { id: 'won',      col: 5, label: 'Won',        sub: won,        value: won,        color: '#059669' },
        { id: 'proposal', col: 5, label: 'Proposal',   sub: proposal,   value: proposal,   color: '#6366f1' },
        ...(warmWork > 0 ? [{ id: 'warmwork', col: 5, label: 'Working', sub: warmWork, value: warmWork, color: '#3b82f6' }] : []),
      ] : []),
    ];

    const rawLinks = [
      { source: 'all',      target: 'email',    value: withEmail,  color: '#3b82f6' },
      { source: 'all',      target: 'noemail',  value: noEmail,    color: '#cbd5e1' },
      { source: 'email',    target: 'emailed',  value: emailed,    color: '#3b82f6' },
      { source: 'email',    target: 'backlog',  value: backlog,    color: '#fbbf24' },
      { source: 'emailed',  target: 'opened',   value: opened,     color: '#10b981' },
      { source: 'emailed',  target: 'notopened',value: notOpened,  color: '#cbd5e1' },
      ...(showReply ? [
        { source: 'opened', target: 'replied',  value: replied,    color: '#10b981' },
        { source: 'opened', target: 'noreply',  value: noReply,    color: '#fbbf24' },
      ] : []),
      ...(showWon ? [
        ...(won > 0       ? [{ source: 'replied', target: 'won',      value: won,      color: '#059669' }] : []),
        ...(proposal > 0  ? [{ source: 'replied', target: 'proposal', value: proposal, color: '#6366f1' }] : []),
        ...(warmWork > 0  ? [{ source: 'replied', target: 'warmwork', value: warmWork, color: '#3b82f6' }] : []),
      ] : []),
    ];

    return { rawNodes, rawLinks, stats: { total, withEmail, emailed, opened, replied, won } };
  }, [leads]);

  const W = 760, H = 320;
  const padL = 10, padR = 10, padT = 10, padB = 10;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const { nodes, links } = layout(data.rawNodes, data.rawLinks, innerW, innerH);

  const cols = [...new Set(nodes.map(n => n.col))].sort((a, b) => a - b);
  const step = cols.length > 1 ? innerW / (cols.length - 1) : innerW / 2;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-6">
      <h3 className="font-semibold text-slate-900 mb-1">Outreach Pipeline</h3>
      <p className="text-xs text-slate-400 mb-4">End-to-end flow from lead found → closed</p>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 500 }}>
          <g transform={`translate(${padL},${padT})`}>

            {/* Links */}
            {links.map((l, i) => (
              <path
                key={i}
                d={linkPath(l)}
                fill={l.color}
                opacity={0.35}
              />
            ))}

            {/* Nodes */}
            {nodes.map(n => (
              <g key={n.id}>
                <rect
                  x={n.x}
                  y={n.y}
                  width={NODE_W}
                  height={n.h}
                  fill={n.color}
                  rx={3}
                />
                {/* Label */}
                {n.col === 0 ? (
                  // Left side labels
                  <text x={n.x - 6} y={n.y + n.h / 2} textAnchor="end" dominantBaseline="middle" fill="#475569" fontSize={11} fontWeight="500">
                    {n.label}
                  </text>
                ) : (
                  // Right side labels
                  <text x={n.x + NODE_W + 6} y={n.y + n.h / 2} textAnchor="start" dominantBaseline="middle" fill="#475569" fontSize={11} fontWeight="500">
                    {n.label}
                    <tspan fill={n.color} fontWeight="700"> {n.sub}</tspan>
                  </text>
                )}
              </g>
            ))}

            {/* Column headers */}
            {cols.map((col, i) => {
              const colNodes = nodes.filter(n => n.col === col);
              const total = colNodes.reduce((s, n) => s + n.value, 0);
              const x = i * step + NODE_W / 2;
              return (
                <text key={col} x={x} y={-2} textAnchor="middle" fill="#94a3b8" fontSize={10}>
                  {total}
                </text>
              );
            })}

          </g>
        </svg>
      </div>

      {/* Summary stats */}
      <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-6 gap-3 text-center">
        {[
          { label: 'Total leads', value: data.stats.total, color: 'text-slate-800' },
          { label: 'Has email', value: data.stats.withEmail, color: 'text-blue-600' },
          { label: 'Emailed', value: data.stats.emailed, color: 'text-blue-600' },
          { label: 'Opened', value: data.stats.opened, color: 'text-emerald-600' },
          { label: 'Replied', value: data.stats.replied, color: 'text-emerald-700' },
          { label: 'Won', value: data.stats.won, color: 'text-emerald-800' },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
