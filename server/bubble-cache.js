const { v4: uuidv4 } = require('uuid');

class BubbleCache {
    constructor() {
        this.timeline = [];
        this.maxGroups = 5;
        this.hasNew = false;
    }

    addGroup(bubbleGroup) {
        const group = {
            id: uuidv4(),
            context_summary: bubbleGroup.context_summary,
            bubbles: bubbleGroup.bubbles,
            generated_at: bubbleGroup.generated_at,
            transcript_snapshot: bubbleGroup.transcript_snapshot || ''
        };

        this.timeline.push(group);

        if (this.timeline.length > this.maxGroups) {
            this.timeline.shift();
        }

        this.hasNew = true;
        console.log(`[Bubble] 新增一组，时间线共 ${this.timeline.length} 组`);
    }

    getTimeline() {
        return [...this.timeline];
    }

    getLatest() {
        if (this.timeline.length === 0) {
            return null;
        }
        return this.timeline[this.timeline.length - 1];
    }

    clear() {
        this.timeline = [];
        this.hasNew = false;
    }

    hasNewGroup() {
        return this.hasNew;
    }

    markRead() {
        this.hasNew = false;
    }
}

module.exports = BubbleCache;