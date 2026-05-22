// ── 인증 유틸리티 ─────────────────────────────────────────

function getToken() { return localStorage.getItem('token'); }

function authFetch(url, options = {}) {
    const token = getToken();
    if (!options.headers) options.headers = {};
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, options);
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    window.location.href = 'index.html';
}

function requireRole(...roles) {
    const token = getToken();
    const role = localStorage.getItem('role');
    if (!token || !role) { window.location.href = 'index.html'; return; }
    if (roles.length && !roles.includes(role)) { window.location.href = 'index.html'; }
}

// ── 토스트 알림 ───────────────────────────────────────────

function showToast(msg, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i> ${msg}`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}
