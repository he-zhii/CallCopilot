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
            'Content-Type': 'application/json'
        };
    }

    async listSessions(limit = 20, offset = 0) {
        const response = await fetch(
            `${this.url}/rest/v1/call_sessions?select=id,started_at,ended_at,duration_seconds,ai_summary,user_context&order=started_at.desc&limit=${limit}&offset=${offset}`,
            { method: 'GET', headers: this.baseHeaders }
        );
        return response.ok ? await response.json() : [];
    }

    async getSession(id) {
        const response = await fetch(`${this.url}/rest/v1/call_sessions?id=eq.${id}`, {
            method: 'GET',
            headers: this.baseHeaders
        });
        const result = await response.json();
        return result[0] || null;
    }
}

async function queryTest() {
    const client = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    console.log('=== 查询通话记录 ===\n');

    // 列表查询
    const sessions = await client.listSessions(20, 0);
    console.log(`共 ${sessions.length} 条记录:\n`);

    for (const s of sessions) {
        const time = new Date(s.started_at).toLocaleString('zh-CN', { 
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' 
        });
        const duration = `${Math.floor(s.duration_seconds / 60)}分${s.duration_seconds % 60}秒`;
        
        console.log(`📞 ${s.ai_summary?.substring(0, 25) || '未命名'}`);
        console.log(`   ${time} · ${duration}`);
        console.log();
    }

    // 详情查询
    if (sessions[0]) {
        console.log('=== 详情页测试 ===\n');
        const detail = await client.getSession(sessions[0].id);
        console.log(`ID: ${detail.id}`);
        console.log(`时长: ${detail.duration_seconds}秒`);
        console.log(`摘要: ${detail.ai_summary}`);
        console.log(`对话: ${detail.transcript?.length} 条`);
    }
}

queryTest();