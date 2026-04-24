import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import dayjs from 'dayjs'
import { getDb } from '../db/index.ts'
import { authMiddleware, AuthRequest, operationLog } from '../middleware/index.ts'
import { buildVoucherListQuery } from '../services/voucherQuery.ts'
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
  loadVoucherAuxiliaryData,
  replaceVoucherEntries,
  validateVoucherEntriesNoNegativeBalance,
  validateVoucherEntryCount,
} from '../services/voucherEntry.ts'
import fs from 'fs/promises'
import path from 'path'
import multer from 'multer'

const router = Router()

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
router.post('/vouchers/renumber', operationLog('重新排号', '凭证管理'), (req: AuthRequest, res) => {
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
router.post('/vouchers/insert', operationLog('插入凭证', '凭证管理'), (req: AuthRequest, res) => {
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
    const balanceError = getVoucherBalanceError(entries)
    if (balanceError) {
      return res.status(400).json({ code: 400, message: balanceError })
    }

    const entryCountError = validateVoucherEntryCount(entries)
    if (entryCountError) {
      return res.status(400).json({ code: 400, message: entryCountError })
    }

    const negativeError = validateVoucherEntriesNoNegativeBalance({
      entries,
      getAccountById: accountId =>
        db.prepare('SELECT * FROM accounts WHERE id=?').get(accountId) as any,
      getBalanceByAccountId: () => 0,
    })
    if (negativeError) {
      return res.status(400).json({ code: 400, message: negativeError })
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
    const insertEntryStmt = db.prepare(`
      INSERT INTO voucher_entries (id, account_set_id, voucher_id, seq, account_id, account_code, account_name, direction, amount, summary, dept_id, dept_name, project_id, project_name, supplier_id, supplier_name, person_id, person_name, func_class_id, func_class_name, aux_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const entryPayloads = buildVoucherEntryPayloads({
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

router.post('/vouchers', operationLog('录入凭证', '凭证管理'), (req: AuthRequest, res) => {
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

  const { debitTotal } = calculateVoucherTotals(entries)
  const balanceError = getVoucherBalanceError(entries)
  if (balanceError) {
    return res.status(400).json({ code: 400, message: balanceError })
  }

  const { effectiveTypeId, voucherNo } = getNextVoucherNo({
    db,
    accountSetId: req.accountSetId || '',
    year,
    period,
    voucherTypeId: voucher_type_id,
  })

  const voucherId = uuidv4()

  const noNegativeBalanceError = validateVoucherEntriesNoNegativeBalance({
    entries,
    getAccountById: accountId =>
      db.prepare('SELECT * FROM accounts WHERE id=?').get(accountId) as any,
    getBalanceByAccountId: accountId => {
      const balance = db
        .prepare(
          `
          SELECT end_balance FROM account_balances WHERE account_set_id=? AND account_id=? AND year=? AND period=?
          ORDER BY year DESC, period DESC LIMIT 1
        `
        )
        .get(req.accountSetId, accountId, year, period) as any
      return balance?.end_balance || 0
    },
  })
  if (noNegativeBalanceError) {
    return res.status(400).json({ code: 400, message: noNegativeBalanceError })
  }

  const insertVoucher = db.prepare(`
    INSERT INTO vouchers (id, account_set_id, voucher_no, voucher_type_id, voucher_date, year, period, total_amount, maker_id, maker_name, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertEntry = db.prepare(`
    INSERT INTO voucher_entries (id, account_set_id, voucher_id, seq, account_id, account_code, account_name, direction, amount, summary, dept_id, dept_name, project_id, project_name, supplier_id, supplier_name, person_id, person_name, func_class_id, func_class_name, aux_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const { categories, itemMap } = loadVoucherAuxiliaryData({
    db,
    accountSetId: req.accountSetId || '',
  })

  const createVoucher = db.transaction(() => {
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
      accountSetId: req.accountSetId || '',
      voucherId,
      entries,
      categories,
      itemMap,
    })

    entryPayloads.forEach(payload => {
      insertEntry.run(...payload)
    })
  })
  createVoucher()

  res.json({ code: 0, message: '凭证录入成功', data: { id: voucherId, voucherNo } })
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
  } = req.query

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
  })

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

router.put('/vouchers/:id', operationLog('修改凭证', '凭证管理'), (req: AuthRequest, res) => {
  const { id } = req.params
  const { entries, remark } = req.body
  const db = getDb()
  const voucher = getVoucherById({ db, voucherId: id })
  if (!voucher) {
    return res.status(404).json({ code: 404, message: '凭证不存在' })
  }
  if (isPostedVoucher(voucher)) {
    return res.status(400).json({ code: 400, message: '已过账凭证不能修改' })
  }

  const balanceError = getVoucherUpdateBalanceError(entries)
  if (balanceError) {
    return res.status(400).json({ code: 400, message: balanceError })
  }
  const { debitTotal } = calculateVoucherTotals(entries)

  const { categories, itemMap } = loadVoucherAuxiliaryData({
    db,
    accountSetId: req.accountSetId || '',
  })

  const updateVoucher = db.transaction(() => {
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
  })
  updateVoucher()
  res.json({ code: 0, message: '修改成功' })
})

// 修改已审核凭证（自动反审核-修改-重新审核）
router.put(
  '/vouchers/:id/edit-audited',
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
      return res.status(400).json({ code: 400, message: '已过账凭证不能修改，请先反过账' })
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

router.delete('/vouchers/:id', operationLog('删除凭证', '凭证管理'), (req: AuthRequest, res) => {
  const { id } = req.params
  const db = getDb()
  const voucher = getVoucherById({ db, voucherId: id })
  if (voucher?.status === 'posted') {
    return res.status(400).json({ code: 400, message: '已过账凭证不能删除' })
  }
  deleteVoucherRecords(db, id)
  res.json({ code: 0, message: '删除成功' })
})

// ===================== 凭证附件管理 =====================

// 上传附件
router.post(
  '/vouchers/:voucherId/attachments',
  attachmentUpload.array('file'),
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

    const uploadedFiles = await Promise.all(
      (req.files as Express.Multer.File[]).map(async file => {
        const fileId = uuidv4()
        const ext = path.extname(file.originalname)
        const filename = `${fileId}${ext}`
        const uploadDir = path.join(process.cwd(), 'uploads', 'attachments')

        // 确保上传目录存在
        await fs.mkdir(uploadDir, { recursive: true })

        // 保存文件
        const filePath = path.join(uploadDir, filename)
        await fs.writeFile(filePath, file.buffer)

        const attachment = {
          id: fileId,
          account_set_id: accountSetId,
          voucher_id: voucherId,
          filename,
          original_name: fixGarbledFilename(file.originalname),
          file_path: `/uploads/attachments/${filename}`,
          file_size: file.size,
          mime_type: file.mimetype,
          created_by: req.user?.id,
          created_at: new Date().toISOString(),
        }

        // 保存到数据库
        db.prepare(
          `INSERT INTO voucher_attachments
           (id, account_set_id, voucher_id, filename, original_name, file_path, file_size, mime_type, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          attachment.id,
          attachment.account_set_id,
          attachment.voucher_id,
          attachment.filename,
          attachment.original_name,
          attachment.file_path,
          attachment.file_size,
          attachment.mime_type,
          attachment.created_by,
          attachment.created_at
        )

        return attachment
      })
    )

    // 更新凭证附件计数
    db.prepare('UPDATE vouchers SET attachments = attachments + ? WHERE id = ?').run(
      uploadedFiles.length,
      voucherId
    )

    res.json({ code: 0, data: uploadedFiles, message: `成功上传 ${uploadedFiles.length} 个文件` })
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
      await fs.unlink(filePath)

      // 从数据库删除
      db.prepare(
        'DELETE FROM voucher_attachments WHERE id = ? AND voucher_id = ? AND account_set_id = ?'
      ).run(attachmentId, voucherId, accountSetId)

      // 更新凭证附件计数
      const attachmentCount = db
        .prepare('SELECT COUNT(*) as count FROM voucher_attachments WHERE voucher_id = ?')
        .get(voucherId).count as number

      db.prepare('UPDATE vouchers SET attachments = ? WHERE id = ?').run(attachmentCount, voucherId)

      res.json({ code: 0, message: '附件删除成功' })
    } catch (error) {
      console.error('删除附件失败:', error)
      res.status(500).json({ code: 500, message: '删除附件失败' })
    }
  }
)

export default router
