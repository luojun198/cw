import { Router } from 'express'
import { getDb } from '../db/index.ts'
import { authMiddleware, AuthRequest, operationLog } from '../middleware/index.ts'
import {
  applyVoucherAudit,
  applyVoucherUnAudit,
  getVoucherById,
  validateVoucherForAudit,
  validateVoucherForUnAudit,
} from '../services/voucherEntry.ts'

const router = Router()
router.use(authMiddleware)

// ===================== 凭证审核 =====================

router.post(
  '/vouchers/:id/audit',
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
  operationLog('批量审核凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const { voucherIds } = req.body

    if (!Array.isArray(voucherIds) || voucherIds.length === 0) {
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
