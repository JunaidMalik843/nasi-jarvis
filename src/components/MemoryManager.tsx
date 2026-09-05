import { useState, useCallback } from 'react';
import {
  Database,
  Trash2,
  ShieldCheck,
  Brain,
  Tag,
  Clock,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react';
import type { Memory } from '../lib/storage';

interface MemoryManagerProps {
  memories: Memory[];
  onDelete: (id: string) => void;
  onClear: () => void;
  loading?: boolean;
}

function CategoryIcon({ category }: { category: string }) {
  switch (category.toLowerCase()) {
    case 'preference':
      return <span className="memory-category-icon preference">⚙</span>;
    case 'task':
      return <span className="memory-category-icon task">✓</span>;
    case 'project':
      return <span className="memory-category-icon project">◆</span>;
    case 'fact':
      return <span className="memory-category-icon fact">●</span>;
    default:
      return <span className="memory-category-icon info">◉</span>;
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getImportanceLabel(importance: number): string {
  if (importance >= 8) return 'High';
  if (importance >= 5) return 'Medium';
  return 'Low';
}

export function MemoryManager({ memories, onDelete, onClear, loading }: MemoryManagerProps) {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = memories.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.key.toLowerCase().includes(q) ||
      m.value.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q)
    );
  });

  const grouped = filtered.reduce(
    (acc, m) => {
      const cat = m.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(m);
      return acc;
    },
    {} as Record<string, Memory[]>,
  );

  return (
    <div className="memory-manager">
      <div className="memory-manager-header">
        <div className="memory-manager-title">
          <Brain size={12} />
          <span>Long-Term Memory</span>
          <span className="memory-count">{memories.length}</span>
        </div>
        <div className="memory-manager-actions">
          <button
            className="memory-clear-btn"
            onClick={onClear}
            disabled={memories.length === 0}
            title="Clear all memories"
          >
            <Trash2 size={10} /> Clear all
          </button>
        </div>
      </div>

      <div className="memory-manager-search">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search memories..."
          className="memory-search-input"
        />
      </div>

      <div className="memory-notice">
        <ShieldCheck size={11} />
        <span>
          Memories are stored locally and can be inspected or deleted at any time.
          NASI only remembers what you explicitly ask it to.
        </span>
      </div>

      {filtered.length === 0 && !loading ? (
        <div className="memory-empty">
          <Database size={24} />
          <span>No memories saved yet</span>
          <span className="memory-empty-hint">
            Say "Remember that…" to save something important
          </span>
        </div>
      ) : (
        <div className="memory-groups">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="memory-group">
              <div className="memory-group-header">
                <CategoryIcon category={category} />
                <span className="memory-group-title">{category}</span>
                <span className="memory-group-count">{items.length}</span>
              </div>
              <div className="memory-items">
                {items.map((memory) => {
                  const isExpanded = expandedId === memory.id;
                  return (
                    <div key={memory.id} className={`memory-item ${isExpanded ? 'expanded' : ''}`}>
                      <div
                        className="memory-item-main"
                        onClick={() => setExpandedId(isExpanded ? null : memory.id)}
                      >
                        <div className="memory-item-left">
                          <CategoryIcon category={memory.category} />
                          <div className="memory-item-content">
                            <div className="memory-item-key">{memory.key}</div>
                            <div className="memory-item-value">{memory.value}</div>
                          </div>
                        </div>
                        <div className="memory-item-right">
                          <div className="memory-importance">
                            <span
                              className={`importance-badge ${getImportanceLevel(memory.importance)}`}
                            >
                              {memory.importance}/10
                            </span>
                            <span className="importance-label">{getImportanceLabel(memory.importance)}</span>
                          </div>
                          <button
                            className="memory-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(memory.id);
                            }}
                            title={`Delete "${memory.key}"`}
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="memory-item-details">
                          <div className="memory-detail-row">
                            <Clock size={10} />
                            <span>Created {formatTime(memory.createdAt)}</span>
                            {memory.sourceConversationId && (
                              <span className="memory-source">
                                <MessageSquare size={10} />
                                From conversation
                              </span>
                            )}
                          </div>
                          <div className="memory-detail-meta">
                            <Tag size={9} />
                            <span>Category: {memory.category}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && <div className="memory-loading"><span className="loading-dot" /> Loading…</div>}
    </div>
  );
}

function getImportanceLevel(importance: number): string {
  if (importance >= 8) return 'high';
  if (importance >= 5) return 'medium';
  return 'low';
}
