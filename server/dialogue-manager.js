class DialogueManager {
    constructor(llmEngine, bubbleCache) {
        this.llmEngine = llmEngine;
        this.bubbleCache = bubbleCache;
        
        this.transcript = [];
        this.userContext = '';
        
        this.lastFinalTime = 0;
        this.lastLLMTime = 0;
        this.isLLMRunning = false;
        
        this.debounceTimer = null;
        this.pollTimer = null;
        
        this.onBubbleGenerated = null;
        
        this.startTimers();
    }

    startTimers() {
        this.pollTimer = setInterval(() => {
            this.checkAndTriggerLLM();
        }, 8000);
    }

    addTranscript(text, isPartial) {
        console.log(`[ASR] 收到 final 结果: "${text}"`);
        
        if (isPartial) {
            return;
        }

        this.transcript.push({
            text: text,
            timestamp: Date.now(),
            isPartial: false
        });

        this.lastFinalTime = Date.now();
        console.log(`[Dialogue] 添加 transcript，当前共 ${this.transcript.length} 条`);

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.checkAndTriggerLLM();
        }, 1500);
    }

    setUserContext(contextText) {
        this.userContext = contextText;
        console.log(`[Dialogue] 设置用户上下文: "${contextText}"`);
    }

    getTranscript() {
        return [...this.transcript];
    }

    checkAndTriggerLLM() {
        const now = Date.now();
        const timeSinceLastFinal = now - this.lastFinalTime;
        const timeSinceLastLLM = now - this.lastLLMTime;

        if (this.isLLMRunning) {
            console.log('[Dialogue] LLM 正在运行，跳过本次触发');
            return;
        }

        if (this.transcript.length === 0) {
            return;
        }

        const shouldTrigger = (
            (timeSinceLastFinal >= 1500 && timeSinceLastLLM >= 3000) ||
            (timeSinceLastLLM >= 8000 && this.transcript.length > 0)
        );

        if (!shouldTrigger) {
            return;
        }

        this.triggerLLM();
    }

    async triggerLLM() {
        this.isLLMRunning = true;
        const now = Date.now();
        
        const recentTranscript = this.getRecentTranscript();
        const transcriptText = this.formatTranscript(recentTranscript);
        
        console.log(`[Dialogue] 触发 LLM 生成（上次触发 ${Math.round((now - this.lastLLMTime) / 1000)} 秒前）`);
        
        try {
            const result = await this.llmEngine.generateBubbles(transcriptText, this.userContext);
            
            if (result) {
                result.transcript_snapshot = recentTranscript[recentTranscript.length - 1]?.text || '';
                this.bubbleCache.addGroup(result);
                this.lastLLMTime = Date.now();
                
                if (this.onBubbleGenerated) {
                    this.onBubbleGenerated(result);
                }
            } else {
                console.log('[Dialogue] LLM 生成失败或校验未通过');
            }
        } catch (error) {
            console.error('[Dialogue] LLM 调用异常:', error.message);
        } finally {
            this.isLLMRunning = false;
        }
    }

    getRecentTranscript() {
        const maxItems = 20;
        const maxDuration = 3 * 60 * 1000;
        
        const now = Date.now();
        let recent = [];
        
        for (let i = this.transcript.length - 1; i >= 0; i--) {
            recent.unshift(this.transcript[i]);
            if (recent.length >= maxItems) break;
            if (now - recent[0].timestamp > maxDuration) break;
        }
        
        return recent;
    }

    formatTranscript(transcriptItems) {
        return transcriptItems.map(item => item.text).join('\n');
    }

    destroy() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }
}

module.exports = DialogueManager;