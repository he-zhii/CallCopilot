require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const projectRef = SUPABASE_URL?.match(/https:\/\/([^.]+)\./)?.[1];

async function tryCreateTable() {
    console.log('=== 尝试不同方式创建表 ===\n');

    // 方式1: 通过 pg_catalog
    const methods = [
        {
            name: 'REST API (正常方式)',
            url: `${SUPABASE_URL}/rest/v1/call_sessions`,
            method: 'POST',
            body: { started_at: new Date().toISOString() }
        },
        {
            name: 'PostgREST /rpc',
            url: `${SUPABASE_URL}/rpc/`,
            method: 'POST'
        },
    ];

    // 先测试正常方式能否创建（预期会失败，因为表不存在）
    console.log('1. 测试直接 POST 到表（预期失败）...');
    try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/call_sessions`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ started_at: new Date().toISOString() })
        });
        const err = await resp.text();
        console.log(`   状态: ${resp.status}`);
        console.log(`   错误: ${err.substring(0, 100)}`);
    } catch (e) {
        console.log(`   错误: ${e.message}`);
    }

    console.log('\n2. 尝试查询现有表...');
    try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/?select=table_name&table_schema=eq.public`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        console.log(`   状态: ${resp.status}`);
        if (resp.ok) {
            const tables = await resp.json();
            console.log(`   现有表: ${JSON.stringify(tables)}`);
        }
    } catch (e) {
        console.log(`   错误: ${e.message}`);
    }

    console.log('\n=== 结论 ===');
    console.log('Supabase REST API (PostgREST) 不支持 DDL (CREATE TABLE 等)');
    console.log('需要通过以下方式创建表：');
    console.log('1. Supabase 控制台 > SQL Editor');
    console.log('2. 或者使用 service_role 密钥 + Management API');
    console.log('\n请在 Supabase SQL Editor 中执行建表 SQL，或者提供 service_role_key');
}

tryCreateTable();