class Sidebar {
    constructor() {
        this.isOpen = false;
        this.currentView = 'list';
        this.sessions = [];
        this.currentPage = 0;
        this.pageSize = 20;
        this.hasMore = true;
        this.loading = false;
        
        this.init();
    }

    init() {
        this.createDOM();
        this.bindEvents();
    }

    createDOM() {
        const sidebarHtml = `
            <div class="sidebar-overlay" id="sidebarOverlay"></div>
            <aside class="sidebar" id="sidebar">
                <div class="sidebar-header">
                    <h2 class="sidebar-title">通话记录</h2>
                    <button class="sidebar-close" id="sidebarClose">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <div class="sidebar-content" id="sidebarContent">
                    <div class="sessions-list" id="sessionsList"></div>
                    <div class="load-more" id="loadMore" style="display: none;">
                        <span>点击加载更多</span>
                    </div>
                    <div class="sessions-empty" id="sessionsEmpty" style="display: none;">
                        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        <p>还没有通话记录</p>
                        <p class="empty-hint">通话结束后会自动保存</p>
                    </div>
                </div>
                <div class="sidebar-detail" id="sidebarDetail" style="display: none;">
                    <div class="detail-header">
                        <button class="detail-back" id="detailBack">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="15 18 9 12 15 6"/>
                            </svg>
                            <span>返回</span>
                        </button>
                        <button class="detail-delete" id="detailDelete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                    <div class="detail-content" id="detailContent">
                        <div class="detail-skeleton" id="detailSkeleton">
                            <div class="skeleton-line" style="width: 60%"></div>
                            <div class="skeleton-line" style="width: 40%"></div>
                            <div class="skeleton-block"></div>
                        </div>
                        <div class="detail-body" id="detailBody" style="display: none;"></div>
                    </div>
                </div>
            </aside>
        `;

        document.body.insertAdjacentHTML('beforeend', sidebarHtml);
        
        this.overlay = document.getElementById('sidebarOverlay');
        this.sidebar = document.getElementById('sidebar');
        this.sessionsList = document.getElementById('sessionsList');
        this.sessionsEmpty = document.getElementById('sessionsEmpty');
        this.loadMore = document.getElementById('loadMore');
        this.sidebarContent = document.getElementById('sidebarContent');
        this.sidebarDetail = document.getElementById('sidebarDetail');
        this.detailBody = document.getElementById('detailBody');
        this.detailSkeleton = document.getElementById('detailSkeleton');
    }

    bindEvents() {
        document.getElementById('sidebarClose').addEventListener('click', () => this.close());
        this.overlay.addEventListener('click', () => this.close());
        document.getElementById('detailBack').addEventListener('click', () => this.showList());
        document.getElementById('detailDelete').addEventListener('click', () => this.deleteCurrentSession());
        this.loadMore.addEventListener('click', () => this.loadMoreSessions());
        
        this.sidebarContent.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = this.sidebarContent;
            if (scrollTop + clientHeight >= scrollHeight - 50 && this.hasMore && !this.loading) {
                this.loadMoreSessions();
            }
        });
    }

    open() {
        this.isOpen = true;
        this.sidebar.classList.add('open');
        this.overlay.classList.add('visible');
        this.currentView = 'list';
        this.showList();
        this.loadSessions();
    }

    close() {
        this.isOpen = false;
        this.sidebar.classList.remove('open');
        this.overlay.classList.remove('visible');
    }

    async loadSessions(reset = true) {
        if (reset) {
            this.currentPage = 0;
            this.sessions = [];
            this.hasMore = true;
        }
        
        if (this.loading) return;
        this.loading = true;

        try {
            const offset = this.currentPage * this.pageSize;
            const response = await fetch(`/api/sessions?limit=${this.pageSize}&offset=${offset}`);
            const data = await response.json();

            if (reset) {
                this.sessions = data.sessions || [];
            } else {
                this.sessions = [...this.sessions, ...(data.sessions || [])];
            }

            this.hasMore = this.sessions.length < data.total;
            this.currentPage++;

            this.renderSessions();
        } catch (error) {
            console.error('[Sidebar] 加载失败:', error);
        } finally {
            this.loading = false;
        }
    }

    renderSessions() {
        if (this.sessions.length === 0) {
            this.sessionsList.innerHTML = '';
            this.sessionsList.style.display = 'none';
            this.sessionsEmpty.style.display = 'flex';
            this.loadMore.style.display = 'none';
            return;
        }

        this.sessionsList.style.display = 'flex';
        this.sessionsEmpty.style.display = 'none';

        this.sessionsList.innerHTML = this.sessions.map(session => this.renderSessionCard(session)).join('');
        
        this.loadMore.style.display = this.hasMore ? 'block' : 'none';
        
        if (!this.hasMore && this.sessions.length > 0) {
            this.loadMore.innerHTML = '<span>· 已经到底了 ·</span>';
        }

        this.sessionsList.querySelectorAll('.session-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.session-delete')) {
                    this.showDetail(card.dataset.id);
                }
            });
        });

        this.sessionsList.querySelectorAll('.session-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.confirmDelete(btn.dataset.id);
            });
        });
    }

    renderSessionCard(session) {
        const time = this.formatSmartTime(new Date(session.started_at));
        const duration = this.formatDuration(session.duration_seconds);
        const title = session.ai_summary?.substring(0, 10) || session.user_context?.substring(0, 10) || '未命名通话';
        const summary = session.ai_summary || '';

        return `
            <div class="session-card" data-id="${session.id}">
                <div class="session-header">
                    <span class="session-title">📞 ${title}</span>
                </div>
                <div class="session-meta">${time} · ${duration}</div>
                ${summary ? `<div class="session-summary">${summary}</div>` : ''}
                <button class="session-delete" data-id="${session.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `;
    }

    async loadMoreSessions() {
        await this.loadSessions(false);
    }

    formatSmartTime(date) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const sessionDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        const timeStr = date.toTimeString().slice(0, 5);

        if (sessionDate.getTime() === today.getTime()) {
            return `今天 ${timeStr}`;
        } else if (sessionDate.getTime() === yesterday.getTime()) {
            return `昨天 ${timeStr}`;
        } else {
            return `${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`;
        }
    }

    formatDuration(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}分${s}秒`;
    }

    showList() {
        this.currentView = 'list';
        this.sidebarContent.style.display = 'flex';
        this.sidebarDetail.style.display = 'none';
        this.loadSessions(true);
    }

    async showDetail(id) {
        this.currentView = 'detail';
        this.sidebarContent.style.display = 'none';
        this.sidebarDetail.style.display = 'flex';
        this.detailSkeleton.style.display = 'block';
        this.detailBody.style.display = 'none';

        try {
            const response = await fetch(`/api/sessions/${id}`);
            const session = await response.json();
            this.currentSession = session;
            this.renderDetail(session);
        } catch (error) {
            console.error('[Sidebar] 加载详情失败:', error);
            this.showList();
        }
    }

    renderDetail(session) {
        this.detailSkeleton.style.display = 'none';
        this.detailBody.style.display = 'block';

        const startTime = new Date(session.started_at);
        const endTime = session.ended_at ? new Date(session.ended_at) : null;
        
        const timeRange = endTime 
            ? `${this.formatSmartTime(startTime)} - ${startTime.toTimeString().slice(0, 5)} · ${this.formatDuration(session.duration_seconds)}`
            : this.formatSmartTime(startTime);

        const title = session.ai_summary?.substring(0, 10) || session.user_context?.substring(0, 10) || '未命名通话';

        let html = `
            <h2 class="detail-title">${title}</h2>
            <p class="detail-time">${timeRange}</p>
        `;

        if (session.user_context) {
            html += `
                <div class="detail-card">
                    <div class="detail-card-label">通话背景</div>
                    <div class="detail-card-content">${session.user_context}</div>
                </div>
            `;
        }

        if (session.ai_summary) {
            html += `
                <div class="detail-card summary-card">
                    <div class="detail-card-label">AI 摘要</div>
                    <div class="detail-card-content">${session.ai_summary}</div>
                </div>
            `;
        }

        if (session.transcript && session.transcript.length > 0) {
            html += `
                <div class="detail-section">
                    <div class="detail-section-label">完整对话记录</div>
                    <div class="transcript-list">
                        ${session.transcript.map(t => `
                            <div class="transcript-item">
                                <span class="transcript-time">${new Date(t.timestamp).toTimeString().slice(0, 8)}</span>
                                <span class="transcript-text">${t.text}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        this.detailBody.innerHTML = html;
    }

    confirmDelete(id) {
        if (confirm('确定要删除这条通话记录吗？')) {
            this.deleteSession(id);
        }
    }

    async deleteSession(id) {
        try {
            await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
            
            const card = document.querySelector(`.session-card[data-id="${id}"]`);
            if (card) {
                card.style.opacity = '0';
                card.style.transform = 'translateX(-20px)';
                setTimeout(() => {
                    this.sessions = this.sessions.filter(s => s.id !== id);
                    this.renderSessions();
                }, 300);
            }

            if (this.currentView === 'detail' && this.currentSession?.id === id) {
                this.showList();
            }
        } catch (error) {
            console.error('[Sidebar] 删除失败:', error);
            alert('删除失败，请重试');
        }
    }

    async deleteCurrentSession() {
        if (this.currentSession && confirm('确定要删除这条通话记录吗？')) {
            await this.deleteSession(this.currentSession.id);
        }
    }
}