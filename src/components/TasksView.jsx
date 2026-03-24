import { Check, Trash2, Calendar, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate, isDueToday, isOverdue } from '../utils/constants';

function TaskRow({ task, lead, onComplete, onDelete, onSelectLead }) {
  const overdue = !task.completed && isOverdue(task.dueDate);
  const today   = !task.completed && isDueToday(task.dueDate);

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border bg-white transition-all
      ${task.completed ? 'opacity-50 border-slate-100' : overdue ? 'border-red-200 bg-red-50/40' : 'border-slate-100 hover:border-blue-200'}`}
    >
      <button
        onClick={() => onComplete(task.id, !task.completed)}
        className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors
          ${task.completed ? 'bg-green-500 border-green-500' : overdue ? 'border-red-400 hover:border-green-400' : 'border-slate-300 hover:border-green-400'}`}
      >
        {task.completed && <Check size={10} className="text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${task.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
          {task.description}
        </p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {lead && (
            <button
              onClick={() => onSelectLead(lead)}
              className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
            >
              {lead.businessName}
            </button>
          )}
          {task.dueDate && (
            <span className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-600 font-medium' : today ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
              {overdue && <AlertTriangle size={10} />}
              <Calendar size={10} />
              {formatDate(task.dueDate)}
              {overdue && ' · Overdue'}
              {today && ' · Today'}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => onDelete(task.id)}
        className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0 mt-0.5"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function TaskGroup({ title, tasks, leads, onComplete, onDelete, onSelectLead, emptyMsg, titleClass = '' }) {
  if (tasks.length === 0) return null;
  const leadById = Object.fromEntries(leads.map(l => [l.id, l]));

  return (
    <div className="mb-6">
      <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${titleClass || 'text-slate-400'}`}>
        {title} ({tasks.length})
      </h3>
      <div className="space-y-2">
        {tasks.map(task => (
          <TaskRow
            key={task.id}
            task={task}
            lead={leadById[task.leadId]}
            onComplete={onComplete}
            onDelete={onDelete}
            onSelectLead={onSelectLead}
          />
        ))}
      </div>
    </div>
  );
}

export default function TasksView({ tasks, leads, onTaskUpdate, onSelectLead }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const overdue   = tasks.filter(t => !t.completed && t.dueDate && isOverdue(t.dueDate));
  const dueToday  = tasks.filter(t => !t.completed && t.dueDate && isDueToday(t.dueDate));
  const upcoming  = tasks.filter(t => !t.completed && t.dueDate && !isOverdue(t.dueDate) && !isDueToday(t.dueDate));
  const noDue     = tasks.filter(t => !t.completed && !t.dueDate);
  const completed = tasks.filter(t => t.completed);

  const handleComplete = async (taskId, isCompleted) => {
    try {
      await api.updateTask(taskId, { completed: isCompleted });
      onTaskUpdate();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (taskId) => {
    try {
      await api.deleteTask(taskId);
      onTaskUpdate();
    } catch (err) {
      console.error(err);
    }
  };

  const totalOpen = overdue.length + dueToday.length + upcoming.length + noDue.length;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Tasks</h2>
        <p className="text-slate-500 text-sm mt-0.5">
          {totalOpen} open · {completed.length} completed
        </p>
      </div>

      {totalOpen === 0 && completed.length === 0 && (
        <div className="text-center py-16">
          <p className="text-slate-400 text-sm">No tasks yet. Add tasks from a lead's detail panel.</p>
        </div>
      )}

      <TaskGroup
        title="Overdue"
        tasks={overdue}
        leads={leads}
        onComplete={handleComplete}
        onDelete={handleDelete}
        onSelectLead={onSelectLead}
        titleClass="text-red-500"
      />
      <TaskGroup
        title="Today"
        tasks={dueToday}
        leads={leads}
        onComplete={handleComplete}
        onDelete={handleDelete}
        onSelectLead={onSelectLead}
        titleClass="text-amber-600"
      />
      <TaskGroup
        title="Upcoming"
        tasks={upcoming}
        leads={leads}
        onComplete={handleComplete}
        onDelete={handleDelete}
        onSelectLead={onSelectLead}
      />
      <TaskGroup
        title="No Due Date"
        tasks={noDue}
        leads={leads}
        onComplete={handleComplete}
        onDelete={handleDelete}
        onSelectLead={onSelectLead}
      />

      {completed.length > 0 && (
        <details>
          <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 select-none mb-3">
            {completed.length} completed task{completed.length > 1 ? 's' : ''}
          </summary>
          <TaskGroup
            title="Completed"
            tasks={completed}
            leads={leads}
            onComplete={handleComplete}
            onDelete={handleDelete}
            onSelectLead={onSelectLead}
          />
        </details>
      )}
    </div>
  );
}
