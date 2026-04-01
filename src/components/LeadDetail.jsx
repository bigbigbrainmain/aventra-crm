import { useState, useEffect, useCallback } from 'react';
import {
  X, Mail, Phone, ExternalLink, Tag, Calendar,
  Plus, Check, Trash2, AlertCircle, ChevronDown,
  Star, Pencil,
} from 'lucide-react';
import { api } from '../utils/api';
import { getStatusStyle, getPriorityStyle, STATUSES, timeAgo, formatDate } from '../utils/constants';

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

export default function LeadDetail({ lead, onClose, onUpdate, onDelete, onTasksChange, onToggleFavourite }) {
  const [notes, setNotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [newTask, setNewTask] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState({});

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

  // Edit contact info
  const startEditContact = () => {
    setContactDraft({ email: lead.email, phone: lead.phone, website: lead.website });
    setEditingContact(true);
  };

  const saveContact = async () => {
    const updated = { ...lead, ...contactDraft };
    onUpdate(updated);
    setEditingContact(false);
    try {
      await api.updateLead(lead.id, contactDraft);
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

  const incompleteTasks = tasks.filter(t => !t.completed);
  const completedTasks  = tasks.filter(t => t.completed);
  const priorityCfg = getPriorityStyle(lead.priority);

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(`${lead.businessName} ${lead.city}`.trim())}`}
              target="_blank"
              rel="noreferrer"
              className="text-lg font-bold text-slate-900 leading-tight truncate hover:text-blue-600 hover:underline transition-colors"
            >
              {lead.businessName}
            </a>
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
              {!editingContact && (
                <button
                  onClick={startEditContact}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors"
                >
                  <Pencil size={11} />
                  Edit
                </button>
              )}
            </div>

            {editingContact ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-slate-400 shrink-0" />
                  <input
                    type="email"
                    value={contactDraft.email}
                    onChange={e => setContactDraft(d => ({ ...d, email: e.target.value }))}
                    placeholder="Email"
                    className="flex-1 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-300"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-slate-400 shrink-0" />
                  <input
                    type="tel"
                    value={contactDraft.phone}
                    onChange={e => setContactDraft(d => ({ ...d, phone: e.target.value }))}
                    placeholder="Phone"
                    className="flex-1 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-300"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <ExternalLink size={14} className="text-slate-400 shrink-0" />
                  <input
                    type="url"
                    value={contactDraft.website}
                    onChange={e => setContactDraft(d => ({ ...d, website: e.target.value }))}
                    placeholder="Website URL"
                    className="flex-1 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-300"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={saveContact}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingContact(false)}
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
                  <button onClick={startEditContact} className="flex items-center gap-2.5 text-sm text-slate-300 hover:text-blue-500 transition-colors">
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
                  <button onClick={startEditContact} className="flex items-center gap-2.5 text-sm text-slate-300 hover:text-blue-500 transition-colors">
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
                  <button onClick={startEditContact} className="flex items-center gap-2.5 text-sm text-slate-300 hover:text-blue-500 transition-colors">
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

          {/* Email from scripts */}
          {(lead.subject || lead.emailBody) && (
            <Section
              title="Outreach Email"
              action={
                <button onClick={() => setShowEmail(v => !v)} className="text-xs text-blue-600 hover:text-blue-700">
                  {showEmail ? 'Hide' : 'Show'}
                </button>
              }
            >
              {showEmail && (
                <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                  {lead.subject && (
                    <div>
                      <p className="text-xs font-medium text-slate-400 mb-0.5">Subject</p>
                      <p className="text-sm text-slate-700">{lead.subject}</p>
                    </div>
                  )}
                  {lead.emailBody && (
                    <div>
                      <p className="text-xs font-medium text-slate-400 mb-0.5">Body</p>
                      <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{lead.emailBody}</p>
                    </div>
                  )}
                </div>
              )}
              {!showEmail && (
                <p className="text-xs text-slate-400">
                  {lead.subject ? `"${lead.subject}"` : 'Email drafted by script'}
                </p>
              )}
            </Section>
          )}

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
