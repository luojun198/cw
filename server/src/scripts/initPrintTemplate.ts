import { getDb } from '../db/index.ts'
import { v4 as uuidv4 } from 'uuid'

/**
 * 初始化默认打印模版
 * 为所有账套创建标准凭证打印模版
 */
export function initDefaultPrintTemplate() {
  const db = getDb()

  // 获取所有账套
  const accountSets = db.prepare('SELECT id FROM account_sets').all() as Array<{ id: string }>

  if (accountSets.length === 0) {
    console.log('没有找到账套，跳过打印模版初始化')
    return
  }

  // 默认模版配置
  const defaultElements = {
    title: {
      type: 'title',
      text: '记账凭证',
      fontSize: 20,
      fontWeight: 'bold',
      align: 'center',
      marginBottom: 10,
    },
    info: {
      type: 'info',
      fields: ['voucher_no', 'date', 'voucher_type', 'attachments'],
      fontSize: 12,
      marginBottom: 10,
    },
    table: {
      type: 'table',
      columns: [
        { field: 'summary', label: '摘要', width: '30%' },
        { field: 'account', label: '会计科目', width: '30%' },
        { field: 'debit', label: '借方金额', width: '20%', align: 'right' },
        { field: 'credit', label: '贷方金额', width: '20%', align: 'right' },
      ],
      fontSize: 12,
      borderWidth: 1,
      marginBottom: 10,
    },
    total: {
      type: 'total',
      fontSize: 12,
      fontWeight: 'bold',
      marginBottom: 15,
    },
    signature: {
      type: 'signature',
      fields: [
        { label: '制单', field: 'created_by' },
        { label: '审核', field: 'auditor' },
        { label: '记账', field: 'poster' },
        { label: '主管', field: 'supervisor' },
      ],
      fontSize: 12,
    },
  }

  const insertStmt = db.prepare(`
    INSERT INTO print_templates (
      id, account_set_id, name, paper_size, paper_width, paper_height,
      margin_top, margin_bottom, margin_left, margin_right,
      elements, is_default, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let createdCount = 0

  for (const accountSet of accountSets) {
    // 检查是否已存在默认模版
    const existing = db
      .prepare('SELECT id FROM print_templates WHERE account_set_id = ? AND is_default = 1')
      .get(accountSet.id)

    if (existing) {
      console.log(`账套 ${accountSet.id} 已存在默认打印模版，跳过`)
      continue
    }

    const now = new Date().toISOString()
    const templateId = uuidv4()

    insertStmt.run(
      templateId,
      accountSet.id,
      '标准凭证打印模版',
      'custom', // paper_size
      220, // paper_width (mm)
      140, // paper_height (mm)
      15, // margin_top (mm)
      15, // margin_bottom (mm)
      10, // margin_left (mm)
      10, // margin_right (mm)
      JSON.stringify(defaultElements),
      1, // is_default
      now,
      now
    )

    createdCount++
    console.log(`为账套 ${accountSet.id} 创建默认打印模版: ${templateId}`)
  }

  console.log(`打印模版初始化完成，共创建 ${createdCount} 个默认模版`)
}
