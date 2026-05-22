'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [adminCode, setAdminCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        tab === 'login'
          ? { username, password }
          : { username, password, role, adminCode: role === 'user' ? adminCode : undefined };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '오류가 발생했습니다.');
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      localStorage.setItem('role', data.role);

      router.push(data.role === 'admin' ? '/admin' : '/chat');
    } catch {
      setError('서버 연결에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="logo">
              <i className="fa-solid fa-brain-circuit neon-glow"></i>
              <span>SLE Agent</span>
            </div>
            <p className="auth-subtitle">AI 기반 사내 규정 탐색 시스템</p>
          </div>

          <div className="auth-tabs">
            <button
              className={`auth-tab${tab === 'login' ? ' active' : ''}`}
              onClick={() => { setTab('login'); setError(''); }}
            >
              로그인
            </button>
            <button
              className={`auth-tab${tab === 'register' ? ' active' : ''}`}
              onClick={() => { setTab('register'); setError(''); }}
            >
              회원가입
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="form-error">{error}</div>}

            <div className="form-group">
              <label>아이디</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="아이디를 입력하세요"
                required
              />
            </div>

            <div className="form-group">
              <label>비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                required
              />
            </div>

            {tab === 'register' && (
              <>
                <div className="form-group">
                  <label>역할</label>
                  <div className="role-selector">
                    <label className="role-option">
                      <input
                        type="radio"
                        name="role"
                        value="user"
                        checked={role === 'user'}
                        onChange={() => setRole('user')}
                      />
                      <div className="role-card">
                        <i className="fa-solid fa-user"></i>
                        <span>일반 사용자</span>
                      </div>
                    </label>
                    <label className="role-option">
                      <input
                        type="radio"
                        name="role"
                        value="admin"
                        checked={role === 'admin'}
                        onChange={() => setRole('admin')}
                      />
                      <div className="role-card">
                        <i className="fa-solid fa-shield-halved"></i>
                        <span>관리자</span>
                      </div>
                    </label>
                  </div>
                </div>

                {role === 'user' && (
                  <div className="form-group">
                    <label>관리자 코드</label>
                    <input
                      type="text"
                      value={adminCode}
                      onChange={e => setAdminCode(e.target.value)}
                      placeholder="관리자로부터 받은 코드를 입력하세요"
                    />
                    <p className="form-hint">관리자 코드가 없으면 독립 계정으로 가입됩니다.</p>
                  </div>
                )}
              </>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading}
            >
              {loading
                ? (tab === 'login' ? '로그인 중...' : '가입 중...')
                : (tab === 'login' ? '로그인' : '회원가입')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
