import { useMemo, useState } from 'react';
import { sankey, sankeyLinkHorizontal, sankeyLeft } from 'd3-sankey';

function validDate(v) { return v && v.length > 10 && !isNaN(new Date(v)); }

const COLORS = {
  // Inputs
  'Manual':        '#334155',
  'Auto-Generated':'#6366f1',
  // Email status
  'Has Email':     '#3b82f6',
  'No Email':      '#cbd5e1',
  // Outreach status
  'Backlog':       '#fbbf24',
  'Emailed':       '#3b82f6',
  // Engagement
  'Not Opened':    '#94a3b8',
  'Opened':        '#10b981',
  // Reply status
  'No Reply':      '#fbbf24',
  'Followed Up':   '#f97316',
  'Replied':       '#10b981',
  // Outcome
  'Proposal':      '#6366f1',
  'Won':           '#059669',
  'Lost/Dropped':  '#f87171',
};

function nodeColor(name) {
  return COLORS[name] || '#94a3b8';
}

function SankeyTooltip({ node, x, y }) {
  if (!node) return null;
  return (
    <div
      className="absolute pointer-events-none bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl z-20 whitespace-nowrap"
      style={{ left: x + 12, top: y - 20 }}
    >
      <p className="font-semibold">{node.name}</p>
      <p className="text-slate-300">{node.value} leads</p>
    </div>
  );
}

export default function OutreachFlow({ leads = [] }) {
  const [tooltip, setTooltip] = useState(null);

  const graph = useMemo(() => {
    if (!leads.length) return null;

    // Classify leads
    // "Auto-Generated" = has reviewCount > 0 (set by Places API) or created by auto-lead-gen
    // For now all existing leads are Manual; future auto leads will have reviewCount set at creation
    const auto   = leads.filter(l => l.reviewCount > 0 && l.outreachCount === 0).length;
    const manual = leads.length - auto;

    const withEmail  = leads.filter(l => l.email).length;
    const noEmail    = leads.length - withEmail;
    const emailed    = leads.filter(l => l.outreachCount > 0).length;
    const backlog    = Math.max(0, withEmail - emailed);

    // Emailed breakdowns
    const emailedLeads    = leads.filter(l => l.outreachCount > 0);
    const opened          = emailedLeads.filter(l => validDate(l.emailOpenedAt)).length;
    const notOpened       = Math.max(0, emailed - opened);

    // Opened breakdowns
    const replied         = leads.filter(l => l.status === 'Replied').length;
    const noReply         = Math.max(0, opened - replied);
    // Approximation: followed-up = leads that were emailed 2+ times and never replied
    const followedUp      = leads.filter(l => l.outreachCount >= 2 && !validDate(l.emailOpenedAt) && l.status !== 'Replied').length;

    // Outcomes
    const won             = leads.filter(l => l.status === 'Closed Won').length;
    const proposal        = leads.filter(l => l.status === 'Proposal Requested').length;
    const lost            = leads.filter(l => ['Lost', 'Qualified Out', 'NRTB', 'Incorrect Product Fit'].includes(l.status)).length;

    const nodes = [
      // Col 0 — source
      { name: 'Manual' },
      ...(auto > 0 ? [{ name: 'Auto-Generated' }] : []),

      // Col 1 — email status
      { name: 'Has Email' },
      { name: 'No Email' },

      // Col 2 — outreach status
      ...(emailed > 0 ? [{ name: 'Emailed' }] : []),
      ...(backlog > 0 ? [{ name: 'Backlog' }] : []),

      // Col 3 — engagement
      ...(opened > 0    ? [{ name: 'Opened' }]    : []),
      ...(notOpened > 0 ? [{ name: 'Not Opened' }] : []),

      // Col 4 — reply
      ...(replied > 0    ? [{ name: 'Replied' }]   : []),
      ...(noReply > 0    ? [{ name: 'No Reply' }]  : []),
      ...(followedUp > 0 ? [{ name: 'Followed Up' }] : []),

      // Col 5 — outcome
      ...(won > 0      ? [{ name: 'Won' }]          : []),
      ...(proposal > 0 ? [{ name: 'Proposal' }]     : []),
      ...(lost > 0     ? [{ name: 'Lost/Dropped' }] : []),
    ];

    const has = name => nodes.some(n => n.name === name);

    const links = [
      // Source → email status
      { source: 'Manual',         target: 'Has Email', value: Math.max(1, Math.round(manual * withEmail / leads.length)) },
      { source: 'Manual',         target: 'No Email',  value: Math.max(1, Math.round(manual * noEmail   / leads.length)) },
      ...(auto > 0 ? [
        { source: 'Auto-Generated', target: 'Has Email', value: Math.max(1, Math.round(auto * withEmail / leads.length)) },
        { source: 'Auto-Generated', target: 'No Email',  value: Math.max(1, Math.round(auto * noEmail   / leads.length)) },
      ] : []),

      // Email status → outreach
      ...(has('Emailed') ? [{ source: 'Has Email', target: 'Emailed', value: emailed }] : []),
      ...(has('Backlog')  ? [{ source: 'Has Email', target: 'Backlog',  value: backlog  }] : []),

      // Emailed → engagement
      ...(has('Opened')     ? [{ source: 'Emailed', target: 'Opened',     value: opened     }] : []),
      ...(has('Not Opened') ? [{ source: 'Emailed', target: 'Not Opened', value: notOpened  }] : []),

      // Engagement → reply
      ...(has('Replied')     && replied    > 0 ? [{ source: 'Opened',     target: 'Replied',     value: replied    }] : []),
      ...(has('No Reply')    && noReply    > 0 ? [{ source: 'Opened',     target: 'No Reply',    value: noReply    }] : []),
      ...(has('Followed Up') && followedUp > 0 ? [{ source: 'Not Opened', target: 'Followed Up', value: followedUp }] : []),

      // Reply → outcome
      ...(has('Won')          && won      > 0 ? [{ source: 'Replied', target: 'Won',          value: won      }] : []),
      ...(has('Proposal')     && proposal > 0 ? [{ source: 'Replied', target: 'Proposal',     value: proposal }] : []),
      ...(has('Lost/Dropped') && lost     > 0 ? [{ source: 'Emailed', target: 'Lost/Dropped', value: lost     }] : []),
    ].filter(l => l.value > 0 && l.source !== l.target && has(l.source) && has(l.target));

    return { nodes, links };
  }, [leads]);

  const WIDTH  = 1100;
  const HEIGHT = 400;
  const PAD    = { top: 24, right: 150, bottom: 16, left: 110 };

  const { nodes: layoutNodes, links: layoutLinks } = useMemo(() => {
    if (!graph) return { nodes: [], links: [] };
    try {
      const gen = sankey()
        .nodeId(d => d.name)
        .nodeAlign(sankeyLeft)
        .nodeWidth(14)
        .nodePadding(12)
        .extent([[PAD.left, PAD.top], [WIDTH - PAD.right, HEIGHT - PAD.bottom]]);
      return gen({ nodes: graph.nodes.map(n => ({ ...n })), links: graph.links.map(l => ({ ...l })) });
    } catch (e) {
      console.error('Sankey layout error:', e);
      return { nodes: [], links: [] };
    }
  }, [graph]);

  const linkGen = sankeyLinkHorizontal();

  if (!leads.length) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-6">
      <h3 className="font-semibold text-slate-900 mb-1">Outreach Pipeline</h3>
      <p className="text-xs text-slate-400 mb-4">Lead sources → email status → outreach → engagement → outcome</p>

      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          style={{ width: '100%', height: HEIGHT, display: 'block' }}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Links */}
          {layoutLinks.map((link, i) => (
            <path
              key={i}
              d={linkGen(link)}
              fill="none"
              stroke={nodeColor(link.source.name)}
              strokeWidth={Math.max(1, link.width)}
              strokeOpacity={0.3}
            />
          ))}

          {/* Nodes */}
          {layoutNodes.map((node, i) => (
            <g key={i}>
              <rect
                x={node.x0}
                y={node.y0}
                width={node.x1 - node.x0}
                height={Math.max(1, node.y1 - node.y0)}
                fill={nodeColor(node.name)}
                rx={2}
                onMouseEnter={e => setTooltip({ node, x: e.clientX - e.currentTarget.closest('svg').getBoundingClientRect().left, y: e.clientY - e.currentTarget.closest('svg').getBoundingClientRect().top })}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: 'default' }}
              />
              {/* Left label */}
              {node.x0 < PAD.left + 5 && (
                <text x={node.x0 - 6} y={(node.y0 + node.y1) / 2} textAnchor="end" dominantBaseline="middle" fill="#475569" fontSize={11} fontWeight={500}>
                  {node.name}
                </text>
              )}
              {/* Right label */}
              {node.x0 >= PAD.left + 5 && (
                <text x={node.x1 + 6} y={(node.y0 + node.y1) / 2} textAnchor="start" dominantBaseline="middle" fontSize={11}>
                  <tspan fill="#475569" fontWeight={500}>{node.name} </tspan>
                  <tspan fill={nodeColor(node.name)} fontWeight={700}>{node.value}</tspan>
                </text>
              )}
            </g>
          ))}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl z-20 whitespace-nowrap"
            style={{ left: tooltip.x + 12, top: tooltip.y - 20 }}
          >
            <p className="font-semibold">{tooltip.node.name}</p>
            <p className="text-slate-300">{tooltip.node.value} leads</p>
          </div>
        )}
      </div>
    </div>
  );
}
