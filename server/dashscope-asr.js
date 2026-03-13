const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

class DashScopeASR {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.ws = null;
        this.taskId = null;
        this.isConnected = false;
        this.isTaskStarted = false;
        this.isStopped = false;
        this.onResultCallback = null;
        this.onErrorCallback = null;
        this.onCloseCallback = null;
    }

    generateTaskId() {
        return uuidv4().replace(/-/g, '').substring(0, 32);
    }

    start() {
        return new Promise((resolve, reject) => {
            this.taskId = this.generateTaskId();
            
            this.ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference/', {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            this.ws.on('open', () => {
                console.log('[DashScope ASR] WebSocket 连接已建立');
                this.sendRunTask();
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('error', (error) => {
                if (this.isStopped) {
                    console.log('[DashScope ASR] 连接已关闭，忽略错误');
                    return;
                }
                console.error('[DashScope ASR] WebSocket 错误:', error.message);
                if (this.onErrorCallback) {
                    this.onErrorCallback(error);
                }
                reject(error);
            });

            this.ws.on('close', () => {
                console.log('[DashScope ASR] 连接已关闭');
                this.isConnected = false;
                this.isTaskStarted = false;
                if (this.onCloseCallback) {
                    this.onCloseCallback();
                }
            });

            const timeout = setTimeout(() => {
                if (!this.isTaskStarted) {
                    reject(new Error('ASR 连接超时'));
                }
            }, 10000);

            this._resolveStart = (result) => {
                clearTimeout(timeout);
                resolve(result);
            };
            this._rejectStart = (error) => {
                clearTimeout(timeout);
                reject(error);
            };
        });
    }

    sendRunTask() {
        const runTaskMsg = {
            header: {
                action: 'run-task',
                task_id: this.taskId,
                streaming: 'duplex'
            },
            payload: {
                task_group: 'audio',
                task: 'asr',
                function: 'recognition',
                model: 'fun-asr-realtime',
                parameters: {
                    format: 'pcm',
                    sample_rate: 16000,
                    language_hints: ['zh', 'en']
                },
                input: {}
            }
        };
        this.ws.send(JSON.stringify(runTaskMsg));
        console.log('[DashScope ASR] 已发送 run-task 指令');
    }

    handleMessage(data) {
        try {
            const msg = JSON.parse(data.toString());
            const event = msg.header?.event;

            if (event === 'task-started') {
                console.log('[DashScope ASR] 任务启动成功');
                this.isConnected = true;
                this.isTaskStarted = true;
                if (this._resolveStart) {
                    this._resolveStart({ status: 'ready' });
                }
            } else if (event === 'result-generated') {
                const sentence = msg.payload?.output?.sentence;
                if (sentence) {
                    const result = {
                        text: sentence.text,
                        isPartial: !sentence.end_time,
                        beginTime: sentence.begin_time,
                        endTime: sentence.end_time
                    };
                    if (this.onResultCallback) {
                        this.onResultCallback(result);
                    }
                }
            } else if (event === 'task-finished') {
                console.log('[DashScope ASR] 任务完成', msg.payload?.usage?.duration ? `时长: ${msg.payload.usage.duration}s` : '');
            } else if (event === 'task-failed') {
                console.error('[DashScope ASR] 任务失败:', msg.header?.error_message);
                if (this.onErrorCallback) {
                    this.onErrorCallback(new Error(msg.header?.error_message || 'ASR 任务失败'));
                }
            }
        } catch (e) {
            console.error('[DashScope ASR] 解析消息失败:', e);
        }
    }

    sendAudio(pcmBuffer) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isTaskStarted) {
            this.ws.send(pcmBuffer);
            console.log('[DashScope ASR] 发送音频数据:', pcmBuffer.length, 'bytes');
        } else {
            console.log('[DashScope ASR] 无法发送，状态:', this.ws?.readyState, 'taskStarted:', this.isTaskStarted);
        }
    }

    stop() {
        return new Promise((resolve) => {
            if (!this.isTaskStarted || !this.ws) {
                resolve();
                return;
            }

            const finishMsg = {
                header: {
                    action: 'finish-task',
                    task_id: this.taskId,
                    streaming: 'duplex'
                },
                payload: {
                    input: {}
                }
            };
            this.ws.send(JSON.stringify(finishMsg));
            console.log('[DashScope ASR] 已发送 finish-task 指令');

            const timeout = setTimeout(() => {
                if (this.ws) {
                    this.ws.close();
                }
                resolve();
            }, 3000);

            this._resolveStop = () => {
                clearTimeout(timeout);
                resolve();
            };
        });
    }

    onResult(callback) {
        this.onResultCallback = callback;
    }

    onError(callback) {
        this.onErrorCallback = callback;
    }

    onClose(callback) {
        this.onCloseCallback = callback;
    }
}

module.exports = DashScopeASR;