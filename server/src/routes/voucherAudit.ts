import { Router } from 'express'
import { getDb } from '../db/index.js'
import { authMiddleware, AuthRequest, requirePermission, operationLog } from '../middleware/index.js'
import {
  applyVoucherAudit,
  applyVoucherUnAudit,
  auditBatchVouchers,
  findSelfMadeVoucher,
  getBatchVoucherFilters,
  getVoucherById,
  loadBatchDraftVouchers,
  validateVoucherForAudit,
  validateBatchVoucherFilters,
  validateVoucherForUnAudit,
} from '../services/voucherEntry.js'

const router = Router()
router.use(authMiddleware)

// ===================== 凭证审核 =====================

router.post(
  '/vouchers/:id/audit',
  requirePermission('voucher:audit'),
  operationLog('审核凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const db = getDb()
    const voucher = getVoucherById({ db, voucherId: id })
    const validationError = validateVoucherForAudit(voucher, req.userId)
    if (validationError) {
      const status = validationError === '凭证不存在' ? 404 : 400
      return res.status(status).json({ code: status, message: validationError })
    }
    applyVoucherAudit({
      db,
      voucherId: id,
      userId: req.userId,
      userName: req.userName,
    })
    res.json({ code: 0, message: '审核成功' })
  }
)

// 批量审核
router.post(
  '/vouchers/batch-audit',
  requirePermission('voucher:audit'),
  operationLog('批量审核凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const { voucherIds } = req.body

    if (!Array.isArray(voucherIds)) {
      const filters = getBatchVoucherFilters(req.body)
      if (!validateBatchVoucherFilters(filters)) {
        return res.status(400).json({ code: 400, message: '请选择要审核的凭证，或完整选择日期区间和凭证类型' })
      }

      const db = getDb()
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

      return res.json({
        code: 0,
        message: `批量审核成功，共审核 ${vouchers.length} 张凭证`,
        data: { count: vouchers.length },
      })
    }

    if (voucherIds.length === 0) {
      return res.status(400).json({ code: 400, message: '请选择要审核的凭证' })
    }

    if (voucherIds.length > 100) {
      return res.status(400).json({ code: 400, message: '单次最多审核100张凭证' })
    }

    const db = getDb()
    const results: Array<{ id: string; success: boolean; error?: string }> = []

    for (const id of voucherIds) {
      try {
        const voucher = getVoucherById({ db, voucherId: id })
        const validationError = validateVoucherForAudit(voucher, req.userId)

        if (validationError) {
          results.push({ id, success: false, error: validationError })
          continue
        }

        applyVoucherAudit({
          db,
          voucherId: id,
          userId: req.userId,
          userName: req.userName,
        })

        results.push({ id, success: true })
      } catch (error: any) {
        results.push({ id, success: false, error: error.message || '审核失败' })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    // 全部失败：返回 400，避免前端把"全失败"误显示为"操作成功"
    if (successCount === 0 && failCount > 0) {
      const firstError = results.find(r => !r.success)?.error || '审核失败'
      return res.status(400).json({
        code: 400,
        message: `批量审核失败：${firstError}（共 ${failCount} 张全部失败）`,
        data: {
          total: voucherIds.length,
          success: 0,
          fail: failCount,
          details: results,
        },
      })
    }

    res.json({
      code: 0,
      message: `批量审核完成：成功 ${successCount} 张，失败 ${failCount} 张`,
      data: {
        total: voucherIds.length,
        success: successCount,
        fail: failCount,
        details: results,
      },
    })
  }
)

router.post(
  '/vouchers/:id/unaudit',
  requirePermission('voucher:audit'),
  operationLog('反审核凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const db = getDb()
    const voucher = getVoucherById({ db, voucherId: id })
    const validationError = validateVoucherForUnAudit(voucher)
    if (validationError) {
      return res.status(400).json({ code: 400, message: validationError })
    }
    applyVoucherUnAudit({ db, voucherId: id })
    res.json({ code: 0, message: '反审核成功' })
  }
)

export default router
