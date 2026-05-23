'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch, getUsername, logout } from '@/lib/client-auth';

interface PathStep {
  name: string;
  type: 'folder' | 'file';
  found: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  source?: string;
  pathTaken?: PathStep[];
  thinking?: boolean;
}

interface ConvHistory {
  role: 'user' | 'assistant';
  content: string;
  source?: string;
}

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '안녕하세요! 사내 규정 탐색 에이전트입니다.\n\n궁금한 규정 사항을 자유롭게 질문해 주세요.\n관련 조항과 출처를 함께 안내해 드립니다.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ConvHistory[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const username = typeof window !== 'undefined' ? getUsername() : '';

  useEffect(() => {
    const role = localStorage.getItem('role');
    if (!role) router.push('/');
  }, [router]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  function resetChat() {
    setHistory([]);
    setMessages([{
      role: 'assistant',
      content: '대화가 초기화되었습니다. 새로운 질문을 입력해 주세요.',
    }]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;
    setInput('');
    setLoading(true);

    setMessages(prev => [
      ...prev,
      { role: 'user', content: question },
      { role: 'assistant', content: '', thinking: true },
    ]);

    try {
      const res = await authFetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversation_history: history }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`서버 오류: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalData: { answer?: string; source?: string; path_taken?: PathStep[] } = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'progress') {
              setMessages(prev => prev.map(m =>
                m.thinking
                  ? { ...m, content: event.message }
                  : m
              ));
            } else if (event.type === 'done') {
              finalData = event;
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }

      const answer = finalData.answer || '답변을 가져오지 못했습니다.';
      setMessages(prev => [
        ...prev.filter(m => !m.thinking),
        {
          role: 'assistant',
          content: answer,
          source: finalData.source,
          pathTaken: finalData.path_taken,
        },
      ]);

      const newHistory: ConvHistory[] = [
        ...history,
        { role: 'user', content: question },
        { role: 'assistant', content: answer, source: finalData.source },
      ];
      setHistory(newHistory.slice(-20));
    } catch (err) {
      setMessages(prev => [
        ...prev.filter(m => !m.thinking),
        { role: 'assistant', content: '오류가 발생했습니다: ' + String(err) },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function renderBreadcrumb(steps: PathStep[]) {
    const folders = steps.filter(s => s.type === 'folder');
    const files = steps.filter(s => s.type === 'file');
    const parts: React.ReactNode[] = [];

    folders.forEach((f, i) => {
      if (i === 0) parts.push(<i key={`fi${i}`} className="fa-solid fa-folder bc-folder-icon" />);
      else parts.push(<span key={`sep${i}`} className="bc-sep">/</span>);
      parts.push(<span key={`fn${i}`} className="bc-name">{f.name}</span>);
    });

    if (files.length > 0) {
      parts.push(<span key="filesep" className="bc-sep">/</span>);
      parts.push(<i key="fileicon" className="fa-solid fa-file-lines bc-file-icon" />);
      files.forEach((f, i) => {
        if (i > 0) parts.push(<span key={`comma${i}`} className="bc-file-sep">,</span>);
        parts.push(<span key={`ff${i}`} className="bc-name bc-file-name">{f.name}</span>);
      });
    }

    return parts;
  }

  function escapeHtml(str: string) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  return (
    <div className="chat-layout">
      <header className="chat-header">
        <div className="chat-header-left">
          <div className="logo">
            <i className="fa-solid fa-brain-circuit neon-glow"></i>
            <span>SLE Agent</span>
          </div>
          <div className="status-indicator online"></div>
          <div>
            <span className="chat-title">AI 사내 규정 탐색</span>
            <span className="header-username" style={{ marginLeft: 8 }}>{username}</span>
          </div>
        </div>
        <div className="chat-header-right">
          <button className="btn btn-icon" title="대화 초기화" onClick={resetChat}>
            <i className="fa-solid fa-rotate-right"></i>
          </button>
          <button className="btn btn-outline btn-sm" onClick={logout}>
            <i className="fa-solid fa-right-from-bracket"></i> 로그아웃
          </button>
        </div>
      </header>

      <section className="chat-feed" ref={feedRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}${msg.thinking ? ' thinking' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="message-avatar"><i className="fa-solid fa-robot"></i></div>
            )}
            <div className="message-bubble-wrapper">
              <div
                className="message-bubble"
                dangerouslySetInnerHTML={{
                  __html: msg.thinking
                    ? `<span class="dot-flashing"></span>${msg.content ? `<span class="progress-text"> ${escapeHtml(msg.content)}</span>` : ''}`
                    : escapeHtml(msg.content).replace(/\n/g, '<br>'),
                }}
              />
              {msg.pathTaken && msg.pathTaken.length > 0 && (
                <div className="msg-breadcrumb">
                  {renderBreadcrumb(msg.pathTaken)}
                </div>
              )}
            </div>
          </div>
        ))}
      </section>

      <footer className="chat-footer">
        <form className="chat-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="예: 2박 3일로 부산 출장을 가야하는데, 여비 지급 기준이나 금액이 어떻게 되나요?"
            autoComplete="off"
            disabled={loading}
          />
          <button type="submit" className="btn btn-send-icon" disabled={loading || !input.trim()}>
            <i className="fa-solid fa-paper-plane"></i>
          </button>
        </form>
      </footer>
    </div>
  );
}
