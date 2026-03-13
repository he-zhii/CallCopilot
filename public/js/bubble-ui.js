class BubbleUI {
    constructor() {
        this.bubbleTimeline = [];
        this.panelOpen = false;
        this.expandedBubbleId = null;
        
        this.panel = document.getElementById('bubblePanel');
        this.timeline = document.getElementById('bubbleTimeline');
        this.emptyState = document.getElementById('bubbleEmptyState');
        this.emptyText = document.getElementById('bubbleEmptyText');
        this.overlay = document.getElementById('overlay');
    }

    addBubbleGroup(data) {
        this.bubbleTimeline.push(data);
        
        if (this.bubbleTimeline.length > 5) {
            this.bubbleTimeline.shift();
        }
        
        this.renderBubbleGroup(data);
        
        if (this.panelOpen) {
            this.scrollToBottom();
        }
    }

    renderBubbleGroup(data) {
        if (this.emptyState) {
            this.emptyState.style.display = 'none';
        }

        const groupEl = document.createElement('div');
        groupEl.className = 'bubble-group';
        groupEl.dataset.groupId = data.id;

        const time = new Date(data.generated_at).toTimeString().slice(0, 5);

        let bubblesHtml = '';
        data.bubbles.forEach((bubble, index) => {
            const bubbleId = `${data.id}-${index}`;
            bubblesHtml += `
                <button class="bubble-item" data-bubble-id="${bubbleId}" data-group-id="${data.id}" data-index="${index}">
                    ${bubble.preview}
                </button>
                <div class="bubble-card" data-card-id="${bubbleId}" data-group-id="${data.id}" data-index="${index}">
                    <div class="bubble-strategy">💡 ${bubble.strategy}</div>
                    <div class="bubble-text">${bubble.full_text}</div>
                </div>
            `;
        });

        groupEl.innerHTML = `
            <div class="bubble-group-header">
                <span class="bubble-group-time">${time}</span>
                <span class="bubble-group-context">${data.context_summary}</span>
            </div>
            <div class="bubble-list">
                ${bubblesHtml}
            </div>
        `;

        const bubbleItems = groupEl.querySelectorAll('.bubble-item');
        bubbleItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const bubbleId = item.dataset.bubbleId;
                const groupId = item.dataset.groupId;
                const index = item.dataset.index;
                this.toggleBubble(groupId, index);
            });
        });

        this.timeline.appendChild(groupEl);
    }

    toggleBubble(groupId, index) {
        const bubbleId = `${groupId}-${index}`;
        
        if (this.expandedBubbleId === bubbleId) {
            this.collapseBubble(bubbleId, groupId, index);
            this.expandedBubbleId = null;
        } else {
            if (this.expandedBubbleId) {
                const [oldGroupId, oldIndex] = this.parseBubbleId(this.expandedBubbleId);
                this.collapseBubble(this.expandedBubbleId, oldGroupId, oldIndex);
            }
            this.expandBubble(bubbleId, groupId, index);
            this.expandedBubbleId = bubbleId;
        }
    }

    expandBubble(bubbleId, groupId, index) {
        const card = document.querySelector(`.bubble-card[data-card-id="${bubbleId}"]`);
        const item = document.querySelector(`.bubble-item[data-bubble-id="${bubbleId}"]`);
        
        if (card) {
            card.classList.add('expanded');
            setTimeout(() => {
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 50);
        }
        
        if (item) {
            item.classList.add('expanded');
        }
    }

    collapseBubble(bubbleId, groupId, index) {
        const card = document.querySelector(`.bubble-card[data-card-id="${bubbleId}"]`);
        const item = document.querySelector(`.bubble-item[data-bubble-id="${bubbleId}"]`);
        
        if (card) {
            card.classList.remove('expanded');
        }
        
        if (item) {
            item.classList.remove('expanded');
        }
    }

    parseBubbleId(bubbleId) {
        const parts = bubbleId.split('-');
        const index = parseInt(parts.pop());
        const groupId = parts.join('-');
        return [groupId, index];
    }

    togglePanel() {
        this.panelOpen = !this.panelOpen;
        
        if (this.panelOpen) {
            this.panel.classList.add('open');
            this.overlay.classList.add('visible');
            this.expandedBubbleId = null;
        } else {
            this.panel.classList.remove('open');
            this.overlay.classList.remove('visible');
            
            document.querySelectorAll('.bubble-card.expanded').forEach(card => {
                card.classList.remove('expanded');
            });
            document.querySelectorAll('.bubble-item.expanded').forEach(item => {
                item.classList.remove('expanded');
            });
            this.expandedBubbleId = null;
        }
    }

    isPanelOpen() {
        return this.panelOpen;
    }

    clearNotification() {
        const notification = document.getElementById('fabNotification');
        if (notification) {
            notification.style.display = 'none';
        }
        
        const fabBtn = document.getElementById('fabBtn');
        if (fabBtn) {
            fabBtn.classList.remove('has-notification');
        }
    }

    updateEmptyState(asrStarted) {
        if (this.emptyState) {
            if (asrStarted) {
                this.emptyText.textContent = 'AI 正在监听对话...';
            } else {
                this.emptyText.textContent = '开始监听后，AI 会实时生成话术建议';
            }
        }
    }

    scrollToBottom() {
        setTimeout(() => {
            this.timeline.scrollTo({
                top: this.timeline.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);
    }

    getTimeline() {
        return this.bubbleTimeline;
    }

    clear() {
        this.bubbleTimeline = [];
        this.timeline.innerHTML = `
            <div class="bubble-empty" id="bubbleEmptyState">
                <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span id="bubbleEmptyText">开始监听后，AI 会实时生成话术建议</span>
            </div>
        `;
        this.emptyState = document.getElementById('bubbleEmptyState');
        this.emptyText = document.getElementById('bubbleEmptyText');
    }
}