import { useState, useEffect, useMemo } from 'react';
import {
  Search, Save, Trash2, Copy, Loader2, Check, AlertCircle, ChevronDown,
  SendHorizontal, Calendar, Info, Users, FileText,
} from 'lucide-react';
import { api } from '../utils/api';
import { getPriorityStyle } from '../utils/constants';
import { useAuth } from '../contexts/AuthContext';
import {
  PLACEHOLDERS, DEFAULT_TEMPLATE, renderTemplate, leftoverPlaceholders,
  firstNameFor, spreadTimes, nextWeekday, localDateStr,
} from '../utils/template';

const PRIORITY_ORDER = { '🔴 Priority 1': 0, '🟠 Priority 2': 1, '🟡 Priority 3': 2, '🟢 Skip': 3 };
const DEAD_STATUSES = new Set(['Lost', 'Qualified Out', 'Closed Won', 'NRTB', 'Incorrect Product Fit', 'Replied']);
const SENDER_LABEL = { joe: 'Joe', ollie: 'Ollie' };

// Mirrors isGenericInbox() in netlify/functions/_sheets.js — info@ addresses
// are never cold-emailed, so don't offer them.
const isGenericInbox = (email) => {
  const prefix = String(email || '').toLowerCase().split('@')[0] || '';
  return prefix.split(/[.\-+]/)[0] === 'info';
};

const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '–');

function Card({ step, title, right, children }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">{step}</span>
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  );
}

export default function BulkSendView({ leads, pendingScheduledLeadIds, onSent }) {
  const { user } = useAuth();
  const defaultSender = String(user?.email || '').toLowerCase().startsWith('ollie') ? 'ollie' : 'joe';

  // ── Templates ──
  const [templates, setTemplates] = useState([]);
  const [tplId, setTplId] = useState('new');
  const [draft, setDraft] = useState({ ...DEFAULT_TEMPLATE, sender: defaultSender });
  const [dirty, setDirty] = useState(false);
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplError, setTplError] = useState('');

  // ── Usage / cap ──
  const [usage, setUsage] = useState(null);

  // ── Recipients ──
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [city, setCity] = useState('');
  const [priority, setPriority] = useState('all');
  const [namedOnly, setNamedOnly] = useState(false);
  const [selected, setSelected] = useState(new Set());

  // ── Review / send ──
  const [overrides, setOverrides] = useState({}); // leadId → { subject, body }
  const [expanded, setExpanded] = useState(null);
  const [results, setResults] = useState({});     // leadId → { status, message }
  const [mode, setMode] = useState('now');        // now | today | date
  const [day, setDay] = useState(() => localDateStr(nextWeekday(new Date(Date.now() + 86400000))));
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState('');

  const loadTemplates = async (selectId) => {
    try {
      const list = await api.getTemplates();
      setTemplates(list);
      const pick = list.find(t => t.id === selectId) || (selectId === undefined && list[0]);
      if (pick && !dirty) {
        setTplId(pick.id);
        setDraft({ name: pick.name, sender: pick.sender, subject: pick.subject, body: pick.body });
      }
    } catch (err) {
      setTplError(`Couldn't load templates: ${err.message}`);
    }
  };
  const loadUsage = () => api.getTemplateUsage().then(setUsage).catch(() => {});

  useEffect(() => { loadTemplates(); loadUsage(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const editDraft = (field, value) => { setDraft(d => ({ ...d, [field]: value })); setDirty(true); };

  const chooseTemplate = (id) => {
    if (dirty && !window.confirm('Discard unsaved changes to this template?')) return;
    setTplId(id);
    setDirty(false);
    setOverrides({});
    if (id === 'new') setDraft({ ...DEFAULT_TEMPLATE, name: 'New template', sender: defaultSender });
    else {
      const t = templates.find(x => x.id === id);
      if (t) setDraft({ name: t.name, sender: t.sender, subject: t.subject, body: t.body });
    }
  };

  // Saves the draft (create or update). Returns the template id.
  const saveTemplate = async ({ asNew = false } = {}) => {
    setSavingTpl(true);
    setTplError('');
    try {
      let id = tplId;
      if (tplId === 'new' || asNew) {
        const created = await api.createTemplate({ ...draft, name: asNew ? `${draft.name} (copy)` : draft.name });
        id = created.id;
      } else {
        await api.updateTemplate(tplId, draft);
      }
      setDirty(false);
      setTplId(id);
      if (asNew) setDraft(d => ({ ...d, name: `${d.name} (copy)` }));
      await loadTemplates(id);
      return id;
    } catch (err) {
      setTplError(err.message);
      throw err;
    } finally {
      setSavingTpl(false);
    }
  };

  const removeTemplate = async () => {
    if (tplId === 'new') return;
    if (!window.confirm(`Delete template "${draft.name}"? Its send history stays in the sheet.`)) return;
    await api.deleteTemplate(tplId).catch(err => setTplError(err.message));
    setDirty(false);
    setTplId('new');
    setDraft({ ...DEFAULT_TEMPLATE, name: 'New template', sender: defaultSender });
    loadTemplates(null);
  };

  const insertTag = (tag) => {
    const el = document.getElementById('bulk-template-body');
    if (!el) return editDraft('body', draft.body + tag);
    const { selectionStart: a, selectionEnd: b } = el;
    editDraft('body', draft.body.slice(0, a) + tag + draft.body.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + tag.length, a + tag.length); });
  };

  // ── Eligible leads: emailable, never contacted, not queued ──
  const eligible = useMemo(() => leads
    .filter(l =>
      l.email && !isGenericInbox(l.email) &&
      l.outreachOptedOut !== 'Yes' &&
      !l.outreachCount &&
      !DEAD_STATUSES.has(l.status) &&
      !pendingScheduledLeadIds.has(l.id)
    )
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)),
  [leads, pendingScheduledLeadIds]);

  const industries = useMemo(() => [...new Set(eligible.map(l => l.industry).filter(Boolean))].sort(), [eligible]);
  const cities = useMemo(() => [...new Set(eligible.map(l => l.city).filter(Boolean))].sort(), [eligible]);

  const q = search.toLowerCase();
  const filtered = eligible.filter(l =>
    (!q || [l.businessName, l.industry, l.city, l.email].some(v => (v || '').toLowerCase().includes(q))) &&
    (!industry || l.industry === industry) &&
    (!city || l.city === city) &&
    (priority === 'all' || l.priority === priority) &&
    (!namedOnly || firstNameFor(l))
  );

  // ── Daily cap for the chosen sender + day ──
  const sendDay = mode === 'date' ? day : usage?.today;
  const cap = usage?.cap ?? 30;
  const usedOnDay = usage ? (usage.byDate?.[sendDay]?.[draft.sender] ?? (sendDay === usage.today ? usage.usage[draft.sender] : 0)) : 0;
  const remaining = Math.max(0, cap - usedOnDay);

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else if (next.size < remaining) next.add(id);
    return next;
  });
  const selectFirst = () => setSelected(new Set(filtered.slice(0, remaining).map(l => l.id)));
  const clearSelection = () => setSelected(new Set());

  // Keep selection to leads that are still eligible (e.g. after a send)
  const selectedLeads = eligible.filter(l => selected.has(l.id));

  // ── Rendered emails ──
  const rendered = selectedLeads.map(lead => {
    const subj = renderTemplate(draft.subject, lead);
    const body = renderTemplate(draft.body, lead);
    const o = overrides[lead.id];
    const subject = o?.subject ?? subj.text;
    const text = o?.body ?? body.text;
    const leftover = [...leftoverPlaceholders(subject), ...leftoverPlaceholders(text)];
    return {
      lead, subject, body: text,
      edited: !!o,
      noName: !firstNameFor(lead) && /\{firstName\}/.test(draft.subject + draft.body),
      missing: o ? [] : [...new Set([...subj.missing, ...body.missing])],
      leftover,
    };
  });
  const blocked = rendered.filter(r => r.leftover.length || !r.subject.trim() || !r.body.trim());
  const overCap = selectedLeads.length > remaining;

  const editOne = (leadId, field, value, current) =>
    setOverrides(prev => ({ ...prev, [leadId]: { subject: current.subject, body: current.body, ...prev[leadId], [field]: value } }));

  const send = async () => {
    setSendError('');
    if (!rendered.length) return;
    if (blocked.length) return setSendError(`Fix ${blocked.length} email${blocked.length > 1 ? 's' : ''} with unfilled placeholders first.`);
    if (overCap) return setSendError(`Only ${remaining} left ${mode === 'date' ? `on ${day}` : 'today'} for ${SENDER_LABEL[draft.sender]}. Untick some.`);

    let sendAts = null;
    if (mode !== 'now') {
      const target = mode === 'today' ? new Date() : new Date(`${day}T12:00:00`);
      sendAts = spreadTimes(rendered.length, target);
      if (!sendAts) return setSendError(mode === 'today' ? "It's too late to spread over today (sends run 9am–5pm). Pick a date instead." : 'Pick a future date.');
    }

    const who = SENDER_LABEL[draft.sender];
    const what = mode === 'now'
      ? `Send ${rendered.length} email${rendered.length > 1 ? 's' : ''} from ${who} now?`
      : `Queue ${rendered.length} email${rendered.length > 1 ? 's' : ''} from ${who}, spread 9am–5pm on ${mode === 'today' ? 'today' : day}?`;
    if (!window.confirm(what)) return;

    setBusy(true);
    try {
      const templateId = (dirty || tplId === 'new') ? await saveTemplate() : tplId;

      if (mode === 'now') {
        for (const r of rendered) {
          setResults(prev => ({ ...prev, [r.lead.id]: { status: 'sending' } }));
          try {
            await api.sendTemplateOne({ sender: draft.sender, templateId, leadId: r.lead.id, subject: r.subject, body: r.body });
            setResults(prev => ({ ...prev, [r.lead.id]: { status: 'sent' } }));
          } catch (err) {
            setResults(prev => ({ ...prev, [r.lead.id]: { status: 'error', message: err.message } }));
            if (/Daily limit/i.test(err.message)) { setSendError(err.message); break; }
          }
        }
      } else {
        const res = await api.queueTemplate({
          sender: draft.sender, templateId,
          items: rendered.map((r, i) => ({ leadId: r.lead.id, subject: r.subject, body: r.body, sendAt: sendAts[i] })),
        });
        const skipped = new Map(res.skipped.map(s => [s.leadId, s.reason]));
        setResults(prev => {
          const next = { ...prev };
          rendered.forEach((r, i) => {
            next[r.lead.id] = skipped.has(r.lead.id)
              ? { status: 'error', message: skipped.get(r.lead.id) }
              : { status: 'queued', message: new Date(sendAts[i]).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) };
          });
          return next;
        });
      }
    } catch (err) {
      setSendError(err.message);
    } finally {
      setBusy(false);
      setSelected(new Set());
      setOverrides({});
      loadUsage();
      loadTemplates(tplId === 'new' ? null : tplId);
      onSent?.();
    }
  };

  const currentTpl = templates.find(t => t.id === tplId);
  const doneResults = Object.entries(results);

  return (
    <div>
      {/* ── 1. Template ── */}
      <Card
        step={1}
        title="Write the email"
        right={
          <select
            value={tplId}
            onChange={e => chooseTemplate(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700"
          >
            <option value="new">+ New template</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 mb-2">
          <input
            value={draft.name}
            onChange={e => editDraft('name', e.target.value)}
            placeholder="Template name"
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
            <span className="text-xs text-slate-400 px-1.5">Send from</span>
            {['joe', 'ollie'].map(s => (
              <button
                key={s}
                onClick={() => editDraft('sender', s)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${draft.sender === s ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {SENDER_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <input
          value={draft.subject}
          onChange={e => editDraft('subject', e.target.value)}
          placeholder="Subject"
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <textarea
          id="bulk-template-body"
          value={draft.body}
          onChange={e => editDraft('body', e.target.value)}
          rows={11}
          className="w-full text-sm text-slate-700 border border-slate-200 rounded-lg px-3 py-2 font-[inherit] focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-xs text-slate-400">Insert:</span>
          {PLACEHOLDERS.map(p => (
            <button
              key={p.tag}
              onClick={() => insertTag(p.tag)}
              title={p.hint}
              className="text-xs font-mono bg-blue-50 text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 hover:bg-blue-100"
            >
              {p.tag}
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-400 mt-2 flex items-start gap-1">
          <Info size={12} className="mt-0.5 shrink-0" />
          Sent as plain text exactly as written, from {draft.sender}@aventrasites.online. Only a signature and an unsubscribe line are added. No booking link, tracking or Joe sign-off, so it lands in the inbox more often.
        </p>

        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
          <button
            onClick={() => saveTemplate().catch(() => {})}
            disabled={savingTpl || (!dirty && tplId !== 'new')}
            className="flex items-center gap-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg px-3 py-1.5 disabled:opacity-40"
          >
            {savingTpl ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {tplId === 'new' ? 'Save template' : dirty ? 'Save changes' : 'Saved'}
          </button>
          {tplId !== 'new' && (
            <>
              <button onClick={() => saveTemplate({ asNew: true }).catch(() => {})} className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 px-2 py-1.5">
                <Copy size={12} /> Duplicate (for A/B test)
              </button>
              <button onClick={removeTemplate} className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 px-2 py-1.5">
                <Trash2 size={12} /> Delete
              </button>
            </>
          )}
          {tplError && <span className="text-xs text-red-600">{tplError}</span>}
        </div>

        {templates.some(t => t.stats?.sent || t.stats?.queued) && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-1.5">How each template is doing</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 text-left">
                  <th className="font-normal py-0.5">Template</th>
                  <th className="font-normal text-right">Sent</th>
                  <th className="font-normal text-right">Queued</th>
                  <th className="font-normal text-right">Replied</th>
                </tr>
              </thead>
              <tbody>
                {templates.filter(t => t.stats?.sent || t.stats?.queued).map(t => (
                  <tr key={t.id} className={t.id === tplId ? 'text-blue-700 font-medium' : 'text-slate-700'}>
                    <td className="py-0.5">{t.name} <span className="text-slate-400 font-normal">· {SENDER_LABEL[t.sender]}</span></td>
                    <td className="text-right">{t.stats.sent}</td>
                    <td className="text-right">{t.stats.queued}</td>
                    <td className="text-right">{t.stats.replied} <span className="text-slate-400">({pct(t.stats.replied, t.stats.sent)})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-slate-400 mt-1">Bulk send emails are plain text, so opens aren't tracked. Replies are what count.</p>
          </div>
        )}
      </Card>

      {/* ── 2. Recipients ── */}
      <Card
        step={2}
        title="Pick who gets it"
        right={
          <span className={`text-xs font-medium ${remaining === 0 ? 'text-red-600' : 'text-slate-500'}`}>
            {selected.size} selected · {remaining} of {cap} left {mode === 'date' ? `on ${day}` : 'today'} for {SENDER_LABEL[draft.sender]}
          </span>
        }
      >
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full pl-7 pr-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select value={industry} onChange={e => setIndustry(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white max-w-[160px]">
            <option value="">All trades</option>
            {industries.map(i => <option key={i}>{i}</option>)}
          </select>
          <select value={city} onChange={e => setCity(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white max-w-[140px]">
            <option value="">All cities</option>
            {cities.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={priority} onChange={e => setPriority(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="all">All priorities</option>
            <option value="🔴 Priority 1">P1</option>
            <option value="🟠 Priority 2">P2</option>
            <option value="🟡 Priority 3">P3</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 px-1">
            <input type="checkbox" checked={namedOnly} onChange={e => setNamedOnly(e.target.checked)} />
            Has first name
          </label>
        </div>

        <div className="flex items-center gap-3 mb-2 text-xs">
          <button onClick={selectFirst} disabled={!remaining || !filtered.length} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium disabled:opacity-40">
            <Users size={12} /> Select first {Math.min(remaining, filtered.length)}
          </button>
          {selected.size > 0 && <button onClick={clearSelection} className="text-slate-500 hover:text-slate-700">Clear</button>}
          <span className="ml-auto text-slate-400">{filtered.length} of {eligible.length} uncontacted leads</span>
        </div>

        <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
          {filtered.length === 0 && <p className="text-sm text-slate-400 p-4 text-center">No uncontacted leads match these filters.</p>}
          {filtered.slice(0, 300).map(lead => {
            const checked = selected.has(lead.id);
            const disabled = !checked && selected.size >= remaining;
            const p = getPriorityStyle(lead.priority);
            const name = firstNameFor(lead);
            return (
              <label key={lead.id} className={`flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(lead.id)} />
                <span className="font-medium text-slate-800 truncate">{lead.businessName}</span>
                <span className="text-xs text-slate-400 truncate">{lead.industry}{lead.city ? ` · ${lead.city}` : ''}</span>
                <span className="ml-auto flex items-center gap-1.5 shrink-0">
                  {name && <span className="text-[11px] text-slate-500 bg-slate-100 rounded px-1.5">{name}</span>}
                  {p && <span className={`text-[11px] font-semibold px-1.5 rounded-full ${p.bg} ${p.text}`}>{p.label}</span>}
                </span>
              </label>
            );
          })}
          {filtered.length > 300 && <p className="text-xs text-slate-400 p-2 text-center">Showing first 300, use the filters to narrow down.</p>}
        </div>
      </Card>

      {/* ── 3. Review & send ── */}
      <Card step={3} title="Check and send" right={rendered.length > 0 && <span className="text-xs text-slate-500">{rendered.length} email{rendered.length > 1 ? 's' : ''}</span>}>
        {rendered.length === 0 ? (
          <p className="text-sm text-slate-400">Tick some leads above to preview their emails.</p>
        ) : (
          <div className="space-y-1.5 mb-4">
            {rendered.map(r => {
              const open = expanded === r.lead.id;
              return (
                <div key={r.lead.id} className={`border rounded-lg ${r.leftover.length ? 'border-red-200 bg-red-50/40' : 'border-slate-200'}`}>
                  <button onClick={() => setExpanded(open ? null : r.lead.id)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
                    <ChevronDown size={13} className={`text-slate-400 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
                    <span className="text-sm font-medium text-slate-800 truncate">{r.lead.businessName}</span>
                    <span className="text-xs text-slate-400 truncate">{r.lead.email}</span>
                    <span className="ml-auto flex gap-1 shrink-0">
                      {r.edited && <span className="text-[11px] text-blue-700 bg-blue-50 rounded px-1.5">edited</span>}
                      {r.noName && <span className="text-[11px] text-slate-500 bg-slate-100 rounded px-1.5" title='No first name, so the greeting becomes "Hi,"'>no name</span>}
                      {r.missing.length > 0 && <span className="text-[11px] text-amber-700 bg-amber-50 rounded px-1.5" title={`Empty: ${r.missing.join(', ')}`}>missing {r.missing.join(' ')}</span>}
                      {r.leftover.length > 0 && <span className="text-[11px] text-red-700 bg-red-100 rounded px-1.5">unfilled {r.leftover[0]}</span>}
                    </span>
                  </button>
                  {open && (
                    <div className="px-3 pb-3 space-y-2">
                      <input
                        value={r.subject}
                        onChange={e => editOne(r.lead.id, 'subject', e.target.value, r)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <textarea
                        value={r.body}
                        onChange={e => editOne(r.lead.id, 'body', e.target.value, r)}
                        rows={9}
                        className="w-full text-sm text-slate-700 border border-slate-200 rounded-lg px-3 py-2 font-[inherit] focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-slate-400 whitespace-pre-line border-t border-slate-100 pt-2">
                        {draft.sender === 'ollie' ? '--\nOllie Eastham\nAventra\naventrasites.online\n\nNot for you? Unsubscribe here: <link>' : '--\nJoe Clacher\nAventra\n07710 988 228\naventrasites.online\n\nNot for you? Unsubscribe here: <link>'}
                      </p>
                      {r.edited && (
                        <button onClick={() => setOverrides(({ [r.lead.id]: _, ...rest }) => rest)} className="text-xs text-slate-500 hover:text-slate-700">
                          Reset to template
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
            {[
              { id: 'now', label: 'Send now', Icon: SendHorizontal },
              { id: 'today', label: 'Spread over today', Icon: Calendar },
              { id: 'date', label: 'Spread over…', Icon: Calendar },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${mode === id ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
          {mode === 'date' && (
            <input
              type="date"
              value={day}
              min={localDateStr(new Date())}
              onChange={e => setDay(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
            />
          )}
          <button
            onClick={send}
            disabled={busy || rendered.length === 0}
            className="ml-auto flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <SendHorizontal size={14} />}
            {mode === 'now' ? `Send ${rendered.length || ''} from ${SENDER_LABEL[draft.sender]}` : `Queue ${rendered.length || ''} from ${SENDER_LABEL[draft.sender]}`}
          </button>
        </div>
        {mode !== 'now' && (
          <p className="text-[11px] text-slate-400 mt-1.5">Spaced out between 9am and 5pm and sent on the hour. You can edit or cancel them in the Scheduled tab.</p>
        )}
        {sendError && (
          <p className="text-xs text-red-600 mt-2 flex items-center gap-1"><AlertCircle size={12} /> {sendError}</p>
        )}

        {doneResults.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="flex items-center mb-1.5">
              <p className="text-xs font-medium text-slate-500">This session</p>
              <button onClick={() => setResults({})} className="ml-auto text-xs text-slate-400 hover:text-slate-600">Clear</button>
            </div>
            <div className="space-y-1">
              {doneResults.map(([leadId, r]) => {
                const lead = leads.find(l => l.id === leadId);
                return (
                  <div key={leadId} className="flex items-center gap-2 text-xs">
                    {r.status === 'sending' && <Loader2 size={12} className="animate-spin text-slate-400" />}
                    {r.status === 'sent' && <Check size={12} className="text-green-600" />}
                    {r.status === 'queued' && <Calendar size={12} className="text-blue-600" />}
                    {r.status === 'error' && <AlertCircle size={12} className="text-red-500" />}
                    <span className="text-slate-700">{lead?.businessName || leadId}</span>
                    <span className={r.status === 'error' ? 'text-red-600' : 'text-slate-400'}>
                      {r.status === 'sent' ? 'sent' : r.status === 'queued' ? `queued · ${r.message}` : r.status === 'sending' ? 'sending…' : r.message}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {!currentTpl && templates.length === 0 && (
        <p className="text-xs text-slate-400 flex items-center gap-1"><FileText size={12} /> Ollie's intro is loaded as a starting template. Save it to reuse it.</p>
      )}
    </div>
  );
}
