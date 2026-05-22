import { Router, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import dayjs from 'dayjs'
import { getDb } from '../db/index.js'
import { authMiddleware, AuthRequest, requirePermission, operationLog } from '../middleware/index.js'
import { buildVoucherListQuery } from '../services/voucherQuery.js'
import { yuanToCents } from '../utils/amountUtils.js'
import {
  attachVoucherEntries,
  buildVoucherEntryPayloads,
  buildVoucherEntriesMap,
  calculateVoucherTotals,
  deleteVoucherRecords,
  getNextVoucherNo,
  getVoucherBalanceError,
  getVoucherById,
  getVoucherDetail,
  getVoucherUpdateBalanceError,
  isPostedVoucher,
  createRealtimeNoNegativeBalanceGetters,
  loadVoucherAuxiliaryData,
  replaceVoucherEntries,
  validateVoucherEntriesNoNegativeBalance,
  validateVoucherEntryCount,
  validateVoucherEntriesCashFlow,
  VOUCHER_ENTRY_INSERT_SQL,
  type VoucherEntryInput,
  type NoNegativeBalanceCheckResult,
} from '../services/voucherEntry.js'
import fs from 'fs/promises'
import path from 'path'
import multer from 'multer'

const router = Router()

/** 禁止负数余额：期初 + 全部凭证实时汇总；启用辅助核算时按各辅助项目分项校验 */
function validateNoNegativeBalance(
  db: ReturnType<typeof getDb>,
  accountSetId: string,
  entries: VoucherEntryInput[],
  year: number,
  period: number,
  excludeVoucherId?: string
) {
  const { categories } = loadVoucherAuxiliaryData({ db, accountSetId })
  const realtimeGetters = createRealtimeNoNegativeBalanceGetters(db, {
    accountSetId,
    year,
    period,
    categories,
    excludeVoucherId,
  })
  return validateVoucherEntriesNoNegativeBalance({
    entries,
    getAccountById: accountId =>
      db.prepare('SELECT * FROM accounts WHERE id=?').get(accountId) as any,
    ...realtimeGetters,
  })
}

function respondNoNegativeBalanceError(res: Response, result: NoNegativeBalanceCheckResult) {
  return res.status(400).json({
    code: 400,
    codeType: 'NO_NEGATIVE_BALANCE',
    message: result.message,
    violations: result.violations,
  })
}

// 附件上传配置
const ALLOWED_ATTACHMENT_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024 // 10MB

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_ATTACHMENT_SIZE,
    files: 10, // 单次最多10个附件
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_ATTACHMENT_MIMES.includes(file.mimetype)) {
      return cb(new Error(`不支持的文件类型: ${file.mimetype}，仅允许图片、PDF和Office文档`))
    }
    cb(null, true)
  },
})

router.use(authMiddleware)

/**
 * 修复被错误解码为 Latin-1 的文件名（busboy/multer 对 RFC 5987 中文文件名处理 bug）
 */
function fixGarbledFilename(str: string): string {
  if (!str || typeof str !== 'string') return str
  // 如果看起来像 Latin1 解码后的 UTF-8，则还原
  const latin1Buf = Buffer.from(str, 'latin1')
  const fixed = new TextDecoder('utf-8', { fatal: false }).decode(latin1Buf)
  if (fixed && fixed !== str) {
    const reencoded = Buffer.from(fixed, 'utf-8')
    if (reencoded.equals(latin1Buf)) return fixed
  }
  return str
}

// ===================== 凭证录入 =====================

// 预览下一个凭证编号
router.get('/next-voucher-no', (req: AuthRequest, res) => {
  const { voucher_type_id, voucher_date } = req.query
  const db = getDb()
  const year = dayjs((voucher_date as string) || undefined).year()
  const period = dayjs((voucher_date as string) || undefined).month() + 1
  const { effectiveTypeId, typeName, voucherNo } = getNextVoucherNo({
    db,
    accountSetId: req.accountSetId || '',
    year,
    period,
    voucherTypeId: voucher_type_id as string | null,
  })
  res.json({
    code: 0,
    data: { voucher_no: voucherNo, effective_type_id: effectiveTypeId, type_name: typeName },
  })
})

// 修改单个凭证编号（含冲突检测）
router.put(
  '/vouchers/:id/number',
  requirePermission('voucher:entry'),
  operationLog('修改凭证编号', '凭证管理'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const { voucher_no, voucher_type_id } = req.body
    if (!voucher_no) {
      return res.status(400).json({ code: 400, message: '凭证号不能为空' })
    }

    const db = getDb()
    const voucher = db
      .prepare('SELECT * FROM vouchers WHERE id=? AND account_set_id=?')
      .get(id, req.accountSetId) as any
    if (!voucher) {
      return res.status(404).json({ code: 404, message: '凭证不存在' })
    }
    if (voucher.status !== 'draft') {
      return res.status(400).json({ code: 400, message: '仅允许修改未审核凭证的编号' })
    }

    // 检查新编号是否已被其他凭证占用
    const conflict = db
      .prepare(
        'SELECT id, voucher_no FROM vouchers WHERE voucher_no=? AND account_set_id=? AND id<>?'
      )
      .get(voucher_no, req.accountSetId, id) as any
    if (conflict) {
      return res.status(400).json({
        code: 400,
        message: `凭证号「${voucher_no}」已被凭证「${conflict.voucher_no}」占用`,
      })
    }

    // 更新凭证类型（如果改了）
    if (voucher_type_id !== undefined && voucher_type_id !== voucher.voucher_type_id) {
      db.prepare(
        "UPDATE vouchers SET voucher_no=?, voucher_type_id=?, updated_at=datetime('now') WHERE id=?"
      ).run(voucher_no, voucher_type_id || null, id)
    } else {
      db.prepare("UPDATE vouchers SET voucher_no=?, updated_at=datetime('now') WHERE id=?").run(
        voucher_no,
        id
      )
    }

    res.json({ code: 0, message: '凭证编号已更新', data: { id, voucher_no } })
  }
)

// 批量重新排号
router.post('/vouchers/renumber', requirePermission('voucher:entry'), operationLog('重新排号', '凭证管理'), (req: AuthRequest, res) => {
  const { year, period, start_no, voucher_type_id } = req.body
  if (!year || !period) {
    return res.status(400).json({ code: 400, message: '请指定年和期间' })
  }

  const db = getDb()

  // 获取凭证类型信息（用于生成带前缀的编号）
  let typeName: string | null = null
  if (voucher_type_id) {
    const type = db.prepare('SELECT name FROM voucher_types WHERE id=?').get(voucher_type_id) as any
    typeName = type?.name || null
  }

  // 获取该期间指定类型的所有未审核凭证，按日期+创建时间排序
  const vouchers = db
    .prepare(
      `
    SELECT id, voucher_date, created_at, voucher_type_id FROM vouchers
    WHERE account_set_id=? AND year=? AND period=? AND status='draft'
      AND (voucher_type_id=? OR (voucher_type_id IS NULL AND ? IS NULL))
    ORDER BY voucher_date ASC, created_at ASC
  `
    )
    .all(req.accountSetId, Number(year), Number(period), voucher_type_id || null, voucher_type_id || null) as any[]

  if (vouchers.length === 0) {
    return res.json({ code: 0, message: '该期间无未审核凭证', data: { updated: 0 } })
  }

  const startNumber = Number(start_no) || 1
  const updateStmt = db.prepare("UPDATE vouchers SET voucher_no=?, updated_at=datetime('now') WHERE id=?")

  const updateAll = db.transaction(() => {
    vouchers.forEach((v, i) => {
      let newNo: string
      if (typeName) {
        // 带类型前缀的格式：记-001
        const shortName = typeName.charAt(0)
        newNo = `${shortName}-${String(startNumber + i).padStart(3, '0')}`
      } else {
        // 纯数字格式：001
        newNo = String(startNumber + i).padStart(3, '0')
      }
      updateStmt.run(newNo, v.id)
    })
  })
  updateAll()

  res.json({
    code: 0,
    message: `已完成 ${vouchers.length} 张凭证的重新排号`,
    data: { updated: vouchers.length, start_no: startNumber },
  })
})

// 插入凭证（在指定凭证前插入，自动调整后续凭证号）
router.post('/vouchers/insert', requirePermission('voucher:entry'), operationLog('插入凭证', '凭证管理'), (req: AuthRequest, res) => {
  const { target_voucher_id, voucher } = req.body

  if (!target_voucher_id) {
    return res.status(400).json({ code: 400, message: '请指定插入位置' })
  }

  const db = getDb()

  // 获取目标凭证
  const targetVoucher = getVoucherById({ db, voucherId: target_voucher_id })
  if (!targetVoucher) {
    return res.status(404).json({ code: 404, message: '目标凭证不存在' })
  }

  // 提取凭证号序号（兼容 "记-001" 和 "001" 两种格式）
  const targetNo = targetVoucher.voucher_no
  const dashIndex = targetNo.indexOf('-')
  let prefix: string
  let seqStr: string
  if (dashIndex >= 0) {
    prefix = targetNo.substring(0, dashIndex) // 如 "记"
    seqStr = targetNo.substring(dashIndex + 1) // 如 "005"
  } else {
    prefix = ''
    seqStr = targetNo
  }
  const targetSeq = parseInt(seqStr, 10)

  if (isNaN(targetSeq)) {
    return res.status(400).json({ code: 400, message: '无法解析凭证号序号' })
  }

  // 校验新凭证数据
  const { entries = [], remark, voucher_date } = voucher

  // 插行允许空分录
  if (entries.length > 0) {
    const finalVoucherDate = voucher_date || targetVoucher.voucher_date
    const year = dayjs(finalVoucherDate).year()
    const period = dayjs(finalVoucherDate).month() + 1
    const balanceError = getVoucherBalanceError(entries)
    if (balanceError) {
      return res.status(400).json({ code: 400, message: balanceError })
    }

    const entryCountError = validateVoucherEntryCount(entries)
    if (entryCountError) {
      return res.status(400).json({ code: 400, message: entryCountError })
    }

    const negativeError = validateNoNegativeBalance(
      db,
      req.accountSetId || '',
      entries,
      year,
      period
    )
    if (negativeError) {
      return respondNoNegativeBalanceError(res, negativeError)
    }

    const cashFlowError = validateVoucherEntriesCashFlow(
      db,
      req.accountSetId || '',
      entries
    )
    if (cashFlowError) {
      return res.status(400).json({ code: 400, message: cashFlowError })
    }
  }

  const { debitTotal } = calculateVoucherTotals(entries)
  const { categories, itemMap } = loadVoucherAuxiliaryData({
    db,
    accountSetId: req.accountSetId || '',
  })

  // 使用事务插入凭证并更新后续凭证号
  const insertTransaction = db.transaction(() => {
    // 1. 查询需要更新的凭证（序号 >= targetSeq，同类型、同年份）
    const likePattern = dashIndex >= 0 ? `${prefix}-%` : '%'
    const affectedVouchers = db
      .prepare(
        `
      SELECT id, voucher_no FROM vouchers
      WHERE account_set_id = ?
        AND voucher_type_id = ?
        AND year = ?
        AND status = 'draft'
        AND voucher_no LIKE ?
      ORDER BY voucher_no
    `
      )
      .all(
        req.accountSetId,
        targetVoucher.voucher_type_id,
        targetVoucher.year,
        likePattern
      ) as any[]

    // 筛选出序号 >= targetSeq 的凭证
    const toUpdate = affectedVouchers.filter(v => {
      const vDashIndex = v.voucher_no.indexOf('-')
      const vSeqStr = vDashIndex >= 0 ? v.voucher_no.substring(vDashIndex + 1) : v.voucher_no
      const vSeq = parseInt(vSeqStr, 10)
      return !isNaN(vSeq) && vSeq >= targetSeq
    })

    // 从大到小更新，避免唯一约束冲突
    toUpdate.sort((a, b) => {
      const aDash = a.voucher_no.indexOf('-')
      const bDash = b.voucher_no.indexOf('-')
      const aSeq = parseInt(aDash >= 0 ? a.voucher_no.substring(aDash + 1) : a.voucher_no, 10)
      const bSeq = parseInt(bDash >= 0 ? b.voucher_no.substring(bDash + 1) : b.voucher_no, 10)
      return bSeq - aSeq
    })

    const updateStmt = db.prepare(`
      UPDATE vouchers SET voucher_no = ?, updated_at = datetime('now')
      WHERE id = ?
    `)

    for (const v of toUpdate) {
      const vDash = v.voucher_no.indexOf('-')
      const oldSeq = parseInt(vDash >= 0 ? v.voucher_no.substring(vDash + 1) : v.voucher_no, 10)
      const newNo = dashIndex >= 0 ? `${prefix}-${String(oldSeq + 1).padStart(3, '0')}` : String(oldSeq + 1).padStart(3, '0')
      updateStmt.run(newNo, v.id)
    }

    // 2. 插入新凭证
    const voucherId = uuidv4()
    const newVoucherNo = dashIndex >= 0 ? `${prefix}-${String(targetSeq).padStart(3, '0')}` : String(targetSeq).padStart(3, '0')
    const finalVoucherDate = voucher_date || targetVoucher.voucher_date
    const year = dayjs(finalVoucherDate).year()
    const period = dayjs(finalVoucherDate).month() + 1

    db.prepare(
      `
      INSERT INTO vouchers (
        id, account_set_id, voucher_type_id, voucher_no, voucher_date,
        year, period, total_amount, remark, status, maker_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, datetime('now'), datetime('now'))
    `
    ).run(
      voucherId,
      req.accountSetId,
      targetVoucher.voucher_type_id,
      newVoucherNo,
      finalVoucherDate,
      year,
      period,
      debitTotal,
      remark || '',
      req.userId
    )

    // 3. 插入分录（使用和新建凭证相同的完整 INSERT）
    const insertEntryStmt = db.prepare(VOUCHER_ENTRY_INSERT_SQL)

    const entryPayloads = buildVoucherEntryPayloads({
      db,
      accountSetId: req.accountSetId || '',
      voucherId,
      entries,
      categories,
      itemMap,
    })

    entryPayloads.forEach(payload => {
      insertEntryStmt.run(...payload)
    })

    return { voucherId, newVoucherNo, updatedCount: toUpdate.length }
  })

  const result = insertTransaction()

  res.json({
    code: 0,
    message: '插入成功',
    data: {
      id: result.voucherId,
      voucher_no: result.newVoucherNo,
      updated_count: result.updatedCount,
    },
  })
})

router.post('/vouchers', requirePermission('voucher:entry'), operationLog('录入凭证', '凭证管理'), (req: AuthRequest, res) => {
  const { voucher_type_id, voucher_date, entries, remark } = req.body
  const entryCountError = validateVoucherEntryCount(entries)
  if (!voucher_date || entryCountError) {
    return res.status(400).json({ code: 400, message: entryCountError || '凭证日期和分录不能为空' })
  }

  const db = getDb()

  // 检查月份是否已结账
  const year = dayjs(voucher_date).year()
  const period = dayjs(voucher_date).month() + 1
  const closed = db
    .prepare(
      `SELECT * FROM period_closing WHERE account_set_id=? AND year=? AND period=? AND status='closed'`
    )
    .get(req.accountSetId, year, period)
  if (closed) {
    return res.status(400).json({
      code: 400,
      message: '该月份已结账，无法新增凭证',
      data: {
        closedPeriod: { year, period },
        solution: '如需录入凭证，请先执行反结账操作',
        hint: '路径：凭证管理 → 期间结账 → 反结账',
      },
    })
  }

  // 凭证时序控制检查（仅针对新增凭证）
  const timeControlParam = db.prepare(
    'SELECT param_value FROM system_params WHERE account_set_id = ? AND param_key = ?'
  ).get(req.accountSetId, 'voucher_time_control') as { param_value: string } | undefined

  if (timeControlParam?.param_value === 'true') {
    // 查询该账套中最大的凭证日期（新增凭证不需要排除自身）
    const maxDateRow = db.prepare(`
      SELECT MAX(voucher_date) as max_date
      FROM vouchers
      WHERE account_set_id = ?
        AND status IN ('draft', 'audited', 'posted')
    `).get(req.accountSetId) as { max_date: string | null } | undefined

    const maxDate = maxDateRow?.max_date

    // 如果存在凭证，且当前凭证日期早于最大日期，则拒绝
    if (maxDate && voucher_date < maxDate) {
      return res.status(400).json({
        error: `凭证时序控制已开启，不允许录入早于 ${maxDate} 的凭证。当前凭证日期：${voucher_date}`,
        code: 'VOUCHER_DATE_OUT_OF_ORDER',
        maxDate: maxDate,
        currentDate: voucher_date
      })
    }
  }

  const { debitTotal } = calculateVoucherTotals(entries)
  const balanceError = getVoucherBalanceError(entries)
  if (balanceError) {
    return res.status(400).json({ code: 400, message: balanceError })
  }

  const noNegativeBalanceError = validateNoNegativeBalance(
    db,
    req.accountSetId || '',
    entries,
    year,
    period
  )
  if (noNegativeBalanceError) {
    return respondNoNegativeBalanceError(res, noNegativeBalanceError)
  }

  const cashFlowError = validateVoucherEntriesCashFlow(db, req.accountSetId || '', entries)
  if (cashFlowError) {
    return res.status(400).json({ code: 400, message: cashFlowError })
  }

  const { categories, itemMap } = loadVoucherAuxiliaryData({
    db,
    accountSetId: req.accountSetId || '',
  })

  // 并发控制：使用 BEGIN IMMEDIATE 排它锁 + 自动重试机制（最多3次）
  const MAX_RETRIES = 3
  let lastError: any = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // 使用 BEGIN IMMEDIATE 获取排它锁，防止并发冲突
      db.exec('BEGIN IMMEDIATE')

      try {
        // 在锁保护下获取凭证号
        const { effectiveTypeId, voucherNo } = getNextVoucherNo({
          db,
          accountSetId: req.accountSetId || '',
          year,
          period,
          voucherTypeId: voucher_type_id,
        })

        const voucherId = uuidv4()

        const insertVoucher = db.prepare(`
          INSERT INTO vouchers (id, account_set_id, voucher_no, voucher_type_id, voucher_date, year, period, total_amount, maker_id, maker_name, remark)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        const insertEntry = db.prepare(VOUCHER_ENTRY_INSERT_SQL)

        insertVoucher.run(
          voucherId,
          req.accountSetId,
          voucherNo,
          effectiveTypeId,
          voucher_date,
          year,
          period,
          debitTotal,
          req.userId,
          req.userName,
          remark
        )
        const entryPayloads = buildVoucherEntryPayloads({
          db,
          accountSetId: req.accountSetId || '',
          voucherId,
          entries,
          categories,
          itemMap,
        })

        entryPayloads.forEach(payload => {
          insertEntry.run(...payload)
        })

        // 提交事务
        db.exec('COMMIT')

        // 成功，返回结果
        return res.json({
          code: 0,
          message: attempt > 0 ? `凭证录入成功（自动重试${attempt}次）` : '凭证录入成功',
          data: { id: voucherId, voucherNo }
        })
      } catch (innerError: any) {
        // 回滚事务
        try {
          db.exec('ROLLBACK')
        } catch (rollbackError) {
          // 忽略回滚错误（可能事务已结束）
        }
        throw innerError
      }
    } catch (error: any) {
      lastError = error
      // 检查是否是唯一约束冲突（凭证号重复）
      if (error.code === 'SQLITE_CONSTRAINT' && error.message.includes('UNIQUE')) {
        // 凭证号冲突，继续重试
        continue
      }
      // 其他错误，直接抛出
      throw error
    }
  }

  // 重试次数用完，返回错误
  return res.status(500).json({
    code: 500,
    message: `凭证号冲突，已重试${MAX_RETRIES}次仍失败，请稍后再试`,
    error: lastError?.message,
  })
})

// ===================== 凭证查询 =====================

router.get('/vouchers', (req: AuthRequest, res) => {
  const db = getDb()
  const {
    page = 1,
    pageSize = 20,
    year,
    period,
    status,
    keyword,
    start_date,
    end_date,
    account_id,
    auditor_id,
    voucher_type_ids,
    sortField,
    sortOrder,
    ...rest
  } = req.query

  const voucherTypeIds =
    typeof voucher_type_ids === 'string' && voucher_type_ids.trim()
      ? voucher_type_ids.split(',').filter(id => id.trim())
      : undefined

  // 提取辅助核算项目筛选参数（格式：aux_<categoryId>=<itemId> 或 aux_<categoryId>=<itemId1>,<itemId2>）
  const auxItemsInput: Record<string, string | string[]> = {}
  // 提取辅助核算自定义字段筛选参数（格式：aux_field_<categoryId>_<fieldKey>=<value>）
  const auxFieldsInput: Record<string, string> = {}
  for (const [key, value] of Object.entries(rest)) {
    if (key.startsWith('aux_field_') && typeof value === 'string' && value) {
      const fieldKey = key.substring(10) // 去掉 aux_field_ 前缀，得到 categoryId_fieldKey
      auxFieldsInput[fieldKey] = value
    } else if (key.startsWith('aux_')) {
      const categoryId = key.substring(4)
      // 支持字符串（逗号分隔）或数组
      if (typeof value === 'string' && value) {
        auxItemsInput[categoryId] = value
      } else if (Array.isArray(value) && value.length > 0) {
        auxItemsInput[categoryId] = value.filter((v): v is string => typeof v === 'string')
      }
    }
  }

  // 将 categoryId 转换为 categoryCode（aux_data 使用 code 作为 key）
  const auxItems: Record<string, number[]> = {}
  const auxFields: Record<string, string> = {}

  if (Object.keys(auxItemsInput).length > 0 || Object.keys(auxFieldsInput).length > 0) {
    const categoryIds = [
      ...Object.keys(auxItemsInput),
      ...Object.keys(auxFieldsInput).map(k => k.split('_')[0])
    ]
    const uniqueCategoryIds = [...new Set(categoryIds)]

    if (uniqueCategoryIds.length > 0) {
      const placeholders = uniqueCategoryIds.map(() => '?').join(',')
      const categories = db
        .prepare(`SELECT id, code FROM aux_categories WHERE id IN (${placeholders})`)
        .all(...uniqueCategoryIds) as Array<{ id: string; code: string }>

      const categoryCodeMap = new Map(categories.map(c => [c.id, c.code]))

      // 转换 auxItems：categoryId -> categoryCode，支持字符串（逗号分隔）或数组
      for (const [categoryId, itemIds] of Object.entries(auxItemsInput)) {
        const code = categoryCodeMap.get(categoryId)
        if (code) {
          // 将字符串或数组统一转换为数组
          if (typeof itemIds === 'string') {
            auxItems[code] = itemIds.split(',').map(id => parseInt(id.trim(), 10))
          } else if (Array.isArray(itemIds)) {
            auxItems[code] = itemIds.map(id => typeof id === 'string' ? parseInt(id, 10) : id)
          }
        }
      }

      // 转换 auxFields：categoryId_fieldKey -> categoryCode_fieldKey
      for (const [key, value] of Object.entries(auxFieldsInput)) {
        const [categoryId, ...fieldKeyParts] = key.split('_')
        const fieldKey = fieldKeyParts.join('_')
        const code = categoryCodeMap.get(categoryId)
        if (code && fieldKey) {
          auxFields[`${code}_${fieldKey}`] = value
        }
      }
    }
  }

  const query = buildVoucherListQuery({
    accountSetId: req.accountSetId || '',
    page: Number(page),
    pageSize: Number(pageSize),
    year: year as string | number | undefined,
    period: period as string | number | undefined,
    status: status as string | undefined,
    keyword: keyword as string | undefined,
    startDate: start_date as string | undefined,
    endDate: end_date as string | undefined,
    accountId: account_id as string | undefined,
    auditorId: auditor_id as string | undefined,
    voucherTypeIds,
    auxItems: Object.keys(auxItems).length > 0 ? auxItems : undefined,
    auxFields: Object.keys(auxFields).length > 0 ? auxFields : undefined,
    sortField: sortField as string | undefined,
    sortOrder: sortOrder as string | undefined,
  }, db)

  const total = (db.prepare(query.countSql).get(...query.countParams) as any).count
  const list = db.prepare(query.listSql).all(...query.listParams) as any[]

  const voucherIds = [...new Set(list.map(v => v.id))]
  const entriesMap: Record<string, any[]> = {}
  if (voucherIds.length > 0) {
    const placeholders = voucherIds.map(() => '?').join(',')
    const allEntries = db
      .prepare(
        `SELECT * FROM voucher_entries WHERE voucher_id IN (${placeholders}) ORDER BY voucher_id, seq`
      )
      .all(...voucherIds) as any[]
    const entriesMap = buildVoucherEntriesMap(allEntries)
    list.splice(0, list.length, ...attachVoucherEntries(list, entriesMap))
  }

  res.json({ code: 0, data: list, total })
})

router.get('/vouchers/:id', (req: AuthRequest, res) => {
  const { id } = req.params
  const db = getDb()
  const voucher = getVoucherDetail({ db, voucherId: id })
  if (!voucher) {
    return res.status(404).json({ code: 404, message: '凭证不存在' })
  }
  res.json({ code: 0, data: voucher })
})

router.put('/vouchers/:id', requirePermission('voucher:entry'), operationLog('修改凭证', '凭证管理'), (req: AuthRequest, res) => {
  const { id } = req.params
  const { entries, remark, voucher_date, voucher_type_id, voucher_no } = req.body
  const db = getDb()
  const voucher = getVoucherById({ db, voucherId: id })
  if (!voucher) {
    return res.status(404).json({ code: 404, message: '凭证不存在' })
  }
  if (isPostedVoucher(voucher)) {
    return res.status(400).json({ code: 400, message: '已记账凭证不能修改' })
  }

  // 凭证号冲突检测
  if (voucher_no && voucher_no !== voucher.voucher_no) {
    const conflict = db
      .prepare('SELECT id FROM vouchers WHERE voucher_no=? AND account_set_id=? AND id<>?')
      .get(voucher_no, req.accountSetId, id) as any
    if (conflict) {
      return res.status(400).json({
        code: 400,
        message: `凭证号「${voucher_no}」已被其他凭证占用`,
      })
    }
  }

  // 凭证时序控制检查（如果修改了日期）
  if (voucher_date && voucher_date !== voucher.voucher_date) {
    const timeControlParam = db.prepare(
      'SELECT param_value FROM system_params WHERE account_set_id = ? AND param_key = ?'
    ).get(req.accountSetId, 'voucher_time_control') as { param_value: string } | undefined

    if (timeControlParam?.param_value === 'true') {
      // 查询该账套中最大的凭证日期（排除当前凭证）
      const maxDateRow = db.prepare(`
        SELECT MAX(voucher_date) as max_date
        FROM vouchers
        WHERE account_set_id = ?
          AND status IN ('draft', 'audited', 'posted')
          AND id != ?
      `).get(req.accountSetId, id) as { max_date: string | null } | undefined

      const maxDate = maxDateRow?.max_date

      // 如果存在其他凭证，且修改后的日期早于最大日期，则拒绝
      if (maxDate && voucher_date < maxDate) {
        return res.status(400).json({
          error: `凭证时序控制已开启，不允许修改为早于 ${maxDate} 的日期。修改后日期：${voucher_date}`,
          code: 'VOUCHER_DATE_OUT_OF_ORDER',
          maxDate: maxDate,
          currentDate: voucher_date
        })
      }
    }
  }

  const balanceError = getVoucherUpdateBalanceError(entries)
  if (balanceError) {
    return res.status(400).json({ code: 400, message: balanceError })
  }
  const finalVoucherDate = voucher_date || voucher.voucher_date
  const year = dayjs(finalVoucherDate).year()
  const period = dayjs(finalVoucherDate).month() + 1
  const noNegativeBalanceError = validateNoNegativeBalance(
    db,
    req.accountSetId || '',
    entries,
    year,
    period,
    id
  )
  if (noNegativeBalanceError) {
    return respondNoNegativeBalanceError(res, noNegativeBalanceError)
  }

  const cashFlowError = validateVoucherEntriesCashFlow(db, req.accountSetId || '', entries)
  if (cashFlowError) {
    return res.status(400).json({ code: 400, message: cashFlowError })
  }

  const { debitTotal } = calculateVoucherTotals(entries)

  const { categories, itemMap } = loadVoucherAuxiliaryData({
    db,
    accountSetId: req.accountSetId || '',
  })

  const updateVoucher = db.transaction(() => {
    // 更新所有字段
    db.prepare(
      "UPDATE vouchers SET voucher_type_id=?, voucher_no=?, voucher_date=?, year=?, period=?, total_amount=?, remark=?, updated_at=datetime('now') WHERE id=?"
    ).run(
      voucher_type_id !== undefined ? (voucher_type_id || null) : voucher.voucher_type_id,
      voucher_no || voucher.voucher_no,
      finalVoucherDate,
      year,
      period,
      debitTotal,
      remark,
      id
    )

    replaceVoucherEntries({
      db,
      accountSetId: req.accountSetId || '',
      voucherId: id,
      entries,
      categories,
      itemMap,
    })
  })
  updateVoucher()
  res.json({ code: 0, message: '修改成功' })
})

// 修改已审核凭证（自动反审核-修改-重新审核）
router.put(
  '/vouchers/:id/edit-audited',
  requirePermission('voucher:entry'),
  operationLog('修改已审核凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const { entries, remark } = req.body
    const db = getDb()
    const voucher = getVoucherById({ db, voucherId: id })

    if (!voucher) {
      return res.status(404).json({ code: 404, message: '凭证不存在' })
    }

    if (isPostedVoucher(voucher)) {
      return res.status(400).json({ code: 400, message: '已记账凭证不能修改，请先反记账' })
    }

    // 检查是否已审核
    const isAudited = voucher.status === 'audited'
    if (!isAudited) {
      return res.status(400).json({ code: 400, message: '该凭证未审核，请使用普通修改功能' })
    }

    const balanceError = getVoucherUpdateBalanceError(entries)
    if (balanceError) {
      return res.status(400).json({ code: 400, message: balanceError })
    }
    const noNegativeBalanceError = validateNoNegativeBalance(
      db,
      req.accountSetId || '',
      entries,
      voucher.year,
      voucher.period,
      id
    )
    if (noNegativeBalanceError) {
      return respondNoNegativeBalanceError(res, noNegativeBalanceError)
    }

    const { debitTotal } = calculateVoucherTotals(entries)
    const { categories, itemMap } = loadVoucherAuxiliaryData({
      db,
      accountSetId: req.accountSetId || '',
    })

    // 事务：反审核 → 修改 → 重新审核
    const updateAuditedVoucher = db.transaction(() => {
      // 1. 反审核
      db.prepare(
        "UPDATE vouchers SET status='draft', auditor_id=NULL, auditor_name=NULL WHERE id=?"
      ).run(id)

      // 2. 修改凭证
      db.prepare(
        "UPDATE vouchers SET total_amount=?, remark=?, updated_at=datetime('now') WHERE id=?"
      ).run(debitTotal, remark, id)

      replaceVoucherEntries({
        db,
        accountSetId: req.accountSetId || '',
        voucherId: id,
        entries,
        categories,
        itemMap,
      })

      // 3. 重新审核
      db.prepare(
        "UPDATE vouchers SET status='audited', auditor_id=?, auditor_name=? WHERE id=?"
      ).run(req.userId, req.userName, id)
    })

    updateAuditedVoucher()

    res.json({
      code: 0,
      message: '修改成功（已自动重新审核）',
      data: {
        note: '凭证已反审核、修改并重新审核',
      },
    })
  }
)

// ===================== 凭证删除 =====================

router.delete('/vouchers/:id', requirePermission('voucher:entry'), operationLog('删除凭证', '凭证管理'), (req: AuthRequest, res) => {
  const { id } = req.params
  const db = getDb()
  const voucher = getVoucherById({ db, voucherId: id })
  if (voucher?.status === 'posted') {
    return res.status(400).json({ code: 400, message: '已记账凭证不能删除' })
  }
  deleteVoucherRecords(db, id)
  res.json({ code: 0, message: '删除成功' })
})

// ===================== 凭证附件管理 =====================

// 上传附件
router.post(
  '/vouchers/:voucherId/attachments',
  attachmentUpload.array('file'),
  requirePermission('voucher:entry'),
  operationLog('上传凭证附件', '凭证管理'),
  async (req: AuthRequest, res) => {
    const { voucherId } = req.params
    const accountSetId = req.accountSetId

    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      return res.status(400).json({ code: 400, message: '请选择要上传的文件' })
    }

    const db = getDb()
    const voucher = getVoucherById({ db, voucherId })

    if (!voucher) {
      return res.status(404).json({ code: 404, message: '凭证不存在' })
    }

    const uploadDir = path.join(process.cwd(), 'uploads', 'attachments')
    await fs.mkdir(uploadDir, { recursive: true })

    // 阶段 1：先把全部文件写到磁盘，任一失败即清理已写入的物理文件
    const files = req.files as Express.Multer.File[]
    const writtenPaths: string[] = []
    const attachments: Array<{
      id: string
      account_set_id: string | undefined
      voucher_id: string
      filename: string
      original_name: string
      file_path: string
      file_size: number
      mime_type: string
      created_by: string | undefined
      created_at: string
    }> = []

    try {
      for (const file of files) {
        const fileId = uuidv4()
        const ext = path.extname(file.originalname)
        const filename = `${fileId}${ext}`
        const filePath = path.join(uploadDir, filename)
        await fs.writeFile(filePath, file.buffer)
        writtenPaths.push(filePath)
        attachments.push({
          id: fileId,
          account_set_id: accountSetId,
          voucher_id: voucherId,
          filename,
          original_name: fixGarbledFilename(file.originalname),
          file_path: `/uploads/attachments/${filename}`,
          file_size: file.size,
          mime_type: file.mimetype,
          created_by: req.userId,
          created_at: new Date().toISOString(),
        })
      }
    } catch (err: any) {
      // 写盘失败：清理已写入的物理文件
      await Promise.all(
        writtenPaths.map(p => fs.unlink(p).catch(() => undefined))
      )
      console.error('上传附件写盘失败:', err)
      return res.status(500).json({ code: 500, message: '上传附件失败: ' + (err?.message || '未知错误') })
    }

    // 阶段 2：DB 写入用事务包裹；attachments 计数基于 COUNT(*) 重算，避免并发 +N 漂移
    const insertStmt = db.prepare(
      `INSERT INTO voucher_attachments
       (id, account_set_id, voucher_id, filename, original_name, file_path, file_size, mime_type, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const countStmt = db.prepare(
      'SELECT COUNT(*) as count FROM voucher_attachments WHERE voucher_id = ?'
    )
    const updateCounterStmt = db.prepare(
      'UPDATE vouchers SET attachments = ? WHERE id = ?'
    )

    try {
      const persist = db.transaction(() => {
        for (const a of attachments) {
          insertStmt.run(
            a.id,
            a.account_set_id,
            a.voucher_id,
            a.filename,
            a.original_name,
            a.file_path,
            a.file_size,
            a.mime_type,
            a.created_by,
            a.created_at
          )
        }
        const { count } = countStmt.get(voucherId) as { count: number }
        updateCounterStmt.run(count, voucherId)
      })
      persist()
    } catch (err: any) {
      // DB 失败：回滚磁盘文件
      await Promise.all(
        writtenPaths.map(p => fs.unlink(p).catch(() => undefined))
      )
      console.error('保存附件元数据失败:', err)
      return res.status(500).json({ code: 500, message: '保存附件失败: ' + (err?.message || '未知错误') })
    }

    res.json({ code: 0, data: attachments, message: `成功上传 ${attachments.length} 个文件` })
  }
)

// 获取凭证附件列表
router.get('/vouchers/:voucherId/attachments', (req: AuthRequest, res) => {
  const { voucherId } = req.params
  const db = getDb()

  const attachments = db
    .prepare(
      `SELECT id, filename, original_name, file_path, file_size, mime_type, created_by, created_at
       FROM voucher_attachments
       WHERE account_set_id = ? AND voucher_id = ?
       ORDER BY created_at DESC`
    )
    .all(req.accountSetId, voucherId)

  res.json({ code: 0, data: attachments })
})

// 删除附件
router.delete(
  '/vouchers/:voucherId/attachments/:attachmentId',
  requirePermission('voucher:entry'),
  operationLog('删除凭证附件', '凭证管理'),
  async (req: AuthRequest, res) => {
    const { voucherId, attachmentId } = req.params
    const accountSetId = req.accountSetId

    const db = getDb()

    // 获取附件信息
    const attachment = db
      .prepare(
        `SELECT * FROM voucher_attachments
         WHERE account_set_id = ? AND voucher_id = ? AND id = ?`
      )
      .get(accountSetId, voucherId, attachmentId)

    if (!attachment) {
      return res.status(404).json({ code: 404, message: '附件不存在' })
    }

    try {
      // 删除物理文件
      const normalizedFilePath = String((attachment as any).file_path || '').replace(/^\//, '')
      const filePath = path.join(process.cwd(), normalizedFilePath)

      // 安全检查：确保文件路径在 uploads 目录内
      const uploadsDir = path.join(process.cwd(), 'uploads')
      const resolvedPath = path.resolve(filePath)
      const resolvedUploadsDir = path.resolve(uploadsDir)

      if (!resolvedPath.startsWith(resolvedUploadsDir)) {
        return res.status(400).json({ code: 400, message: '非法的文件路径' })
      }

      await fs.unlink(filePath)

      // 从数据库删除
      db.prepare(
        'DELETE FROM voucher_attachments WHERE id = ? AND voucher_id = ? AND account_set_id = ?'
      ).run(attachmentId, voucherId, accountSetId)

      // 更新凭证附件计数
      const result = db
        .prepare('SELECT COUNT(*) as count FROM voucher_attachments WHERE voucher_id = ?')
        .get(voucherId) as { count: number }
      const attachmentCount = result.count

      db.prepare('UPDATE vouchers SET attachments = ? WHERE id = ?').run(attachmentCount, voucherId)

      res.json({ code: 0, message: '附件删除成功' })
    } catch (error) {
      console.error('删除附件失败:', error)
      res.status(500).json({ code: 500, message: '删除附件失败' })
    }
  }
)

// ===================== 打印数据接口 =====================

// 获取单张凭证打印数据
router.get('/print-data/:id', authMiddleware, (req: AuthRequest, res) => {
  const { id } = req.params
  const db = getDb()

  try {
    // 获取凭证基本信息
    const voucher = getVoucherById({ db, voucherId: id })
    if (!voucher || voucher.account_set_id !== req.accountSetId) {
      return res.status(404).json({ code: 404, message: '凭证不存在' })
    }

    // 获取凭证详情（包含分录）
    const detail = getVoucherDetail({ db, voucherId: id })
    if (!detail) {
      return res.status(404).json({ code: 404, message: '凭证详情不存在' })
    }

    // 获取使用单位名称（优先读 system_params 中的 unit_name，回退到账套名称）
    const accountSet = db
      .prepare('SELECT name FROM account_sets WHERE id = ?')
      .get(req.accountSetId || '') as any
    const unitNameParam = db
      .prepare(`SELECT param_value FROM system_params WHERE account_set_id = ? AND param_key = 'unit_name'`)
      .get(req.accountSetId || '') as any
    const unitName = unitNameParam?.param_value || accountSet?.name || ''

    // 格式化分录数据（direction+amount → debit/credit）
    const entries = detail.entries.map((entry: any) => {
      // 解析辅助项目数据
      let auxData = null
      if (entry.aux_data) {
        try {
          auxData = typeof entry.aux_data === 'string' ? JSON.parse(entry.aux_data) : entry.aux_data
        } catch (e) {
          console.error('解析辅助项目数据失败:', e)
        }
      }

      return {
        summary: entry.summary || '',
        account_code: entry.account_code || '',
        account_name: entry.account_name || '',
        debit: entry.direction === 'debit' ? (entry.amount || 0) : 0,
        credit: entry.direction === 'credit' ? (entry.amount || 0) : 0,
        aux_items: entry.aux_items || [],
        aux_data: auxData,
      }
    })

    // 计算合计（calculateVoucherTotals 返回 debitTotal/creditTotal）
    const totals = calculateVoucherTotals(detail.entries)

    // 获取制单人信息
    const creator = db
      .prepare('SELECT username FROM users WHERE id = ?')
      .get(detail.maker_id) as any

    res.json({
      code: 0,
      data: {
        id: detail.id,
        voucher_no: detail.voucher_no,
        date: detail.voucher_date || '',
        voucher_type: detail.voucher_type_name || '',
        attachments: detail.attachments || 0,
        account_set_name: unitName,
        entries,
        total_debit: totals.debitTotal,
        total_credit: totals.creditTotal,
        maker: detail.maker_name || creator?.username || '',
        auditor: detail.auditor_name || '',
        poster: detail.poster_name || '',
        supervisor: '',
        created_by: creator?.username || '',
        created_at: detail.created_at,
      },
    })
  } catch (error) {
    console.error('获取凭证打印数据失败:', error)
    res.status(500).json({ code: 500, message: '获取凭证打印数据失败' })
  }
})

// 批量获取凭证打印数据
router.post('/print-data/batch', authMiddleware, (req: AuthRequest, res) => {
  const { voucher_ids, voucher_type, voucher_type_ids, start_date, end_date, voucher_no_start, voucher_no_end } = req.body
  const db = getDb()

  try {
    let voucherList: any[] = []

    // 如果提供了凭证ID列表，直接查询
    if (voucher_ids && Array.isArray(voucher_ids) && voucher_ids.length > 0) {
      const placeholders = voucher_ids.map(() => '?').join(',')
      voucherList = db
        .prepare(
          `SELECT v.id, v.voucher_no, v.voucher_date, v.attachments, v.maker_id, v.created_at,
                  v.maker_name, v.auditor_name, v.poster_name,
                  vt.name as voucher_type_name
           FROM vouchers v
           LEFT JOIN voucher_types vt ON v.voucher_type_id = vt.id
           WHERE v.account_set_id = ? AND v.id IN (${placeholders})
           ORDER BY v.voucher_date, v.voucher_no`
        )
        .all(req.accountSetId || '', ...voucher_ids)
    }
    // 否则根据筛选条件查询
    else {
      // 至少需要一个筛选条件
      const hasTypeFilter = voucher_type || (voucher_type_ids && Array.isArray(voucher_type_ids) && voucher_type_ids.length > 0)
      const hasDateFilter = start_date && end_date
      const hasNoFilter = voucher_no_start || voucher_no_end
      if (!hasTypeFilter && !hasDateFilter && !hasNoFilter) {
        return res.status(400).json({ code: 400, message: '请提供凭证ID列表或筛选条件' })
      }

      let sql = `SELECT v.id, v.voucher_no, v.voucher_date, v.attachments, v.maker_id, v.created_at,
                        v.maker_name, v.auditor_name, v.poster_name,
                        vt.name as voucher_type_name
                 FROM vouchers v
                 LEFT JOIN voucher_types vt ON v.voucher_type_id = vt.id
                 WHERE v.account_set_id = ?`
      const params: any[] = [req.accountSetId || '']

      // 凭证类型筛选：优先用 voucher_type_ids（ID 数组），兼容旧的 voucher_type（名称）
      if (voucher_type_ids && Array.isArray(voucher_type_ids) && voucher_type_ids.length > 0) {
        const ph = voucher_type_ids.map(() => '?').join(',')
        sql += ` AND v.voucher_type_id IN (${ph})`
        params.push(...voucher_type_ids)
      } else if (voucher_type) {
        sql += ' AND vt.name = ?'
        params.push(voucher_type)
      }

      // 日期区间
      if (start_date && end_date) {
        sql += ' AND v.voucher_date >= ? AND v.voucher_date <= ?'
        params.push(start_date, end_date)
      }

      // 凭证号范围
      if (voucher_no_start) {
        if (/^\d+$/.test(voucher_no_start)) {
          // 纯数字：提取凭证号中'-'后的数字部分进行数值比较
          sql += ` AND COALESCE(CAST(SUBSTR(v.voucher_no, INSTR(v.voucher_no, '-') + 1) AS INTEGER), CAST(v.voucher_no AS INTEGER)) >= ?`
          params.push(parseInt(voucher_no_start, 10))
        } else {
          sql += ' AND v.voucher_no >= ?'
          params.push(voucher_no_start)
        }
      }
      if (voucher_no_end) {
        if (/^\d+$/.test(voucher_no_end)) {
          sql += ` AND COALESCE(CAST(SUBSTR(v.voucher_no, INSTR(v.voucher_no, '-') + 1) AS INTEGER), CAST(v.voucher_no AS INTEGER)) <= ?`
          params.push(parseInt(voucher_no_end, 10))
        } else {
          sql += ' AND v.voucher_no <= ?'
          params.push(voucher_no_end)
        }
      }

      sql += ' ORDER BY v.voucher_date, v.voucher_no'

      voucherList = db.prepare(sql).all(...params)
    }

    if (voucherList.length === 0) {
      return res.json({ code: 0, data: [] })
    }

    // 获取使用单位名称（优先读 system_params 中的 unit_name，回退到账套名称）
    const accountSet = db
      .prepare('SELECT name FROM account_sets WHERE id = ?')
      .get(req.accountSetId || '') as any
    const unitNameParam = db
      .prepare(`SELECT param_value FROM system_params WHERE account_set_id = ? AND param_key = 'unit_name'`)
      .get(req.accountSetId || '') as any
    const unitName = unitNameParam?.param_value || accountSet?.name || ''

    // 批量获取每张凭证的详细数据
    const printDataList = voucherList.map((voucher: any) => {
      const detail = getVoucherDetail({ db, voucherId: voucher.id })
      if (!detail) return null

      const entries = detail.entries.map((entry: any) => {
        // 解析辅助项目数据
        let auxData = null
        if (entry.aux_data) {
          try {
            auxData = typeof entry.aux_data === 'string' ? JSON.parse(entry.aux_data) : entry.aux_data
          } catch (e) {
            console.error('解析辅助项目数据失败:', e)
          }
        }

        return {
          summary: entry.summary || '',
          account_code: entry.account_code || '',
          account_name: entry.account_name || '',
          debit: entry.direction === 'debit' ? (entry.amount || 0) : 0,
          credit: entry.direction === 'credit' ? (entry.amount || 0) : 0,
          aux_items: entry.aux_items || [],
          aux_data: auxData,
        }
      })

      const totals = calculateVoucherTotals(detail.entries)

      const creator = db
        .prepare('SELECT username FROM users WHERE id = ?')
        .get(voucher.maker_id) as any

      return {
        id: voucher.id,
        voucher_no: voucher.voucher_no,
        date: voucher.voucher_date || '',
        voucher_type: voucher.voucher_type_name || '',
        attachments: voucher.attachments || 0,
        account_set_name: unitName,
        entries,
        total_debit: totals.debitTotal,
        total_credit: totals.creditTotal,
        maker: voucher.maker_name || creator?.username || '',
        auditor: voucher.auditor_name || '',
        poster: voucher.poster_name || '',
        supervisor: '',
        created_by: creator?.username || '',
        created_at: voucher.created_at,
      }
    }).filter(Boolean)

    res.json({ code: 0, data: printDataList })
  } catch (error) {
    console.error('批量获取凭证打印数据失败:', error)
    res.status(500).json({ code: 500, message: '批量获取凭证打印数据失败' })
  }
})

export default router
