# CallCopilot 新功能 — 通话记录持久化（Supabase）

> **功能：** 通话结束后自动保存 session，侧边栏查看历史记录，支持查看详情和删除
> **存储：** Supabase（PostgreSQL + REST API）
> **保存内容：** 通话元信息 + 完整转写 + 用户上下文 + AI 自动摘要
> **UI：** 主页左侧抽屉式侧边栏

---

## 项目上下文（给 Claude Code）

```
我在开发 CallCopilot，一个通话实时 AI 辅助工具。

已完成：
- Sprint 1：ASR 实时转写
- Sprint 2：LLM 话术生成 + 预生成机制
- Sprint 3：Bubble UI 交互（进行中）

现在新增功能：通话记录持久化。
每次通话是一个 session，结束后自动保存到 Supabase，用户可以在侧边栏查看历史、回顾详情、删除记录。

技术栈：
- 后端：Node.js + Express
- 前端：原生 HTML/CSS/JS，移动端优先，Clean Professional 风格
- 存储：Supabase（PostgreSQL + REST API）
- 设计风格：白色/浅灰底，主色调 #2563EB，类 Linear/Notion

.env 中新增：
SUPABASE_URL=https://azudfypnpjeehcofwtat.supabase.co
SUPABASE_ANON_KEY=sb_publishable_00V9EaPh6xBt2DVD0tXFEg_pXYGXMaS
```

---

## Step 1：Supabase 建表

```
在 Supabase 控制台的 SQL Editor 中执行以下建表语句。
也可创建 supabase/migrations/001_create_sessions.sql 文件记录：

-- 通话 session 表
CREATE TABLE call_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  user_context TEXT,
  ai_summary TEXT,
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_started_at ON call_sessions(started_at DESC);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sessions
  BEFORE UPDATE ON call_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS 策略（个人使用，允许匿名读写）
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON call_sessions FOR ALL USING (true) WITH CHECK (true);


字段说明：
- transcript 是 JSONB 数组：[{ "text": "你好", "timestamp": 1710300001000 }, ...]
- ai_summary：通话结束时 LLM 自动生成，可为空
- user_context：用户预设的背景信息，可为空
- 不存 Bubble 数据（实时辅助信息，结束后意义不大）
```

---

## Step 2：后端 Supabase 客户端

```
新建 server/supabase-client.js。

用 Node.js 原生 fetch 调 Supabase REST API，不装额外 SDK。

Supabase REST API 格式：
- Base URL: ${SUPABASE_URL}/rest/v1/call_sessions
- 请求头:
  apikey: ${SUPABASE_ANON_KEY}
  Authorization: Bearer ${SUPABASE_ANON_KEY}
  Content-Type: application/json
  Prefer: return=representation（INSERT/UPDATE 时返回完整数据）

封装方法：

class SupabaseClient {
  constructor(url, anonKey)

  async createSession(data)
  // POST /rest/v1/call_sessions
  // body: { started_at, user_context }
  // 返回创建的记录

  async updateSession(id, data)
  // PATCH /rest/v1/call_sessions?id=eq.${id}
  // body: { ended_at, duration_seconds, transcript, ai_summary }

  async listSessions(limit = 20, offset = 0)
  // GET /rest/v1/call_sessions?select=id,started_at,ended_at,duration_seconds,ai_summary,user_context&order=started_at.desc&limit=${limit}&offset=${offset}
  // 注意：不返回 transcript（太大），只返回元信息

  async getSession(id)
  // GET /rest/v1/call_sessions?id=eq.${id}
  // 返回完整记录含 transcript

  async deleteSession(id)
  // DELETE /rest/v1/call_sessions?id=eq.${id}

  async getSessionCount()
  // GET /rest/v1/call_sessions?select=count
  // Header: Prefer: count=exact
}

每个方法 try-catch，Supabase 不可用时打印警告，不影响主功能。
```

---

## Step 3：Session 生命周期管理

```
新建 server/session-manager.js。

class SessionManager {
  constructor(supabaseClient, llmEngine)

  async startSession(userContext?)
  // 1. 在 Supabase 创建记录（started_at + user_context）
  // 2. 内存维护当前 session 的 transcript 数组
  // 3. 返回 sessionId

  addTranscript(text, timestamp)
  // 追加到内存 transcript 数组

  async endSession()
  // 1. 计算 duration_seconds
  // 2. 如果 transcript 为空（没说话），删除这条空 session，返回 null
  // 3. 调用 llmEngine.generateSummary() 生成摘要
  // 4. 更新 Supabase（transcript + ai_summary + ended_at + duration）
  // 5. 清空内存临时数据
  // 6. 返回 { id, duration_seconds, ai_summary, transcript_count }

  getCurrentSession()
  // 返回当前 session 状态，或 null
}

在 server/llm-engine.js 中新增摘要方法：

async generateSummary(transcript, userContext)

Prompt：
  你是一个通话摘要助手。根据以下通话记录生成简洁摘要。
  要求：
  1. 不超过 100 字
  2. 包含通话主题、关键讨论点、后续行动
  3. 第三人称叙述
  4. 只输出纯文本，不要格式标记

  【用户背景】{userContext 或 "无"}
  【通话记录】{transcript}

API 参数：model: qwen-turbo, temperature: 0.3, max_tokens: 200
生成失败则返回 null，不影响保存。
```

---

## Step 4：后端 API 路由 + WebSocket 消息

```
在 server/index.js 中新增。

### REST API

GET  /api/sessions?limit=20&offset=0  → { sessions: [...], total }
GET  /api/sessions/:id                → 完整 session 对象
DELETE /api/sessions/:id              → { success: true }

### WebSocket 新增消息

后端 → 前端：

通话保存成功：
{
  "type": "session_saved",
  "data": { "id": "uuid", "duration_seconds": 180, "ai_summary": "...", "transcript_count": 25 }
}

通话保存失败：
{
  "type": "session_save_failed",
  "message": "错误描述"
}

### 串联到现有流程

前端"开始监听"时：
→ 原有逻辑 + sessionManager.startSession(userContext)

ASR 返回 final 结果时：
→ 原有逻辑 + sessionManager.addTranscript(text, timestamp)

前端"停止监听"时：
→ 原有逻辑（停止 ASR + 清理 DialogueManager）
→ 异步执行：sessionManager.endSession() → WebSocket 推送结果
→ 不阻塞，前端可以立即开始新通话

transcript 为空时（开了监听没说话就停了）不保存。
```

---

## Step 5：前端侧边栏

```
新建 public/js/sidebar.js。

### 打开方式

顶部状态栏左侧，"CallCopilot" 标题左边加汉堡图标 ☰（三横线）：
- 24x24px，颜色 #374151
- 点击：侧边栏从左侧滑出
- 同时出现半透明遮罩，点击遮罩关闭

### 侧边栏样式

- 从左侧滑出，宽 85vw（最大 360px），高 100vh
- 白色背景，z-index: 1000
- 右侧有微妙阴影
- 展开/收起：transform translateX，300ms ease-out

### 侧边栏内部结构

顶部标题栏（56px 高）：
- 左侧："通话记录" 字号 16px 字重 600
- 右侧：✕ 关闭按钮

内容区（可滚动）：Session 卡片列表

### Session 卡片

白色背景，border: 1px solid #E5E7EB，圆角 12px，内边距 14px 16px，卡片间距 10px。

第一行：📞 + 标题
- 标题取自 ai_summary 前 10 字，或 user_context 前 10 字，或"未命名通话"
- 字号 15px，字重 500，颜色 #111827

第二行：时间 + 时长
- 智能时间："今天 14:03" / "昨天 10:30" / "3月11日 16:22"
- 时长："3分12秒"
- 字号 12px，颜色 #9CA3AF

第三行：ai_summary 摘要（最多 2 行，ellipsis 截断）
- 字号 13px，颜色 #6B7280

右下角：🗑️ 删除图标
- 平时颜色 #D1D5DB，点击/hover 变 #EF4444
- 点击弹确认框，确认后调 DELETE API，列表移除（带 fadeOut 动画）

点击卡片（非删除按钮区域）→ 进入详情页

### 空状态

居中：浅色文件图标 + "还没有通话记录" + "通话结束后会自动保存"
颜色 #9CA3AF

### 分页

初始加载 20 条，滚动到底部显示"加载更多"文字按钮，点击加载下一页。
没有更多时显示"· 已经到底了 ·"
```

---

## Step 6：Session 详情页

```
点击 session 卡片后，侧边栏内容切换为详情页（slide-left 过渡动画）。

### 顶部导航
- 左侧："← 返回"（点击回到列表，slide-right 动画）
- 右侧：🗑️ 删除（确认后删除并返回列表）

### 内容区

标题：ai_summary 前 10 字或"未命名通话"
副标题：时间范围 + 时长（"今天 14:03 - 14:06 · 3分12秒"）

通话背景 卡片（user_context 非空时显示）：
- 标签 "通话背景"：12px，#2563EB
- 内容：14px，#374151
- 背景 #F9FAFB，圆角 8px

AI 摘要 卡片（ai_summary 非空时显示）：
- 标签 "AI 摘要"：12px，#2563EB
- 内容：14px，#374151，行高 1.6
- 背景 #F0F7FF（淡蓝），圆角 8px

完整对话记录：
- 标签 "完整对话记录"：12px，#6B7280
- 每条：时间戳（11px 灰色等宽）+ 文字（14px #111827），间距 6px
- 区域可滚动

### 加载

进入时调 GET /api/sessions/:id，骨架屏过渡。
```

---

## Step 7：通话结束保存的前端交互

```
用户点"停止监听"后：

1. 转写区域底部出现提示条：
   - "正在保存通话记录..." + spinner
   - 背景 #F0F7FF，字号 13px，颜色 #2563EB

2. 收到 session_saved：
   - 变为 "✅ 通话记录已保存"，绿色 #059669
   - 2 秒后自动消失（fadeOut）

3. 收到 session_save_failed：
   - 变为 "⚠️ 保存失败：{message}"，橙色 #D97706
   - 不自动消失，右侧有 ✕ 手动关闭

4. 不论成功失败，主功能不受影响，可以立刻开始新通话。
```

---

## Step 8：环境配置 + 防御性设计

```
### .env 新增
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_ANON_KEY=你的匿名Key

### 启动检查
如果 SUPABASE_URL 或 SUPABASE_ANON_KEY 未配置：
- 打印："⚠️ Supabase 未配置，通话记录将不会保存"
- SessionManager 进入 disabled 模式，所有方法为 no-op
- 核心功能（ASR + LLM + Bubble）不受影响

### Supabase 运行时不可用
- 所有 Supabase 调用有 try-catch
- 超时设置：5 秒
- 失败时打印警告，发送 session_save_failed，不 crash 服务器
```

---

## 新增文件

```
server/supabase-client.js      # Supabase REST API 封装
server/session-manager.js      # Session 生命周期管理
public/js/sidebar.js           # 侧边栏 UI
supabase/migrations/001_create_sessions.sql
```

---

## 验收标准

| 验证项           | 合格标准                |
| ------------- | ------------------- |
| 通话结束自动保存      | 停止后 3-5 秒内看到"已保存"提示 |
| AI 摘要         | 准确概括通话内容，≤ 100 字    |
| 侧边栏打开         | 300ms 滑出，列表正确加载     |
| 卡片信息展示        | 时间、时长、摘要格式清晰        |
| 详情页           | 完整展示背景、摘要、对话记录      |
| 删除            | 确认后删除，列表即时更新        |
| 空 session 不保存 | 开了监听没说话直接停→不产生记录    |
| Supabase 未配置  | 警告但不影响核心功能          |
| 主功能不被破坏       | ASR、LLM、Bubble 全部正常 |
