require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const DashScopeASR = require('./dashscope-asr');
const LLMEngine = require('./llm-engine');
const DialogueManager = require('./dialogue-manager');
const BubbleCache = require('./bubble-cache');
const { createSessionManager } = require('./session-manager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws/asr' });

const API_KEY = process.env.DASHSCOPE_API_KEY;

if (!API_KEY) {
    console.warn('⚠️ 警告: DASHSCOPE_API_KEY 未配置，请在 .env 文件中设置');
}

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

const llmEngine = new LLMEngine(API_KEY);
const bubbleCache = new BubbleCache();
const sessionManager = createSessionManager(llmEngine);

function createDialogueManager() {
    const dm = new DialogueManager(llmEngine, bubbleCache);
    dm.onBubbleGenerated = (bubbleGroup) => {
        const latest = bubbleCache.getLatest();
        if (latest) {
            broadcastToAll({
                type: 'bubble_group',
                data: latest
            });
            console.log(`[WS] 推送 bubble_group 给前端`);
        }
    };
    return dm;
}

let dialogueManager = createDialogueManager();

function broadcastToAll(msg) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(msg));
        }
    });
}

function sendToClient(ws, msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

app.get('/api/sessions', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        
        const sessions = await sessionManager.listSessions(limit, offset);
        const total = await sessionManager.getSessionCount();
        
        res.json({ sessions, total });
    } catch (error) {
        console.error('[API] 获取sessions失败:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sessions/:id', async (req, res) => {
    try {
        const session = await sessionManager.getSession(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json(session);
    } catch (error) {
        console.error('[API] 获取session详情失败:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/sessions/:id', async (req, res) => {
    try {
        await sessionManager.deleteSession(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('[API] 删除session失败:', error.message);
        res.status(500).json({ error: error.message });
    }
});

wss.on('connection', (ws) => {
    console.log('[Server] 前端 WebSocket 连接已建立');

    dialogueManager.destroy();
    dialogueManager = createDialogueManager();
    bubbleCache.clear();
    sessionManager.reset();

    let asr = null;
    let isReady = false;
    let isClosed = false;

    const sendMessage = (msg) => {
        if (ws.readyState === WebSocket.OPEN && !isClosed) {
            ws.send(JSON.stringify(msg));
        }
    };

    if (!API_KEY) {
        sendMessage({ type: 'status', status: 'error', message: 'API Key 未配置' });
        ws.close();
        return;
    }

    asr = new DashScopeASR(API_KEY);

    asr.onResult((result) => {
        sendMessage({
            type: 'asr_result',
            text: result.text,
            isPartial: result.isPartial
        });

        if (!result.isPartial) {
            dialogueManager.addTranscript(result.text, result.isPartial);
            sessionManager.addTranscript(result.text, Date.now());
        }
    });

    asr.onError((error) => {
        if (isClosed) return;
        console.error('[Server] ASR 错误:', error.message);
        sendMessage({ type: 'status', status: 'error', message: error.message });
        isReady = false;
    });

    asr.onClose(() => {
        if (isClosed) return;
        console.log('[Server] ASR 连接已关闭');
        isReady = false;
        dialogueManager.destroy();
    });

    asr.start()
        .then(async () => {
            console.log('[Server] ASR 已就绪');
            isReady = true;
            
            const userContext = '';
            await sessionManager.startSession(userContext);
            
            sendMessage({ type: 'status', status: 'ready' });
        })
        .catch((error) => {
            console.error('[Server] ASR 启动失败:', error.message);
            sendMessage({ type: 'status', status: 'error', message: error.message });
        });

    ws.on('message', (message) => {
        if (message instanceof Buffer) {
            if (isReady && asr) {
                asr.sendAudio(message);
            }
        } else {
            try {
                const data = JSON.parse(message.toString());
                
                if (data.type === 'stop') {
                    console.log('[Server] 收到停止指令');
                    isClosed = true;
                    
                    if (asr) {
                        asr.stop().then(() => {
                            console.log('[Server] ASR 已停止');
                        });
                    }
                    
                    dialogueManager.destroy();
                    bubbleCache.clear();
                    
                    sendMessage({ type: 'status', status: 'closed', message: '监听已停止' });

                    sessionManager.endSession()
                        .then(result => {
                            if (result) {
                                sendMessage({
                                    type: 'session_saved',
                                    data: result
                                });
                            }
                        })
                        .catch(error => {
                            sendMessage({
                                type: 'session_save_failed',
                                message: error.message
                            });
                        });
                }
                
                if (data.type === 'set_context') {
                    dialogueManager.setUserContext(data.context || '');
                    sendMessage({ type: 'status', status: 'ready', message: '上下文已设置' });
                    
                    if (sessionManager.getCurrentSession()) {
                        sessionManager.startSession(data.context || '');
                    }
                }
                
                if (data.type === 'get_bubbles') {
                    const timeline = bubbleCache.getTimeline();
                    sendMessage({ type: 'bubble_timeline', data: timeline });
                }
            } catch (e) {
                console.error('[Server] 解析消息失败:', e);
            }
        }
    });

    ws.on('close', () => {
        console.log('[Server] 前端 WebSocket 连接已关闭');
        isClosed = true;
        if (asr) {
            asr.stop();
        }
        dialogueManager.destroy();
        bubbleCache.clear();
    });

    ws.on('error', (error) => {
        console.error('[Server] 前端 WebSocket 错误:', error.message);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`CallCopilot server running on http://localhost:${PORT}`);
});