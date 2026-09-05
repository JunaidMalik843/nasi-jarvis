import { useState, useCallback } from 'react';
import {
  MessageSquare,
  Plus,
  Trash2,
  Clock,
  ChevronRight,
  Archive,
  User,
} from 'lucide-react';
import type { Conversation } from '../lib/storage';

interface ConversationManagerProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onNewConversation: () => void;
  loading?: boolean;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return `${days} days ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

export function ConversationManager({
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  onDelete,
  onNewConversation,
  loading,
}: ConversationManagerProps) {
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.messages.some((m) => m.text.toLowerCase().includes(q))
    );
  });

  function handleDelete(id: string) {
    if (confirmDelete === id) {
      onDelete(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  }

  return (
    <div className="conversation-manager">
      <div className="conversation-manager-header">
        <div className="conversation-manager-title">
          <MessageSquare size={12} />
          <span>Conversations</span>
          <span className="conversation-count">{conversations.length}</span>
        </div>
        <div className="conversation-manager-actions">
          <button className="conversation-new-btn" onClick={onCreate} title="New conversation">
            <Plus size={12} /> New
          </button>
        </div>
      </div>

      <div className="conversation-manager-search">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations..."
          className="conversation-search-input"
        />
      </div>

      <div className="conversation-list">
        {filtered.length === 0 && !loading ? (
          <div className="conversation-empty">
            <Archive size={20} />
            <span>No conversations yet</span>
            <button className="conversation-empty-btn" onClick={onCreate}>
              <Plus size={11} /> Start one
            </button>
          </div>
        ) : (
          filtered.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const lastMsg = conv.messages[conv.messages.length - 1];
            const preview = lastMsg ? lastMsg.text.slice(0, 50) : '';
            const msgCount = conv.messages.length;

            return (
              <div
                key={conv.id}
                className={`conversation-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelect(conv.id)}
              >
                <div className="conversation-item-main">
                  <div className="conversation-item-title">
                    <span className="conversation-title-text">{conv.title}</span>
                    <span className="conversation-meta">
                      <Clock size={8} />
                      {formatTime(conv.updatedAt)}
                    </span>
                  </div>
                  {preview && (
                    <div className="conversation-preview">
                      <span>{preview}</span>
                      {!lastMsg?.text.endsWith('…') && preview.length >= 50 && (
                        <span className="preview-ellipsis">…</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="conversation-item-footer">
                  <span className="conversation-msg-count">
                    <User size={8} /> {msgCount} msgs
                  </span>
                  <div className={`conversation-delete ${confirmDelete === conv.id ? 'confirming' : ''}`}>
                    <button
                      className="conversation-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(conv.id);
                      }}
                      title={confirmDelete === conv.id ? 'Confirm delete' : 'Delete conversation'}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
                {isActive && <div className="conversation-active-indicator" />}
              </div>
            );
          })
        )}
      </div>

      {loading && <div className="conversation-loading"><span className="loading-dot" /> Loading…</div>}
    </div>
  );
}
