const { v4: uuidv4 } = require('uuid');

const SYSTEM_PROMPT = `你是 CallCopilot，一个通话实时辅助 AI。用户正在打电话，需要你根据对话内容提供话术建议。

## 你的任务
分析当前对话，判断谁是"用户"（打电话寻求帮助的人）、谁是"对方"（通话另一端的人）。然后针对对方最近说的内容，生成 2-4 个 Bubble 话术建议，帮助用户接话。

## 说话人判断规则
对话记录中没有标注说话人。你需要通过以下线索判断：
- 如果提供了"用户背景信息"，根据背景推断谁是用户（例如背景说"我是摄影店的销售"，那么推销/介绍产品的是用户）
- 如果没有背景信息，根据对话语境推断：通常最后提问/提出需求/表达疑虑的一方是"对方"，而需要回应的一方是"用户"
- 不确定时，优先假设最后发言的人是"对方"

## 输出格式（严格 JSON，不要输出任何其他内容）
{
  "context_summary": "对方刚才说了什么（一句话中文概括，不超过15字）",
  "bubbles": [
    {
      "preview": "话术预览（不超过8个中文字符，用户扫一眼就能判断方向）",
      "full_text": "完整话术（不超过40个中文字符，自然口语化，可以直接说出口）",
      "strategy": "策略标签（2-4个中文字符）"
    }
  ]
}

## 话术硬性要求
1. 自然口语：像真人聊天，可以带语气词（"哈哈"、"其实"、"您看"、"嗯"），绝对不能像书面语或 AI 八股文
2. 人称：用"我"、"我们"、"您"或"你"（根据对话语境判断用哪个）
3. 策略多样：每个 Bubble 必须代表不同的应对策略/方向，不是同一个意思的不同说法
4. 情绪匹配：对方语气轻松→话术也轻松；对方严肃/不满→先共情再解决
5. 长度严格控制：preview 必须不超过 8 个中文字符，full_text 必须不超过 40 个中文字符
6. 实用优先：每句话术必须是用户可以直接开口说的完整句子，不要省略号、不要半句话
7. 如果对方在开玩笑，至少有一个高情商/幽默的回应选项

## 重要
- 只输出 JSON，不要任何解释、前缀或 markdown 代码块标记
- bubbles 数量 2-4 个，不多不少
- 如果对话内容太少或无法判断语境，依然要给出通用的接话建议（如"嗯嗯您说"、"我理解"等）`;

class LLMEngine {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.isGenerating = false;
    }

    async generateBubbles(transcript, userContext) {
        if (this.isGenerating) {
            console.log('[LLM] 上次调用还未完成，跳过本次');
            return null;
        }

        this.isGenerating = true;
        const startTime = Date.now();

        try {
            let userMessage = '';
            if (userContext) {
                userMessage += `【用户背景信息】\n${userContext}\n\n`;
            }
            userMessage += `【实时对话记录】\n${transcript}\n\n请生成 Bubble 话术建议：`;

            console.log('[LLM] 调用通义千问 API...');

            const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'qwen-turbo',
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: userMessage }
                    ],
                    temperature: 0.8,
                    max_tokens: 600,
                    response_format: { type: 'json_object' }
                })
            });

            const data = await response.json();
            const elapsed = Date.now() - startTime;
            console.log(`[LLM] 收到响应，耗时 ${elapsed}ms`);

            let bubblePreviews = [];
            try {
                const parsed = JSON.parse(content);
                if (parsed.bubbles && Array.isArray(parsed.bubbles)) {
                    bubblePreviews = parsed.bubbles.map(b => b.preview || '');
                }
            } catch (e) {}
            if (bubblePreviews.length > 0) {
                console.log(`[LLM] Bubbles: [${bubblePreviews.join('] [')}]`);
            }

            if (!data.choices || !data.choices[0]) {
                console.error('[LLM] 响应格式异常:', data);
                return null;
            }

            const content = data.choices[0].message.content;
            let result;

            try {
                result = JSON.parse(content);
            } catch (e) {
                console.error('[LLM] JSON 解析失败:', e.message);
                return null;
            }

            const validation = this.validateResult(result);
            if (!validation.valid) {
                console.log(`[LLM] 校验结果：FAIL（${validation.reason}）`);
                return null;
            }

            console.log(`[LLM] 校验结果：PASS，生成 ${result.bubbles.length} 个 Bubble`);

            return {
                context_summary: result.context_summary,
                bubbles: result.bubbles,
                generated_at: Date.now()
            };

        } catch (error) {
            console.error('[LLM] 调用失败:', error.message);
            return null;
        } finally {
            this.isGenerating = false;
        }
    }

    validateResult(result) {
        if (!result || !result.bubbles || !Array.isArray(result.bubbles)) {
            return { valid: false, reason: 'bubbles 不是数组' };
        }

        const bubbleCount = result.bubbles.length;
        if (bubbleCount < 2 || bubbleCount > 4) {
            return { valid: false, reason: `Bubble 数量 ${bubbleCount} 不在 2-4 范围内` };
        }

        const strategies = new Set();

        for (const bubble of result.bubbles) {
            if (!bubble.preview || !bubble.full_text || !bubble.strategy) {
                return { valid: false, reason: 'Bubble 字段不完整' };
            }

            if (this.getCharCount(bubble.preview) > 8) {
                return { valid: false, reason: `preview 超长: ${bubble.preview}` };
            }

            if (this.getCharCount(bubble.full_text) > 40) {
                return { valid: false, reason: `full_text 超长: ${bubble.full_text}` };
            }

            strategies.add(bubble.strategy);
        }

        if (strategies.size < bubbleCount) {
            return { valid: false, reason: '策略有重复' };
        }

        return { valid: true };
    }

    getCharCount(str) {
        return str.replace(/[^\u4e00-\u9fa5]/g, '').length + 
               str.replace(/[\u4e00-\u9fa5]/g, '').length;
    }

    isGeneratingStatus() {
        return this.isGenerating;
    }
}

module.exports = LLMEngine;