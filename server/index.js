require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const DashScopeASR = require('./dashscope-asr');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws/asr' });

const API_KEY = process.env.DASHSCOPE_API_KEY;

if (!API_KEY) {
    console.warn('⚠️ 警告: DASHSCOPE_API_KEY 未配置，请在 .env 文件中设置');
}

app.use(express.static(path.join(__dirname, '../public')));

wss.on('connection', (ws) => {
    console.log('[Server] 前端 WebSocket 连接已建立');

    let asr = null;
    let isReady = false;

    const sendMessage = (msg) => {
        if (ws.readyState === WebSocket.OPEN) {
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
    });

    asr.onError((error) => {
        console.error('[Server] ASR 错误:', error.message);
        sendMessage({ type: 'status', status: 'error', message: error.message });
        isReady = false;
    });

    asr.onClose(() => {
        console.log('[Server] ASR 连接已关闭');
        isReady = false;
    });

    asr.start()
        .then(() => {
            console.log('[Server] ASR 已就绪');
            isReady = true;
            sendMessage({ type: 'status', status: 'ready' });
        })
        .catch((error) => {
            console.error('[Server] ASR 启动失败:', error.message);
            sendMessage({ type: 'status', status: 'error', message: error.message });
        });

    ws.on('message', (message) => {
        if (message instanceof Buffer) {
            console.log('[Server] 收到音频数据:', message.length, 'bytes');
            if (isReady && asr) {
                asr.sendAudio(message);
            }
        } else {
            try {
                const data = JSON.parse(message.toString());
                if (data.type === 'stop') {
                    console.log('[Server] 收到停止指令');
                    if (asr) {
                        asr.stop();
                    }
                    sendMessage({ type: 'status', status: 'closed', message: '监听已停止' });
                }
            } catch (e) {
                console.error('[Server] 解析消息失败:', e);
            }
        }
    });

    ws.on('close', () => {
        console.log('[Server] 前端 WebSocket 连接已关闭');
        if (asr) {
            asr.stop();
        }
    });

    ws.on('error', (error) => {
        console.error('[Server] 前端 WebSocket 错误:', error.message);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`CallCopilot server running on http://localhost:${PORT}`);
});