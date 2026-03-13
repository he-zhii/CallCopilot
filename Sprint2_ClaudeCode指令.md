# CallCopilot Sprint 2 — Claude Code 开发指令

> **目标：** 接入通义千问 LLM，实现预生成 Bubble 话术建议，验证话术质量
> **技术栈：** 在 Sprint 1 基础上新增通义千问 qwen-turbo API
> **用时：** Day 3-4
> **验证标准：** 对着麦克风说一段对话，后台自动生成 2-4 个 Bubble 话术，话术自然口语化且策略多样

---

## 项目上下文（每次开新对话时先发给 Claude Code）

```
我在开发 CallCopilot，一个通话实时 AI 辅助工具。

Sprint 1 已完成：
- Node.js + Express + WebSocket 后端
- 阿里云 DashScope Fun-ASR 实时语音识别（WebSocket 直连）
- 前端麦克风采集 + 实时转写显示
- Clean Professional 设计风格

当前项目结构：
callcopilot/
├── server/
│   ├── index.js              # Express + WebSocket 服务器
│   └── dashscope-asr.js      # 阿里云 Fun-ASR 客户端
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── app.js
│       ├── audio-capture.js
│       └── ws-client.js
├── .env
└── package.json

当前阶段：Sprint 2 — LLM 话术生成验证

核心机制：「预生成」模式
- AI 全程监听对话，每当检测到一段完整语句，后台自动触发 LLM 生成 Bubble 建议
- 生成结果存入 Bubble 缓存池，按时间线排列
- 用户按按钮时直接取缓存，不需要等 LLM 生成
- 说话人不做技术区分，让 LLM 根据对话上下文自己判断谁是用户、谁是对方
```

---

## Step 1：新增文件结构 + 依赖

```
在现有 callcopilot 项目基础上新增以下文件：

server/
├── llm-engine.js          # 通义千问 API 调用 + Prompt 管理
├── dialogue-manager.js    # 对话状态管理 + LLM 触发逻辑
└── bubble-cache.js        # Bubble 时间线缓存

新增依赖：无。通义千问使用 OpenAI 兼容格式的 HTTP API，用 Node.js 原生 fetch 即可（Node 18+）。

.env 中已有 DASHSCOPE_API_KEY，通义千问和 ASR 共用同一个 Key，不需要新增环境变量。
```

---

## Step 2：对话状态管理（dialogue-manager.js）

```
创建 server/dialogue-manager.js，负责管理实时对话状态和触发 LLM 生成。

### 核心职责

1. 维护一个对话 transcript 数组（从 ASR 持续接收的转写结果）
2. 判断何时触发 LLM 生成 Bubble
3. 触发时调用 llm-engine 生成建议
4. 将结果存入 bubble-cache

### 数据结构

transcript 数组的每一项：
{
  text: "识别出的文字",
  timestamp: Date.now(),
  isPartial: false       // 只存最终结果，不存中间结果
}

### LLM 触发逻辑（关键）

不是每句话都触发 LLM，需要有策略：

触发条件（满足任一即触发）：
- 条件 A：收到一条 final 结果后，静默超过 1.5 秒没有新的 final 结果
- 条件 B：距离上次 LLM 调用超过 8 秒，且期间有新的 final 结果

防抖/节流规则：
- 两次 LLM 调用之间至少间隔 3 秒
- 如果上一次 LLM 调用还在进行中（未返回），跳过本次触发

具体实现：
- 每次收到 final 结果时，重置一个 1.5 秒的 debounce 定时器
- 定时器到期时检查：是否满足间隔 3 秒？上次调用是否已完成？
- 如果满足，取最近的 transcript 构建 prompt，调用 LLM
- 同时维护一个 8 秒的轮询定时器作为兜底

### 构建 LLM 输入时的 transcript 窗口

- 取最近 20 条 final 结果（或最近 3 分钟内的，以少的为准）
- 格式化为时间顺序的纯文本对话记录
- 不做说话人标注（让 LLM 自己判断）

### 导出接口

class DialogueManager {
  constructor(llmEngine, bubbleCache)

  // 接收 ASR 结果（由 index.js 调用）
  addTranscript(text, isPartial)

  // 设置用户预设上下文（通话前输入的背景信息）
  setUserContext(contextText)

  // 获取当前 transcript（供调试用）
  getTranscript()

  // 清理资源（停止定时器等）
  destroy()
}

事件：
- 'bubble_generated' 事件：当新的 Bubble 组生成时触发，携带 bubble 数据
```

---

## Step 3：LLM 引擎（llm-engine.js）

```
创建 server/llm-engine.js，封装通义千问 API 调用。

### API 信息

- Endpoint: https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
- Model: qwen-turbo（速度优先）
- 鉴权: Authorization: Bearer ${DASHSCOPE_API_KEY}
- 兼容 OpenAI Chat Completions 格式

### System Prompt（核心，直接写在代码中）

你是 CallCopilot，一个通话实时辅助 AI。用户正在打电话，需要你根据对话内容提供话术建议。

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
- 如果对话内容太少或无法判断语境，依然要给出通用的接话建议（如"嗯嗯您说"、"我理解"等）

### API 调用实现

async function generateBubbles(transcript, userContext) {
  // transcript: 格式化的对话文本
  // userContext: 用户预设的背景信息（可能为空）

  // 构建 user message
  let userMessage = '';
  if (userContext) {
    userMessage += `【用户背景信息】\n${userContext}\n\n`;
  }
  userMessage += `【实时对话记录】\n${transcript}\n\n请生成 Bubble 话术建议：`;

  // 调用通义千问 API
  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
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

  // 解析响应
  // 注意：response_format: json_object 强制模型输出合法 JSON
  // 但仍需要 try-catch 解析，以防格式异常
}

### 返回值

成功时返回：
{
  context_summary: "对方刚才说了什么",
  bubbles: [
    { preview: "...", full_text: "...", strategy: "..." },
    ...
  ],
  generated_at: Date.now()
}

失败时返回 null，并打印错误日志。

### 结果校验

解析 JSON 后做以下校验（不通过则丢弃本次结果，不报错）：
- bubbles 是数组且长度 2-4
- 每个 bubble 都有 preview、full_text、strategy 字段
- preview 长度 ≤ 8 个字符
- full_text 长度 ≤ 40 个字符
- 如果某条 bubble 超长，尝试截断到限制长度而不是丢弃整组

### 导出

class LLMEngine {
  constructor(apiKey)

  // 生成 Bubble 建议
  async generateBubbles(transcript, userContext): Promise<BubbleGroup | null>

  // 是否正在生成中
  isGenerating(): boolean
}
```

---

## Step 4：Bubble 缓存池（bubble-cache.js）

```
创建 server/bubble-cache.js，维护 Bubble 时间线数据。

### 数据结构

时间线是一个数组，每一项代表一组 Bubble：
{
  id: "唯一ID（uuid）",
  context_summary: "对方刚才说了什么",
  bubbles: [
    { preview: "...", full_text: "...", strategy: "..." },
    ...
  ],
  generated_at: 1710300000000,  // 生成时间戳
  transcript_snapshot: "触发时的最后一句转写"  // 用于调试
}

### 行为规则

- 新增一组时追加到数组末尾（最新的在最后）
- 最多保留最近 5 组，超出时移除最旧的
- 每组有唯一 id，方便前端追踪

### 导出

class BubbleCache {
  constructor()

  // 添加一组新的 Bubble
  addGroup(bubbleGroup): void

  // 获取完整时间线
  getTimeline(): BubbleGroup[]

  // 获取最新一组
  getLatest(): BubbleGroup | null

  // 清空
  clear(): void

  // 是否有新的未读组（用于通知前端）
  hasNew(): boolean
  markRead(): void
}
```

---

## Step 5：串联到现有后端（修改 server/index.js）

```
修改 server/index.js，将 Sprint 2 的新模块串联到已有的 ASR 流程中。

### 初始化

在服务器启动时：
1. 创建 LLMEngine 实例（传入 DASHSCOPE_API_KEY）
2. 创建 BubbleCache 实例
3. 创建 DialogueManager 实例（传入 llmEngine 和 bubbleCache）

### 数据流改动

原有流程（Sprint 1）：
前端音频 → 后端 → DashScope ASR → 转写结果 → 前端显示

新增流程（Sprint 2）：
转写结果 → DialogueManager.addTranscript()
                ↓（触发条件满足时）
         LLMEngine.generateBubbles()
                ↓
         BubbleCache.addGroup()
                ↓
         通过 WebSocket 推送给前端

### WebSocket 消息新增类型

后端 → 前端的新消息：

新 Bubble 组生成时：
{
  "type": "bubble_group",
  "data": {
    "id": "uuid",
    "context_summary": "对方在问价格",
    "bubbles": [
      { "preview": "老客福利", "full_text": "...", "strategy": "转移赠品" },
      ...
    ],
    "generated_at": 1710300000000
  }
}

前端 → 后端的新消息：

设置用户上下文（通话前）：
{
  "type": "set_context",
  "context": "客户姓李，之前拍了3999套餐，今天回访问满意度"
}

### 前端临时展示（Sprint 2 阶段用简单 UI 即可）

在现有转写区域下方，新增一个"AI 建议"区域：
- 收到 bubble_group 消息时，显示最新一组 Bubble
- 每个 Bubble 显示 preview 文字，点击展开显示 full_text 和 strategy
- 旧的组往上推，新的在底部
- 用简单的卡片样式即可，不需要做完整的 Bubble UI（Sprint 3 再做）

同时在转写区域上方增加：
- 一个可折叠的"通话准备"区域
- 包含一个 textarea："输入通话背景信息（可选）"
- 一个"设置"按钮，点击后通过 WebSocket 发送 set_context 消息
- 默认折叠，有一个小箭头可以展开
```

---

## Step 6：Prompt 测试脚本

```
创建 test/prompt-test.js，用于离线测试 prompt 质量，不需要启动服务器或麦克风。

### 功能

1. 读取 DASHSCOPE_API_KEY 环境变量
2. 定义 5 个测试场景（预设的对话 transcript）
3. 分别调用 LLMEngine.generateBubbles()
4. 打印结果并做质量检查

### 测试场景

场景 1 - 客户问价格（有上下文）：
  userContext: "我是XX婚纱摄影的销售小陈，客户姓李，之前拍了3999套餐"
  transcript: "收到了收到了整体还行吧\n有几张确实挺好看的\n这个套餐能不能便宜点我朋友也想拍"

场景 2 - 客户开玩笑（有上下文）：
  userContext: "我是摄影店的销售"
  transcript: "嗯我看了一下价格单\n你们这价格是把金子镶上去了吧"

场景 3 - 客户投诉（有上下文）：
  userContext: "婚纱摄影客户回访"
  transcript: "照片收到了\n上次拍的照片我不太满意修图感觉不够细致\n有些地方皮肤看起来还是不太好"

场景 4 - 客户犹豫（无上下文）：
  userContext: ""
  transcript: "嗯我再考虑考虑吧\n回头联系你\n主要是想跟家里人商量一下"

场景 5 - 冷场/对话很少（无上下文）：
  userContext: ""
  transcript: "嗯\n哦\n好的"

### 质量检查项

对每个场景的结果检查并打印 PASS/FAIL：
- [ ] JSON 解析成功
- [ ] bubbles 数量 2-4 个
- [ ] 所有 preview ≤ 8 字符
- [ ] 所有 full_text ≤ 40 字符
- [ ] 各 bubble 的 strategy 互不相同
- [ ] full_text 读起来像口语（简单启发：包含至少一个语气词如 "嗯/哈哈/其实/您看/呢/吧/啊/哦"，或人称代词 "我/您/你/咱们"）

### 运行方式

node test/prompt-test.js

输出格式：
--- 场景 1: 客户问价格 ---
上下文: 我是XX婚纱摄影的销售小陈...
Transcript: 收到了收到了整体还行吧...

结果:
  概要: 客户想砍价，朋友也想拍
  Bubble 1: [老客福利] "李姐您是老客户了，带朋友来两位一起有专属折扣" (策略: 老带新)
  Bubble 2: [升级更值] "其实加800升级套餐多一组外景，算下来单价更低" (策略: 推升级)
  Bubble 3: [帮您问问] "价格我不太好做主，帮您跟店长申请个特别优惠" (策略: 缓兵之计)

检查:
  ✅ JSON 合法
  ✅ Bubble 数量: 3
  ✅ Preview 长度均 ≤ 8
  ✅ Full_text 长度均 ≤ 40
  ✅ Strategy 互不相同
  ✅ 口语化检查通过

--- 场景 2: 客户开玩笑 ---
...

=== 总结 ===
通过: 4/5
失败: 场景 5（冷场场景 full_text 超长）
```

---

## Step 7：端到端测试

```
完成所有代码后，帮我检查以下集成点：

1. 启动服务器，打开浏览器页面
2. 在"通话准备"区域输入上下文（可选），点击设置
3. 点击"开始监听"，对着麦克风说几句话
4. 观察：
   - 转写区域是否正常显示文字？（Sprint 1 功能不能被破坏）
   - 后端控制台是否打印 LLM 触发日志？
   - 前端是否收到 bubble_group 消息？
   - AI 建议区域是否显示 Bubble？

5. 在 server/index.js 中添加详细日志：
   - [ASR] 收到 final 结果: "xxx"
   - [Dialogue] 添加 transcript，当前共 N 条
   - [Dialogue] 触发 LLM 生成（上次触发 X 秒前）
   - [LLM] 调用通义千问 API...
   - [LLM] 收到响应，耗时 Xms
   - [LLM] 解析结果：N 个 Bubble
   - [LLM] 校验结果：PASS / FAIL（原因）
   - [Bubble] 新增一组，时间线共 N 组
   - [WS] 推送 bubble_group 给前端

这些日志对调试非常重要，请确保每个关键节点都有打印。
```

---

## Sprint 2 验收标准

完成后对照检查：

| 验证项             | 方法                     | 合格标准                   |
| --------------- | ---------------------- | ---------------------- |
| prompt-test 通过率 | 运行 test/prompt-test.js | 至少 4/5 场景通过所有检查        |
| LLM 响应速度        | 看后端日志的耗时               | qwen-turbo < 2 秒       |
| JSON 输出合法率      | 看日志中的校验结果              | > 90% 成功解析             |
| 触发频率合理          | 连续说话 1 分钟，看触发次数        | 约每 5-10 秒触发一次，不会每句话都触发 |
| 话术自然度           | 人工阅读                   | 像人说的话，不像 AI 八股         |
| 策略多样性           | 人工判断                   | 同组内各 bubble 方向不同       |
| Sprint 1 不被破坏   | 正常使用转写功能               | ASR 转写正常，无报错           |

---

## 重要提醒

1. **Prompt 是 Sprint 2 的灵魂。** 代码逻辑 Claude Code 可以一次性写对，但 prompt 需要看到实际输出后反复调。先跑 prompt-test.js，不满意就修改 system prompt 再跑。

2. **预生成机制的触发频率很影响成本。** 如果每句话都触发 LLM，一通 10 分钟的电话可能触发 60-100 次调用。按上面的防抖逻辑（1.5s 静默 + 3s 最小间隔），大约控制在 10-20 次，成本可接受。

3. **Sprint 2 的前端 UI 可以简陋。** 重点是验证后端链路和话术质量。完整的 Bubble 时间线 UI 在 Sprint 3 做。
