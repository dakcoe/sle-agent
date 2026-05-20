// Global State Variables
let uploadedFiles = [];
let categoryDraft = [];
let conversationHistory = [];
let isProcessing = false;

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const btnAnalyze = document.getElementById('btn-analyze');
const progressContainer = document.getElementById('progress-container');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressPercent = document.getElementById('progress-percent');
const progressFile = document.getElementById('progress-file');
const categoryTree = document.getElementById('category-tree');
const btnConfirmTrigger = document.getElementById('btn-confirm-trigger');

const chatFeed = document.getElementById('chat-feed');
const chatForm = document.getElementById('chat-form');
const queryInput = document.getElementById('query-input');
const btnResetChat = document.getElementById('btn-reset-chat');

// Modal Elements
const categoryModal = document.getElementById('category-modal');
const modalClose = document.getElementById('modal-close');
const modalCategoriesList = document.getElementById('modal-categories-list');
const btnModalCancel = document.getElementById('btn-modal-cancel');
const btnModalConfirm = document.getElementById('btn-modal-confirm');

// --- 1. Event Listeners Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Drag and Drop Events
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', handleDrop, false);
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // Button Events
    btnAnalyze.addEventListener('click', analyzeCategories);
    btnResetChat.addEventListener('click', resetChat);
    chatForm.addEventListener('submit', handleQuerySubmit);

    // Modal Events
    modalClose.addEventListener('click', closeModal);
    btnModalCancel.addEventListener('click', closeModal);
    btnModalConfirm.addEventListener('click', submitConfirmedCategories);

    // Load existing categories on startup (if any)
    checkExistingCategories();
});

// --- 2. File Upload Management ---
function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    uploadFiles(files);
}

function handleFileSelect(e) {
    const files = e.target.files;
    uploadFiles(files);
}

async function uploadFiles(files) {
    if (files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }

    try {
        addBotMessage("파일을 업로드하는 중입니다. 잠시만 기다려주세요...");
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('업로드 실패');

        const data = await response.json();
        const newlyUploaded = data.uploaded_files;

        if (newlyUploaded.length > 0) {
            uploadedFiles = [...newlyUploaded];
            renderFileList();
            btnAnalyze.disabled = false;
            addBotMessage(`파일 ${newlyUploaded.length}개가 안전하게 업로드되었습니다. '카테고리 초안 분석'을 진행하여 규정 구조를 모델링해보세요.`);
        } else {
            addBotMessage("지원하지 않는 형식의 파일입니다. PDF, DOCX, JPG, PNG 파일만 지원합니다.");
        }
    } catch (error) {
        console.error('Error uploading:', error);
        addBotMessage("파일 업로드 중 에러가 발생했습니다. 다시 시도해 주세요.");
    }
}

function renderFileList() {
    fileList.innerHTML = '';
    uploadedFiles.forEach((filename) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        
        // 아이콘 결정
        let iconClass = 'fa-file-pdf';
        const ext = filename.split('.').pop().toLowerCase();
        if (ext === 'docx') iconClass = 'fa-file-word';
        else if (['jpg', 'jpeg', 'png'].includes(ext)) iconClass = 'fa-file-image';

        item.innerHTML = `
            <div class="file-item-left">
                <i class="fa-solid ${iconClass}"></i>
                <span>${filename}</span>
            </div>
        `;
        fileList.appendChild(item);
    });
}

// --- 3. Category Draft Analysis ---
async function analyzeCategories() {
    btnAnalyze.disabled = true;
    addBotMessage("문서 첫 페이지들을 기반으로 카테고리 분류 초안을 추출하고 있습니다. Gemini가 문서의 구조를 영리하게 판단하는 중입니다...");
    
    try {
        const response = await fetch('/api/analyze', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('분석 실패');

        const data = await response.json();
        categoryDraft = data.categories || [];

        if (categoryDraft.length > 0) {
            showCategoryModal();
        } else {
            addBotMessage("카테고리를 분석하지 못했습니다. 문서 본문이 텍스트로 채워져 있는지 확인해 주세요.");
            btnAnalyze.disabled = false;
        }
    } catch (error) {
        console.error('Error analyzing:', error);
        addBotMessage("카테고리 분석 도중 통신 장애가 생겼습니다. 다시 한 번 시도해 주세요.");
        btnAnalyze.disabled = false;
    }
}

function showCategoryModal() {
    modalCategoriesList.innerHTML = '';
    
    categoryDraft.forEach((cat, index) => {
        const row = document.createElement('div');
        row.className = 'modal-cat-row';
        row.innerHTML = `
            <input type="text" class="modal-cat-title-input" value="${cat.name}" data-index="${index}" placeholder="대카테고리 명">
            <input type="text" class="modal-cat-desc-input" value="${cat.description}" data-index="${index}" placeholder="대카테고리 설명">
            <input type="text" class="modal-subcats-input" value="${cat.sub_categories.join(', ')}" data-index="${index}" placeholder="소카테고리 목록 (쉼표로 구분)">
        `;
        modalCategoriesList.appendChild(row);
    });

    categoryModal.classList.remove('hidden');
}

function closeModal() {
    categoryModal.classList.add('hidden');
    btnAnalyze.disabled = false;
}

// --- 4. SSE-based Document Processing ---
async function submitConfirmedCategories() {
    // Collect customized categories from UI
    const rows = modalCategoriesList.querySelectorAll('.modal-cat-row');
    const confirmedCategories = [];

    rows.forEach(row => {
        const nameInput = row.querySelector('.modal-cat-title-input');
        const descInput = row.querySelector('.modal-cat-desc-input');
        const subInput = row.querySelector('.modal-subcats-input');

        const subs = subInput.value.split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        confirmedCategories.push({
            name: nameInput.value.trim(),
            description: descInput.value.trim(),
            sub_categories: subs
        });
    });

    closeModal();
    addBotMessage("카테고리를 확정했습니다. 지금부터 전체 문서를 정밀 파싱하여 각 카테고리별 조항 파일로 가공 및 저장합니다.");

    try {
        // 1. Confirm Categories via API
        const confirmResponse = await fetch('/api/categories/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categories: confirmedCategories })
        });

        if (!confirmResponse.ok) throw new Error('카테고리 확정 실패');

        // 2. Start Processing via SSE Stream
        startSSEProcessing();

    } catch (error) {
        console.error('Error confirming:', error);
        addBotMessage("카테고리 확정 도중 에러가 발생했습니다.");
    }
}

function startSSEProcessing() {
    progressContainer.classList.remove('hidden');
    isProcessing = true;

    // POST /api/process 엔드포인트는 SSE 응답(text/event-stream)을 주므로 EventSource 대신 fetch와 ReadableStream을 사용하거나,
    // 간단히 처리하기 위해 백엔드에서 GET /api/process_stream 형태로도 매칭할 수 있지만, 
    // 표준 API를 POST로 해두었으므로 fetch의 body reader를 사용하여 스트림을 수신합니다.
    fetch('/api/process', {
        method: 'POST'
    }).then(response => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        function readStream() {
            return reader.read().then(({ done, value }) => {
                if (done) {
                    finalizeProcessing();
                    return;
                }

                const chunk = decoder.decode(value, { stream: true });
                // SSE 포맷 파싱: "data: {...}\n\n"
                const lines = chunk.split('\n');
                lines.forEach(line => {
                    if (line.startsWith('data: ')) {
                        try {
                            const eventData = JSON.parse(line.substring(6));
                            updateProgressBar(eventData);
                        } catch (e) {
                            // JSON 파싱 실패 무시 (단편적인 패킷 수신 등)
                        }
                    }
                });

                return readStream();
            });
        }

        return readStream();
    }).catch(error => {
        console.error('SSE Stream Error:', error);
        addBotMessage("문서 분류 도중 스트림이 중단되었습니다. 로컬 파일 시스템을 점검해 주세요.");
        isProcessing = false;
        progressContainer.classList.add('hidden');
    });
}

function updateProgressBar(data) {
    if (data.status === 'processing') {
        const progress = data.progress || 0;
        progressBarFill.style.width = `${progress}%`;
        progressPercent.textContent = `${progress}%`;
        progressFile.innerHTML = `<i class="fa-solid fa-gear fa-spin"></i> 현재 분석 중: <strong>${data.file}</strong>`;
    } else if (data.status === 'done') {
        finalizeProcessing();
    }
}

async function finalizeProcessing() {
    progressBarFill.style.width = '100%';
    progressPercent.textContent = '100%';
    progressFile.innerHTML = `<i class="fa-solid fa-circle-check"></i> 모든 규정 문서 가공 완료!`;
    isProcessing = false;

    // 잠시 후 프로그레스 바 숨김
    setTimeout(() => {
        progressContainer.classList.add('hidden');
    }, 3000);

    addBotMessage("🎉 축하합니다! 모든 문서 가공이 완료되었습니다. 이제 자유롭게 규정에 관한 자연어 질문을 입력해 보세요.");
    
    // Refresh Sidebar Category Tree
    await refreshCategoryTree();
}

// --- 5. Category Tree View Rendering ---
async function checkExistingCategories() {
    try {
        const response = await fetch('/api/categories');
        const data = await response.json();
        if (data.categories && data.categories.length > 0) {
            renderCategoryTree(data.categories);
        }
    } catch (e) {
        console.error('Error fetching categories:', e);
    }
}

async function refreshCategoryTree() {
    await checkExistingCategories();
}

function renderCategoryTree(categories) {
    categoryTree.innerHTML = '';
    
    categories.forEach(cat => {
        const node = document.createElement('div');
        node.className = 'tree-node';
        
        let subItemsHTML = '';
        cat.sub_categories.forEach(sub => {
            subItemsHTML += `
                <li class="tree-sub-item">
                    <i class="fa-solid fa-file-lines"></i>
                    <span>${sub}</span>
                </li>
            `;
        });

        node.innerHTML = `
            <div class="tree-node-title">
                <i class="fa-solid fa-folder-open"></i>
                <span>${cat.name}</span>
            </div>
            <ul class="tree-sub-list">
                ${subItemsHTML}
            </ul>
        `;
        categoryTree.appendChild(node);
    });
}

// --- 6. Question Querying & Chat System ---
async function handleQuerySubmit(e) {
    e.preventDefault();
    const question = queryInput.value.trim();
    if (!question) return;

    // User Message 추가
    addUserMessage(question);
    queryInput.value = '';

    // 로딩 메시지 출력용 Bot bubble 생성
    const loadingBubbleId = addBotLoadingBubble();

    try {
        const response = await fetch('/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question: question,
                conversation_history: conversationHistory
            })
        });

        if (!response.ok) throw new Error('질문 처리 실패');

        const data = await response.json();
        
        // 로딩 버블 제거
        removeBotLoadingBubble(loadingBubbleId);

        // 결과 렌더링
        renderQueryResult(data);

        // 대화 히스토리 업데이트
        conversationHistory.push({ role: 'user', content: question });
        conversationHistory.push({ 
            role: 'assistant', 
            content: data.answer, 
            source: data.source 
        });

    } catch (error) {
        console.error('Error querying:', error);
        removeBotLoadingBubble(loadingBubbleId);
        addBotMessage("질문을 전송하는 과정에서 오류가 발생했습니다. 서버가 실행 중인지 확인하세요.");
    }
}

function addUserMessage(content) {
    const msg = document.createElement('div');
    msg.className = 'message user';
    msg.innerHTML = `
        <div class="message-avatar">
            <i class="fa-solid fa-user"></i>
        </div>
        <div class="message-bubble-wrapper">
            <div class="message-bubble">${escapeHTML(content)}</div>
        </div>
    `;
    chatFeed.appendChild(msg);
    scrollToBottom();
}

function addBotMessage(content) {
    const msg = document.createElement('div');
    msg.className = 'message assistant';
    msg.innerHTML = `
        <div class="message-avatar">
            <i class="fa-solid fa-robot"></i>
        </div>
        <div class="message-bubble-wrapper">
            <div class="message-bubble">${content.replace(/\n/g, '<br>')}</div>
        </div>
    `;
    chatFeed.appendChild(msg);
    scrollToBottom();
}

function addBotLoadingBubble() {
    const id = 'loading-' + Date.now();
    const msg = document.createElement('div');
    msg.className = 'message assistant';
    msg.id = id;
    msg.innerHTML = `
        <div class="message-avatar">
            <i class="fa-solid fa-robot"></i>
        </div>
        <div class="message-bubble-wrapper">
            <div class="message-bubble">
                <i class="fa-solid fa-circle-notch fa-spin"></i> 규정 파일을 계층적으로 탐색하고 있습니다. 잠시만 대기해 주세요...
            </div>
        </div>
    `;
    chatFeed.appendChild(msg);
    scrollToBottom();
    return id;
}

function removeBotLoadingBubble(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function renderQueryResult(data) {
    const msg = document.createElement('div');
    msg.className = 'message assistant';
    
    // 1. 소스 정보 라벨링
    let sourceHTML = '';
    if (data.source) {
        sourceHTML = `<div class="source-label"><i class="fa-solid fa-bookmark"></i> 출처: ${data.source}</div>`;
    }

    // 2. 탐색 경로 시각화 HTML 작성
    let pathHTML = '';
    if (data.path_taken && data.path_taken.length > 0) {
        let stepsHTML = '';
        data.path_taken.forEach(step => {
            const isFound = step.found;
            const itemClass = isFound ? 'found-yes' : 'found-no';
            const icon = isFound 
                ? '<i class="fa-solid fa-circle-check path-icon-check"></i>' 
                : '<i class="fa-solid fa-circle-xmark path-icon-times"></i>';
            const desc = isFound ? '규정 발견' : '관련 내용 없음';
            
            stepsHTML += `
                <li class="path-step ${itemClass}">
                    <span>${step.category} &gt; ${step.sub}</span>
                    <span>${icon} ${desc}</span>
                </li>
            `;
        });

        pathHTML = `
            <div class="path-container">
                <div class="path-title"><i class="fa-solid fa-route"></i> 계층 탐색 경로 추적 (RAG Trace)</div>
                <ul class="path-list">
                    ${stepsHTML}
                </ul>
            </div>
        `;
    }

    msg.innerHTML = `
        <div class="message-avatar">
            <i class="fa-solid fa-robot"></i>
        </div>
        <div class="message-bubble-wrapper">
            <div class="message-bubble">
                ${data.answer.replace(/\n/g, '<br>')}
                ${sourceHTML}
                ${pathHTML}
            </div>
        </div>
    `;
    chatFeed.appendChild(msg);
    scrollToBottom();
}

function resetChat() {
    conversationHistory = [];
    chatFeed.innerHTML = '';
    addBotMessage("대화 기록이 초기화되었습니다. 새로운 질문을 해주시면 처음부터 탐색합니다.");
}

// --- 7. Utility Helper Functions ---
function scrollToBottom() {
    chatFeed.scrollTop = chatFeed.scrollHeight;
}

function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
