import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, getAuthToken, useAuth } from '../api';
import { io } from 'socket.io-client';

const API_BASE = process.env.REACT_APP_API_URL || '';
const SOCKET_URL = API_BASE || (window.location.port === '3000' ? 'http://localhost:3001' : window.location.origin);
const REACTION_OPTIONS = ['❤️', '😂', '🔥', '👏', '😍', '👍', '😮', '😢'];
const EXTRA_REACTION_EMOJIS = [
  '😀', '😃', '😄', '😁', '😅', '🤣', '🙂', '😉', '😊', '😇', '🥰', '😘',
  '😋', '😎', '🤩', '🥳', '😏', '😴', '🤔', '🫡', '🤯', '🥶', '😡', '🤬',
  '😭', '🥹', '😱', '😈', '💀', '👀', '🫶', '🙌', '👌', '🤝', '💪', '🙏',
  '🎉', '✨', '⚡', '🌈', '🌟', '💫', '🍿', '🍕', '☕', '🎵', '🎶', '🏆',
  '⚽', '🏀', '🎮', '🚀', '🧠', '❤️‍🔥', '💯', '✅', '❌', '💌', '💘', '🫠'
];
const MENTION_TAIL_REGEX = /(?:^|\s)@([\p{L}\p{N}_.-]{1,24})$/u;
const MENTION_TOKEN_REGEX = /(@[\p{L}\p{N}_.-]+)/gu;

function Avatar({ user, size = 28 }) {
  const token = getAuthToken();
  if (user?.avatar) {
    return (
      <img
        src={`${API_BASE}/api/profile/avatar/${user.id}?token=${token}`}
        alt={user.username}
        className="interaction-avatar"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="interaction-avatar interaction-avatar-fallback"
      style={{
        width: size,
        height: size,
        background: user?.color || '#6366f1',
      }}
    >
      {(user?.username || '?').slice(0, 1).toUpperCase()}
    </div>
  );
}

function RichTextWithMentions({ content, onMentionClick }) {
  const parts = content.split(MENTION_TOKEN_REGEX);
  return (
    <>
      {parts.map((part, idx) => {
        if (part.startsWith('@')) {
          return (
            <button
              key={`${part}-${idx}`}
              className="comment-mention"
              onClick={() => onMentionClick(part.replace('@', ''))}
            >
              {part}
            </button>
          );
        }
        return <React.Fragment key={`txt-${idx}`}>{part}</React.Fragment>;
      })}
    </>
  );
}

function ReactionGroups({ reactions, currentUserId, onToggle, customReaction, onCustomReactionChange, onAddCustomReaction }) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  return (
    <div className="interactions-section">
      <div className="interactions-title">Reactions</div>

      <div className="reaction-option-row">
        {REACTION_OPTIONS.map((emoji) => (
          <button key={emoji} className="reaction-option-btn" onClick={() => onToggle(emoji)}>
            {emoji}
          </button>
        ))}
      </div>

      <div className="reaction-custom-row">
        <input
          className="reaction-custom-input"
          value={customReaction}
          onChange={(e) => onCustomReactionChange(e.target.value)}
          placeholder="😀"
          maxLength={16}
          inputMode="text"
          aria-label="Custom reaction"
        />
        <button className="btn btn-secondary btn-sm" onClick={onAddCustomReaction} disabled={!customReaction.trim()}>
          Add
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setShowEmojiPicker((s) => !s)}
          title="Open emoji panel"
        >
          😀
        </button>
      </div>

      {showEmojiPicker && (
        <div className="emoji-picker-grid" role="listbox" aria-label="Emoji picker">
          {EXTRA_REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className="emoji-picker-item"
              onClick={() => {
                onToggle(emoji);
                setShowEmojiPicker(false);
              }}
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <div className="reaction-group-list">
        {reactions.length === 0 ? (
          <div className="interactions-empty">No reactions yet.</div>
        ) : (
          reactions.map((group) => {
            const mine = group.users.some((u) => u.id === currentUserId);
            const names = group.users.map((u) => u.username).join(', ');

            return (
              <div className="reaction-group-item" key={group.emoji}>
                <button
                  className={`reaction-chip${mine ? ' active' : ''}`}
                  onClick={() => onToggle(group.emoji)}
                  title={names}
                >
                  <span>{group.emoji}</span>
                  <span>{group.count}</span>
                </button>
                <div className="reaction-user-avatars">
                  {group.users.slice(0, 6).map((u) => (
                    <Avatar key={`${group.emoji}-${u.id}`} user={u} size={18} />
                  ))}
                  {group.users.length > 6 && <span className="reaction-overflow">+{group.users.length - 6}</span>}
                </div>
                <div className="reaction-users">{names}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  replies,
  currentUserId,
  replyingTo,
  replyText,
  repliesExpanded,
  onToggleReplies,
  onReplyStart,
  onReplyCancel,
  onReplyText,
  onSubmitReply,
  onDeleteComment,
  onToggleCommentLike,
  mentionUsers,
  mentionOpen,
  onSelectMention,
  onReplyInputFocus,
  onMentionClick,
}) {
  const isOwner = currentUserId === comment.user_id;

  return (
    <div className="comment-item">
      <div className="comment-head">
        <Avatar user={{ id: comment.user_id, username: comment.username, color: comment.color, avatar: comment.avatar }} size={30} />
        <div className="comment-author-wrap">
          <div className="comment-author" style={comment.color ? { color: comment.color } : undefined}>{comment.username}</div>
          <div className="comment-date">{new Date(comment.created_at).toLocaleString('en-GB')}</div>
        </div>
        {isOwner && (
          <button className="comment-link danger" onClick={() => onDeleteComment(comment.id)}>
            Delete
          </button>
        )}
      </div>

      <div className="comment-content"><RichTextWithMentions content={comment.content} onMentionClick={onMentionClick} /></div>

      <div className="comment-actions">
        <button className={`comment-link${comment.liked_by_me ? ' active' : ''}`} onClick={() => onToggleCommentLike(comment.id, comment.liked_by_me)}>
          {comment.liked_by_me ? 'Unlike' : 'Like'} ({comment.like_count || 0})
        </button>
        <button className="comment-link" onClick={() => onReplyStart(comment.id)}>Reply</button>
        {replies.length > 0 && (
          <button className="comment-link" onClick={() => onToggleReplies(comment.id)}>
            {repliesExpanded ? `Hide replies (${replies.length})` : `Show replies (${replies.length})`}
          </button>
        )}
      </div>

      {replyingTo === comment.id && (
        <div className="reply-editor">
          <textarea
            className="comment-input"
            placeholder="Write a reply..."
            value={replyText}
            onFocus={onReplyInputFocus}
            onChange={(e) => onReplyText(e.target.value)}
            rows={2}
          />
          {mentionOpen && mentionUsers.length > 0 && (
            <div className="mention-dropdown">
              {mentionUsers.map((u) => (
                <button
                  key={`reply-mention-${u.id}`}
                  className="mention-item"
                  onClick={() => onSelectMention(u.username)}
                >
                  <Avatar user={u} size={18} />
                  <span>{u.username}</span>
                </button>
              ))}
            </div>
          )}
          <div className="reply-editor-actions">
            <button className="btn btn-secondary btn-sm" onClick={onReplyCancel}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={() => onSubmitReply(comment.id)} disabled={!replyText.trim()}>
              Reply
            </button>
          </div>
        </div>
      )}

      {repliesExpanded && replies.length > 0 && (
        <div className="reply-list">
          {replies.map((reply) => {
            const canDeleteReply = currentUserId === reply.user_id;
            return (
              <div className="reply-item" key={reply.id}>
                <div className="comment-head">
                  <Avatar user={{ id: reply.user_id, username: reply.username, color: reply.color, avatar: reply.avatar }} size={24} />
                  <div className="comment-author-wrap">
                    <div className="comment-author" style={reply.color ? { color: reply.color } : undefined}>{reply.username}</div>
                    <div className="comment-date">{new Date(reply.created_at).toLocaleString('en-GB')}</div>
                  </div>
                  <button className={`comment-link${reply.liked_by_me ? ' active' : ''}`} onClick={() => onToggleCommentLike(reply.id, reply.liked_by_me)}>
                    {reply.liked_by_me ? 'Unlike' : 'Like'} ({reply.like_count || 0})
                  </button>
                  {canDeleteReply && (
                    <button className="comment-link danger" onClick={() => onDeleteComment(reply.id)}>
                      Delete
                    </button>
                  )}
                </div>
                <div className="comment-content"><RichTextWithMentions content={reply.content} onMentionClick={onMentionClick} /></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FileInteractionsPanel({ fileId }) {
  const { user } = useAuth();
  const currentUserId = user?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reactions, setReactions] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [expanded, setExpanded] = useState({});
  const [mentionMode, setMentionMode] = useState('comment');
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionUsers, setMentionUsers] = useState([]);
  const [profileCard, setProfileCard] = useState(null);
  const [customReaction, setCustomReaction] = useState('');

  const pollingRef = useRef(null);
  const searchTimerRef = useRef(null);
  const socketRef = useRef(null);

  const fetchingRef = useRef(false);

  const fetchInteractions = useCallback(async (isInitial = false) => {
    // Prevent concurrent fetch requests
    if (fetchingRef.current && !isInitial) return;
    fetchingRef.current = true;
    if (isInitial) setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/api/files/${fileId}/interactions`);
      setReactions(data.reactions || []);
      setComments(data.comments || []);
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not load interactions');
    } finally {
      if (isInitial) setLoading(false);
      fetchingRef.current = false;
    }
  }, [fileId]);

  useEffect(() => {
    fetchInteractions(true);

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      // The server only lets authenticated sockets join file rooms.
      socket.emit('auth', getAuthToken());
      socket.emit('join_file', fileId);
    });

    socket.on('file_interactions_updated', (payload) => {
      if (payload?.fileId === fileId) {
        fetchInteractions(false);
      }
    });

    // Fallback polling when websocket is blocked by proxy/network.
    pollingRef.current = setInterval(() => {
      fetchInteractions(false);
    }, 12000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (socketRef.current) {
        socketRef.current.emit('leave_file', fileId);
        socketRef.current.disconnect();
      }
    };
  }, [fileId, fetchInteractions]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!mentionQuery) {
      setMentionUsers([]);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/api/profile/users', { params: { search: mentionQuery, limit: 8 } });
        setMentionUsers(data.users || []);
      } catch {
        setMentionUsers([]);
      }
    }, 180);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [mentionQuery]);

  const commentTree = useMemo(() => {
    const top = [];
    const replyMap = {};

    for (const c of comments) {
      if (c.parent_comment_id) {
        if (!replyMap[c.parent_comment_id]) replyMap[c.parent_comment_id] = [];
        replyMap[c.parent_comment_id].push(c);
      } else {
        top.push(c);
      }
    }

    return { top, replyMap };
  }, [comments]);

  const toggleReaction = async (emoji) => {
    try {
      const mine = reactions
        .find((g) => g.emoji === emoji)
        ?.users?.some((u) => u.id === currentUserId);

      const res = mine
        ? await api.delete(`/api/files/${fileId}/reactions/${encodeURIComponent(emoji)}`)
        : await api.post(`/api/files/${fileId}/reactions`, { emoji });

      setReactions(res.data.reactions || []);
    } catch (err) {
      alert(err?.response?.data?.error || 'Reaction failed');
    }
  };

  const addCustomReaction = async () => {
    const emoji = customReaction.trim();
    if (!emoji) return;
    await toggleReaction(emoji);
    setCustomReaction('');
  };

  const submitComment = async () => {
    const content = commentText.trim();
    if (!content) return;

    try {
      const { data } = await api.post(`/api/files/${fileId}/comments`, { content });
      setComments((prev) => [...prev, data.comment]);
      setCommentText('');
      setMentionQuery('');
    } catch (err) {
      alert(err?.response?.data?.error || 'Could not add comment');
    }
  };

  const submitReply = async (parentId) => {
    const content = replyText.trim();
    if (!content) return;

    try {
      const { data } = await api.post(`/api/files/${fileId}/comments`, {
        content,
        parentCommentId: parentId,
      });
      setComments((prev) => [...prev, data.comment]);
      setReplyText('');
      setReplyingTo(null);
      setMentionQuery('');
      setExpanded((prev) => ({ ...prev, [parentId]: true }));
    } catch (err) {
      alert(err?.response?.data?.error || 'Could not add reply');
    }
  };

  const updateMentionState = (text, mode) => {
    const match = text.match(MENTION_TAIL_REGEX);
    setMentionMode(mode);
    setMentionQuery(match?.[1] || '');
  };

  const applyMention = (username) => {
    const targetSetter = mentionMode === 'reply' ? setReplyText : setCommentText;
    const targetText = mentionMode === 'reply' ? replyText : commentText;
    const replaced = targetText.replace(MENTION_TAIL_REGEX, (full, _capture) => full.replace(/@[\p{L}\p{N}_.-]{1,24}$/u, `@${username} `));
    targetSetter(replaced);
    setMentionQuery('');
  };

  const toggleCommentLike = async (commentId, likedByMe) => {
    try {
      const { data } = likedByMe
        ? await api.delete(`/api/files/${fileId}/comments/${commentId}/like`)
        : await api.post(`/api/files/${fileId}/comments/${commentId}/like`);

      setComments((prev) => prev.map((c) => (
        c.id === commentId
          ? { ...c, like_count: data.likeCount, liked_by_me: data.likedByMe ? 1 : 0 }
          : c
      )));
    } catch (err) {
      alert(err?.response?.data?.error || 'Could not update like');
    }
  };

  const openMentionProfile = async (username) => {
    try {
      const { data } = await api.get(`/api/profile/by-username/${encodeURIComponent(username)}`);
      setProfileCard(data.user || null);
    } catch {
      alert('User profile not found');
    }
  };

  const deleteComment = async (commentId) => {
    try {
      await api.delete(`/api/files/${fileId}/comments/${commentId}`);
      fetchInteractions();
    } catch (err) {
      alert(err?.response?.data?.error || 'Could not delete comment');
    }
  };

  if (loading) {
    return (
      <aside className="file-interactions-panel">
        <div className="interaction-loader"><div className="spinner" /></div>
      </aside>
    );
  }

  if (error) {
    return (
      <aside className="file-interactions-panel">
        <div className="interactions-empty">{error}</div>
      </aside>
    );
  }

  return (
    <aside className="file-interactions-panel">
      {profileCard && (
        <div className="mention-profile-card">
          <div className="mention-profile-head">
            <Avatar user={profileCard} size={34} />
            <div className="mention-profile-meta">
              <div className="mention-profile-name" style={profileCard.color ? { color: profileCard.color } : undefined}>{profileCard.username}</div>
              <div className="mention-profile-date">Joined: {new Date(profileCard.created_at).toLocaleDateString('en-GB')}</div>
            </div>
            <button className="btn btn-ghost" onClick={() => setProfileCard(null)} style={{ padding: 4 }}>✕</button>
          </div>
          {profileCard.email && <div className="mention-profile-line">Email: {profileCard.email}</div>}
          {profileCard.phone && <div className="mention-profile-line">Phone: {profileCard.phone}</div>}
        </div>
      )}

      <ReactionGroups
        reactions={reactions}
        currentUserId={currentUserId}
        onToggle={toggleReaction}
        customReaction={customReaction}
        onCustomReactionChange={setCustomReaction}
        onAddCustomReaction={addCustomReaction}
      />

      <div className="interactions-section comments-section">
        <div className="interactions-title">Comments</div>
        <div className="comment-editor">
          <textarea
            className="comment-input"
            value={commentText}
            onFocus={() => setMentionMode('comment')}
            onChange={(e) => {
              setCommentText(e.target.value);
              updateMentionState(e.target.value, 'comment');
            }}
            placeholder="Write a comment..."
            rows={3}
          />
          {mentionMode === 'comment' && mentionQuery && mentionUsers.length > 0 && (
            <div className="mention-dropdown">
              {mentionUsers.map((u) => (
                <button
                  key={`comment-mention-${u.id}`}
                  className="mention-item"
                  onClick={() => applyMention(u.username)}
                >
                  <Avatar user={u} size={18} />
                  <span>{u.username}</span>
                </button>
              ))}
            </div>
          )}
          <div className="comment-editor-actions">
            <button className="btn btn-primary btn-sm" onClick={submitComment} disabled={!commentText.trim()}>
              Send
            </button>
          </div>
        </div>

        <div className="comment-list">
          {commentTree.top.length === 0 ? (
            <div className="interactions-empty">No comments yet.</div>
          ) : (
            commentTree.top.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                replies={commentTree.replyMap[comment.id] || []}
                currentUserId={currentUserId}
                replyingTo={replyingTo}
                replyText={replyText}
                repliesExpanded={expanded[comment.id] !== false}
                onToggleReplies={(id) => setExpanded((prev) => ({ ...prev, [id]: prev[id] === false ? true : false }))}
                onReplyStart={(id) => {
                  setReplyingTo(id);
                  setReplyText('');
                  setExpanded((prev) => ({ ...prev, [id]: true }));
                }}
                onReplyCancel={() => {
                  setReplyingTo(null);
                  setReplyText('');
                  setMentionQuery('');
                }}
                onReplyText={(text) => {
                  setReplyText(text);
                  updateMentionState(text, 'reply');
                }}
                onSubmitReply={submitReply}
                onDeleteComment={deleteComment}
                onToggleCommentLike={toggleCommentLike}
                mentionUsers={mentionUsers}
                mentionOpen={mentionMode === 'reply' && !!mentionQuery}
                onSelectMention={applyMention}
                onReplyInputFocus={() => setMentionMode('reply')}
                onMentionClick={openMentionProfile}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
