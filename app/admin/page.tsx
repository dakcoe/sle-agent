'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch, getToken, getUsername, logout } from '@/lib/client-auth';
import { showToast, registerToast, unregisterToast } from '@/lib/toast';

// ─── Types ─────────────────────────────────────────────────────────────
interface TreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children?: TreeNode[];
}

interface UserRow {
  id: number;
  username: string;
  is_blocked: boolean;
  created_at: string;
}

type Panel = 'docs' | 'files' | 'users';

// ─── Component ─────────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>('docs');

  useEffect(() => {
    const role = localStorage.getItem('role');
    if (!role) { router.push('/'); return; }
    if (role !== 'admin') { router.push('/chat'); }
  }, [router]);

  return (
    <div className="admin-page">
      <AdminHeader />
      <div className="admin-layout">
        <AdminNav panel={panel} setPanel={setPanel} />
        <main className="admin-content">
          {panel === 'docs' && <DocsPanel />}
          {panel === 'files' && <FilesPanel />}
          {panel === 'users' && <UsersPanel />}
        </main>
      </div>
      <Toast />
    </div>
  );
}

// ─── Toast ─────────────────────────────────────────────────────────────
function Toast() {
  const [items, setItems] = useState<Array<{ id: number; msg: string; type: string; show: boolean }>>([]);
  const counter = useRef(0);

  useEffect(() => {
    registerToast((msg, type = 'success') => {
      const id = ++counter.current;
      setItems(prev => [...prev, { id, msg, type, show: false }]);
      setTimeout(() => setItems(prev => prev.map(i => i.id === id ? { ...i, show: true } : i)), 10);
      setTimeout(() => setItems(prev => prev.filter(i => i.id !== id)), 3000);
    });
    return () => { unregisterToast(); };
  }, []);

  return (
    <div id="toast-container">
      {items.map(item => (
        <div key={item.id} className={`toast toast-${item.type}${item.show ? ' show' : ''}`}>
          <i className={`fa-solid ${item.type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}`}></i>
          {item.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Header ────────────────────────────────────────────────────────────
function AdminHeader() {
  const username = typeof window !== 'undefined' ? getUsername() : '';

  function copyCode() {
    navigator.clipboard.writeText(username || '');
    showToast('아이디가 복사되었습니다 (접속 코드로 사용)');
  }

  return (
    <header className="admin-header">
      <div className="admin-header-left">
        <div className="logo">
          <i className="fa-solid fa-brain-circuit neon-glow"></i>
          <span>SLE Agent</span>
        </div>
        <span className="header-sep">|</span>
        <span className="header-username">{username}</span>
      </div>
      <div className="admin-header-right">
        <div className="admin-code-display">
          <span className="code-label">접속 코드</span>
          <span className="code-badge">{username}</span>
          <button className="btn btn-icon" title="코드 복사" onClick={copyCode}>
            <i className="fa-regular fa-copy"></i>
          </button>
        </div>
        <button className="btn btn-outline btn-sm" onClick={logout}>
          <i className="fa-solid fa-right-from-bracket"></i> 로그아웃
        </button>
      </div>
    </header>
  );
}

// ─── Nav ───────────────────────────────────────────────────────────────
function AdminNav({ panel, setPanel }: { panel: Panel; setPanel: (p: Panel) => void }) {
  return (
    <nav className="admin-nav">
      {(['docs', 'files', 'users'] as Panel[]).map(p => {
        const icons: Record<Panel, string> = {
          docs: 'fa-file-arrow-up',
          files: 'fa-folder-open',
          users: 'fa-users',
        };
        const labels: Record<Panel, string> = {
          docs: '문서 관리',
          files: '파일 매니저',
          users: '사용자 관리',
        };
        return (
          <button
            key={p}
            className={`nav-item${panel === p ? ' active' : ''}`}
            onClick={() => setPanel(p)}
          >
            <i className={`fa-solid ${icons[p]}`}></i>
            <span>{labels[p]}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ─── Docs Panel ────────────────────────────────────────────────────────
function DocsPanel() {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [serverFiles, setServerFiles] = useState<string[]>([]);
  const [categoryDraft, setCategoryDraft] = useState<TreeNode[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [progress, setProgress] = useState<{ pct: number; msg: string } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalTree, setModalTree] = useState<TreeNode[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadServerFiles();
    loadCurrentCategories();
  }, []);

  async function loadServerFiles() {
    try {
      const res = await authFetch('/api/upload/list');
      const data = await res.json();
      setServerFiles(data.files || []);
    } catch { setServerFiles([]); }
  }

  async function loadCurrentCategories() {
    try {
      const res = await authFetch('/api/categories');
      const data = await res.json();
      if (data.tree?.length) setCategoryDraft(data.tree);
    } catch { /* ignore */ }
  }

  function handleFiles(files: File[]) {
    const allowed = ['pdf', 'docx', 'txt'];
    const toAdd: File[] = [];
    for (const f of files) {
      const ext = f.name.split('.').pop()?.toLowerCase();
      if (!ext || !allowed.includes(ext)) continue;
      if (pendingFiles.find(u => u.name === f.name)) continue;
      if (serverFiles.includes(f.name)) {
        if (!confirm(`"${f.name}" 은(는) 이미 서버에 업로드된 파일입니다.\n다시 가공을 진행하시겠습니까?`)) continue;
      }
      toAdd.push(f);
    }
    setPendingFiles(prev => [...prev, ...toAdd]);
  }

  async function runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<void>
  ) {
    let idx = 0;
    async function worker() {
      while (idx < items.length) {
        const i = idx++;
        await fn(items[i], i);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  }

  async function handleAnalyze() {
    if (!pendingFiles.length) return;
    setAnalyzing(true);
    setAnalyzeProgress({ done: 0, total: pendingFiles.length, current: '업로드 중...' });
    try {
      // Upload all files (5 in parallel)
      await runWithConcurrency(pendingFiles, 5, async (f) => {
        const form = new FormData();
        form.append('file', f);
        const res = await authFetch('/api/upload', { method: 'POST', body: form });
        if (!res.ok) throw new Error(`업로드 실패: ${f.name}`);
      });

      // Analyze each file (3 in parallel to avoid rate limits)
      const trees: TreeNode[][] = new Array(pendingFiles.length).fill(null);
      let done = 0;
      await runWithConcurrency(pendingFiles, 3, async (f, i) => {
        setAnalyzeProgress({ done, total: pendingFiles.length, current: f.name });
        const res = await authFetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: f.name }),
        });
        const data = await res.json();
        trees[i] = data.tree || [];
        done++;
        setAnalyzeProgress({ done, total: pendingFiles.length, current: f.name });
      });

      // Merge all trees into one
      const validTrees = trees.filter(t => t?.length);
      const mergeRes = await authFetch('/api/analyze/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trees: validTrees, filenames: pendingFiles.map(f => f.name) }),
      });
      const merged = await mergeRes.json();
      const tree = merged.tree || [];
      setCategoryDraft(tree);
      setModalTree(deepClone(tree));
      setShowModal(true);
      await loadServerFiles();
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setAnalyzing(false);
      setAnalyzeProgress(null);
    }
  }

  function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  async function handleConfirm(editedTree: TreeNode[]) {
    setShowModal(false);
    setCategoryDraft(editedTree);
    try {
      await authFetch('/api/categories/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tree: editedTree }),
      });
      startProcessing(editedTree);
    } catch (err) {
      showToast('카테고리 확정 실패: ' + String(err), 'error');
    }
  }

  function startProcessing(tree: TreeNode[]) {
    void tree;
    setProgress({ pct: 0, msg: '처리 시작...' });
    const token = getToken();
    const filenames = pendingFiles.map(f => f.name);
    let idx = 0;

    function processNext() {
      if (idx >= filenames.length) {
        setProgress({ pct: 100, msg: '완료!' });
        showToast('문서 처리가 완료되었습니다');
        setPendingFiles([]);
        loadServerFiles();
        return;
      }
      const filename = filenames[idx];
      const pct = Math.round((idx / filenames.length) * 100);
      setProgress({ pct, msg: `처리 중: ${filename}` });

      const es = new EventSource(`/api/process?filename=${encodeURIComponent(filename)}&token=${token}`);
      es.onmessage = (e) => {
        const d = JSON.parse(e.data);
        if (d.type === 'progress') setProgress({ pct, msg: d.message });
        if (d.type === 'done' || d.type === 'error') {
          es.close();
          if (d.type === 'error') showToast(d.message, 'error');
          idx++;
          processNext();
        }
      };
      es.onerror = () => { es.close(); idx++; processNext(); };
    }

    processNext();
  }

  return (
    <section className="admin-panel">
      <h2 className="panel-title"><i className="fa-solid fa-file-arrow-up"></i> 문서 관리</h2>

      <div className="card">
        <h3 className="card-title">파일 업로드</h3>
        <div
          className="drop-zone"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add('dragover'); }}
          onDragLeave={e => (e.currentTarget as HTMLElement).classList.remove('dragover')}
          onDrop={e => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.remove('dragover'); handleFiles(Array.from(e.dataTransfer.files)); }}
        >
          <i className="fa-solid fa-cloud-arrow-up cloud-icon"></i>
          <p>PDF, DOCX, TXT 파일을 끌어오거나 클릭하세요</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt"
            style={{ display: 'none' }}
            onChange={e => handleFiles(Array.from(e.target.files || []))}
          />
        </div>

        <div className="file-list">
          {pendingFiles.map((f, i) => (
            <div key={i} className="file-item">
              <i className="fa-solid fa-file"></i>
              <span>{f.name}</span>
              <button className="btn btn-icon btn-sm" onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          ))}

          {serverFiles.length > 0 && (
            <div className="server-files-section">
              <div className="server-files-label">
                <i className="fa-solid fa-cloud-arrow-up"></i> 서버에 저장된 파일
              </div>
              {serverFiles.map(name => (
                <div key={name} className="file-item file-item-server">
                  <i className="fa-solid fa-file-check"></i>
                  <span>{name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="btn btn-primary" disabled={analyzing || pendingFiles.length === 0} onClick={handleAnalyze}>
          {analyzing
            ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                {analyzeProgress
                  ? ` 분석 중... (${analyzeProgress.done}/${analyzeProgress.total})`
                  : ' 분석 중...'}
              </>
            )
            : <><i className="fa-solid fa-magnifying-glass-chart"></i> 카테고리 초안 분석</>
          }
        </button>
        {analyzing && analyzeProgress && (
          <div className="analyze-progress-hint">
            <i className="fa-solid fa-file-lines"></i> {analyzeProgress.current}
          </div>
        )}
      </div>

      {progress && (
        <div className="card">
          <div className="progress-title">
            <span>문서 분류 및 가공 중...</span>
            <span>{progress.pct}%</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progress.pct}%` }}></div>
          </div>
          <div className="progress-file">{progress.msg}</div>
        </div>
      )}

      <div className="card">
        <div className="card-title-row">
          <h3 className="card-title"><i className="fa-solid fa-folder-tree"></i> 카테고리 구조</h3>
          {categoryDraft.length > 0 && (
            <button className="btn btn-outline btn-sm" onClick={() => { setModalTree(JSON.parse(JSON.stringify(categoryDraft))); setShowModal(true); }}>
              <i className="fa-solid fa-check-double"></i> 구조 확정
            </button>
          )}
        </div>
        {categoryDraft.length > 0
          ? <TreePreview nodes={categoryDraft} depth={0} />
          : (
            <div className="empty-state">
              <i className="fa-solid fa-diagram-predecessor"></i>
              <p>문서를 업로드하고 분석하면 카테고리 구조가 표시됩니다.</p>
            </div>
          )
        }
      </div>

      {showModal && (
        <CategoryModal
          tree={modalTree}
          onChange={setModalTree}
          onClose={() => setShowModal(false)}
          onConfirm={() => handleConfirm(modalTree)}
        />
      )}
    </section>
  );
}

function TreePreview({ nodes, depth }: { nodes: TreeNode[]; depth: number }) {
  return (
    <>
      {nodes.map((node, i) => (
        <div key={i}>
          {node.children?.length
            ? (
              <div className="cat-item" style={{ marginLeft: depth * 14 }}>
                <div className="cat-name"><i className="fa-solid fa-folder"></i> {node.name}</div>
                <TreePreview nodes={node.children} depth={depth + 1} />
              </div>
            )
            : (
              <div className="cat-leaf" style={{ marginLeft: depth * 14 }}>
                <span className="sub-tag"><i className="fa-solid fa-file-lines"></i> {node.name}</span>
              </div>
            )
          }
        </div>
      ))}
    </>
  );
}

function CategoryModal({
  tree, onChange, onClose, onConfirm,
}: {
  tree: TreeNode[];
  onChange: (t: TreeNode[]) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  function updateName(node: TreeNode, value: string) {
    node.name = value;
    onChange(JSON.parse(JSON.stringify(tree)));
  }

  function renderNodes(nodes: TreeNode[], depth: number) {
    return nodes.map((node, i) => (
      <div key={i} className="modal-tree-item">
        <div className="modal-tree-row" style={{ paddingLeft: depth * 18 }}>
          <i className={`fa-solid ${node.children?.length ? 'fa-folder' : 'fa-file-lines'}`}></i>
          <input
            className="modal-tree-name"
            value={node.name}
            onChange={e => updateName(node, e.target.value)}
          />
        </div>
        {node.children?.length ? renderNodes(node.children, depth + 1) : null}
      </div>
    ));
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content">
        <div className="modal-header">
          <h2><i className="fa-solid fa-pen-to-square"></i> 카테고리 초안 편집</h2>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p className="modal-desc">AI가 분석한 카테고리 구조입니다. 이름을 수정할 수 있습니다.</p>
          <div className="modal-categories-list">{renderNodes(tree, 0)}</div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={onConfirm}>확정 및 문서 분류 시작</button>
        </div>
      </div>
    </div>
  );
}

// ─── Files Panel ───────────────────────────────────────────────────────
function FilesPanel() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState('');
  const [content, setContent] = useState('');
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);

  useEffect(() => { loadTree(); }, []);

  async function loadTree() {
    const res = await authFetch('/api/files/tree');
    const data = await res.json();
    setTree(data.tree || []);
  }

  async function openFile(path: string) {
    const res = await authFetch('/api/files/content?path=' + encodeURIComponent(path));
    const data = await res.json();
    setCurrentPath(path);
    const lastSlash = path.lastIndexOf('/');
    setCurrentFolder(lastSlash > 0 ? path.substring(0, lastSlash) : '');
    setContent(data.content || '');
  }

  async function saveFile() {
    if (!currentPath) return;
    const res = await authFetch('/api/files/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentPath, content }),
    });
    if (res.ok) showToast('저장되었습니다');
    else showToast('저장 실패', 'error');
  }

  async function deleteFile() {
    if (!currentPath || !confirm(`"${currentPath}" 파일을 삭제하시겠습니까?`)) return;
    const res = await authFetch('/api/files/item?path=' + encodeURIComponent(currentPath), { method: 'DELETE' });
    if (res.ok) {
      setCurrentPath(null);
      loadTree();
      showToast('삭제되었습니다');
    } else showToast('삭제 실패', 'error');
  }

  async function deleteFolder(path: string) {
    if (!confirm(`"${path}" 폴더와 내부 파일을 모두 삭제하시겠습니까?`)) return;
    const res = await authFetch('/api/files/item?path=' + encodeURIComponent(path), { method: 'DELETE' });
    if (res.ok) {
      if (currentPath?.startsWith(path + '/')) setCurrentPath(null);
      loadTree();
      showToast('폴더가 삭제되었습니다');
    } else showToast('폴더 삭제 실패', 'error');
  }

  async function newFolder() {
    const name = prompt('새 폴더명을 입력하세요:');
    if (!name) return;
    const path = currentFolder ? `${currentFolder}/${name}` : name;
    await authFetch('/api/files/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    loadTree();
  }

  async function newFile() {
    const hint = currentFolder ? `현재 폴더: ${currentFolder}` : '폴더를 먼저 선택하면 해당 폴더에 생성됩니다';
    const name = prompt(`파일명을 입력하세요 (.txt 생략 가능)\n${hint}`);
    if (!name) return;
    const filename = name.endsWith('.txt') ? name : name + '.txt';
    const fullPath = currentFolder ? `${currentFolder}/${filename}` : filename;
    await authFetch('/api/files/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fullPath }),
    });
    await loadTree();
    openFile(fullPath);
  }

  async function openMoveModal() {
    if (!currentPath) return;
    const res = await authFetch('/api/files/tree');
    const data = await res.json();
    const fols: string[] = [];
    function collect(items: TreeNode[]) {
      for (const i of items) {
        if (i.type === 'folder') { fols.push(i.path); collect(i.children || []); }
      }
    }
    collect(data.tree || []);
    setFolders(fols);
    setShowMoveModal(true);
  }

  async function moveFile(targetFolder: string) {
    if (!currentPath) return;
    const filename = currentPath.split('/').pop()!;
    const dst = targetFolder ? `${targetFolder}/${filename}` : filename;
    const res = await authFetch('/api/files/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: currentPath, to: dst }),
    });
    setShowMoveModal(false);
    if (res.ok) {
      setCurrentPath(dst);
      setCurrentFolder(targetFolder);
      loadTree();
      showToast('이동 완료');
    } else showToast('이동 실패', 'error');
  }

  return (
    <section className="admin-panel">
      <h2 className="panel-title"><i className="fa-solid fa-folder-open"></i> 파일 매니저</h2>
      <div className="file-manager">
        <div className="fm-sidebar">
          <div className="fm-sidebar-header">
            <span>폴더 구조</span>
            <div className="fm-actions">
              <button className="btn btn-icon" title="새 폴더" onClick={newFolder}>
                <i className="fa-solid fa-folder-plus"></i>
              </button>
              <button className="btn btn-icon" title="새 파일" onClick={newFile}>
                <i className="fa-solid fa-file-circle-plus"></i>
              </button>
              <button className="btn btn-icon" title="새로고침" onClick={loadTree}>
                <i className="fa-solid fa-rotate-right"></i>
              </button>
            </div>
          </div>
          <div className="file-tree">
            {tree.length === 0
              ? <div className="empty-state"><p>파일이 없습니다</p></div>
              : <FileTree nodes={tree} currentPath={currentPath} currentFolder={currentFolder} onOpen={openFile} onDeleteFolder={deleteFolder} onSelectFolder={setCurrentFolder} />
            }
          </div>
        </div>

        <div className="fm-editor">
          {currentPath
            ? (
              <>
                <div className="fm-editor-header">
                  <span className="fm-path">{currentPath}</span>
                  <div className="fm-editor-actions">
                    <button className="btn btn-outline btn-sm" onClick={openMoveModal}>
                      <i className="fa-solid fa-arrows-up-down-left-right"></i> 이동
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={deleteFile}>
                      <i className="fa-solid fa-trash"></i> 삭제
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={saveFile}>
                      <i className="fa-solid fa-floppy-disk"></i> 저장
                    </button>
                  </div>
                </div>
                <div id="fm-edit-area">
                  <textarea
                    className="fm-textarea"
                    spellCheck={false}
                    value={content}
                    onChange={e => setContent(e.target.value)}
                  />
                </div>
              </>
            )
            : (
              <div className="fm-placeholder">
                <i className="fa-solid fa-file-lines"></i>
                <p>좌측에서 파일을 선택하세요</p>
              </div>
            )
          }
        </div>
      </div>

      {showMoveModal && (
        <MoveModal
          folders={folders}
          onClose={() => setShowMoveModal(false)}
          onMove={moveFile}
        />
      )}
    </section>
  );
}

function FileTree({
  nodes, currentPath, currentFolder, onOpen, onDeleteFolder, onSelectFolder,
}: {
  nodes: TreeNode[];
  currentPath: string | null;
  currentFolder: string;
  onOpen: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onSelectFolder: (path: string) => void;
}) {
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  function toggleFolder(path: string) {
    setOpenFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderNodes(items: TreeNode[]) {
    return items.map(item => {
      if (item.type === 'folder') {
        const isOpen = openFolders.has(item.path);
        const isActive = currentFolder === item.path;
        return (
          <div key={item.path} className={`tree-folder${isOpen ? ' open' : ''}`}>
            <div
              className={`tree-folder-label${isActive ? ' active' : ''}`}
              onClick={() => { toggleFolder(item.path); onSelectFolder(item.path); }}
            >
              <span className="folder-label-text">
                <i className={`fa-solid ${isOpen ? 'fa-folder-open' : 'fa-folder'}`}></i>
                {item.name}
              </span>
              <button
                className="btn btn-icon tree-delete-folder"
                title="폴더 삭제"
                style={{ padding: '2px 5px', fontSize: '0.7rem' }}
                onClick={e => { e.stopPropagation(); onDeleteFolder(item.path); }}
              >
                <i className="fa-solid fa-trash"></i>
              </button>
            </div>
            {isOpen && (
              <div className="tree-folder-children">
                {renderNodes(item.children || [])}
              </div>
            )}
          </div>
        );
      } else {
        return (
          <div
            key={item.path}
            className={`tree-file${currentPath === item.path ? ' active' : ''}`}
            onClick={() => onOpen(item.path)}
          >
            <i className="fa-solid fa-file-lines"></i> {item.name}
          </div>
        );
      }
    });
  }

  return <>{renderNodes(nodes)}</>;
}

function MoveModal({ folders, onClose, onMove }: {
  folders: string[];
  onClose: () => void;
  onMove: (folder: string) => void;
}) {
  const [selected, setSelected] = useState(folders[0] || '');
  const [customFolder, setCustomFolder] = useState('');

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content modal-sm">
        <div className="modal-header">
          <h2><i className="fa-solid fa-arrows-up-down-left-right"></i> 파일 이동</h2>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>이동할 폴더 선택</label>
            <select className="form-select" value={selected} onChange={e => setSelected(e.target.value)}>
              {folders.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>또는 새 폴더명 직접 입력</label>
            <input
              type="text"
              placeholder="새 폴더명 (선택 사항)"
              value={customFolder}
              onChange={e => setCustomFolder(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={() => onMove(customFolder.trim() || selected)}>이동</button>
        </div>
      </div>
    </div>
  );
}

// ─── Users Panel ───────────────────────────────────────────────────────
function UsersPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    const res = await authFetch('/api/users/linked');
    const data = await res.json();
    setUsers(data.users || []);
  }

  async function toggleBlock(userId: number, blocked: boolean) {
    await authFetch('/api/users/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, block: !blocked }),
    });
    loadUsers();
  }

  return (
    <section className="admin-panel">
      <h2 className="panel-title"><i className="fa-solid fa-users"></i> 사용자 관리</h2>
      <div className="card">
        <div className="card-title-row">
          <h3 className="card-title">연결된 사용자</h3>
          <button className="btn btn-outline btn-sm" onClick={loadUsers}>
            <i className="fa-solid fa-rotate-right"></i> 새로고침
          </button>
        </div>
        {users.length === 0
          ? <div className="empty-state"><p>연결된 사용자가 없습니다</p></div>
          : (
            <table className="users-table">
              <thead>
                <tr><th>아이디</th><th>가입일</th><th>상태</th><th>관리</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.created_at?.slice(0, 10) || '-'}</td>
                    <td>
                      <span className={`status-badge ${u.is_blocked ? 'blocked' : 'active'}`}>
                        {u.is_blocked ? '차단됨' : '활성'}
                      </span>
                    </td>
                    <td>
                      <button
                        className={`btn btn-sm ${u.is_blocked ? 'btn-primary' : 'btn-danger'}`}
                        onClick={() => toggleBlock(u.id, u.is_blocked)}
                      >
                        {u.is_blocked ? '차단 해제' : '차단'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>
    </section>
  );
}
