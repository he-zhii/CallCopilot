# CallCopilot

通话实时 AI 辅助工具。通过手机免提通话，AI 实时监听对话并生成话术建议。

## 功能特性

- **实时语音识别** - 阿里云 Fun-ASR 实时转写，支持远场识别
- **AI 话术建议** - 通义千问生成多种策略方向的话术 Bubble
- **移动端优先** - 专为手机免提场景设计，触摸友好
- **Bubble 时间线** - 按时间顺序展示话术建议，点击展开查看完整内容

## 技术栈

- **后端**：Node.js + Express + WebSocket
- **前端**：原生 HTML/CSS/JS，移动端适配
- **ASR**：阿里云 DashScope Fun-ASR 实时语音识别
- **LLM**：通义千问 qwen-turbo

## 项目结构

```
callcopilot/
├── server/                    # 后端服务
│   ├── index.js               # Express + WebSocket 服务器入口
│   ├── dashscope-asr.js       # 阿里云 ASR WebSocket 客户端
│   ├── llm-engine.js          # 通义千问 API 调用
│   ├── dialogue-manager.js    # 对话状态管理 + LLM 触发逻辑
│   ├── bubble-cache.js        # Bubble 时间线缓存
│   ├── session-manager.js     # 会话管理
│   └── supabase-client.js     # Supabase 数据库客户端
├── public/                    # 前端静态文件
│   ├── index.html             # 主页面
│   ├── css/                   # 样式文件
│   └── js/                    # 前端脚本
│       ├── audio-capture.js   # 麦克风采集
│       ├── ws-client.js       # WebSocket 通信
│       └── bubble-ui.js       # Bubble UI 组件
├── test/                      # 测试脚本
├── .env                       # 环境变量
└── package.json
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```env
# 阿里云 DashScope（通义千问）
DASHSCOPE_API_KEY=你的百炼API_Key

# 阿里云语音识别（可选，如使用 DashScope ASR）
# ALIYUN_ACCESS_KEY_ID=你的AccessKeyID
# ALIYUN_ACCESS_KEY_SECRET=你的AccessKeySecret
# ALIYUN_ASR_APP_KEY=你的ASR应用AppKey

# Supabase（可选，用于通话记录持久化）
# SUPABASE_URL=你的Supabase项目URL
# SUPABASE_ANON_KEY=你的Supabase匿名Key
```

### 3. 启动服务

```bash
npm start
```

服务启动后访问 http://localhost:3000

### 4. 使用流程

1. 打开页面，可选输入通话背景信息
2. 点击「开始通话」按钮
3. 手机开启免提放旁边，开始通话
4. AI 实时转写对话内容
5. 点击右下角 💬 按钮查看话术建议
6. 点击任意 Bubble 展开查看完整话术

## 核心交互

- **开始/停止监听**：底部大按钮切换
- **查看建议**：点击右下角悬浮按钮
- **展开话术**：点击 Bubble 气泡
- **收起话术**：再次点击或点击其他 Bubble

## 开发

### Sprint 概览

| Sprint   | 内容           | 目标              |
| -------- | ------------ | --------------- |
| Sprint 1 | 收音 + ASR 验证  | 手机免提通话实时转写      |
| Sprint 2 | LLM 话术生成     | AI 生成 Bubble 建议 |
| Sprint 3 | Bubble UI 实现 | 完整交互界面          |
| Sprint 4 | 真实通话验证       | 迭代优化            |

详细开发文档见：

- `CallCopilot_开发任务书.md` - 完整开发任务书
- `Sprint1_ClaudeCode指令.md` - Sprint 1 详细指令
- `Sprint2_ClaudeCode指令.md` - Sprint 2 详细指令
- `Sprint3_ClaudeCode指令.md` - Sprint 3 详细指令
- `新功能_通话记录持久化_ClaudeCode指令.md` - 通话记录持久化功能

## 注意事项

- 移动端需要 HTTPS 才能使用 getUserMedia（开发环境用 localhost 除外）
- 阿里云服务需要正确配置 API Key 和 AppKey
- 建议使用 qwen-turbo 模型以获得更快的响应速度