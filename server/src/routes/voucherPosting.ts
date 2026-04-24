import { Router } from 'express'
import { getDb } from '../db/index.ts'
import { authMiddleware, AuthRequest, operationLog } from '../middleware/index.ts'
import {
  applyVoucherPosting,
  applyVoucherUnpost,
  getAllowDirectPost,
  getRequireAuditEnabled,
  loadVoucherEntries,
  validateVoucherCanPost,
  validateVoucherForUnpost,
} from '../services/voucherPosting.ts'
import { getVoucherById } from '../services/voucherEntry.ts'
import { checkPostingIntegrity } from '../services/postingIntegrityCheck.ts'

const router = Router()
router.use(authMiddleware)

// ===================== 凭证过账 =====================

router.post('/vouchers/:id/post', operationLog('过账凭证', '凭证管理'), (req: AuthRequest, res) => {
  const { id } = req.params
  const db = getDb()
  const voucher = getVoucherById({ db, voucherId: id })
  if (!voucher) {
    return res.status(404).json({ code: 404, message: '凭证不存在' })
  }

  // 检查系统参数：是否需要审核
  const requireAudit = db
    .prepare(
      `SELECT param_value FROM system_params WHERE account_set_id=? AND param_key='require_audit'`
    )
    .get(req.accountSetId) as any
  const requireAuditEnabled = getRequireAuditEnabled(requireAudit)

  // 检查系统参数：是否允许直接过账
  const allowDirectPost = db
    .prepare(
      `SELECT param_value FROM system_params WHERE account_set_id=? AND param_key='allow_direct_post'`
    )
    .get(req.accountSetId) as any
  const allowDirectPostEnabled = getAllowDirectPost(allowDirectPost)

  const postValidationError = validateVoucherCanPost(
    voucher,
    requireAuditEnabled,
    allowDirectPostEnabled
  )
  if (postValidationError) {
    return res.status(400).json({ code: 400, message: postValidationError })
  }

  const entries = loadVoucherEntries(db, id)

  // 过账前数据完整性检查（仅警告，不阻止过账）
  const integrityCheck = checkPostingIntegrity(
    db,
    req.accountSetId || '',
    voucher.year,
    voucher.period,
    entries
  )

  applyVoucherPosting(db, voucher, entries, {
    accountSetId: req.accountSetId || '',
    userId: req.userId,
    userName: req.userName,
    requireAudit: requireAuditEnabled,
    allowDirectPost: allowDirectPostEnabled,
  })

  res.json({
    code: 0,
    message: '过账成功',
    data:
      integrityCheck.warnings.length > 0
        ? {
            warnings: integrityCheck.warnings,
          }
        : undefined,
  })
})

router.post(
  '/vouchers/:id/unpost',
  operationLog('反过账凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const db = getDb()
    const voucher = getVoucherById({ db, voucherId: id })
    const validationError = validateVoucherForUnpost(voucher)
    if (validationError) {
      return res.status(400).json({ code: 400, message: validationError })
    }
    const entries = loadVoucherEntries(db, id)
    const requireAudit = db
      .prepare(
        `SELECT param_value FROM system_params WHERE account_set_id=? AND param_key='require_audit'`
      )
      .get(req.accountSetId) as any

    const allowDirectPost = db
      .prepare(
        `SELECT param_value FROM system_params WHERE account_set_id=? AND param_key='allow_direct_post'`
      )
      .get(req.accountSetId) as any

    applyVoucherUnpost(db, voucher, entries, {
      accountSetId: req.accountSetId || '',
      requireAudit: getRequireAuditEnabled(requireAudit),
      allowDirectPost: getAllowDirectPost(allowDirectPost),
    })

    res.json({ code: 0, message: '反过账成功' })
  }
)

// 批量反过账
router.post(
  '/vouchers/batch-unpost',
  operationLog('批量反过账凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const { voucherIds } = req.body

    if (!Array.isArray(voucherIds) || voucherIds.length === 0) {
      return res.status(400).json({ code: 400, message: '请选择要反过账的凭证' })
    }

    if (voucherIds.length > 100) {
      return res.status(400).json({ code: 400, message: '单次最多反过账100张凭证' })
    }

    const db = getDb()
    const requireAudit = db
      .prepare(
        `SELECT param_value FROM system_params WHERE account_set_id=? AND param_key='require_audit'`
      )
      .get(req.accountSetId) as any

    const allowDirectPost = db
      .prepare(
        `SELECT param_value FROM system_params WHERE account_set_id=? AND param_key='allow_direct_post'`
      )
      .get(req.accountSetId) as any

    const results: Array<{ id: string; success: boolean; error?: string }> = []

    for (const id of voucherIds) {
      try {
        const voucher = getVoucherById({ db, voucherId: id })
        const validationError = validateVoucherForUnpost(voucher)

        if (validationError) {
          results.push({ id, success: false, error: validationError })
          continue
        }

        const entries = loadVoucherEntries(db, id)
        applyVoucherUnpost(db, voucher, entries, {
          accountSetId: req.accountSetId || '',
          requireAudit: getRequireAuditEnabled(requireAudit),
          allowDirectPost: getAllowDirectPost(allowDirectPost),
        })

        results.push({ id, success: true })
      } catch (error: any) {
        results.push({ id, success: false, error: error.message || '反过账失败' })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    res.json({
      code: 0,
      message: `批量反过账完成：成功 ${successCount} 张，失败 ${failCount} 张`,
      data: {
        total: voucherIds.length,
        success: successCount,
        fail: failCount,
        details: results,
      },
    })
  }
)

export default router
