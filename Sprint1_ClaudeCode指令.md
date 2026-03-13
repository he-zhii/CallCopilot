# CallCopilot Sprint 1 — Claude Code 开发指令

> **目标：** 收音 + 实时 ASR 转写验证
> **技术栈：** Node.js + Express + WebSocket + 阿里云 Fun-ASR（DashScope WebSocket API）
> **用时：** Day 1-2
> **验证标准：** 手机免提放旁边说话，页面上 1 秒内出现转写文字，识别率 > 70%

---

## 项目上下文（每次开新对话时先发给 Claude Code）

```
我在开发一个通话实时 AI 辅助工具 CallCopilot。

技术栈：
- 后端：Node.js + Express + ws（WebSocket）
- 前端：原生 HTML/CSS/JS，移动端优先（375px 竖屏设计）
- ASR：阿里云 DashScope Fun-ASR 实时语音识别（WebSocket 协议直连）
- LLM：通义千问 qwen-turbo（Sprint 2 再接入）
- 设计风格：Clean Professional（极简商务风，类 Linear/Notion）

核心交互：
- 手机开免提打电话，旁边设备（电脑/平板）收音
- AI 全程后台监听对话，持续预生成话术建议
- 用户按悬浮按钮，屏幕弹出 Bubble 时间线
- 每个 Bubble 是一种回话方向（≤8字预览），点开看完整话术（≤40字）

当前阶段：Sprint 1 — 收音 + ASR 验证
```

---

## Step 1：项目初始化

```
帮我创建 CallCopilot 项目，结构如下：

callcopilot/
├── server/
│   ├── index.js              # Express + WebSocket 服务器
│   └── dashscope-asr.js      # 阿里云 DashScope ASR WebSocket 客户端
├── public/
│   ├── index.html            # 主页面（移动端优先）
│   ├── css/
│   │   └── style.css         # 全局样式
│   └── js/
│       ├── app.js            # 主逻辑
│       ├── audio-capture.js  # 麦克风采集
│       └── ws-client.js      # 前端 WebSocket 客户端
├── .env.example              # 环境变量示例
├── .gitignore
├── package.json
└── README.md

后端依赖：
- express
- ws
- dotenv
- uuid

.env.example 内容：
DASHSCOPE_API_KEY=你的百炼API_Key

.gitignore 忽略：node_modules, .env

服务器启动后：
- Express 在端口 3000 提供 public/ 静态文件
- WebSocket 服务器监听路径 /ws/asr
- 打印 "CallCopilot server running on http://localhost:3000"

先不接 ASR，WebSocket 连接成功后 echo "connected" 即可。
```

---

## Step 2：前端页面 + 麦克风采集

```
实现前端页面和麦克风音频采集。设计风格：Clean Professional（极简商务风）。

### 页面布局（移动端优先，375px 宽度）

顶部状态栏：
- 左侧：CallCopilot 标题（DM Sans 或 Noto Sans SC 字体）
- 右侧：连接状态指示灯（绿色=已连接，灰色=未连接，红色=错误）
- 通话计时器（00:00 格式，开始监听后计时）

中间主体：实时转写区域
- 占屏幕主体部分
- 初始状态显示提示文字："点击下方按钮开始监听"
- 开始后显示转写文字，新内容自动滚动到底部
- 区分正在转写（灰色斜体 + 闪烁光标）和已确认文字（黑色正体）

底部：
- 一个大的圆形按钮：「开始监听」/「停止监听」切换
- 按钮状态：
  - 未开始：蓝色底 + 麦克风图标
  - 监听中：红色底 + 脉冲动画 + 停止图标
  - 错误：灰色 + 叹号

### 音频采集实现

点击"开始监听"后：
1. 请求麦克风权限 navigator.mediaDevices.getUserMedia({ audio: true })
2. 创建 AudioContext
3. 用 ScriptProcessorNode（bufferSize: 4096）采集原始音频
4. 浏览器原生采样率可能是 44100 或 48000，需要重采样到 16000Hz
5. 输出格式：16bit PCM，单声道
6. 每采集约 100ms 的数据（约 3200 字节 = 16000 * 2 * 0.1），通过 WebSocket 发送给后端
7. 用 Binary Frame 发送 PCM 数据

重采样方法：
- 使用线性插值将 44100/48000 下采样到 16000
- 不需要外部库，手写即可

注意：
- 移动端 AudioContext 必须在用户手势（click）事件中创建
- iOS Safari 需要先 resume AudioContext
- viewport meta 标签必须设置：<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
- 按钮最小高度 56px（手指友好）
- 字体 16px 起步（防止 iOS 自动缩放）
```

---

## Step 3：接入阿里云 DashScope Fun-ASR

这是最关键的一步。以下是 DashScope Fun-ASR 实时语音识别的 **WebSocket 协议规范**，从官方文档提取：

```
实现 server/dashscope-asr.js，接入阿里云 DashScope Fun-ASR 实时语音识别。

### 连接信息

- WebSocket 地址：wss://dashscope.aliyuncs.com/api-ws/v1/inference/
- 鉴权方式：WebSocket 连接时在 headers 中带上 Authorization: bearer ${DASHSCOPE_API_KEY}
- API Key 从环境变量 DASHSCOPE_API_KEY 读取

### 协议流程

1. 建立 WebSocket 连接（带 Authorization header）
2. 发送 run-task 指令（JSON Text Frame）
3. 等待服务端返回 task-started 事件
4. 开始发送音频二进制数据（Binary Frame）
5. 服务端持续返回 result-generated 事件（包含识别结果）
6. 音频发送结束后，发送 finish-task 指令
7. 等待 task-finished 事件
8. 关闭连接

### run-task 指令格式

{
  "header": {
    "action": "run-task",
    "task_id": "32位随机ID，如uuid去掉横线取前32位",
    "streaming": "duplex"
  },
  "payload": {
    "task_group": "audio",
    "task": "asr",
    "function": "recognition",
    "model": "fun-asr-realtime",
    "parameters": {
      "format": "pcm",
      "sample_rate": 16000,
      "language_hints": ["zh", "en"]
    },
    "input": {}
  }
}

### finish-task 指令格式

{
  "header": {
    "action": "finish-task",
    "task_id": "和 run-task 相同的 task_id",
    "streaming": "duplex"
  },
  "payload": {
    "input": {}
  }
}

### 服务端事件格式

task-started 事件：
{
  "header": {
    "task_id": "xxx",
    "event": "task-started",
    "attributes": {}
  }
}

result-generated 事件（识别结果）：
{
  "header": {
    "task_id": "xxx",
    "event": "result-generated",
    "attributes": {}
  },
  "payload": {
    "output": {
      "sentence": {
        "text": "识别出的文字",
        "begin_time": 1234,
        "end_time": 5678
      }
    }
  }
}

重要：result-generated 事件会多次返回。
- 如果 sentence 中没有 end_time 或句子未完成，是中间结果（正在说的话，会不断更新）
- 如果句子完成（有完整的 begin_time 和 end_time），是最终结果（一句话说完了）
- 可以通过观察 text 是否变化来判断是中间还是最终结果

task-finished 事件：
{
  "header": {
    "task_id": "xxx",
    "event": "task-finished",
    "attributes": {}
  },
  "payload": {
    "output": {},
    "usage": { "duration": 秒数 }
  }
}

task-failed 事件：
{
  "header": {
    "task_id": "xxx",
    "event": "task-failed",
    "error_code": "错误码",
    "error_message": "错误描述",
    "attributes": {}
  }
}

### 音频数据发送规范

- 格式：PCM，16000Hz，16bit，单声道
- 通过 WebSocket Binary Frame 发送
- 建议每次发送约 100ms 的音频（约 3200 字节）
- 发送间隔约 100ms

### 后端实现逻辑（server/dashscope-asr.js）

导出一个类 DashScopeASR，功能：
1. 构造函数接收 apiKey 参数
2. start() 方法：建立到 DashScope 的 WebSocket 连接，发送 run-task，等待 task-started
3. sendAudio(pcmBuffer) 方法：转发音频数据到 DashScope
4. stop() 方法：发送 finish-task，等待 task-finished，关闭连接
5. 事件回调：
   - onResult(callback)：收到识别结果时触发，callback 参数为 { text, isPartial, beginTime, endTime }
   - onError(callback)：出错时触发
   - onClose(callback)：连接关闭时触发

### 后端 WebSocket 服务器逻辑（server/index.js）

当前端 WebSocket 连接到 /ws/asr 时：
1. 创建一个 DashScopeASR 实例
2. 调用 start()，等待连接就绪
3. 前端发来的 Binary 消息（音频数据）→ 调用 sendAudio() 转发
4. DashScope 返回识别结果 → 通过 WebSocket 发回前端
5. 前端发来 "stop" 文本消息 → 调用 stop() 结束识别
6. 任何一方断开时做好清理

发回前端的消息格式（JSON）：
{
  "type": "asr_result",
  "text": "识别的文字",
  "isPartial": true/false
}

{
  "type": "status",
  "status": "ready" | "error" | "closed",
  "message": "可选的说明"
}

### 前端接收和展示

前端 ws-client.js 收到消息后：
- type === "status" && status === "ready"：更新状态指示灯为绿色
- type === "asr_result" && isPartial === true：更新"正在转写"区域（灰色斜体，持续替换）
- type === "asr_result" && isPartial === false：将文字追加到转写历史，清空"正在转写"区域
- type === "status" && status === "error"：显示错误提示

转写区域显示逻辑：
- 已确认的句子：黑色正体，每句一行，带时间戳
- 正在转写中：灰色斜体 + 末尾闪烁光标动画，实时更新
- 自动滚动到底部
```

---

## Step 4：本地测试验证

```
项目完成后，帮我添加以下内容：

1. README.md：
   - 项目说明
   - 环境要求（Node.js 18+）
   - 安装步骤（npm install, 配置 .env）
   - 启动命令（node server/index.js）
   - 手机访问方式（同一局域网下访问电脑 IP:3000）
   - 注意：非 localhost 访问需要 HTTPS 才能使用麦克风
     - 方案 A：用 ngrok（ngrok http 3000）
     - 方案 B：Chrome 手机版可以在 chrome://flags 里允许特定 IP 的不安全来源

2. 添加一个简单的连接测试页面 public/test.html：
   - 点击按钮连接 WebSocket
   - 显示连接状态
   - 不采集音频，只测试 WebSocket 和 DashScope 连接是否正常
   - 发送一段预录的测试音频（可选，如果有的话）

3. 在 server/index.js 中添加错误处理：
   - DashScope API Key 未配置时，启动时打印友好提示
   - WebSocket 连接异常时不要 crash 整个服务器
   - 添加基本的日志打印（连接/断开/错误）
```

---

## 开发节奏提醒

- **Step 1 完成后**：确认 `npm start` 能启动，浏览器能打开页面
- **Step 2 完成后**：确认点击按钮能获取麦克风权限，控制台能看到音频数据大小的打印
- **Step 3 完成后**：对着麦克风说中文，页面上实时出现转写文字 ← **这是 Sprint 1 的核心验收点**
- **Step 4 完成后**：README 写好，手机能访问

如果 Step 3 遇到问题，优先排查：
1. DashScope API Key 是否正确
2. WebSocket 连接是否成功建立（看后端日志）
3. run-task 指令发送后是否收到 task-started 事件
4. 音频格式是否正确（PCM, 16000Hz, 16bit, 单声道）
5. 前端重采样是否正常（从 44100/48000 到 16000）
