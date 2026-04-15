import { useState, useEffect } from 'react';
import { ExternalLink, Plus, Pencil, Trash2, X, Check, BookOpen } from 'lucide-react';
import { api } from '../utils/api';

const CATEGORIES = ['General', 'Templates', 'Processes', 'Tools', 'Legal', 'Design', 'Other'];

function DocModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    url: initial?.url || '',
    category: initial?.category || 'General',
    description: initial?.description || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.url.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-slate-800 font-semibold text-sm">{initial ? 'Edit Link' : 'Add Link'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Proposal Template"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">URL *</label>
            <input
              type="url"
              value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              placeholder="https://..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional short description"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.title.trim() || !form.url.trim()}
              className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : initial ? 'Save' : 'Add Link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DocCard({ doc, onEdit, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    await onDelete(doc.id);
  };

  return (
    <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-slate-800 hover:text-blue-600 transition-colors truncate"
          >
            {doc.title}
          </a>
          <ExternalLink size={12} className="text-slate-400 shrink-0" />
        </div>
        {doc.description && (
          <p className="text-xs text-slate-500 mt-0.5 truncate">{doc.description}</p>
        )}
        <p className="text-xs text-slate-400 mt-1 truncate">{doc.url}</p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {confirmDelete ? (
          <>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              title="Confirm delete"
            >
              <Check size={13} />
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
            >
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onEdit(doc)}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              title="Edit"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function DocumentsView() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);

  useEffect(() => {
    api.getDocuments()
      .then(setDocuments)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (data) => {
    if (editingDoc) {
      const updated = await api.updateDocument(editingDoc.id, data);
      setDocuments(prev => prev.map(d => d.id === editingDoc.id ? { ...d, ...updated } : d));
    } else {
      const { id } = await api.createDocument(data);
      const newDoc = { id, ...data, addedDate: new Date().toISOString().split('T')[0] };
      setDocuments(prev => [...prev, newDoc]);
    }
    setEditingDoc(null);
  };

  const handleEdit = (doc) => {
    setEditingDoc(doc);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    await api.deleteDocument(id);
    setDocuments(prev => prev.filter(d => d.id !== id));
  };

  const handleClose = () => {
    setShowModal(false);
    setEditingDoc(null);
  };

  // Group documents by category
  const grouped = documents.reduce((acc, doc) => {
    const cat = doc.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(doc);
    return acc;
  }, {});

  const orderedCategories = CATEGORIES.filter(c => grouped[c]);
  // Any custom categories not in the default list
  Object.keys(grouped).forEach(c => { if (!CATEGORIES.includes(c)) orderedCategories.push(c); });

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Internal Docs</h1>
          <p className="text-slate-500 text-sm mt-0.5">Links and resources shared across the team</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} />
          Add Link
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <BookOpen size={20} className="text-slate-400" />
          </div>
          <p className="text-slate-500 text-sm font-medium">No links yet</p>
          <p className="text-slate-400 text-xs mt-1">Add your first link to share with the team</p>
        </div>
      ) : (
        <div className="space-y-6">
          {orderedCategories.map(category => (
            <div key={category}>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{category}</h2>
              <div className="space-y-2">
                {grouped[category].map(doc => (
                  <DocCard
                    key={doc.id}
                    doc={doc}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <DocModal
          initial={editingDoc}
          onSave={handleSave}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
