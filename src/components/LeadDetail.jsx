import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  X, Mail, Phone, ExternalLink, Tag, Calendar,
  Plus, Check, Trash2, AlertCircle, ChevronDown,
  ChevronRight, Star, Pencil, Maximize2, Minimize2, UserCheck,
  Loader2, SendHorizontal,
} from 'lucide-react';
import { api } from '../utils/api';
import { getStatusStyle, getPriorityStyle, STATUSES, timeAgo, formatDate } from '../utils/constants';
import ChatSection from './ChatSection';
import { useUserSettings } from '../hooks/useUserSettings';

const FROM_LABELS = {
  dashboard: 'Dashboard',
  tasks: 'Tasks',
  outreach: 'Outreach',
};

function Section({ title, children, action }) {
  return (
    <div className="border-t border-slate-100 pt-5 mt-5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</h4>
        {action}
      </div>
      {children}
    </div>
  );
}

function StatusSelect({ value, onChange }) {
  const s = getStatusStyle(value);
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`appearance-none pl-3 pr-8 py-1.5 rounded-full text-xs font-semibold cursor-pointer border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 ${s.bg} ${s.text}`}
      >
        {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
      </select>
      <ChevronDown size={11} className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${s.text}`} />
    </div>
  );
}

export default function LeadDetail({ lead, onClose, onUpdate, onDelete, onTasksChange, onToggleFavourite, expanded, onToggleExpand }) {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [searchParams] = useSearchParams();
  const focusThreadId = searchParams.get('thread');
  const fromKey = state?.from;
  const fromLabel = FROM_LABELS[fromKey] ?? 'All Leads';
  const fromPath = FROM_LABELS[fromKey] ? `/${fromKey}` : '/leads';
  const { getSignature } = useUserSettings();
  const [notes, setNotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [newTask, setNewTask] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftSubject, setDraftSubject] = useState(lead.subject || '');
  const [draftBody, setDraftBody] = useState(lead.emailBody || '');
  const [outreachGenerating, setOutreachGenerating] = useState(false);
  const [outreachSending, setOutreachSending] = useState(false);
  const [outreachSent, setOutreachSent] = useState(false);
  const [outreachError, setOutreachError] = useState('');
  const [draft, setDraft] = useState({});
  const [availableFolders, setAvailableFolders] = useState([]);
  const [folderInput, setFolderInput] = useState(lead.proposalFolder || '');
  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false);
  const [graduateModal, setGraduateModal] = useState(false);

  const loadNotesAndTasks = useCallback(async () => {
    const [n, t] = await Promise.all([
      api.getNotes(lead.id),
      api.getTasks(lead.id),
    ]);
    setNotes(n);
    setTasks(t);
  }, [lead.id]);

  useEffect(() => {
    loadNotesAndTasks();
  }, [loadNotesAndTasks]);

  useEffect(() => {
    api.getProposalFolders().then(setAvailableFolders).catch(() => {});
  }, []);

  useEffect(() => {
    setFolderInput(lead.proposalFolder || '');
    setDraftSubject(lead.subject || '');
    setDraftBody(lead.emailBody || '');
    setOutreachSent(false);
    setOutreachError('');
  }, [lead.id]);

  // Status change — auto-save
  const handleStatusChange = async (newStatus) => {
    const updated = { ...lead, status: newStatus };
    onUpdate(updated); // optimistic
    try {
      await api.updateLead(lead.id, { status: newStatus });
    } catch (err) {
      console.error(err);
      onUpdate(lead); // revert
    }
  };

  // Save inline notes field
  const handleNotesSave = async (value) => {
    onUpdate({ ...lead, notes: value }); // optimistic
    try {
      await api.updateLead(lead.id, { notes: value });
    } catch (err) {
      console.error(err);
      onUpdate(lead);
    }
  };

  // Save proposal folder link
  const handleFolderSave = async (value) => {
    if (value === (lead.proposalFolder || '')) return;
    onUpdate({ ...lead, proposalFolder: value });
    try {
      await api.updateLead(lead.id, { proposalFolder: value });
    } catch (err) {
      console.error(err);
      onUpdate(lead);
      setFolderInput(lead.proposalFolder || '');
    }
  };

  // Edit entire lead
  const startEdit = () => {
    setDraft({
      businessName: lead.businessName,
      industry:     lead.industry,
      city:         lead.city,
      email:        lead.email,
      phone:        lead.phone,
      website:      lead.website,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    const updated = { ...lead, ...draft };
    onUpdate(updated);
    setEditing(false);
    try {
      await api.updateLead(lead.id, draft);
    } catch (err) {
      console.error(err);
      onUpdate(lead);
    }
  };

  // Add note
  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const note = await api.addNote(lead.id, newNote.trim());
      setNotes(prev => [note, ...prev]);
      setNewNote('');
    } catch (err) {
      console.error(err);
    } finally {
      setAddingNote(false);
    }
  };

  // Toggle note actioned
  const handleToggleNote = async (noteId) => {
    try {
      const res = await api.toggleNote(noteId);
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, actioned: res.actioned } : n));
    } catch (err) {
      console.error(err);
    }
  };

  // Delete note
  const handleDeleteNote = async (noteId) => {
    try {
      await api.deleteNote(noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err) {
      console.error(err);
    }
  };

  // Add task
  const handleAddTask = async () => {
    if (!newTask.trim()) return;
    setAddingTask(true);
    try {
      const task = await api.addTask(lead.id, newTask.trim(), newTaskDue);
      setTasks(prev => [...prev, task]);
      setNewTask('');
      setNewTaskDue('');
      onTasksChange();
    } catch (err) {
      console.error(err);
    } finally {
      setAddingTask(false);
    }
  };

  // Complete task
  const handleCompleteTask = async (taskId, completed) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed } : t)); // optimistic
    try {
      await api.updateTask(taskId, { completed });
      onTasksChange();
    } catch (err) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !completed } : t));
    }
  };

  // Delete task
  const handleDeleteTask = async (taskId) => {
    try {
      await api.deleteTask(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      onTasksChange();
    } catch (err) {
      console.error(err);
    }
  };

  // Delete lead
  const handleDeleteLead = async () => {
    if (!confirm(`Delete "${lead.businessName}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await api.deleteLead(lead.id);
      onDelete(lead.id);
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateOutreach = async () => {
    setOutreachGenerating(true);
    setOutreachError('');
    try {
      const [pitch, sig] = await Promise.all([api.generateOutreach(lead.id), getSignature()]);
      const body = sig ? `${pitch.body}\n\n${sig}` : pitch.body;
      setDraftSubject(pitch.subject);
      setDraftBody(body);
      onUpdate({ ...lead, subject: pitch.subject, emailBody: body });
    } catch (err) {
      setOutreachError(err.message);
    } finally {
      setOutreachGenerating(false);
    }
  };

  const handleSendOutreach = async () => {
    if (!confirm(`Send outreach email to ${lead.email}?`)) return;
    setOutreachSending(true);
    setOutreachError('');
    try {
      if (draftSubject !== lead.subject || draftBody !== lead.emailBody) {
        await api.updateLead(lead.id, { subject: draftSubject, emailBody: draftBody });
        onUpdate({ ...lead, subject: draftSubject, emailBody: draftBody });
      }
      const result = await api.sendOutreach(lead.id);
      const now = new Date().toISOString();
      onUpdate({
        ...lead,
        subject: draftSubject,
        emailBody: draftBody,
        outreachSentAt: lead.outreachSentAt || now,
        outreachCount: result.outreachCount,
        lastOutreachAt: now,
      });
      setOutreachSent(true);
    } catch (err) {
      setOutreachError(err.message);
    } finally {
      setOutreachSending(false);
    }
  };

  const filteredFolders = availableFolders.filter(f =>
    f.toLowerCase().includes(folderInput.toLowerCase())
  );

  const incompleteTasks = tasks.filter(t => !t.completed);
  const completedTasks  = tasks.filter(t => t.completed);
  const priorityCfg = getPriorityStyle(lead.priority);

  const handleGraduate = async (formData) => {
    await api.graduateProposal({ leadId: lead.id, folderName: lead.proposalFolder, ...formData });
    onUpdate({ ...lead, status: 'Won' });
    setGraduateModal(false);
  };

  return (
    <>
      {graduateModal && (
        <GraduateModal
          lead={lead}
          onClose={() => setGraduateModal(false)}
          onConfirm={handleGraduate}
        />
      )}
      {/* Overlay — only in expanded mode; small mode keeps background interactive */}
      {expanded && <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-40" onClick={onClose} />}

      {/* Panel */}
      <div className={`fixed top-0 right-0 h-full bg-white shadow-2xl z-50 flex flex-col overflow-hidden transition-all duration-200
        ${expanded ? 'left-16 w-auto max-w-none' : 'w-full max-w-lg'}`}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0 flex-1">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-xs text-slate-400 mb-2">
              <button
                onClick={() => navigate(fromPath)}
                className="hover:text-blue-600 transition-colors"
              >
                {fromLabel}
              </button>
              <ChevronRight size={10} className="shrink-0" />
              <span className="text-slate-500 font-medium truncate">{lead.businessName}</span>
            </nav>
            {editing ? (
              <input
                autoFocus
                value={draft.businessName}
                onChange={e => setDraft(d => ({ ...d, businessName: e.target.value }))}
                className="text-lg font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(`${lead.businessName} ${lead.city}`.trim())}`}
                target="_blank"
                rel="noreferrer"
                className="text-lg font-bold text-slate-900 leading-tight truncate hover:text-blue-600 hover:underline transition-colors"
              >
                {lead.businessName}
              </a>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusSelect value={lead.status} onChange={handleStatusChange} />
              {lead.priority && priorityCfg && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${priorityCfg.bg} ${priorityCfg.text}`}>
                  {lead.priority}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onToggleFavourite(lead.id)}
              title={lead.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
              className={`p-1.5 rounded-lg transition-colors ${lead.isFavourite ? 'text-amber-400 hover:bg-amber-50' : 'text-slate-300 hover:text-amber-400 hover:bg-slate-100'}`}
            >
              <Star size={17} fill={lead.isFavourite ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={startEdit}
              title="Edit lead"
              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-blue-600"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={onToggleExpand}
              title={expanded ? 'Collapse panel' : 'Expand panel'}
              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
            >
              {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X size={18} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4">
          {/* Contact info */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact</span>
            </div>

            {editing ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Tag size={14} className="text-slate-400 shrink-0" />
                  <input
                    value={draft.industry}
                    onChange={e => setDraft(d => ({ ...d, industry: e.target.value }))}
                    placeholder="Industry"
                    className="flex-1 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-300"
                  />
                  <input
                    value={draft.city}
                    onChange={e => setDraft(d => ({ ...d, city: e.target.value }))}
                    placeholder="City"
                    className="flex-1 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-300"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-slate-400 shrink-0" />
                  <input
                    type="email"
                    value={draft.email}
                    onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
                    placeholder="Email"
                    className="flex-1 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-300"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-slate-400 shrink-0" />
                  <input
                    type="tel"
                    value={draft.phone}
                    onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
                    placeholder="Phone"
                    className="flex-1 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-300"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <ExternalLink size={14} className="text-slate-400 shrink-0" />
                  <input
                    type="url"
                    value={draft.website}
                    onChange={e => setDraft(d => ({ ...d, website: e.target.value }))}
                    placeholder="Website URL"
                    className="flex-1 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-300"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={saveEdit}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-3 py-1.5 text-slate-500 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {lead.email ? (
                  <a href={`mailto:${lead.email}`} className="flex items-center gap-2.5 text-sm text-slate-700 hover:text-blue-600 transition-colors">
                    <Mail size={14} className="text-slate-400 shrink-0" />
                    <span>{lead.email}</span>
                  </a>
                ) : (
                  <button onClick={startEdit} className="flex items-center gap-2.5 text-sm text-slate-300 hover:text-blue-500 transition-colors">
                    <Mail size={14} className="shrink-0" />
                    <span>Add email</span>
                  </button>
                )}
                {lead.phone ? (
                  <a href={`tel:${lead.phone}`} className="flex items-center gap-2.5 text-sm text-slate-700 hover:text-blue-600 transition-colors">
                    <Phone size={14} className="text-slate-400 shrink-0" />
                    <span>{lead.phone}</span>
                  </a>
                ) : (
                  <button onClick={startEdit} className="flex items-center gap-2.5 text-sm text-slate-300 hover:text-blue-500 transition-colors">
                    <Phone size={14} className="shrink-0" />
                    <span>Add phone</span>
                  </button>
                )}
                {lead.website ? (
                  <a href={lead.website} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 text-sm text-blue-600 hover:text-blue-700 transition-colors">
                    <ExternalLink size={14} className="text-slate-400 shrink-0" />
                    <span className="truncate">{lead.website}</span>
                  </a>
                ) : (
                  <button onClick={startEdit} className="flex items-center gap-2.5 text-sm text-slate-300 hover:text-blue-500 transition-colors">
                    <ExternalLink size={14} className="shrink-0" />
                    <span>Add website</span>
                  </button>
                )}
                <div className="flex items-center gap-2.5 text-sm text-slate-500">
                  <Tag size={14} className="text-slate-400 shrink-0" />
                  <span>{lead.industry}{lead.city ? ` · ${lead.city}` : ''}</span>
                </div>
                {lead.priorityReason && (
                  <div className="flex items-start gap-2.5 text-sm text-slate-500">
                    <AlertCircle size={14} className="text-slate-400 shrink-0 mt-0.5" />
                    <span className="text-xs">{lead.priorityReason}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Metadata */}
          <Section title="Lead Info">
            <div>
              <p className="text-xs text-slate-400 mb-1">Quick Note</p>
              <textarea
                defaultValue={lead.notes}
                onBlur={e => handleNotesSave(e.target.value)}
                rows={2}
                placeholder="One-line note saved to the sheet..."
                className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-300"
              />
            </div>
          </Section>

          {/* Proposal */}
          <Section title="Proposal">
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-400 mb-1">Linked Folder</p>
                <div className="relative">
                  <input
                    type="text"
                    value={folderInput}
                    onChange={e => { setFolderInput(e.target.value); setFolderDropdownOpen(true); }}
                    onFocus={() => setFolderDropdownOpen(true)}
                    onBlur={() => setTimeout(() => { setFolderDropdownOpen(false); handleFolderSave(folderInput); }, 150)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { handleFolderSave(folderInput); setFolderDropdownOpen(false); e.target.blur(); }
                      if (e.key === 'Escape') { setFolderDropdownOpen(false); setFolderInput(lead.proposalFolder || ''); e.target.blur(); }
                    }}
                    placeholder="Select or type folder name..."
                    className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-300"
                  />
                  {folderDropdownOpen && (filteredFolders.length > 0 || folderInput) && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredFolders.map(folder => (
                        <button
                          key={folder}
                          type="button"
                          onMouseDown={() => { setFolderInput(folder); setFolderDropdownOpen(false); handleFolderSave(folder); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors ${
                            folder === folderInput ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'
                          }`}
                        >
                          {folder}
                        </button>
                      ))}
                      {filteredFolders.length === 0 && folderInput && (
                        <div className="px-3 py-2 text-xs text-slate-400">
                          No match — press Enter to save "{folderInput}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Live URL</p>
                {lead.proposalUrl ? (
                  <a
                    href={lead.proposalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <ExternalLink size={14} className="text-slate-400 shrink-0" />
                    <span className="truncate">{lead.proposalUrl}</span>
                  </a>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-slate-300">
                    <ExternalLink size={14} className="shrink-0" />
                    Not deployed yet
                  </p>
                )}
              </div>
              {lead.proposalFolder && (
                <button
                  onClick={() => setGraduateModal(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  <UserCheck size={13} />
                  Convert to Live Customer
                </button>
              )}
            </div>
          </Section>

          {/* Outreach */}
          <Section
            title="Outreach Email"
            action={lead.outreachCount > 0 ? (
              <button onClick={() => navigate(`/outreach?lead=${lead.id}`)} className="text-xs text-blue-600 hover:text-blue-700">
                View history →
              </button>
            ) : null}
          >
            {lead.outreachOptedOut === 'Yes' && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 px-3 py-2 rounded-lg mb-3">
                This lead has opted out of outreach emails.
              </p>
            )}
            {!lead.email && lead.outreachOptedOut !== 'Yes' && (
              <button onClick={startEdit} className="text-xs text-slate-400 hover:text-blue-500 transition-colors">
                Add an email address to enable outreach →
              </button>
            )}
            {lead.email && lead.outreachOptedOut !== 'Yes' && (
              <div className="space-y-3">
                {lead.outreachCount > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500">Sent {lead.outreachCount}× · last {timeAgo(lead.lastOutreachAt)}</span>
                    {lead.emailOpenedAt ? (
                      <span className="text-xs text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full font-medium">
                        Opened {timeAgo(lead.emailOpenedAt)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Not opened</span>
                    )}
                  </div>
                )}
                {(draftSubject || draftBody) ? (
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Subject</p>
                      <input
                        value={draftSubject}
                        onChange={e => setDraftSubject(e.target.value)}
                        className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Body</p>
                      <textarea
                        value={draftBody}
                        onChange={e => setDraftBody(e.target.value)}
                        rows={6}
                        className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSendOutreach}
                        disabled={outreachSending || !draftSubject.trim() || !draftBody.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {outreachSending ? <><Loader2 size={11} className="animate-spin" />Sending...</> :
                         outreachSent   ? <><Check size={11} />Sent!</> :
                                          <><SendHorizontal size={11} />Send Email</>}
                      </button>
                      <button
                        onClick={handleGenerateOutreach}
                        disabled={outreachGenerating}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-slate-600 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {outreachGenerating ? <><Loader2 size={11} className="animate-spin" />Generating...</> : 'Regenerate'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <button
                      onClick={handleGenerateOutreach}
                      disabled={outreachGenerating || !lead.industry || !lead.city}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {outreachGenerating ? <><Loader2 size={11} className="animate-spin" />Generating...</> : 'Generate AI Pitch'}
                    </button>
                    {(!lead.industry || !lead.city) && (
                      <p className="text-xs text-slate-400">Industry and city are required.</p>
                    )}
                  </div>
                )}
                {outreachError && (
                  <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{outreachError}</p>
                )}
              </div>
            )}
          </Section>

          {/* Notes */}
          <Section title={`Notes (${notes.length})`}>
            {/* Add note */}
            <div className="mb-3">
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Add a note..."
                rows={2}
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleAddNote(); }}
                className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-300"
              />
              <button
                onClick={handleAddNote}
                disabled={!newNote.trim() || addingNote}
                className="mt-1.5 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={12} />
                {addingNote ? 'Adding...' : 'Add Note'}
              </button>
            </div>

            {/* Note list */}
            <div className="space-y-2">
              {notes.map(note => (
                <div
                  key={note.id}
                  className={`flex gap-2 p-3 rounded-lg border transition-colors ${note.actioned ? 'bg-green-50 border-green-100' : 'bg-slate-50 border-slate-100'}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${note.actioned ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                      {note.text}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">{timeAgo(note.timestamp)}</p>
                  </div>
                  <div className="flex items-start gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleNote(note.id)}
                      className={`p-1 rounded transition-colors ${note.actioned ? 'text-green-600 bg-green-100 hover:bg-green-200' : 'text-slate-400 hover:text-green-600 hover:bg-green-50'}`}
                      title="Toggle actioned"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
              {notes.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-2">No notes yet</p>
              )}
            </div>
          </Section>

          {/* Chats */}
          <ChatSection
            entityId={lead.id}
            entityType="lead"
            entityName={lead.businessName}
            focusThreadId={focusThreadId}
          />

          {/* Tasks */}
          <Section title={`Tasks (${incompleteTasks.length} open)`}>
            {/* Add task */}
            <div className="mb-3 space-y-2">
              <input
                type="text"
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                placeholder="Task description..."
                onKeyDown={e => { if (e.key === 'Enter') handleAddTask(); }}
                className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-300"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newTaskDue}
                  onChange={e => setNewTaskDue(e.target.value)}
                  className="flex-1 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleAddTask}
                  disabled={!newTask.trim() || addingTask}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={12} />
                  {addingTask ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>

            {/* Task list — incomplete */}
            <div className="space-y-2 mb-3">
              {incompleteTasks.map(task => (
                <TaskRow key={task.id} task={task} onComplete={handleCompleteTask} onDelete={handleDeleteTask} />
              ))}
              {incompleteTasks.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-1">No open tasks</p>
              )}
            </div>

            {/* Completed tasks (collapsed) */}
            {completedTasks.length > 0 && (
              <details className="group">
                <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 select-none">
                  {completedTasks.length} completed task{completedTasks.length > 1 ? 's' : ''}
                </summary>
                <div className="space-y-2 mt-2">
                  {completedTasks.map(task => (
                    <TaskRow key={task.id} task={task} onComplete={handleCompleteTask} onDelete={handleDeleteTask} />
                  ))}
                </div>
              </details>
            )}
          </Section>

          {/* Danger zone */}
          <div className="mt-8 pb-6">
            <button
              onClick={handleDeleteLead}
              disabled={saving}
              className="w-full py-2 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {saving ? 'Deleting...' : 'Delete this lead'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function GraduateModal({ lead, onClose, onConfirm }) {
  const [form, setForm] = useState({
    businessName: lead.businessName || '',
    domain: '',
    monthlyFee: '',
    setupFee: '',
    goLiveDate: '',
    notes: '',
    removeFromProposals: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const previewUrl = `https://aventra-${lead.proposalFolder}.netlify.app`;

  const handleConfirm = async () => {
    setSaving(true);
    setError('');
    try {
      await onConfirm(form);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="font-semibold text-slate-900">Convert to Live Customer</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Moves <span className="font-medium text-slate-600">{lead.proposalFolder}</span> to live sites and creates a customer record
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div className="bg-slate-50 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1">
            <p><span className="font-medium text-slate-700">Proposal folder:</span> {lead.proposalFolder}</p>
            <p><span className="font-medium text-slate-700">Will deploy to:</span> <span className="text-blue-600">{previewUrl}</span></p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Business Name *</label>
              <input
                value={form.businessName}
                onChange={e => set('businessName', e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Custom Domain</label>
              <input
                value={form.domain}
                onChange={e => set('domain', e.target.value)}
                placeholder="e.g. acmeplumbing.co.uk"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 placeholder-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Monthly Fee (£)</label>
              <input
                type="number"
                value={form.monthlyFee}
                onChange={e => set('monthlyFee', e.target.value)}
                placeholder="49"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 placeholder-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Setup Fee (£)</label>
              <input
                type="number"
                value={form.setupFee}
                onChange={e => set('setupFee', e.target.value)}
                placeholder="500"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 placeholder-slate-300"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Go Live Date</label>
              <input
                type="date"
                value={form.goLiveDate}
                onChange={e => set('goLiveDate', e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={2}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.removeFromProposals}
                  onChange={e => set('removeFromProposals', e.target.checked)}
                  className="w-4 h-4 rounded accent-green-600"
                />
                <span className="text-sm text-slate-600">Remove folder from proposals repo after moving</span>
              </label>
            </div>
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button
            onClick={handleConfirm}
            disabled={saving || !form.businessName.trim()}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Converting...' : 'Convert to Customer'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 text-slate-500 hover:bg-slate-100 text-sm rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskRow({ task, onComplete, onDelete }) {
  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg border ${task.completed ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-100'}`}>
      <button
        onClick={() => onComplete(task.id, !task.completed)}
        className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors
          ${task.completed ? 'bg-green-500 border-green-500' : 'border-slate-300 hover:border-green-400'}`}
      >
        {task.completed && <Check size={10} className="text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${task.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
          {task.description}
        </p>
        {task.dueDate && (
          <div className="flex items-center gap-1 mt-0.5">
            <Calendar size={10} className="text-slate-400" />
            <p className="text-xs text-slate-400">{formatDate(task.dueDate)}</p>
          </div>
        )}
      </div>
      <button
        onClick={() => onDelete(task.id)}
        className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
