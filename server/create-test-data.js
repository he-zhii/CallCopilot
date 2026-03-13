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
        return response.ok ? await response.json() : null;
    }
}

async function createTestData() {
    const client = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const testSessions = [
        {
            started_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2小时前
            ended_at: new Date(Date.now() - 2 * 60 * 60 * 1000 + 185 * 1000).toISOString(),
            duration_seconds: 185,
            user_context: '客户李姐，之前拍了3999套餐，这次想升级',
            ai_summary: '李姐升级套餐咨询，介绍了7988高端套餐',
            transcript: [
                { text: '喂，您好', timestamp: Date.now() - 2 * 60 * 60 * 1000 },
                { text: '您好，请问有什么可以帮您？', timestamp: Date.now() - 2 * 60 * 60 * 1000 + 2000 },
                { text: '我想问一下升级套餐的事情', timestamp: Date.now() - 2 * 60 * 60 * 1000 + 5000 },
                { text: '李姐您好，您之前拍的是3999套餐对吧', timestamp: Date.now() - 2 * 60 * 60 * 1000 + 8000 },
                { text: '对的，我想升级到更好的', timestamp: Date.now() - 2 * 60 * 60 * 1000 + 12000 },
                { text: '我们这边有7988的高端套餐，外景更多', timestamp: Date.now() - 2 * 60 * 60 * 1000 + 15000 }
            ]
        },
        {
            started_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 昨天
            ended_at: new Date(Date.now() - 24 * 60 * 60 * 1000 + 320 * 1000).toISOString(),
            duration_seconds: 320,
            user_context: '新客户王先生，首次咨询婚纱照',
            ai_summary: '王先生婚纱照咨询，预约了明天到店详谈',
            transcript: [
                { text: '你好，我想了解一下婚纱照', timestamp: Date.now() - 24 * 60 * 60 * 1000 },
                { text: '您好欢迎致电，我们有多个套餐', timestamp: Date.now() - 24 * 60 * 60 * 1000 + 3000 },
                { text: '我想问一下价格大概多少', timestamp: Date.now() - 24 * 60 * 60 * 1000 + 7000 },
                { text: '我们套餐从3999到12999都有', timestamp: Date.now() - 24 * 60 * 60 * 1000 + 10000 },
                { text: '我明天可以到店看看吗', timestamp: Date.now() - 24 * 60 * 60 * 1000 + 15000 },
                { text: '可以的，明天上午10点可以吗', timestamp: Date.now() - 24 * 60 * 60 * 1000 + 18000 }
            ]
        },
        {
            started_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3天前
            ended_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 95 * 1000).toISOString(),
            duration_seconds: 95,
            user_context: '投诉处理，客户抱怨成片质量',
            ai_summary: '客户投诉照片质量问题，已安排重拍',
            transcript: [
                { text: '你们拍的照片我不满意', timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 },
                { text: '非常抱歉，请问是哪里不满意', timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 4000 },
                { text: '光线很差，构图也不行', timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 8000 },
                { text: '我理解，我们安排免费重拍', timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 12000 }
            ]
        }
    ];

    console.log('=== 创建测试数据 ===\n');
    
    for (const session of testSessions) {
        const result = await client.createSession(session);
        console.log(`✅ 创建: ${result[0]?.id?.slice(0,8)}... - ${session.ai_summary.substring(0, 20)}`);
    }

    console.log('\n=== 测试数据创建完成 ===');
}

createTestData();