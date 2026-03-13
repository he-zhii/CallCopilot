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
        const response = await fetch(`${this.url}/rest/v1/call_sessions`, {
            method: 'POST',
            headers: this.baseHeaders,
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`创建session失败: ${error}`);
        }
        
        return await response.json();
    }

    async updateSession(id, data) {
        const response = await fetch(`${this.url}/rest/v1/call_sessions?id=eq.${id}`, {
            method: 'PATCH',
            headers: this.baseHeaders,
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`更新session失败: ${error}`);
        }
        
        return await response.json();
    }

    async listSessions(limit = 20, offset = 0) {
        const response = await fetch(
            `${this.url}/rest/v1/call_sessions?select=id,started_at,ended_at,duration_seconds,ai_summary,user_context&order=started_at.desc&limit=${limit}&offset=${offset}`,
            {
                method: 'GET',
                headers: this.baseHeaders
            }
        );
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`列出sessions失败: ${error}`);
        }
        
        return await response.json();
    }

    async getSession(id) {
        const response = await fetch(`${this.url}/rest/v1/call_sessions?id=eq.${id}`, {
            method: 'GET',
            headers: this.baseHeaders
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`获取session失败: ${error}`);
        }
        
        const result = await response.json();
        return result[0] || null;
    }

    async deleteSession(id) {
        const response = await fetch(`${this.url}/rest/v1/call_sessions?id=eq.${id}`, {
            method: 'DELETE',
            headers: this.baseHeaders
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`删除session失败: ${error}`);
        }
        
        return true;
    }

    async getSessionCount() {
        const headers = { ...this.baseHeaders, 'Prefer': 'count=exact' };
        const response = await fetch(`${this.url}/rest/v1/call_sessions?select=count`, {
            method: 'GET',
            headers: headers
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`获取count失败: ${error}`);
        }
        
        const count = response.headers.get('content-range');
        if (count) {
            const match = count.match(/\/(\d+)/);
            return match ? parseInt(match[1]) : 0;
        }
        return 0;
    }
}

async function testSupabase() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.log('⚠️ Supabase 未配置');
        return;
    }

    const client = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    console.log('=== 测试 Supabase API ===\n');

    // 测试1: 创建 session
    console.log('1. 测试创建 session...');
    try {
        const testSession = {
            started_at: new Date().toISOString(),
            user_context: '测试：客户咨询摄影套餐'
        };
        const created = await client.createSession(testSession);
        console.log('   ✅ 创建成功:', created[0]?.id);
        const sessionId = created[0]?.id;

        // 测试2: 更新 session
        console.log('\n2. 测试更新 session...');
        const updated = await client.updateSession(sessionId, {
            ended_at: new Date().toISOString(),
            duration_seconds: 120,
            transcript: [
                { text: '你好，我想咨询一下套餐', timestamp: Date.now() },
                { text: '您好，请问有什么可以帮助您', timestamp: Date.now() + 1000 }
            ],
            ai_summary: '客户咨询摄影套餐详情，初步沟通顺利'
        });
        console.log('   ✅ 更新成功');

        // 测试3: 列出 sessions
        console.log('\n3. 测试列出 sessions...');
        const sessions = await client.listSessions(5, 0);
        console.log('   ✅ 列出成功, 共', sessions.length, '条');

        // 测试4: 获取单个 session
        console.log('\n4. 测试获取单个 session...');
        const single = await client.getSession(sessionId);
        console.log('   ✅ 获取成功, ai_summary:', single?.ai_summary);

        // 测试5: 删除 session
        console.log('\n5. 测试删除 session...');
        await client.deleteSession(sessionId);
        console.log('   ✅ 删除成功');

        // 测试6: 获取 count
        console.log('\n6. 测试获取总数...');
        const count = await client.getSessionCount();
        console.log('   ✅ 总数:', count);

        console.log('\n=== 所有测试通过! ===');
    } catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        
        // 检查是否是表不存在的错误
        if (error.message.includes('Could not find the table')) {
            console.log('\n⚠️ 需要先在 Supabase SQL Editor 中创建表');
            console.log('请在 Supabase 控制台 > SQL Editor 中执行:');
            console.log(`
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

ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON call_sessions FOR ALL USING (true) WITH CHECK (true);
            `);
        }
    }
}

testSupabase();