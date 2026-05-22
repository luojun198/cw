import { Router } from 'express'
import { getDb } from '../db/index.js'
import { authMiddleware, AuthRequest, requirePermission, operationLog } from '../middleware/index.js'
import {
  applyVoucherPosting,
  applyVoucherUnpost,
  getAllowDirectPost,
  getRequireAuditEnabled,
  loadVoucherEntries,
  validateVoucherCanPost,
  validateVoucherForUnpost,
} from '../services/voucherPosting.js'
import { getVoucherById, getPeriodClosingRecord, isPeriodClosed } from '../services/voucherEntry.js'
import { checkPostingIntegrity } from '../services/postingIntegrityCheck.js'

const router = Router()
router.use(authMiddleware)

// ===================== 凭证记账 =====================

router.post('/vouchers/:id/post', requirePermission('voucher:post'), operationLog('记账凭证', '凭证管理'), (req: AuthRequest, res) => {
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

  // 检查系统参数：是否允许直接记账
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

  // 检查期间是否已结账
  const closingRecord = getPeriodClosingRecord({
    db,
    accountSetId: req.accountSetId || '',
    year: voucher.year,
    period: voucher.period,
  })
  if (isPeriodClosed(closingRecord)) {
    return res.status(400).json({
      code: 400,
      message: `${voucher.year}年${voucher.period}期已结账，不能记账`,
    })
  }

  const entries = loadVoucherEntries(db, id)

  // 记账前数据完整性检查（仅警告，不阻止记账）
  const integrityCheck = checkPostingIntegrity(
    db,
    req.accountSetId || '',
    voucher.year,
    voucher.period,
    entries
  )
  if (!integrityCheck.isValid) {
    return res.status(400).json({
      code: 400,
      message: integrityCheck.errors.join('；'),
      data:
        integrityCheck.warnings.length > 0
          ? {
              warnings: integrityCheck.warnings,
            }
          : undefined,
    })
  }

  applyVoucherPosting(db, voucher, entries, {
    accountSetId: req.accountSetId || '',
    userId: req.userId,
    userName: req.userName,
    requireAudit: requireAuditEnabled,
    allowDirectPost: allowDirectPostEnabled,
  })

  res.json({
    code: 0,
    message: '记账成功',
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
  requirePermission('voucher:unpost'),
  operationLog('反记账凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const { id } = req.params
    const db = getDb()
    const voucher = getVoucherById({ db, voucherId: id })
    const validationError = validateVoucherForUnpost(voucher)
    if (validationError) {
      return res.status(400).json({ code: 400, message: validationError })
    }

    // 检查期间是否已结账
    const closingRecord = getPeriodClosingRecord({
      db,
      accountSetId: req.accountSetId || '',
      year: voucher.year,
      period: voucher.period,
    })
    if (isPeriodClosed(closingRecord)) {
      return res.status(400).json({
        code: 400,
        message: `${voucher.year}年${voucher.period}期已结账，不能反记账`,
      })
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

    res.json({ code: 0, message: '反记账成功' })
  }
)

// 批量反记账
router.post(
  '/vouchers/batch-unpost',
  operationLog('批量反记账凭证', '凭证管理'),
  (req: AuthRequest, res) => {
    const { voucherIds } = req.body

    if (!Array.isArray(voucherIds) || voucherIds.length === 0) {
      return res.status(400).json({ code: 400, message: '请选择要反记账的凭证' })
    }

    if (voucherIds.length > 100) {
      return res.status(400).json({ code: 400, message: '单次最多反记账100张凭证' })
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
        results.push({ id, success: false, error: error.message || '反记账失败' })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    res.json({
      code: 0,
      message: `批量反记账完成：成功 ${successCount} 张，失败 ${failCount} 张`,
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
