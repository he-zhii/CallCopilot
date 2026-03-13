const axios = require('axios');
const WebSocket = require('ws');

const API_KEY = 'sk-b8db5c71719d4e77a418f4e47ff2f188';

async function testLLM() {
    console.log('\n========== 测试 LLM (qwen-turbo) ==========');
    try {
        const response = await axios.post(
            'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            {
                model: 'qwen-turbo',
                messages: [
                    { role: 'user', content: '你好，请用一句话介绍你自己' }
                ],
                max_tokens: 100
            },
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('✅ LLM 调用成功！');
        console.log('响应:', JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        console.error('❌ LLM 调用失败:');
        if (error.response) {
            console.error('状态码:', error.response.status);
            console.error('错误信息:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        return false;
    }
}

function testASR() {
    return new Promise((resolve) => {
        console.log('\n========== 测试 ASR (Fun-ASR 实时识别) ==========');
        
        const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference/', {
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });

        let taskStarted = false;
        const taskId = 'test-task-' + Date.now();

        ws.on('open', () => {
            console.log('✅ WebSocket 连接已建立');
            
            const runTaskMsg = {
                header: {
                    action: 'run-task',
                    task_id: taskId,
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
            ws.send(JSON.stringify(runTaskMsg));
            console.log('已发送 run-task 指令');
        });

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                console.log('收到消息:', JSON.stringify(msg, null, 2));
                
                if (msg.header?.event === 'task-started') {
                    taskStarted = true;
                    console.log('✅ ASR 任务启动成功！');
                    
                    const silenceBuffer = Buffer.alloc(3200);
                    ws.send(silenceBuffer);
                    console.log('已发送静音数据测试连接');
                    
                    setTimeout(() => {
                        const finishMsg = {
                            header: {
                                action: 'finish-task',
                                task_id: taskId,
                                streaming: 'duplex'
                            },
                            payload: {
                                input: {}
                            }
                        };
                        ws.send(JSON.stringify(finishMsg));
                        console.log('已发送 finish-task 指令');
                    }, 1000);
                }
                
                if (msg.header?.event === 'task-finished') {
                    console.log('✅ ASR 任务完成！');
                    ws.close();
                    resolve(true);
                }
                
                if (msg.header?.event === 'task-failed') {
                    console.error('❌ ASR 任务失败:', msg.header.error_message);
                    ws.close();
                    resolve(false);
                }
            } catch (e) {
                console.error('解析消息失败:', e);
            }
        });

        ws.on('error', (error) => {
            console.error('❌ WebSocket 错误:');
            console.error(error.message);
            resolve(false);
        });

        ws.on('close', () => {
            console.log('WebSocket 连接已关闭');
        });

        setTimeout(() => {
            if (!taskStarted) {
                console.log('⏰ 超时，关闭连接');
                ws.close();
                resolve(false);
            }
        }, 10000);
    });
}

async function main() {
    console.log('开始测试 DashScope API Key...');
    console.log('API Key:', API_KEY.substring(0, 10) + '...');
    
    const llmResult = await testLLM();
    const asrResult = await testASR();
    
    console.log('\n========== 测试结果汇总 ==========');
    console.log('LLM 测试:', llmResult ? '✅ 通过' : '❌ 失败');
    console.log('ASR 测试:', asrResult ? '✅ 通过' : '❌ 失败');
    
    if (llmResult && asrResult) {
        console.log('\n🎉 API Key 验证完全通过！');
    } else {
        console.log('\n⚠️ 部分测试失败，请检查 API Key 权限');
    }
}

main();