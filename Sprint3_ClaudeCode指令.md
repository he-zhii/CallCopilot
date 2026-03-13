# CallCopilot Sprint 3 — Claude Code 开发指令

> **目标：** 实现完整的 Bubble 时间线 UI，移动端适配，跑通从监听→转写→预生成→按按钮→看 Bubble→点开话术的完整交互链路
> **技术栈：** 在 Sprint 1/2 基础上重构前端 UI
> **用时：** Day 5-7
> **验证标准：** 手机浏览器上完成一次完整的通话辅助体验——说话→按按钮→看到 Bubble→点开→看到自然话术

---

## 项目上下文（每次开新对话时先发给 Claude Code）

```
我在开发 CallCopilot，一个通话实时 AI 辅助工具。

已完成：
- Sprint 1：Node.js 后端 + 阿里云 DashScope Fun-ASR 实时语音识别
- Sprint 2：通义千问 qwen-turbo LLM 话术生成 + Bubble 缓存 + 预生成机制

后端数据流已完全跑通：
  麦克风 → ASR 转写 → DialogueManager → LLM 生成 Bubble → BubbleCache → WebSocket 推送前端

当前后端推送给前端的消息格式：
{
  "type": "bubble_group",
  "data": {
    "id": "uuid",
    "context_summary": "对方在问价格",
    "bubbles": [
      { "preview": "老客福利", "full_text": "李姐您是老客户了，带朋友来两位一起有专属折扣", "strategy": "老带新" },
      { "preview": "升级更值", "full_text": "其实加800升级套餐多一组外景，算下来单价更低", "strategy": "推升级" },
      { "preview": "帮您问问", "full_text": "价格我不太好做主，帮您跟店长申请个特别优惠", "strategy": "缓兵之计" }
    ],
    "generated_at": 1710300000000
  }
}

当前阶段：Sprint 3 — Bubble UI 交互实现
设计风格：Clean Professional（极简商务风，类 Linear/Notion）
- 配色：白色/浅灰底，主色调冷蓝 #2563EB，文字 #111827
- 字体：系统字体栈 -apple-system, "Noto Sans SC", sans-serif
- 圆角：小元素 8px，卡片 12px，Bubble 20px
- 阴影：轻微（0 1px 3px rgba(0,0,0,0.1)）
```

---

## Step 1：重构页面布局

```
重构 public/index.html 和 public/css/style.css，实现新的页面布局。

### 整体结构（移动端优先）

页面分三层，从上到下：

第一层：顶部状态栏（固定在顶部，高度 56px）
第二层：实时转写区域（占剩余空间，可滚动）
第三层：悬浮按钮 FAB（固定在右下角）+ Bubble 面板（按按钮后从底部滑出）

### 顶部状态栏

<header> 固定在页面顶部，高度 56px，白色背景，底部 1px 浅灰色边框。

左侧内容：
- "CallCopilot" 标题，字号 16px，字重 600，颜色 #111827
- 下方一行小字：连接状态，字号 12px
  - "● 已连接" 绿色点 + 灰色文字
  - "● 连接中..." 黄色点 + 灰色文字
  - "● 未连接" 灰色点 + 灰色文字

右侧内容：
- 通话计时器 "00:00"，字号 14px，等宽字体（tabular-nums），颜色 #6B7280
- 一个小的齿轮图标按钮（点击展开"通话准备"面板，Sprint 2 的上下文输入功能）

### 通话准备面板（默认隐藏）

点击齿轮图标后，从顶部状态栏下方滑出一个面板：
- 白色背景，底部圆角 12px，有轻微阴影
- 内含一个 textarea：placeholder "输入通话背景信息（可选），如：客户姓李，之前拍了3999套餐..."
- 字号 14px，最大高度 3 行
- 右下角一个"保存"按钮（蓝色小按钮），点击后折叠面板并通过 WebSocket 发送 set_context
- 再次点击齿轮可以重新展开编辑

### 实时转写区域

占据状态栏和 FAB 之间的所有空间，内部可垂直滚动。
padding: 16px。

每条转写消息的样式：
- 已确认文字（isPartial: false）：
  - 颜色 #111827，字号 15px，行高 1.6
  - 左侧有一个小的时间戳（HH:MM:SS），字号 11px，颜色 #9CA3AF
  - 每条之间间距 8px
  
- 正在转写中（isPartial: true）：
  - 颜色 #9CA3AF，字号 15px，斜体
  - 末尾有一个闪烁的竖线光标动画（CSS animation）
  - 位置始终在最底部

- 空状态（还没开始说话）：
  - 居中显示麦克风图标 + "点击下方按钮开始监听" 文字
  - 颜色 #D1D5DB

自动滚动：有新文字时自动滚动到底部（除非用户手动往上滚了，此时暂停自动滚动，出现一个"↓ 回到最新"小按钮）

### 底部操作区域

页面底部固定一个操作条，高度 80px（含安全区 padding-bottom），白色背景，顶部 1px 边框。

内含：
- 左侧：一个圆形的 开始/停止 按钮（直径 48px）
  - 未开始：蓝色底 (#2563EB) + 白色麦克风图标
  - 监听中：红色底 (#EF4444) + 白色方块图标（停止）+ 外圈脉冲动画
- 右侧：FAB 按钮（Bubble 触发按钮），直径 48px
  - 默认：蓝色底 (#2563EB) + 白色消息气泡图标（💬 用 SVG 或 Unicode）
  - 有新建议时：右上角红色小圆点（直径 10px），有 pulse 动画
  - 面板展开时：变为 ✕ 关闭图标，背景变灰 (#6B7280)
  - 未监听时（ASR 没启动）：灰色底 (#D1D5DB)，不可点击

注意：开始/停止按钮 和 FAB 按钮要有足够间距，不要误触。建议两按钮之间放一个简短的状态文字（如"监听中 · 已生成 3 组建议"）。
```

---

## Step 2：Bubble 时间线面板

```
实现 Bubble 时间线面板，这是整个产品的核心 UI。

### 面板行为

- 默认隐藏（高度 0，不可见）
- 点击 FAB 按钮后，从底部滑出（transform: translateY → 0）
- 面板高度：屏幕高度的 55%，固定位置（fixed），覆盖在转写区域上方
- 面板有自己的垂直滚动
- 背景：白色，顶部圆角 16px，有明显的阴影（0 -4px 20px rgba(0,0,0,0.1)）
- 顶部有一个拖拽指示条（宽 40px，高 4px，圆角，居中，颜色 #D1D5DB）

### 滑出动画

- 展开：300ms，ease-out（cubic-bezier(0.33, 1, 0.68, 1)）
- 收起：250ms，ease-in
- 展开时转写区域加一层半透明遮罩（rgba(0,0,0,0.1)），点击遮罩也可关闭面板

### 面板内容：Bubble 组时间线

面板内部是一个垂直滚动列表，每一项是一组 Bubble。

每组 Bubble 的结构：

┌─────────────────────────────────┐
│ 14:03  对方在问能不能打折         │  ← 时间 + context_summary
│                                 │
│ ┌───────┐ ┌──────┐ ┌─────────┐ │
│ │老客福利│ │升级更值│ │帮您问问  │ │  ← Bubble 气泡横向排列
│ └───────┘ └──────┘ └─────────┘ │
│                                 │
│ （展开的话术卡片，如果有的话）      │  ← 点击某个 Bubble 后展开
└─────────────────────────────────┘

### 对话节点标题行

- 左侧：时间戳，格式 "HH:MM"，字号 12px，颜色 #9CA3AF
- 右侧：context_summary 文字，字号 13px，颜色 #6B7280
- 底部有 1px 的浅灰色分隔线（最后一组不要分隔线）
- 组与组之间的间距：16px

### Bubble 气泡

- 外形：圆角胶囊（border-radius: 20px）
- 背景：#F3F4F6（浅灰）
- hover/active 状态：背景变为 #E5E7EB
- 内边距：8px 16px
- 文字：preview 内容，字号 14px，颜色 #111827，字重 500
- 气泡之间间距：8px
- 横向排列，使用 flexbox，允许换行（flex-wrap: wrap）
- 如果某个 Bubble 正在展开中，其气泡背景变为 #2563EB（蓝色），文字变白色

### Bubble 展开卡片

点击某个 Bubble 气泡后，在该气泡正下方展开一个话术卡片：

┌─────────────────────────────────┐
│ 💡 转移赠品                      │  ← emoji + strategy 标签
│                                 │
│ "李姐您是老客户了，带朋友来       │
│  两位一起有专属折扣"              │  ← full_text 完整话术
└─────────────────────────────────┘

样式：
- 卡片出现在被点击的气泡下方，宽度 100%（撑满 Bubble 组容器）
- 背景：#F0F7FF（极淡蓝）
- 边框：1px solid #DBEAFE
- 圆角：12px
- 内边距：12px 16px
- strategy 标签：字号 12px，颜色 #2563EB，字重 500，前面加一个 💡 emoji
- full_text：字号 15px，颜色 #111827，行高 1.5，字重 400
- full_text 前后加引号（中文引号 ""）

展开动画：
- max-height 从 0 过渡到实际高度，duration 200ms
- 同时 opacity 从 0 到 1
- 展开时自动滚动面板，确保卡片完全可见

交互规则：
- 同一时间只有一个 Bubble 展开（点击新的自动关闭旧的）
- 点击已展开的 Bubble 则收起
- 点击卡片本身不做任何操作（不关闭）
- 点击其他区域（面板空白处）不关闭已展开的 Bubble

### 空状态

如果 BubbleCache 是空的（还没生成过建议），面板内显示：
- 居中的消息图标（灰色线条风格）
- "AI 正在监听对话..."（如果 ASR 已启动）
- "开始监听后，AI 会实时生成话术建议"（如果 ASR 未启动）
- 字号 14px，颜色 #9CA3AF

### 自动滚动到最新

- 收到新的 bubble_group 时，如果面板已展开，自动滚动到底部（最新一组）
- 滚动动画：smooth（behavior: 'smooth'）
```

---

## Step 3：FAB 按钮通知逻辑

```
实现 FAB 按钮的状态管理和通知逻辑。

### 状态机

FAB 按钮有以下状态：

1. disabled（灰色，不可点击）：ASR 未启动
2. idle（蓝色，可点击）：ASR 已启动，没有新建议
3. has_new（蓝色 + 红点 pulse，可点击）：有新的 Bubble 组未查看
4. panel_open（灰色 ✕，可点击）：面板已展开

### 通知红点逻辑

- 后端推送 bubble_group 时：
  - 如果面板未展开 → FAB 进入 has_new 状态，显示红点
  - 如果面板已展开 → 不显示红点（用户能直接看到新内容）

- 用户点击 FAB 展开面板 → 清除红点，进入 panel_open 状态
- 用户关闭面板 → 回到 idle 或 has_new 状态

### 红点动画

红点用 CSS 实现：
- 一个 10px 的红色圆点，绝对定位在 FAB 右上角
- 外圈有一个 pulse 动画：
  @keyframes pulse {
    0% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.5); opacity: 0.5; }
    100% { transform: scale(1); opacity: 1; }
  }
- animation: pulse 1.5s ease-in-out infinite
```

---

## Step 4：数据绑定和实时更新

```
将前端 UI 组件与 WebSocket 数据流连接起来。

### 需要修改的文件

public/js/app.js — 主逻辑，串联所有模块
public/js/ws-client.js — 新增处理 bubble_group 消息
新建 public/js/bubble-ui.js — Bubble 面板的所有 UI 逻辑

### bubble-ui.js 的职责

维护一个本地的 bubbleTimeline 数组（和后端的 BubbleCache 对应）。

导出方法：
- addBubbleGroup(data)：添加一组新 Bubble 到时间线，更新 UI
- togglePanel()：展开/收起面板
- isPanelOpen()：查询面板状态
- clearNotification()：清除红点

### ws-client.js 的修改

在现有的消息处理中新增：

case 'bubble_group':
  // 1. 调用 bubbleUI.addBubbleGroup(message.data)
  // 2. 如果面板未展开，更新 FAB 红点状态
  break;

case 'status':
  // 已有逻辑保持不变
  // 新增：如果 status === 'ready'，启用 FAB 按钮
  // 如果 status === 'closed'，禁用 FAB 按钮
  break;

### app.js 的修改

- 初始化 bubbleUI 模块
- 绑定 FAB 按钮点击事件 → bubbleUI.togglePanel()
- 绑定开始/停止按钮的逻辑（保留 Sprint 1 的功能，新增 FAB 状态联动）

### 前端调试辅助

在浏览器控制台暴露一些调试方法（开发阶段用）：
window.__debug = {
  getBubbleTimeline: () => bubbleTimeline,  // 查看当前缓存的所有 Bubble 组
  simulateBubble: () => { /* 模拟一组 Bubble 数据，测试 UI */ },
  togglePanel: () => bubbleUI.togglePanel()
};
```

---

## Step 5：移动端适配和性能优化

```
确保在手机浏览器上体验流畅。

### 移动端适配清单

1. viewport meta：
   <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">

2. 安全区适配（iPhone 刘海/底部横条）：
   - 底部操作条：padding-bottom: env(safe-area-inset-bottom, 16px)
   - Bubble 面板底部也要加安全区 padding

3. 触控优化：
   - 所有可点击元素最小 44x44 px 触摸区域
   - Bubble 气泡点击区域要足够大（整个胶囊都可点击，不只是文字）
   - 添加 touch-action: manipulation 防止 300ms 延迟
   - 点击按钮时有视觉反馈（:active 状态，缩小 0.95 + 颜色加深）

4. 防止页面弹性滚动（iOS）：
   - 转写区域和 Bubble 面板各自 overflow-y: auto
   - 外层容器 overflow: hidden，高度 100vh（使用 100dvh 更佳）

5. 字体：
   - 最小字号 12px（iOS 不缩放的下限）
   - body 字号 16px（防止 iOS input 缩放问题）

### 性能优化

1. Bubble 面板隐藏时用 visibility: hidden + transform: translateY(100%)
   不要用 display: none（避免展开时重新布局导致卡顿）

2. 转写消息超过 100 条时，移除最旧的（保持 DOM 节点数量可控）

3. Bubble 时间线超过 5 组时，只在 DOM 中保留最近 5 组（和后端缓存一致）

4. 动画使用 transform 和 opacity（GPU 加速），不要用 height/width 做动画

5. 将 will-change: transform 加在面板和 FAB 按钮上
```

---

## Step 6：端到端测试 + Bug 修复

```
完成后做以下测试，逐项确认：

### 功能测试

1. 基础流程：
   - [ ] 打开页面 → 看到空状态提示
   - [ ] 输入上下文（可选）→ 保存成功
   - [ ] 点击开始监听 → 状态指示灯变绿 → 计时器开始
   - [ ] 说话 → 转写区域实时显示文字
   - [ ] 等几秒 → FAB 出现红点（有新建议）
   - [ ] 点击 FAB → 面板滑出 → 看到 Bubble 组
   - [ ] 点击某个 Bubble → 展开话术卡片
   - [ ] 点击另一个 Bubble → 旧的收起，新的展开
   - [ ] 继续说话 → 新的 Bubble 组追加到面板底部
   - [ ] 关闭面板 → 继续说话 → FAB 再次出现红点
   - [ ] 点击停止 → ASR 停止 → FAB 变灰

2. 边界情况：
   - [ ] 没说话就点 FAB → 显示空状态
   - [ ] 快速连续点击 FAB → 不会出现动画错乱
   - [ ] 说话过程中关闭面板再打开 → 数据保持
   - [ ] 刷新页面 → 所有状态重置（缓存清空）

### 手机浏览器测试

在手机上通过 ngrok 或局域网 IP 访问：
- [ ] Android Chrome：页面正常显示，所有交互可用
- [ ] iOS Safari：如果有的话，确认麦克风权限和按钮响应
- [ ] 所有按钮容易点击，不需要精确瞄准
- [ ] 面板滑动流畅，无卡顿
- [ ] 横屏时不会错乱（可以不完美，但不要白屏）

### 同时确认 Sprint 1/2 不被破坏

- [ ] ASR 转写功能正常
- [ ] LLM Bubble 生成正常
- [ ] 后端日志正常打印
- [ ] 停止监听不报错
```

---

## 额外修复（顺手做掉的 Sprint 2 遗留 Bug）

```
在 Sprint 3 开发过程中，顺便修复以下 Sprint 2 的问题：

1. ASR 断连后 LLM 继续触发的问题：
   - 在 server/index.js 中，当 ASR 连接关闭时，调用 dialogueManager.destroy()
   - DialogueManager.destroy() 中清除所有定时器（debounce timer + 轮询 timer）
   - 确保新的 WebSocket 连接建立时，创建新的 DialogueManager 实例

2. 添加 LLM 具体回复内容到日志：
   - 在 [LLM] 收到响应 的日志行后面，增加一行打印生成的 Bubble 内容
   - 格式：[LLM] Bubbles: [老客福利] [升级更值] [帮您问问]
   - 这样不用看前端也能在终端里看到 AI 生成了什么
```

---

## Sprint 3 验收标准

| 验证项 | 合格标准 |
|--------|---------|
| FAB 按钮状态正确 | 未监听=灰色禁用，监听中=蓝色，有新建议=蓝色+红点，面板开=灰色✕ |
| 面板展开/收起动画 | 流畅（60fps），无闪烁，300ms 内完成 |
| Bubble 气泡显示 | 每组 2-4 个，preview 文字清晰可读，一眼能扫完 |
| Bubble 点击展开 | 200ms 内展开，显示完整话术 + 策略标签，同时只展开一个 |
| 时间线更新 | 新 Bubble 组追加到底部，自动滚动，旧的可回看 |
| 手机浏览器 | Android Chrome 所有功能正常，操作流畅 |
| 整条链路 | 说话→转写→AI生成→FAB红点→点开→看到话术，全部串通 |
