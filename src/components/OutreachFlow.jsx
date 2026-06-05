function validDate(val) {
  return val && val.length > 10 && !isNaN(new Date(val));
}

function pct(n, d) {
  if (!d) return '—';
  return Math.round((n / d) * 100) + '%';
}

function FlowRow({ label, main, mainLabel, drop, dropLabel, mainColor, dropColor }) {
  const total = main + drop;
  const mainPct = total > 0 ? (main / total) * 100 : 0;
  const dropPct = total > 0 ? (drop / total) * 100 : 0;

  return (
    <div className="flex items-center gap-4">
      <div className="w-32 shrink-0 text-right">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
      </div>
      <div className="flex-1 flex rounded-lg overflow-hidden h-8" style={{ minWidth: 0 }}>
        {main > 0 && (
          <div
            className={`flex items-center justify-center text-xs font-semibold text-white transition-all ${mainColor}`}
            style={{ width: `${mainPct}%` }}
            title={mainLabel}
          >
            {mainPct > 12 ? main : ''}
          </div>
        )}
        {drop > 0 && (
          <div
            className={`flex items-center justify-center text-xs font-semibold text-white transition-all ${dropColor}`}
            style={{ width: `${dropPct}%` }}
            title={dropLabel}
          >
            {dropPct > 12 ? drop : ''}
          </div>
        )}
        {main === 0 && drop === 0 && (
          <div className="flex-1 bg-slate-100 flex items-center justify-center text-xs text-slate-400">no data</div>
        )}
      </div>
      <div className="w-48 shrink-0 flex gap-3 text-xs">
        <span className={`font-semibold ${main > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
          {mainLabel}: <strong>{main}</strong> <span className="text-slate-400 font-normal">({pct(main, total)})</span>
        </span>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center gap-4 h-4">
      <div className="w-32 shrink-0" />
      <div className="flex-1 flex justify-start pl-4">
        <div className="w-px h-4 bg-slate-200" />
      </div>
      <div className="w-48 shrink-0" />
    </div>
  );
}

export default function OutreachFlow({ leads = [] }) {
  const DEAD = new Set(['Lost', 'Qualified Out', 'Closed Won', 'NRTB', 'Incorrect Product Fit']);

  const total      = leads.length;
  const withEmail  = leads.filter(l => l.email).length;
  const noEmail    = total - withEmail;
  const emailed    = leads.filter(l => l.outreachCount > 0 && l.email).length;
  const backlog    = Math.max(0, withEmail - emailed);
  const opened     = leads.filter(l => validDate(l.emailOpenedAt)).length;
  const notOpened  = Math.max(0, emailed - opened);
  const replied    = leads.filter(l => l.status === 'Replied').length;
  const noReply    = Math.max(0, opened - replied);
  const proposal   = leads.filter(l => l.status === 'Proposal Requested').length;
  const won        = leads.filter(l => l.status === 'Closed Won').length;
  const other      = Math.max(0, replied - proposal - won);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-6">
      <h3 className="font-semibold text-slate-900 mb-1">Outreach Pipeline</h3>
      <p className="text-xs text-slate-400 mb-5">End-to-end flow from lead found → closed</p>

      <div className="space-y-1">
        {/* Legend */}
        <div className="flex items-center gap-4 mb-3 ml-36">
          {[
            { color: 'bg-blue-500', label: 'Main flow' },
            { color: 'bg-slate-300', label: 'Drop-off / pending' },
            { color: 'bg-amber-400', label: 'In progress' },
            { color: 'bg-emerald-500', label: 'Converted' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className={`w-3 h-3 rounded-sm ${color}`} />
              {label}
            </span>
          ))}
        </div>

        <FlowRow
          label="All leads"
          main={withEmail}     mainLabel="Has email"    mainColor="bg-blue-500"
          drop={noEmail}       dropLabel="No email"     dropColor="bg-slate-300"
        />
        <Arrow />
        <FlowRow
          label="Has email"
          main={emailed}       mainLabel="Emailed"      mainColor="bg-blue-500"
          drop={backlog}       dropLabel="Backlog"      dropColor="bg-amber-400"
        />
        <Arrow />
        <FlowRow
          label="Emailed"
          main={opened}        mainLabel="Opened"       mainColor="bg-blue-400"
          drop={notOpened}     dropLabel="Not opened"   dropColor="bg-slate-300"
        />
        <Arrow />
        <FlowRow
          label="Opened"
          main={replied}       mainLabel="Replied"      mainColor="bg-emerald-500"
          drop={noReply}       dropLabel="No reply"     dropColor="bg-amber-400"
        />
        <Arrow />
        <FlowRow
          label="Replied"
          main={proposal + won} mainLabel="Proposal/Won" mainColor="bg-emerald-500"
          drop={Math.max(0, replied - proposal - won)} dropLabel="Working" dropColor="bg-blue-300"
        />
      </div>

      {/* Summary row */}
      <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-6 gap-3 text-center">
        {[
          { label: 'Total leads', value: total, color: 'text-slate-800' },
          { label: 'Has email', value: withEmail, color: 'text-blue-600' },
          { label: 'Emailed', value: emailed, color: 'text-blue-600' },
          { label: 'Opened', value: opened, color: 'text-blue-500' },
          { label: 'Replied', value: replied, color: 'text-emerald-600' },
          { label: 'Won', value: won, color: 'text-emerald-700' },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
