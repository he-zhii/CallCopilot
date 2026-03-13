require('dotenv').config();
const LLMEngine = require('../server/llm-engine');

const API_KEY = process.env.DASHSCOPE_API_KEY;

if (!API_KEY) {
    console.error('请在 .env 文件中设置 DASHSCOPE_API_KEY');
    process.exit(1);
}

const llmEngine = new LLMEngine(API_KEY);

const testCases = [
    {
        name: '客户问价格（有上下文）',
        userContext: '我是XX婚纱摄影的销售小陈，客户姓李，之前拍了3999套餐',
        transcript: '收到了收到了整体还行吧\n有几张确实挺好看的\n这个套餐能不能便宜点我朋友也想拍'
    },
    {
        name: '客户开玩笑（有上下文）',
        userContext: '我是摄影店的销售',
        transcript: '嗯我看了一下价格单\n你们这价格是把金子镶上去了吧'
    },
    {
        name: '客户投诉（有上下文）',
        userContext: '婚纱摄影客户回访',
        transcript: '照片收到了\n上次拍的照片我不太满意修图感觉不够细致\n有些地方皮肤看起来还是不太好'
    },
    {
        name: '客户犹豫（无上下文）',
        userContext: '',
        transcript: '嗯我再考虑考虑吧\n回头联系你\n主要是想跟家里人商量一下'
    },
    {
        name: '冷场/对话很少（无上下文）',
        userContext: '',
        transcript: '嗯\n哦\n好的'
    }
];

function getCharCount(str) {
    const chinese = str.match(/[\u4e00-\u9fa5]/g) || [];
    const other = str.replace(/[\u4e00-\u9fa5]/g, '');
    return chinese.length + other.length;
}

function hasSpokenPattern(text) {
    const spokenPatterns = ['嗯', '哈哈', '其实', '您看', '呢', '吧', '啊', '哦', '我', '您', '你', '咱们'];
    return spokenPatterns.some(p => text.includes(p));
}

function checkResult(result, name) {
    const checks = {
        'JSON 合法': result !== null,
        'Bubble 数量': result && result.bubbles.length >= 2 && result.bubbles.length <= 4,
        'Preview 长度': result && result.bubbles.every(b => getCharCount(b.preview) <= 8),
        'Full_text 长度': result && result.bubbles.every(b => getCharCount(b.full_text) <= 40),
        'Strategy 互异': result && new Set(result.bubbles.map(b => b.strategy)).size === result.bubbles.length,
        '口语化': result && result.bubbles.some(b => hasSpokenPattern(b.full_text))
    };

    console.log(`\n检查:`);
    for (const [check, passed] of Object.entries(checks)) {
        console.log(`  ${passed ? '✅' : '❌'} ${check}`);
    }

    return Object.values(checks).every(v => v);
}

async function runTest(testCase) {
    console.log(`\n--- 场景: ${testCase.name} ---`);
    console.log(`上下文: ${testCase.userContext || '(无)'}`);
    console.log(`Transcript: ${testCase.transcript}`);

    const result = await llmEngine.generateBubbles(testCase.transcript, testCase.userContext);

    if (result) {
        console.log(`\n结果:`);
        console.log(`  概要: ${result.context_summary}`);
        result.bubbles.forEach((b, i) => {
            console.log(`  Bubble ${i + 1}: [${b.strategy}] "${b.full_text}"`);
        });
    }

    return checkResult(result, testCase.name);
}

async function main() {
    console.log('='.repeat(50));
    console.log('Prompt 测试开始');
    console.log('='.repeat(50));

    const results = [];

    for (const testCase of testCases) {
        const passed = await runTest(testCase);
        results.push({ name: testCase.name, passed });
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n' + '='.repeat(50));
    console.log('=== 总结 ===');
    const passCount = results.filter(r => r.passed).length;
    console.log(`通过: ${passCount}/${results.length}`);
    
    if (passCount < results.length) {
        const failed = results.filter(r => !r.passed).map(r => r.name);
        console.log(`失败: ${failed.join(', ')}`);
    }
}

main().catch(console.error);