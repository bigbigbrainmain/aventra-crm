import { useState, useEffect, useRef } from 'react';
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { MessageSquare, Check, Plus, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { timeAgo } from '../utils/constants';

const TEAM = [
  { handle: 'ollie', name: 'Ollie', email: 'ollie@aventrasites.online' },
  { handle: 'joe',   name: 'Joe',   email: 'joe@aventrasites.online'   },
];

function parseMentions(body) {
  const matches = body.match(/@(\w+)/g) || [];
  return matches
    .map(m => m.slice(1).toLowerCase())
    .map(handle => TEAM.find(t => t.handle === handle))
    .filter(Boolean);
}

async function sendMentionEmails(mentions, fromName, entityName, messageBody, threadId, entityId) {
  const deepLink = `${window.location.origin}/#lead=${entityId}&thread=${threadId}`;
  for (const member of mentions) {
    try {
      await fetch('/.netlify/functions/mention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: member.email,
          toName: member.name,
          fromName,
          entityName,
          messageBody,
          deepLink,
        }),
      });
    } catch (err) {
      console.error('Failed to send mention email:', err);
    }
  }
}

function firestoreTimeAgo(ts) {
  if (!ts) return 'just now';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return timeAgo(date.toISOString());
}

function MentionComposer({ value, onChange, onPost, posting, placeholder, autoFocus }) {
  const textareaRef = useRef(null);
  const [showMenu, setShowMenu] = useState(false);
  const [menuFilter, setMenuFilter] = useState('');

  const handleKeyDown = (e) => {
    if (showMenu) {
      if (e.key === 'Escape') { setShowMenu(false); return; }
      if (e.key === 'Enter' && e.metaKey) { onPost(); return; }
      return;
    }
    if (e.key === 'Enter' && e.metaKey) onPost();
  };

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    // Detect @mention trigger
    const cursor = e.target.selectionStart;
    const textUpToCursor = val.slice(0, cursor);
    const atMatch = textUpToCursor.match(/@(\w*)$/);
    if (atMatch) {
      setMenuFilter(atMatch[1].toLowerCase());
      setShowMenu(true);
    } else {
      setShowMenu(false);
    }
  };

  const insertMention = (handle) => {
    const ta = textareaRef.current;
    const cursor = ta.selectionStart;
    const textUpToCursor = value.slice(0, cursor);
    const atIndex = textUpToCursor.lastIndexOf('@');
    const before = value.slice(0, atIndex);
    const after = value.slice(cursor);
    onChange(`${before}@${handle} ${after}`);
    setShowMenu(false);
    setTimeout(() => {
      ta.focus();
      const newPos = atIndex + handle.length + 2;
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const filteredTeam = TEAM.filter(t => t.handle.startsWith(menuFilter));

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        autoFocus={autoFocus}
        className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-300"
      />
      {showMenu && filteredTeam.length > 0 && (
        <div className="absolute z-10 bottom-full mb-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {filteredTeam.map(t => (
            <button
              key={t.handle}
              onMouseDown={e => { e.preventDefault(); insertMention(t.handle); }}
              className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 w-full text-left text-sm text-slate-700"
            >
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-600">
                {t.name[0]}
              </div>
              <span>@{t.handle}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs text-slate-400">Type @ollie or @joe to notify · ⌘↵ to send</span>
        <button
          onClick={onPost}
          disabled={!value.trim() || posting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={11} />
          {posting ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function ThreadCard({ thread, entityName, focusThreadId }) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(thread.id === focusThreadId);
  const [messages, setMessages] = useState([]);
  const [replyBody, setReplyBody] = useState('');
  const [posting, setPosting] = useState(false);
  const cardRef = useRef(null);

  // Scroll into view if this is the deep-linked thread
  useEffect(() => {
    if (focusThreadId === thread.id && cardRef.current) {
      setTimeout(() => cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
    }
  }, [focusThreadId, thread.id]);

  // Listen to messages when expanded
  useEffect(() => {
    if (!expanded) return;
    const q = query(
      collection(db, 'threads', thread.id, 'messages'),
      orderBy('timestamp', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [expanded, thread.id]);

  const handleResolve = async () => {
    const ref = doc(db, 'threads', thread.id);
    await updateDoc(ref, {
      isResolved: !thread.isResolved,
      resolvedAt: !thread.isResolved ? serverTimestamp() : null,
      resolvedBy: !thread.isResolved ? { name: user.displayName, email: user.email } : null,
    });
  };

  const handleReply = async () => {
    if (!replyBody.trim()) return;
    setPosting(true);
    try {
      const mentions = parseMentions(replyBody);
      await addDoc(collection(db, 'threads', thread.id, 'messages'), {
        body: replyBody.trim(),
        authorName: user.displayName,
        authorEmail: user.email,
        timestamp: serverTimestamp(),
      });
      await sendMentionEmails(mentions, user.displayName, entityName, replyBody, thread.id, thread.entityId);
      setReplyBody('');
    } catch (err) {
      console.error(err);
    } finally {
      setPosting(false);
    }
  };

  const isResolved = thread.isResolved;
  const replyCount = messages.length;

  return (
    <div
      id={`thread-${thread.id}`}
      ref={cardRef}
      className={`rounded-lg border transition-colors ${isResolved ? 'bg-green-50 border-green-100' : 'bg-white border-slate-100'} ${focusThreadId === thread.id ? 'ring-2 ring-blue-400' : ''}`}
    >
      {/* Thread header */}
      <div className="p-3">
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-600 shrink-0 mt-0.5">
            {thread.createdBy?.name?.[0] || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs font-semibold text-slate-700">{thread.createdBy?.name}</span>
              <span className="text-xs text-slate-400">{firestoreTimeAgo(thread.createdAt)}</span>
            </div>
            <p className={`text-sm leading-snug ${isResolved ? 'text-slate-400' : 'text-slate-700'}`}>
              {renderBody(thread.body)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2.5 ml-8">
          <button
            onClick={handleResolve}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
              isResolved
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            <Check size={10} />
            {isResolved ? 'Resolved' : 'Resolve'}
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {replyCount > 0 ? `${replyCount} repl${replyCount === 1 ? 'y' : 'ies'}` : 'Reply'}
          </button>
        </div>
      </div>

      {/* Replies */}
      {expanded && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2 space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 shrink-0 mt-0.5">
                {msg.authorName?.[0] || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-semibold text-slate-700">{msg.authorName}</span>
                  <span className="text-xs text-slate-400">{firestoreTimeAgo(msg.timestamp)}</span>
                </div>
                <p className="text-sm text-slate-600 leading-snug">{renderBody(msg.body)}</p>
              </div>
            </div>
          ))}

          <div className="pt-1">
            <MentionComposer
              value={replyBody}
              onChange={setReplyBody}
              onPost={handleReply}
              posting={posting}
              placeholder="Reply..."
              autoFocus={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function renderBody(text) {
  if (!text) return null;
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} className="text-blue-600 font-medium">{part}</span>
      : part
  );
}

export default function ChatSection({ entityId, entityType, entityName, focusThreadId }) {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [showComposer, setShowComposer] = useState(false);
  const [newBody, setNewBody] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'threads'),
      where('entityId', '==', entityId)
    );
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
      setThreads(docs);
    });
    return unsub;
  }, [entityId]);

  // Auto-expand composer if deep-linked to a thread (so user sees context)
  useEffect(() => {
    if (focusThreadId) setShowComposer(false);
  }, [focusThreadId]);

  const handlePost = async () => {
    if (!newBody.trim()) return;
    setPosting(true);
    try {
      const mentions = parseMentions(newBody);
      const docRef = await addDoc(collection(db, 'threads'), {
        entityId,
        entityType,
        createdAt: serverTimestamp(),
        createdBy: { name: user.displayName, email: user.email },
        body: newBody.trim(),
        isResolved: false,
        resolvedAt: null,
        resolvedBy: null,
      });
      await sendMentionEmails(mentions, user.displayName, entityName, newBody, docRef.id, entityId);
      setNewBody('');
      setShowComposer(false);
    } catch (err) {
      console.error(err);
    } finally {
      setPosting(false);
    }
  };

  const openCount = threads.filter(t => !t.isResolved).length;

  return (
    <div className="border-t border-slate-100 pt-5 mt-5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <MessageSquare size={11} />
          Chats {openCount > 0 && <span className="text-blue-500">({openCount} open)</span>}
        </h4>
        <button
          onClick={() => setShowComposer(v => !v)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors"
        >
          <Plus size={12} />
          New thread
        </button>
      </div>

      {showComposer && (
        <div className="mb-3">
          <MentionComposer
            value={newBody}
            onChange={setNewBody}
            onPost={handlePost}
            posting={posting}
            placeholder="Start a thread... use @ollie or @joe to notify someone"
            autoFocus
          />
        </div>
      )}

      <div className="space-y-2">
        {threads.map(thread => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            entityName={entityName}
            focusThreadId={focusThreadId}
          />
        ))}
        {threads.length === 0 && !showComposer && (
          <p className="text-xs text-slate-400 text-center py-2">No threads yet</p>
        )}
      </div>
    </div>
  );
}
