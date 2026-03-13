require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

class SupabaseClient {
    constructor(url, anonKey) {
        this.url = url;
        this.anonKey = anonKey;
        this.baseHeaders = {
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };
    }

    async createSession(data) {
        try {
            const response = await fetch(`${this.url}/rest/v1/call_sessions`, {
                method: 'POST',
                headers: this.baseHeaders,
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error(await response.text());
            return await response.json();
        } catch (e) {
            console.error('[Supabase] 创建session失败:', e.message);
            throw e;
        }
    }

    async updateSession(id, data) {
        try {
            const response = await fetch(`${this.url}/rest/v1/call_sessions?id=eq.${id}`, {
                method: 'PATCH',
                headers: this.baseHeaders,
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error(await response.text());
            return await response.json();
        } catch (e) {
            console.error('[Supabase] 更新session失败:', e.message);
            throw e;
        }
    }

    async listSessions(limit = 20, offset = 0) {
        try {
            const response = await fetch(
                `${this.url}/rest/v1/call_sessions?select=id,started_at,ended_at,duration_seconds,ai_summary,user_context&order=started_at.desc&limit=${limit}&offset=${offset}`,
                { method: 'GET', headers: this.baseHeaders }
            );
            if (!response.ok) throw new Error(await response.text());
            return await response.json();
        } catch (e) {
            console.error('[Supabase] 列出sessions失败:', e.message);
            return [];
        }
    }

    async getSession(id) {
        try {
            const response = await fetch(`${this.url}/rest/v1/call_sessions?id=eq.${id}`, {
                method: 'GET',
                headers: this.baseHeaders
            });
            if (!response.ok) throw new Error(await response.text());
            const result = await response.json();
            return result[0] || null;
        } catch (e) {
            console.error('[Supabase] 获取session失败:', e.message);
            return null;
        }
    }

    async deleteSession(id) {
        try {
            const response = await fetch(`${this.url}/rest/v1/call_sessions?id=eq.${id}`, {
                method: 'DELETE',
                headers: this.baseHeaders
            });
            if (!response.ok) throw new Error(await response.text());
            return true;
        } catch (e) {
            console.error('[Supabase] 删除session失败:', e.message);
            throw e;
        }
    }

    async getSessionCount() {
        try {
            const headers = { ...this.baseHeaders, 'Prefer': 'count=exact' };
            const response = await fetch(`${this.url}/rest/v1/call_sessions?select=count`, {
                method: 'GET',
                headers: headers
            });
            const count = response.headers.get('content-range');
            if (count) {
                const match = count.match(/\/(\d+)/);
                return match ? parseInt(match[1]) : 0;
            }
            return 0;
        } catch (e) {
            return 0;
        }
    }
}

class SessionManager {
    constructor(supabaseClient, llmEngine) {
        this.supabase = supabaseClient;
        this.llmEngine = llmEngine;
        this.currentSession = null;
        this.transcript = [];
        this.disabled = !SUPABASE_URL || !SUPABASE_ANON_KEY;
        
        if (this.disabled) {
            console.log('⚠️ Supabase 未配置，通话记录将不会保存');
        }
    }

    async startSession(userContext = '') {
        if (this.disabled) return null;

        try {
            const sessionData = {
                started_at: new Date().toISOString(),
                user_context: userContext || null
            };

            const result = await this.supabase.createSession(sessionData);
            this.currentSession = result[0];
            this.transcript = [];
            
            console.log(`[Session] 开始新会话: ${this.currentSession.id}`);
            return this.currentSession.id;
        } catch (error) {
            console.error('[Session] 启动session失败:', error.message);
            return null;
        }
    }

    addTranscript(text, timestamp) {
        this.transcript.push({ text, timestamp });
    }

    async endSession() {
        if (this.disabled || !this.currentSession) {
            this.reset();
            return null;
        }

        if (this.transcript.length === 0) {
            console.log('[Session] 转写为空，删除session');
            this.reset();
            return null;
        }

        try {
            const endedAt = new Date();
            const startedAt = new Date(this.currentSession.started_at);
            const durationSeconds = Math.floor((endedAt - startedAt) / 1000);

            console.log('[Session] 正在生成AI摘要...');
            const aiSummary = await this.llmEngine.generateSummary(
                this.transcript, 
                this.currentSession.user_context
            );

            const updateData = {
                ended_at: endedAt.toISOString(),
                duration_seconds: durationSeconds,
                transcript: this.transcript,
                ai_summary: aiSummary
            };

            await this.supabase.updateSession(this.currentSession.id, updateData);

            const result = {
                id: this.currentSession.id,
                duration_seconds: durationSeconds,
                ai_summary: aiSummary,
                transcript_count: this.transcript.length
            };

            console.log(`[Session] 保存成功: ${result.id}, ${durationSeconds}秒, ${this.transcript.length}条对话`);
            
            this.reset();
            return result;
        } catch (error) {
            console.error('[Session] 保存失败:', error.message);
            this.reset();
            throw error;
        }
    }

    getCurrentSession() {
        return this.currentSession;
    }

    reset() {
        this.currentSession = null;
        this.transcript = [];
    }

    async listSessions(limit = 20, offset = 0) {
        return this.supabase.listSessions(limit, offset);
    }

    async getSession(id) {
        return this.supabase.getSession(id);
    }

    async deleteSession(id) {
        return this.supabase.deleteSession(id);
    }

    async getSessionCount() {
        return this.supabase.getSessionCount();
    }
}

function createSessionManager(llmEngine) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return new SessionManager(null, llmEngine);
    }
    const supabaseClient = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return new SessionManager(supabaseClient, llmEngine);
}

module.exports = { SessionManager, createSessionManager };