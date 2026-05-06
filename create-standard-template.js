const Database = require('better-sqlite3')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

const dbPath = path.join(__dirname, 'data', 'finance.db')
const db = new Database(dbPath)

try {
  const accountSet = db.prepare('SELECT id FROM account_sets LIMIT 1').get()
  if (!accountSet) {
    console.error('错误：未找到账套')
    process.exit(1)
  }

  const existing = db.prepare('SELECT id FROM print_templates WHERE name = ? AND account_set_id = ?').get('标准模版', accountSet.id)

  if (existing) {
    console.log('标准模版已存在，将更新现有模版...')
  }

  const now = Date.now()
  let idCounter = 0
  const uid = (prefix) => `${prefix}_${now}_${idCounter++}`

  // ============================================================
  // 纸张：220mm x 140mm，页边距 10mm 四边
  // 内容区：200mm x 120mm
  // 
  // 布局（y 坐标从内容区顶部 0 开始）：
  //   标题区    y=0~11    标题 + 账套名称
  //   分隔线    y=12~14
  //   信息区    y=15~27   第一行：凭证字号 / 日期
  //                       第二行：单位名称 / 附件
  //   表格区    y=29~70   表头 6mm + 5行明细 6mm + 合计行 6mm = 42mm
  //   签名区    y=76~82
  //   底部线    y=85
  // ============================================================

  const CW = 200  // 内容区宽度 mm

  const elements = [
    // ==================== 标题区 ====================
    {
      id: uid('title'),
      type: 'title',
      x: 50, y: 0, width: 100, height: 9,
      fontSize: 16, fontWeight: 'bold', align: 'center',
      text: '记 账 凭 证'
    },
    {
      id: uid('account_set_name'),
      type: 'account_set_name',
      x: 60, y: 10, width: 80, height: 5,
      fontSize: 8, fontWeight: 'normal', align: 'center'
    },

    // ==================== 分隔线 ====================
    {
      id: uid('text_decor'),
      type: 'text',
      x: 0, y: 16, width: CW, height: 3,
      fontSize: 5, fontWeight: 'normal', align: 'center',
      text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    },

    // ==================== 信息区 第一行 ====================
    {
      id: uid('text_seq_label'),
      type: 'text',
      x: 0, y: 21, width: 18, height: 5,
      fontSize: 9, fontWeight: 'normal', align: 'right',
      text: '凭证字号：'
    },
    {
      id: uid('voucher_no'),
      type: 'voucher_no',
      x: 19, y: 21, width: 40, height: 5,
      fontSize: 9, fontWeight: 'normal', align: 'left'
    },
    {
      id: uid('text_date_label'),
      type: 'text',
      x: 140, y: 21, width: 18, height: 5,
      fontSize: 9, fontWeight: 'normal', align: 'right',
      text: '日　　期：'
    },
    {
      id: uid('date'),
      type: 'date',
      x: 159, y: 21, width: 41, height: 5,
      fontSize: 9, fontWeight: 'normal', align: 'left',
      dateFormat: 'YYYY年MM月DD日'
    },

    // ==================== 信息区 第二行 ====================
    {
      id: uid('text_unit_label'),
      type: 'text',
      x: 0, y: 28, width: 18, height: 5,
      fontSize: 9, fontWeight: 'normal', align: 'right',
      text: '单位名称：'
    },
    {
      id: uid('unit_name'),
      type: 'unit_name',
      x: 19, y: 28, width: 70, height: 5,
      fontSize: 9, fontWeight: 'normal', align: 'left'
    },
    {
      id: uid('text_attach_label'),
      type: 'text',
      x: 140, y: 28, width: 18, height: 5,
      fontSize: 9, fontWeight: 'normal', align: 'right',
      text: '附件张数：'
    },
    {
      id: uid('attachments'),
      type: 'attachments',
      x: 159, y: 28, width: 12, height: 5,
      fontSize: 9, fontWeight: 'normal', align: 'left'
    },
    {
      id: uid('text_attach_suffix'),
      type: 'text',
      x: 172, y: 28, width: 6, height: 5,
      fontSize: 9, fontWeight: 'normal', align: 'left',
      text: '张'
    },

    // ==================== 分录表格 ====================
    // 表头 6mm + 5行明细 6mm + 合计行 6mm = 42mm
    {
      id: uid('table'),
      type: 'table',
      x: 0, y: 35, width: CW, height: 45,
      fontSize: 9, fontWeight: 'normal', align: 'left',
      borderWidth: 1, rowHeight: 6, printRows: 6,
      showHeader: true, numberFormat: 'thousand',
      columns: [
        { field: 'summary',      label: '摘　　要', width: '30%',   align: 'left',   visible: true },
        { field: 'account_code', label: '科目代码', width: '12%',   align: 'center', visible: true },
        { field: 'account_name', label: '科目名称', width: '23%',   align: 'left',   visible: true },
        { field: 'debit',        label: '借方金额', width: '17.5%', align: 'right',  visible: true },
        { field: 'credit',       label: '贷方金额', width: '17.5%', align: 'right',  visible: true }
      ]
    },

    // ==================== 签名区 ====================
    // 四列均匀分布，每列 50mm 间距
    {
      id: uid('text_maker_label'),
      type: 'text',
      x: 0, y: 84, width: 12, height: 5,
      fontSize: 8, fontWeight: 'normal', align: 'right',
      text: '制单：'
    },
    {
      id: uid('signature_maker'),
      type: 'signature_maker',
      x: 13, y: 84, width: 30, height: 5,
      fontSize: 8, fontWeight: 'normal', align: 'left'
    },
    {
      id: uid('text_auditor_label'),
      type: 'text',
      x: 50, y: 84, width: 12, height: 5,
      fontSize: 8, fontWeight: 'normal', align: 'right',
      text: '审核：'
    },
    {
      id: uid('signature_auditor'),
      type: 'signature_auditor',
      x: 63, y: 84, width: 30, height: 5,
      fontSize: 8, fontWeight: 'normal', align: 'left'
    },
    {
      id: uid('text_poster_label'),
      type: 'text',
      x: 100, y: 84, width: 12, height: 5,
      fontSize: 8, fontWeight: 'normal', align: 'right',
      text: '记账：'
    },
    {
      id: uid('signature_poster'),
      type: 'signature_poster',
      x: 113, y: 84, width: 30, height: 5,
      fontSize: 8, fontWeight: 'normal', align: 'left'
    },
    {
      id: uid('text_supervisor_label'),
      type: 'text',
      x: 150, y: 84, width: 12, height: 5,
      fontSize: 8, fontWeight: 'normal', align: 'right',
      text: '主管：'
    },
    {
      id: uid('signature_supervisor'),
      type: 'signature_supervisor',
      x: 163, y: 84, width: 30, height: 5,
      fontSize: 8, fontWeight: 'normal', align: 'left'
    },

    // ==================== 底部装饰线 ====================
    {
      id: uid('text_bottom_decor'),
      type: 'text',
      x: 0, y: 92, width: CW, height: 3,
      fontSize: 5, fontWeight: 'normal', align: 'center',
      text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    }
  ]

  const templateData = {
    id: existing ? existing.id : uuidv4(),
    account_set_id: accountSet.id,
    name: '标准模版',
    paper_size: 'custom',
    paper_width: 220,
    paper_height: 140,
    margin_top: 10,
    margin_bottom: 10,
    margin_left: 10,
    margin_right: 10,
    elements: JSON.stringify(elements),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  if (existing) {
    db.prepare(`
      UPDATE print_templates 
      SET paper_size = ?, paper_width = ?, paper_height = ?, 
          margin_top = ?, margin_bottom = ?, margin_left = ?, margin_right = ?,
          elements = ?, updated_at = ?
      WHERE id = ?
    `).run(
      templateData.paper_size,
      templateData.paper_width,
      templateData.paper_height,
      templateData.margin_top,
      templateData.margin_bottom,
      templateData.margin_left,
      templateData.margin_right,
      templateData.elements,
      templateData.updated_at,
      templateData.id
    )
    console.log('标准模版更新成功')
  } else {
    db.prepare(`
      INSERT INTO print_templates (id, account_set_id, name, paper_size, paper_width, paper_height, 
                                   margin_top, margin_bottom, margin_left, margin_right,
                                   elements, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      templateData.id,
      templateData.account_set_id,
      templateData.name,
      templateData.paper_size,
      templateData.paper_width,
      templateData.paper_height,
      templateData.margin_top,
      templateData.margin_bottom,
      templateData.margin_left,
      templateData.margin_right,
      templateData.elements,
      templateData.created_at,
      templateData.updated_at
    )
    console.log('标准模版创建成功')
  }

  console.log('\n模版详情：')
  console.log(`纸张规格：${templateData.paper_width}mm x ${templateData.paper_height}mm`)
  console.log(`页边距：${templateData.margin_top}mm（四边统一）`)
  console.log(`内容区：${templateData.paper_width - templateData.margin_left - templateData.margin_right}mm x ${templateData.paper_height - templateData.margin_top - templateData.margin_bottom}mm`)
  console.log(`元素数量：${elements.length} 个`)
  console.log('')
  console.log('布局结构（220x140mm 紧凑版）：')
  console.log('  [标题区 y=0~15]  记账凭证（16pt 粗体居中）+ 账套名称 + 装饰线')
  console.log('  [信息区 y=21~33] 凭证字号/日期（第一行），单位名称/附件（第二行）')
  console.log('  [表格区 y=35~77] 6行（5行明细+1行合计），行高 6mm')
  console.log('  [签名区 y=84]    制单 | 审核 | 记账 | 主管')
  console.log('  [底部线 y=92]    装饰分隔线')
  console.log('  坐标单位：mm，字体单位：pt')
  console.log('')

} catch (error) {
  console.error('操作失败:', error)
  process.exit(1)
} finally {
  db.close()
}
