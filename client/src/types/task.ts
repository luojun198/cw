export type AsyncTaskType =
  | 'batch-audit'
  | 'batch-unaudit'
  | 'batch-post'
  | 'batch-unpost'
  | 'init-balance-import'
  | 'init-balance-clear'
  | 'aux-init-clear'
  | 'aux-init-save'
  | 'aux-items-delete'
  | 'aux-items-import'
  | 'accounts-import'
  | 'system-reinitialize'

export const TASK_TYPE_LABELS: Record<AsyncTaskType, string> = {
  'batch-audit': '批量审核',
  'batch-unaudit': '批量反审核',
  'batch-post': '批量记账',
  'batch-unpost': '批量反记账',
  'init-balance-import': '批量导入期初',
  'init-balance-clear': '批量清理期初',
  'aux-init-clear': '批量清理辅助期初',
  'aux-init-save': '批量保存辅助期初',
  'aux-items-delete': '批量删除核算项目',
  'aux-items-import': '批量导入核算项目',
  'accounts-import': '批量导入科目',
  'system-reinitialize': '系统初始化',
}

export const TASK_ERROR_ID_LABELS: Record<AsyncTaskType, string> = {
  'batch-audit': '凭证',
  'batch-unaudit': '凭证',
  'batch-post': '凭证',
  'batch-unpost': '凭证',
  'init-balance-import': '科目',
  'init-balance-clear': '记录',
  'aux-init-clear': '记录',
  'aux-init-save': '记录',
  'aux-items-delete': '项目',
  'aux-items-import': '项目',
  'accounts-import': '科目',
  'system-reinitialize': '步骤',
}
