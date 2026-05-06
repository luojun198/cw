const Database = require('better-sqlite3');

const dbPath = 'D:/kf/cw0423/server/data/cw_finance.db';
const db = new Database(dbPath);

console.log('开始初始化默认打印模版...');

// 获取所有账套
const accountSets = db.prepare('SELECT id, name FROM account_sets').all();
console.log('找到账套数量:', accountSets.length);

if (accountSets.length === 0) {
  console.log('没有找到账套，退出');
  db.close();
  process.exit(0);
}

// 新版字段级别的默认模版配置
const defaultElements = [
  // 标题
  { type: 'text', content: '记账凭证', x: 85, y: 10, width: 50, height: 8, fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  
  // 凭证信息
  { type: 'text', content: '凭证字号：', x: 10, y: 25, width: 20, height: 6, fontSize: 12 },
  { type: 'voucher_no', x: 30, y: 25, width: 30, height: 6, fontSize: 12 },
  
  { type: 'text', content: '日期：', x: 120, y: 25, width: 15, height: 6, fontSize: 12 },
  { type: 'date', x: 135, y: 25, width: 30, height: 6, fontSize: 12, dateFormat: 'YYYY-MM-DD' },
  
  { type: 'text', content: '附件：', x: 170, y: 25, width: 15, height: 6, fontSize: 12 },
  { type: 'attachments', x: 185, y: 25, width: 20, height: 6, fontSize: 12 },
  { type: 'text', content: '张', x: 205, y: 25, width: 5, height: 6, fontSize: 12 },
  
  // 分录表格
  {
    type: 'table',
    x: 10,
    y: 35,
    width: 200,
    height: 60,
    fontSize: 11,
    showBorder: true,
    columns: [
      { field: 'summary', label: '摘要', width: 60, visible: true },
      { field: 'account_code', label: '科目代码', width: 30, visible: true },
      { field: 'account_name', label: '科目名称', width: 40, visible: true },
      { field: 'debit', label: '借方金额', width: 35, visible: true },
      { field: 'credit', label: '贷方金额', width: 35, visible: true }
    ]
  },
  
  // 合计
  { type: 'text', content: '合计：', x: 10, y: 100, width: 15, height: 6, fontSize: 12, fontWeight: 'bold' },
  { type: 'total_debit', x: 105, y: 100, width: 35, height: 6, fontSize: 12, fontWeight: 'bold', numberFormat: 'thousand' },
  { type: 'total_credit', x: 145, y: 100, width: 35, height: 6, fontSize: 12, fontWeight: 'bold', numberFormat: 'thousand' },
  
  // 签名栏
  { type: 'text', content: '制单：', x: 10, y: 115, width: 15, height: 6, fontSize: 11 },
  { type: 'maker', x: 25, y: 115, width: 30, height: 6, fontSize: 11 },
  
  { type: 'text', content: '审核：', x: 60, y: 115, width: 15, height: 6, fontSize: 11 },
  { type: 'auditor', x: 75, y: 115, width: 30, height: 6, fontSize: 11 },
  
  { type: 'text', content: '记账：', x: 110, y: 115, width: 15, height: 6, fontSize: 11 },
  { type: 'poster', x: 125, y: 115, width: 30, height: 6, fontSize: 11 },
  
  { type: 'text', content: '主管：', x: 160, y: 115, width: 15, height: 6, fontSize: 11 },
  { type: 'supervisor', x: 175, y: 115, width: 30, height: 6, fontSize: 11 }
];

const insertStmt = db.prepare(`
  INSERT INTO print_templates (
    account_set_id, name, is_default,
    paper_width, paper_height,
    margin_top, margin_bottom, margin_left, margin_right,
    elements, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);

let createdCount = 0;

for (const accountSet of accountSets) {
  // 检查是否已存在默认模版
  const existing = db.prepare('SELECT id FROM print_templates WHERE account_set_id = ? AND is_default = 1').get(accountSet.id);
  
  if (existing) {
    console.log(`账套 ${accountSet.id} (${accountSet.name}) 已存在默认模版，跳过`);
    continue;
  }
  
  insertStmt.run(
    accountSet.id,
    '标准凭证打印模版',
    1, // is_default
    220, // paper_width (mm)
    140, // paper_height (mm)
    15, // margin_top (mm)
    15, // margin_bottom (mm)
    10, // margin_left (mm)
    10, // margin_right (mm)
    JSON.stringify(defaultElements)
  );
  
  createdCount++;
  console.log(`✓ 为账套 ${accountSet.id} (${accountSet.name}) 创建默认打印模版`);
}

console.log(`\n初始化完成，共创建 ${createdCount} 个默认模版`);

// 验证
const templates = db.prepare('SELECT id, account_set_id, name, is_default FROM print_templates').all();
console.log('\n当前所有模版:');
templates.forEach(t => {
  console.log(`  - ID: ${t.id}, 账套: ${t.account_set_id}, 名称: ${t.name}, 默认: ${t.is_default ? '是' : '否'}`);
});

db.close();
