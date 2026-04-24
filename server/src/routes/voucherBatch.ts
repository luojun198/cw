import { Router } from 'express'
import { getDb } from '../db/index.ts'
import { authMiddleware, AuthRequest, operationLog } from '../middleware/index.ts'
import {
  auditBatchVouchers,
  buildBatchAuditPreviewData,
  buildBatchDeletePreviewData,
  deleteBatchVouchers,
  findPostedVoucher,
  findSelfMadeVoucher,
  getBatchVoucherFilters,
  getBatchVoucherQuery,
  loadBatchDraftVouchers,
  loadBatchFilteredVouchers,
  validateBatchVoucherFilters,
} from '../services/voucherEntry.ts'

const router = Router()
router.use(authMiddleware)

// ===================== 批量审核 =====================

router.post(
  '/vouchers/batch-audit/preview',
  operationLog('预览批量审核凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const filters = getBatchVoucherFilters(req.body)
    if (!validateBatchVoucherFilters(filters)) {
      return res.status(400).json({ code: 400, message: '日期区间、凭证类型不能为空' })
    }

    const db = getDb()
    const query = getBatchVoucherQuery({
      voucherTypeIds: filters.voucherTypeIds,
      accountSetId: req.accountSetId || '',
      startDate: filters.startDate,
      endDate: filters.endDate,
      startNo: filters.startNo,
      endNo: filters.endNo,
    })
    const vouchers = loadBatchDraftVouchers({
      db,
      accountSetId: req.accountSetId || '',
      filters,
    })

    res.json({
      code: 0,
      data: buildBatchAuditPreviewData(vouchers, req.userId),
    })
  }
)

router.post(
  '/vouchers/batch-audit',
  operationLog('批量审核凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const filters = getBatchVoucherFilters(req.body)
    if (!validateBatchVoucherFilters(filters)) {
      return res.status(400).json({ code: 400, message: '日期区间、凭证类型不能为空' })
    }

    const db = getDb()
    const query = getBatchVoucherQuery({
      voucherTypeIds: filters.voucherTypeIds,
      accountSetId: req.accountSetId || '',
      startDate: filters.startDate,
      endDate: filters.endDate,
      startNo: filters.startNo,
      endNo: filters.endNo,
    })
    const vouchers = loadBatchDraftVouchers({
      db,
      accountSetId: req.accountSetId || '',
      filters,
    })

    if (vouchers.length === 0) {
      return res.status(400).json({ code: 400, message: '未找到符合条件的草稿凭证' })
    }

    const selfMadeVoucher = findSelfMadeVoucher(vouchers, req.userId)
    if (selfMadeVoucher) {
      return res
        .status(400)
        .json({ code: 400, message: `制单人与审核人不能为同一人：${selfMadeVoucher.voucher_no}` })
    }

    auditBatchVouchers({
      db,
      vouchers,
      userId: req.userId,
      userName: req.userName,
    })

    res.json({
      code: 0,
      message: `批量审核成功，共审核 ${vouchers.length} 张凭证`,
      data: { count: vouchers.length },
    })
  }
)

// ===================== 批量删除 =====================

router.post(
  '/vouchers/batch-delete/preview',
  operationLog('预览批量删除凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const filters = getBatchVoucherFilters(req.body)
    if (!validateBatchVoucherFilters(filters)) {
      return res.status(400).json({ code: 400, message: '日期区间、凭证类型不能为空' })
    }

    const db = getDb()
    const query = getBatchVoucherQuery({
      voucherTypeIds: filters.voucherTypeIds,
      accountSetId: req.accountSetId || '',
      startDate: filters.startDate,
      endDate: filters.endDate,
      startNo: filters.startNo,
      endNo: filters.endNo,
    })
    const vouchers = loadBatchFilteredVouchers({
      db,
      accountSetId: req.accountSetId || '',
      filters,
    })

    res.json({
      code: 0,
      data: buildBatchDeletePreviewData(vouchers),
    })
  }
)

router.post(
  '/vouchers/batch-delete',
  operationLog('批量删除凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const filters = getBatchVoucherFilters(req.body)
    if (!validateBatchVoucherFilters(filters)) {
      return res.status(400).json({ code: 400, message: '日期区间、凭证类型不能为空' })
    }

    const db = getDb()
    const query = getBatchVoucherQuery({
      voucherTypeIds: filters.voucherTypeIds,
      accountSetId: req.accountSetId || '',
      startDate: filters.startDate,
      endDate: filters.endDate,
      startNo: filters.startNo,
      endNo: filters.endNo,
    })
    const vouchers = loadBatchFilteredVouchers({
      db,
      accountSetId: req.accountSetId || '',
      filters,
    })

    if (vouchers.length === 0) {
      return res.status(400).json({ code: 400, message: '未找到符合条件的凭证' })
    }

    const postedVoucher = findPostedVoucher(vouchers)
    if (postedVoucher) {
      return res
        .status(400)
        .json({ code: 400, message: `存在已过账凭证，无法批量删除：${postedVoucher.voucher_no}` })
    }

    deleteBatchVouchers({ db, vouchers })

    res.json({
      code: 0,
      message: `批量删除成功，共删除 ${vouchers.length} 张凭证`,
      data: { count: vouchers.length },
    })
  }
)

// ===================== 批量反审核 =====================

router.post(
  '/vouchers/batch-unaudit/preview',
  operationLog('预览批量反审核凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const filters = getBatchVoucherFilters(req.body)
    if (!validateBatchVoucherFilters(filters)) {
      return res.status(400).json({ code: 400, message: '日期区间、凭证类型不能为空' })
    }

    const db = getDb()
    const vouchers = db
      .prepare(
        `SELECT * FROM vouchers
         WHERE account_set_id=? AND status='audited'
         AND voucher_date BETWEEN ? AND ?
         ${filters.voucherTypeIds.length > 0 ? `AND voucher_type_id IN (${filters.voucherTypeIds.map(() => '?').join(',')})` : ''}
         ${filters.startNo ? 'AND voucher_no >= ?' : ''}
         ${filters.endNo ? 'AND voucher_no <= ?' : ''}
         ORDER BY voucher_date, voucher_no`
      )
      .all(
        req.accountSetId,
        filters.startDate,
        filters.endDate,
        ...filters.voucherTypeIds,
        ...(filters.startNo ? [filters.startNo] : []),
        ...(filters.endNo ? [filters.endNo] : [])
      ) as any[]

    res.json({
      code: 0,
      data: {
        count: vouchers.length,
        firstVoucherNo: vouchers[0]?.voucher_no || null,
        lastVoucherNo: vouchers[vouchers.length - 1]?.voucher_no || null,
        blockedVoucherNo: null,
      },
    })
  }
)

router.post(
  '/vouchers/batch-unaudit',
  operationLog('批量反审核凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const filters = getBatchVoucherFilters(req.body)
    if (!validateBatchVoucherFilters(filters)) {
      return res.status(400).json({ code: 400, message: '日期区间、凭证类型不能为空' })
    }

    const db = getDb()
    const vouchers = db
      .prepare(
        `SELECT * FROM vouchers
         WHERE account_set_id=? AND status='audited'
         AND voucher_date BETWEEN ? AND ?
         ${filters.voucherTypeIds.length > 0 ? `AND voucher_type_id IN (${filters.voucherTypeIds.map(() => '?').join(',')})` : ''}
         ${filters.startNo ? 'AND voucher_no >= ?' : ''}
         ${filters.endNo ? 'AND voucher_no <= ?' : ''}
         ORDER BY voucher_date, voucher_no`
      )
      .all(
        req.accountSetId,
        filters.startDate,
        filters.endDate,
        ...filters.voucherTypeIds,
        ...(filters.startNo ? [filters.startNo] : []),
        ...(filters.endNo ? [filters.endNo] : [])
      ) as any[]

    if (vouchers.length === 0) {
      return res.status(400).json({ code: 400, message: '未找到符合条件的已审核凭证' })
    }

    const updateStmt = db.prepare(
      "UPDATE vouchers SET status='draft', auditor_id=NULL, auditor_name=NULL, updated_at=datetime('now') WHERE id=?"
    )
    const transaction = db.transaction(() => {
      for (const v of vouchers) {
        updateStmt.run(v.id)
      }
    })
    transaction()

    res.json({
      code: 0,
      message: `批量反审核成功，共反审核 ${vouchers.length} 张凭证`,
      data: { count: vouchers.length },
    })
  }
)

// ===================== 批量过账 =====================

router.post(
  '/vouchers/batch-post/preview',
  operationLog('预览批量过账凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const filters = getBatchVoucherFilters(req.body)
    if (!validateBatchVoucherFilters(filters)) {
      return res.status(400).json({ code: 400, message: '日期区间、凭证类型不能为空' })
    }

    const db = getDb()
    const vouchers = db
      .prepare(
        `SELECT * FROM vouchers
         WHERE account_set_id=? AND status='audited'
         AND voucher_date BETWEEN ? AND ?
         ${filters.voucherTypeIds.length > 0 ? `AND voucher_type_id IN (${filters.voucherTypeIds.map(() => '?').join(',')})` : ''}
         ${filters.startNo ? 'AND voucher_no >= ?' : ''}
         ${filters.endNo ? 'AND voucher_no <= ?' : ''}
         ORDER BY voucher_date, voucher_no`
      )
      .all(
        req.accountSetId,
        filters.startDate,
        filters.endDate,
        ...filters.voucherTypeIds,
        ...(filters.startNo ? [filters.startNo] : []),
        ...(filters.endNo ? [filters.endNo] : [])
      ) as any[]

    res.json({
      code: 0,
      data: {
        count: vouchers.length,
        firstVoucherNo: vouchers[0]?.voucher_no || null,
        lastVoucherNo: vouchers[vouchers.length - 1]?.voucher_no || null,
        blockedVoucherNo: null,
      },
    })
  }
)

router.post(
  '/vouchers/batch-post',
  operationLog('批量过账凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const filters = getBatchVoucherFilters(req.body)
    if (!validateBatchVoucherFilters(filters)) {
      return res.status(400).json({ code: 400, message: '日期区间、凭证类型不能为空' })
    }

    const db = getDb()
    const vouchers = db
      .prepare(
        `SELECT * FROM vouchers
         WHERE account_set_id=? AND status='audited'
         AND voucher_date BETWEEN ? AND ?
         ${filters.voucherTypeIds.length > 0 ? `AND voucher_type_id IN (${filters.voucherTypeIds.map(() => '?').join(',')})` : ''}
         ${filters.startNo ? 'AND voucher_no >= ?' : ''}
         ${filters.endNo ? 'AND voucher_no <= ?' : ''}
         ORDER BY voucher_date, voucher_no`
      )
      .all(
        req.accountSetId,
        filters.startDate,
        filters.endDate,
        ...filters.voucherTypeIds,
        ...(filters.startNo ? [filters.startNo] : []),
        ...(filters.endNo ? [filters.endNo] : [])
      ) as any[]

    if (vouchers.length === 0) {
      return res.status(400).json({ code: 400, message: '未找到符合条件的已审核凭证' })
    }

    // 批量过账逻辑
    const { applyVoucherPosting } = require('../services/voucherPosting.ts')
    const { v4: uuidv4 } = require('uuid')

    const transaction = db.transaction(() => {
      for (const voucher of vouchers) {
        const entries = db
          .prepare('SELECT * FROM voucher_entries WHERE voucher_id=? ORDER BY seq')
          .all(voucher.id) as any[]

        applyVoucherPosting(db, voucher, entries, {
          accountSetId: req.accountSetId || '',
          userId: req.userId,
          userName: req.userName,
          requireAudit: false,
          allowDirectPost: true,
        })
      }
    })
    transaction()

    res.json({
      code: 0,
      message: `批量过账成功，共过账 ${vouchers.length} 张凭证`,
      data: { count: vouchers.length },
    })
  }
)

// ===================== 批量反过账 =====================

router.post(
  '/vouchers/batch-unpost/preview',
  operationLog('预览批量反过账凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const filters = getBatchVoucherFilters(req.body)
    if (!validateBatchVoucherFilters(filters)) {
      return res.status(400).json({ code: 400, message: '日期区间、凭证类型不能为空' })
    }

    const db = getDb()
    const vouchers = db
      .prepare(
        `SELECT * FROM vouchers
         WHERE account_set_id=? AND status='posted'
         AND voucher_date BETWEEN ? AND ?
         ${filters.voucherTypeIds.length > 0 ? `AND voucher_type_id IN (${filters.voucherTypeIds.map(() => '?').join(',')})` : ''}
         ${filters.startNo ? 'AND voucher_no >= ?' : ''}
         ${filters.endNo ? 'AND voucher_no <= ?' : ''}
         ORDER BY voucher_date DESC, voucher_no DESC`
      )
      .all(
        req.accountSetId,
        filters.startDate,
        filters.endDate,
        ...filters.voucherTypeIds,
        ...(filters.startNo ? [filters.startNo] : []),
        ...(filters.endNo ? [filters.endNo] : [])
      ) as any[]

    res.json({
      code: 0,
      data: {
        count: vouchers.length,
        firstVoucherNo: vouchers[0]?.voucher_no || null,
        lastVoucherNo: vouchers[vouchers.length - 1]?.voucher_no || null,
        blockedVoucherNo: null,
      },
    })
  }
)

router.post(
  '/vouchers/batch-unpost',
  operationLog('批量反过账凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const filters = getBatchVoucherFilters(req.body)
    if (!validateBatchVoucherFilters(filters)) {
      return res.status(400).json({ code: 400, message: '日期区间、凭证类型不能为空' })
    }

    const db = getDb()
    const vouchers = db
      .prepare(
        `SELECT * FROM vouchers
         WHERE account_set_id=? AND status='posted'
         AND voucher_date BETWEEN ? AND ?
         ${filters.voucherTypeIds.length > 0 ? `AND voucher_type_id IN (${filters.voucherTypeIds.map(() => '?').join(',')})` : ''}
         ${filters.startNo ? 'AND voucher_no >= ?' : ''}
         ${filters.endNo ? 'AND voucher_no <= ?' : ''}
         ORDER BY voucher_date DESC, voucher_no DESC`
      )
      .all(
        req.accountSetId,
        filters.startDate,
        filters.endDate,
        ...filters.voucherTypeIds,
        ...(filters.startNo ? [filters.startNo] : []),
        ...(filters.endNo ? [filters.endNo] : [])
      ) as any[]

    if (vouchers.length === 0) {
      return res.status(400).json({ code: 400, message: '未找到符合条件的已过账凭证' })
    }

    // 批量反过账逻辑
    const { applyVoucherUnpost } = require('../services/voucherPosting.ts')

    const transaction = db.transaction(() => {
      for (const voucher of vouchers) {
        const entries = db
          .prepare('SELECT * FROM voucher_entries WHERE voucher_id=? ORDER BY seq')
          .all(voucher.id) as any[]

        applyVoucherUnpost(db, voucher, entries, {
          accountSetId: req.accountSetId || '',
          userId: req.userId,
          userName: req.userName,
          requireAudit: false,
          allowDirectPost: true,
        })
      }
    })
    transaction()

    res.json({
      code: 0,
      message: `批量反过账成功，共反过账 ${vouchers.length} 张凭证`,
      data: { count: vouchers.length },
    })
  }
)

export default router
