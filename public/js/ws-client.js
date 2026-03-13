class WSClient {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.onStatusChange = null;
        this.onASRResult = null;
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/asr`;
        
        console.log('[WSClient] 连接地址:', wsUrl);
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('[WSClient] WebSocket 已连接');
            this.isConnected = true;
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('[WSClient] 收到消息:', data.type);
                
                if (data.type === 'status') {
                    if (this.onStatusChange) {
                        this.onStatusChange(data.status, data.message);
                    }
                } else if (data.type === 'asr_result') {
                    if (this.onASRResult) {
                        this.onASRResult(data.text, data.isPartial);
                    }
                }
            } catch (e) {
                console.error('[WSClient] 解析消息失败:', e);
            }
        };

        this.ws.onerror = (error) => {
            console.error('[WSClient] WebSocket 错误:', error);
            if (this.onStatusChange) {
                this.onStatusChange('error', '连接出错');
            }
        };

        this.ws.onclose = () => {
            console.log('[WSClient] WebSocket 已断开');
            this.isConnected = false;
            if (this.onStatusChange) {
                this.onStatusChange('closed', '连接已关闭');
            }
        };
    }

    sendAudio(pcmBuffer) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(pcmBuffer);
        }
    }

    sendStop() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'stop' }));
        }
    }

    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }
}