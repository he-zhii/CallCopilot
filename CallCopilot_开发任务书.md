# CallCopilot MVP 开发任务书

> **技术栈：** Web (HTML/CSS/JS) + 阿里云实时 ASR + 通义千问 API
> **开发工具：** Claude Code
> **适配要求：** 移动端优先，手机浏览器可用
> **目标：** 10 天内跑通完整链路，用真实通话验证核心假设

---

## 〇、开发前准备（Day 0）

在写任何代码之前，先把这几件事搞定：

### 0.1 阿里云账号与服务开通

1. 登录阿里云控制台 → 搜索「智能语音交互」→ 开通服务
2. 创建项目 → 获取 `AppKey`
3. 在项目设置中选择「实时语音识别」，语言选中文普通话
4. 获取 `AccessKey ID` 和 `AccessKey Secret`（建议创建子账号 RAM 用户）
5. 阿里云实时 ASR 文档：https://help.aliyun.com/document_detail/324262.html

### 0.2 通义千问 API

1. 登录阿里云「百炼」平台（https://bailian.console.aliyun.com/）
2. 获取 API Key
3. 选择模型：**qwen-turbo**（速度最快，适合实时场景；如果质量不够再换 qwen-plus）
4. 通义千问 API 文档：https://help.aliyun.com/zh/model-studio/developer-reference/api-reference

### 0.3 本地开发环境

```bash
# 确保 Node.js 已安装（v18+）
node -v

# 创建项目目录
mkdir callcopilot && cd callcopilot

# 初始化项目
npm init -y
```

### 0.4 环境变量

创建 `.env` 文件（不要提交到 git）：

```
ALIYUN_ACCESS_KEY_ID=你的AccessKeyID
ALIYUN_ACCESS_KEY_SECRET=你的AccessKeySecret
ALIYUN_ASR_APP_KEY=你的ASR应用AppKey
DASHSCOPE_API_KEY=你的通义千问APIKey
```

---

## 一、Sprint 1 — 收音 + ASR 验证（Day 1-2）

### 1.1 目标

做一个最简页面：手机浏览器打开 → 点击「开始监听」→ 页面实时显示转写文字。验证免提场景下 ASR 识别率是否可接受。

### 1.2 Sprint 1 完成标准

- [ ] 手机浏览器能打开页面并获取麦克风权限
- [ ] 说话后 1 秒内页面上出现转写文字
- [ ] 手机开免提放旁边 50cm 距离，对方说话识别率 > 70%
- [ ] 能区分连续语句（不是所有文字糊成一坨）

### 1.3 技术架构

```
┌──────────────┐     WebSocket      ┌──────────────┐     WebSocket     ┌───────────────┐
│  手机浏览器    │ ←──────────────→  │  Node.js 后端  │ ←──────────────→ │  阿里云实时 ASR │
│ （麦克风采集）  │   音频流 / 转写结果  │  （中转代理）   │   音频流 / 转写   │               │
└──────────────┘                   └──────────────┘                   └───────────────┘
```

为什么需要 Node.js 后端：
- 阿里云实时 ASR 使用 WebSocket 协议连接，需要 AccessKey 签名鉴权
- 签名不能放在前端（会暴露密钥）
- 后端作为中转：前端把音频流发给后端，后端转发给阿里云，再把转写结果回传前端

### 1.4 项目结构

```
callcopilot/
├── server/
│   ├── index.js              # Express + WebSocket 服务器
│   ├── aliyun-asr.js         # 阿里云 ASR WebSocket 客户端
│   └── package.json
├── public/
│   ├── index.html            # 主页面（移动端优先）
│   ├── css/
│   │   └── style.css         # 样式
│   └── js/
│       ├── audio-capture.js  # 麦克风采集 + 音频处理
│       └── asr-client.js     # 与后端 WebSocket 通信
├── .env                      # 环境变量（不提交）
└── package.json
```

### 1.5 关键实现要点

#### 前端音频采集

```
核心要点：
- 使用 navigator.mediaDevices.getUserMedia({ audio: true }) 获取麦克风
- 使用 AudioWorklet 或 ScriptProcessorNode 获取原始 PCM 数据
- 采样率：16000Hz（阿里云 ASR 要求）
- 编码：16bit PCM（单声道）
- 每 100ms 发送一次音频数据到后端 WebSocket
- 注意：移动端浏览器需要用户手势（点击按钮）才能启动音频
```

#### 后端 ASR 中转

```
核心要点：
- Express 提供静态文件服务
- ws 库建立 WebSocket 服务器
- 接收前端音频流 → 转发给阿里云 ASR WebSocket
- 接收阿里云返回的转写结果 → 推送给前端
- 阿里云实时 ASR 返回两种结果：
  - 中间结果（partial）：正在说的句子，会不断更新
  - 最终结果（final）：一句话说完，确定的结果
- 两种结果都发给前端，前端用 partial 做实时显示，用 final 做最终记录
```

#### 移动端适配要点

```
核心要点：
- viewport meta 标签必须设置
- 按钮至少 48px 高度（手指点击友好）
- 字体 16px 起步（防止 iOS 自动缩放）
- 转写文字区域占屏幕主体，自动滚动到最新
- 全程竖屏设计
- HTTPS 必须（getUserMedia 在非 localhost 环境需要 HTTPS）
  - 开发阶段用 localhost 没问题
  - 如果需要手机访问电脑，可以用 ngrok 或者局域网 + 自签证书
```

### 1.6 给 Claude Code 的 Prompt（Sprint 1）

以下是你可以直接喂给 Claude Code 的 prompt，分步执行：

---

**Prompt 1-A：搭建项目骨架**

```
帮我创建一个 Node.js Web 项目 callcopilot，结构如下：

后端：
- Express 服务器，端口 3000
- 提供 public/ 目录的静态文件服务
- 使用 ws 库建立 WebSocket 服务器（路径 /ws/audio）
- 使用 dotenv 读取 .env 中的环境变量

前端：
- public/index.html：移动端优先的响应式页面
- 一个"开始监听"按钮
- 一个实时转写文字显示区域（可滚动）
- 一个状态指示器（未连接/监听中/已停止）

先不接 ASR，WebSocket 连接后简单 echo 音频数据大小即可。
确保手机浏览器（Chrome/Safari）能正常打开和使用。
```

---

**Prompt 1-B：接入麦克风采集**

```
在现有项目基础上，实现前端麦克风音频采集：

1. 点击"开始监听"后，请求麦克风权限
2. 使用 AudioContext + ScriptProcessorNode（或 AudioWorklet）采集音频
3. 采样率 16000Hz，16bit PCM，单声道
4. 每 100ms 将 PCM 数据通过 WebSocket 发送到后端
5. 后端收到后先打印数据大小（验证通路正常）
6. 点击"停止监听"关闭音频流和 WebSocket

注意：
- 移动端 AudioContext 需要在用户手势事件中创建
- 如果浏览器原生采样率不是 16000，需要做重采样
```

---

**Prompt 1-C：接入阿里云实时 ASR**

```
在后端接入阿里云实时语音识别 WebSocket 接口：

技术参数：
- 阿里云实时 ASR WebSocket 地址：wss://nls-gateway.aliyuncs.com/ws/v1
- 需要的参数：appkey（从 .env 读取）、token（需要通过 API 获取）
- 音频格式：PCM，16000Hz，16bit
- 获取 token 的 API：使用 @alicloud/pop-core SDK 调用 CreateToken

实现逻辑：
1. 前端 WebSocket 连接到后端时，后端同时建立到阿里云 ASR 的 WebSocket
2. 前端发送的音频数据，后端原样转发给阿里云
3. 阿里云返回的识别结果（JSON），后端解析后发送给前端
4. 前端接收到结果后：
   - 如果是中间结果（partial），更新当前正在输入的行
   - 如果是最终结果（final），追加一行新的确定文本
5. 页面上实时显示所有转写文字，自动滚动到最底部

请参考阿里云文档实现完整的 ASR 协议握手流程（StartTranscription 指令等）。
```

### 1.7 Sprint 1 验证测试

完成后做以下测试：

| 测试场景 | 方法 | 合格标准 |
|---------|------|---------|
| 近场识别 | 对着电脑麦克风正常说话 | 识别率 > 90% |
| 远场识别（核心） | 手机开免提放在旁边 50cm | 识别率 > 70% |
| 双人对话 | 两个人交替说话 | 能分段识别两个人的话 |
| 长时间稳定性 | 连续运行 10 分钟 | 不断连、不卡死 |
| 移动端 | 手机浏览器访问 | 页面正常、按钮可用 |

如果远场识别率低于 60%，考虑：
- 使用外接定向麦克风
- 调整 ASR 参数（开启降噪、语音增强）
- 缩短手机和采集设备的距离

---

## 二、Sprint 2 — LLM 话术生成验证（Day 3-4）

### 2.1 目标

在 Sprint 1 基础上，将转写文字喂给通义千问，验证 AI 生成的 Bubble 话术质量是否可用。这个阶段重点是调 prompt，UI 可以很粗糙。

### 2.2 Sprint 2 完成标准

- [ ] 转写出一段对话后，LLM 能在 2 秒内返回 Bubble 格式的建议
- [ ] 建议包含 2-4 个不同策略方向的话术
- [ ] 话术读起来自然、口语化，像人说的话
- [ ] Bubble 预览 ≤ 8 字，完整话术 ≤ 40 字

### 2.3 新增项目结构

```
server/
├── llm-engine.js             # 通义千问 API 调用 + Prompt 管理
├── dialogue-manager.js       # 对话状态管理（积累上下文、触发 LLM）
└── bubble-cache.js           # Bubble 缓存池（时间线数据结构）
```

### 2.4 核心 Prompt 设计

这是整个产品的灵魂，需要反复调试。初始版本：

```
你是一个通话辅助 AI。用户正在打电话，需要你实时提供话术建议。

## 你的任务
根据当前对话内容，生成 2-4 个 Bubble 建议。每个 Bubble 代表一种不同的回话方向。

## 输出格式（严格 JSON）
{
  "context_summary": "对方刚才说了什么（一句话概括，≤15字）",
  "bubbles": [
    {
      "preview": "话术预览（≤8字，用户扫一眼就能判断方向）",
      "full_text": "完整话术（≤40字，自然口语化，可以直接说出口）",
      "strategy": "策略标签（2-4字）"
    }
  ]
}

## 话术要求
1. 自然口语：像真人聊天，带语气词（"哈哈"、"其实"、"您看"）
2. 人称：用"我"、"我们"、"您"
3. 策略多样：每个 Bubble 必须是不同的策略方向，不是同一意思的不同说法
4. 情绪匹配：对方轻松→你也轻松；对方严肃/不满→先共情再解决
5. 长度硬约束：preview ≤ 8字，full_text ≤ 40字，超出立即重写

## 当前对话上下文
{user_context}

## 实时对话记录
{dialogue_transcript}

请生成建议（只输出 JSON，不要其他内容）：
```

### 2.5 预生成机制实现

```
核心逻辑（dialogue-manager.js）：

1. 维护一个对话 transcript 数组
2. 每当 ASR 返回一条 final 结果，追加到 transcript
3. 判断是否触发 LLM：
   - 条件 A：对方说完一句话（final 结果 + 静默 > 1s）
   - 条件 B：距离上次 LLM 调用已过去 > 5s 且有新内容
   - 防抖：两次 LLM 调用间隔至少 3s（控制成本）
4. 触发 LLM → 将最近的 transcript（最多最近 20 条）+ 用户预设上下文发给千问
5. 收到结果 → 解析 JSON → 存入 bubble-cache
6. bubble-cache 维护一个时间线数组，每次新增一组，最多保留 5 组
```

### 2.6 通义千问 API 调用要点

```
核心要点：
- 使用 OpenAI 兼容接口格式（通义千问支持）
- Endpoint: https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
- Model: qwen-turbo（速度优先）或 qwen-plus（质量优先）
- 使用流式输出（stream: true）减少首字延迟
- 设置 temperature: 0.8（需要一定创造性但不要太飞）
- 设置 max_tokens: 500（Bubble JSON 不需要太长）
- response_format: { type: "json_object" } 强制 JSON 输出
```

### 2.7 给 Claude Code 的 Prompt（Sprint 2）

---

**Prompt 2-A：对话管理 + LLM 接入**

```
在现有 callcopilot 项目基础上，新增以下功能：

1. dialogue-manager.js：
   - 维护实时对话 transcript 数组
   - 每当 ASR 返回 final 结果，追加一条记录（含时间戳和文本）
   - 触发 LLM 的条件：收到 final 结果后静默 1.5 秒，且距上次调用 > 3 秒
   - 触发时，取最近 20 条 transcript 构建 prompt

2. llm-engine.js：
   - 调用通义千问 API（OpenAI 兼容格式）
   - Endpoint: https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
   - Model: qwen-turbo
   - 使用流式输出收集完整响应
   - 解析返回的 JSON（包含 bubbles 数组）
   - 如果 JSON 解析失败，丢弃本次结果

3. bubble-cache.js：
   - 维护 Bubble 时间线（数组，每项是一组 bubbles + 时间戳 + 上下文摘要）
   - 新增一组时不覆盖旧的，追加到数组末尾
   - 最多保留最近 5 组

4. 前端临时展示：
   - 页面下方新增一个"查看建议"区域
   - 展示当前 bubble-cache 中最新一组的内容（JSON 格式即可，先不做 UI）
   - 用于调试和验证 prompt 质量

Prompt 内容如下（放在 llm-engine.js 中）：
[粘贴上面 2.4 的 prompt]

API Key 从环境变量 DASHSCOPE_API_KEY 读取。
```

---

**Prompt 2-B：Prompt 调优测试**

```
帮我创建一个 prompt 测试工具：

1. 新建 test/prompt-test.js
2. 读取几段预设的对话 transcript（模拟真实通话场景）
3. 分别调用 LLM 生成 Bubble
4. 输出结果并检查：
   - JSON 是否合法
   - preview 是否 ≤ 8 字
   - full_text 是否 ≤ 40 字
   - bubbles 数量是否 2-4 个
   - 各 bubble 的策略是否互不相同

预设测试场景：
场景 1 - 客户问价格：transcript 最后一句是"这个套餐能不能便宜点？"
场景 2 - 客户开玩笑：transcript 最后一句是"你们这价格，是把金子镶上去了吧"
场景 3 - 客户投诉：transcript 最后一句是"上次拍的照片我不太满意，修图感觉不够细致"
场景 4 - 客户犹豫：transcript 最后一句是"我再考虑考虑吧，回头联系你"
场景 5 - 冷场：transcript 最后两句都是短回复"嗯""哦"
```

### 2.8 Sprint 2 验证

| 验证项 | 方法 | 合格标准 |
|--------|------|---------|
| 响应速度 | 测量 LLM 调用到返回的时间 | qwen-turbo < 2s |
| JSON 格式 | 自动化测试 | 100% 合法 JSON |
| 字数约束 | 自动化测试 | preview ≤ 8 字，full_text ≤ 40 字 |
| 话术自然度 | 人工阅读判断 | 像人说的话，不像 AI 八股 |
| 策略多样性 | 人工判断 | 同组内各 bubble 方向不同 |
| 场景覆盖 | 5 个测试场景 | 至少 4/5 生成质量合格 |

---

## 三、Sprint 3 — Bubble UI 交互实现（Day 5-7）

### 3.1 目标

实现完整的 Bubble 时间线 UI，移动端适配，跑通完整的交互链路：监听 → 转写 → 预生成 → 按按钮 → 看 Bubble → 点开看话术。

### 3.2 Sprint 3 完成标准

- [ ] 悬浮「💬」按钮始终可见（手机右下角）
- [ ] 点击按钮弹出 Bubble 时间线面板
- [ ] 每组 Bubble 显示：对方说了什么（摘要）+ 2-4 个 Bubble 气泡
- [ ] Bubble 外层显示话术预览（≤ 8 字）
- [ ] 点击 Bubble 原地展开完整话术 + 策略标签
- [ ] 再点击收起
- [ ] 时间线自动滚动到最新一组
- [ ] 旧的组可以上滑回看
- [ ] 整体交互流畅，无明显卡顿

### 3.3 UI 布局设计（移动端）

```
┌─────────────────────────────┐
│  CallCopilot              ⚙ │  ← 顶部导航
├─────────────────────────────┤
│                             │
│  [实时转写区域]              │  ← 占屏幕上半部分
│  ┌─────────────────────┐    │     显示 ASR 实时转写文字
│  │ 对方: 这个套餐能便宜点吗│    │     滚动显示
│  │ 我: ......              │    │
│  │ 对方: 你们价格镶金了吧  │    │
│  └─────────────────────┘    │
│                             │
├─────────────────────────────┤  ← 分隔线（可拖拽调整上下比例，可选）
│                             │
│  [Bubble 时间线面板]         │  ← 占屏幕下半部分（点击按钮后展开）
│                             │     默认隐藏，只显示悬浮按钮
│  ┌─ 客户在问能不能打折 ─────┐ │
│  │ ┌──────┐┌──────┐┌────┐ │ │
│  │ │老客福利││升级更值││问店长│ │ │
│  │ └──────┘└──────┘└────┘ │ │
│  └─────────────────────────┘ │
│                             │
│  ┌─ 客户开玩笑"镶金了" ────┐ │
│  │ ┌────────┐┌────┐┌────┐│ │
│  │ │哈哈镀金的││值这价││给您看││ │
│  │ └────────┘└────┘└────┘│ │
│  └─────────────────────────┘ │
│                             │
│              ┌────────────┐ │
│              │  💬 需要帮助 │ │  ← 悬浮按钮（FAB）
│              └────────────┘ │
└─────────────────────────────┘
```

### 3.4 交互细节规范

#### 悬浮按钮（FAB）
- 位置：屏幕右下角，距底部 20px，距右侧 20px
- 大小：56px 圆形
- 状态：
  - 默认：💬 图标 + 蓝色背景
  - AI 有新建议时：显示红色小圆点（通知徽章）
  - 面板已展开时：变成 ✕ 关闭图标
- 点击行为：展开/收起 Bubble 时间线面板

#### Bubble 时间线面板
- 从底部滑出，覆盖屏幕下半部分（约 50-60% 高度）
- 背景半透明模糊（backdrop-filter: blur）
- 可上滑查看历史 Bubble 组
- 自动滚动到最底部（最新一组）

#### 单个 Bubble 组
- 顶部：灰色小字，显示对方说了什么（context_summary）+ 时间
- 下方：横向排列 2-4 个 Bubble 气泡
- 如果 Bubble 太多一行放不下，允许横向滚动

#### Bubble 气泡
- 圆角矩形，浅色背景，内边距适中
- 文字：话术预览（preview），单行，字号 14-15px
- 点击效果：
  - 气泡原地向下展开
  - 展开区域显示：策略标签（小字灰色） + 完整话术（正文，字号 16px）
  - 展开动画 ≤ 200ms
  - 再次点击收起

### 3.5 给 Claude Code 的 Prompt（Sprint 3）

---

**Prompt 3-A：Bubble UI 组件**

```
在现有 callcopilot 项目基础上，实现 Bubble 时间线 UI。要求移动端优先设计。

页面分为上下两部分：
上半部分：实时转写区域（已有，保持不变）
下半部分：Bubble 时间线面板（新增）

1. 悬浮按钮（FAB）：
   - 固定在屏幕右下角
   - 圆形，56px，蓝色背景，💬 图标
   - 点击切换 Bubble 面板的展开/收起
   - 当 bubble-cache 有新数据时，显示红色通知圆点

2. Bubble 时间线面板：
   - 从底部滑出动画（300ms ease-out）
   - 高度占屏幕 55%
   - 半透明磨砂背景
   - 内容可垂直滚动，自动定位到最底部

3. Bubble 组：
   - 每组包含：时间戳 + 对方说了什么（灰色小字）+ 横向排列的 Bubble 气泡
   - 组与组之间有间距分隔

4. Bubble 气泡：
   - 圆角矩形（border-radius: 20px），浅蓝/浅灰背景
   - 内容：preview 文字（≤8字），字号 14px
   - 横向排列，间距 8px
   - 如果一行放不下，横向可滚动（overflow-x: auto）

5. Bubble 展开交互：
   - 点击气泡，在气泡下方展开一个卡片
   - 卡片内容：策略标签（小字灰色） + 完整话术（16px）
   - 展开/收起动画 200ms
   - 同一时间只有一个 Bubble 处于展开状态（点开新的自动关闭旧的）

6. 数据来源：
   - 通过 WebSocket 从后端接收 bubble-cache 更新
   - 每当后端有新的 Bubble 组生成，推送给前端
   - 前端追加到时间线并滚动到底部

纯 HTML/CSS/JS 实现，不使用框架。CSS 使用 CSS 变量方便主题调整。
所有交互必须在手机浏览器上流畅运行。
```

---

**Prompt 3-B：上下文预设输入**

```
在通话开始前，增加一个"上下文预设"输入功能：

1. 在主页面顶部增加一个可折叠的"通话准备"区域
2. 包含：
   - 一个多行文本框："输入通话背景信息（可选）"
   - placeholder 示例："客户姓李，之前拍了 3999 套餐，今天回访问满意度"
   - 一个"开始通话"按钮
3. 点击"开始通话"后：
   - 文本框内容作为 user_context 传给后端
   - "通话准备"区域折叠
   - 开始麦克风采集和 ASR
4. 如果不输入直接点"开始通话"，user_context 为空，AI 纯靠实时对话理解

后端在构建 LLM prompt 时，将 user_context 插入到指定位置。
```

---

**Prompt 3-C：完整链路串联**

```
将 Sprint 1（ASR）、Sprint 2（LLM）、Sprint 3（UI）串联成完整链路：

完整流程：
1. 用户打开页面 → 可选输入上下文 → 点击"开始通话"
2. 麦克风开始采集 → 音频发送到后端 → 后端转发阿里云 ASR
3. ASR 返回转写结果 → 前端实时显示在转写区域
4. 后端 dialogue-manager 收到 final 结果 → 判断是否触发 LLM
5. 触发 LLM → 通义千问生成 Bubble JSON → 存入 bubble-cache
6. 新 Bubble 组通过 WebSocket 推送给前端
7. 前端悬浮按钮显示红色通知点
8. 用户点击悬浮按钮 → Bubble 时间线弹出，显示最新建议
9. 用户点击某个 Bubble → 展开看完整话术
10. 用户继续通话...

确保：
- 整条链路在弱网环境下也能降级工作（ASR 断了不影响 UI，LLM 慢了不阻塞 ASR）
- 错误处理完善（每个环节失败都有 fallback 提示，不会白屏）
- 移动端性能流畅（不要有明显卡顿）
```

---

## 四、Sprint 4 — 真实通话验证 + 迭代（Day 8-10）

### 4.1 目标

拿着跑通的原型进行真实通话测试。记录问题，快速迭代。

### 4.2 验证计划

| 天数 | 内容 | 目标 |
|------|------|------|
| Day 8 | 模拟通话测试（找朋友/同事配合） | 发现明显的 bug 和体验问题 |
| Day 9 | 真实业务通话测试（客户回访等） | 验证核心假设 |
| Day 10 | 根据测试结果迭代修复 | 修 top 3 问题 |

### 4.3 测试记录模板

每次通话后填写：

```
## 通话测试 #___

日期：
场景：（客户回访 / 商务沟通 / 其他）
时长：
是否使用上下文预设：是 / 否

### ASR 质量
- 识别率评估：（好 / 一般 / 差）
- 主要问题：

### Bubble 触发
- 总共生成了几组 Bubble：
- 按了几次按钮：
- 建议是否及时（对应当前对话）：是 / 否 / 部分

### 话术质量（核心）
- 查看了几个 Bubble：
- 话术直接用了几次：
- 改了以后用了几次：
- 完全没用几次：
- 最好的一条建议是什么：
- 最差的一条建议是什么：

### 整体体验
- 看 Bubble 是否分散了通话注意力：是 / 否
- 整体感受：这个工具在通话中有帮助吗？（1-5 分）
- 最大的问题是什么：
- 如果改一个地方，最想改什么：
```

### 4.4 常见问题预案

| 可能遇到的问题 | 解决方向 |
|--------------|---------|
| ASR 识别率太低 | 试外接麦克风；调整手机和设备距离；开启阿里云降噪参数 |
| LLM 生成太慢 | 换 qwen-turbo 最小参数；减少 max_tokens；确认预生成机制是否正常 |
| 话术太死板/太 AI | 调 prompt：加更多 few-shot 示例；加"禁止使用书面语"指令 |
| 话术跟不上对话节奏 | 调整 LLM 触发频率（缩短静默阈值）；增加 transcript 窗口大小 |
| Bubble 太多看不过来 | 限制每组最多 3 个 Bubble；缩短时间线保留数 |
| 手机浏览器卡顿 | 减少 DOM 操作；Bubble 组超过 5 组时移除最旧的 |
| 点击 Bubble 不灵敏 | 增大点击区域；增加触控反馈（触觉/视觉） |

---

## 五、项目完整文件清单

```
callcopilot/
├── server/
│   ├── index.js              # Express + WebSocket 服务器主入口
│   ├── aliyun-asr.js         # 阿里云实时 ASR 客户端
│   ├── aliyun-token.js       # 阿里云 Token 获取与缓存
│   ├── llm-engine.js         # 通义千问 API + Prompt 管理
│   ├── dialogue-manager.js   # 对话状态管理 + LLM 触发逻辑
│   └── bubble-cache.js       # Bubble 时间线缓存
├── public/
│   ├── index.html            # 主页面
│   ├── css/
│   │   └── style.css         # 全局样式（移动端优先）
│   └── js/
│       ├── app.js            # 主逻辑：串联所有模块
│       ├── audio-capture.js  # 麦克风采集 + 音频处理
│       ├── asr-client.js     # 与后端 ASR WebSocket 通信
│       ├── bubble-ui.js      # Bubble 时间线 UI 组件
│       └── fab-button.js     # 悬浮按钮组件
├── test/
│   └── prompt-test.js        # Prompt 质量测试脚本
├── .env                      # 环境变量
├── .gitignore                # 忽略 node_modules、.env
├── package.json
└── README.md                 # 项目说明 + 启动方式
```

---

## 六、关键提醒

### 给 Claude Code 的通用指令

每次开始新的 Sprint 时，可以先给 Claude Code 这段话建立上下文：

```
我在开发一个通话实时 AI 辅助工具 CallCopilot。

技术栈：
- 后端：Node.js + Express + ws（WebSocket）
- 前端：原生 HTML/CSS/JS，移动端优先
- ASR：阿里云实时语音识别（WebSocket 接口）
- LLM：通义千问 qwen-turbo（OpenAI 兼容格式）

核心交互：
- 手机开免提打电话，旁边设备收音
- AI 全程后台监听对话，持续预生成话术建议
- 用户按悬浮按钮，屏幕弹出 Bubble 时间线
- 每个 Bubble 是一种回话方向（≤8字预览），点开看完整话术（≤40字）
- Bubble 按时间线排列，最新的在底部

当前进度：[你当前在哪个 Sprint]
```

### 开发节奏把控

- 每个 Sprint 结束必须做一次验证测试，不要急着进入下一个
- 如果 Sprint 1 的 ASR 远场识别率 < 60%，**停下来解决这个问题再继续**
- 如果 Sprint 2 的话术质量不行，**花时间调 prompt，不要急着做 UI**
- Sprint 3 的 UI 可以丑，但交互必须流畅
- Sprint 4 才是真正的价值验证——前面都是为这一步服务的

---

*任务书结束。Day 0 准备好账号和环境，Day 1 开始写代码。*
