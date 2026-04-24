import request from './request'
import type { ApiResponse, LoginResponse, CaptchaResponse, UserInfo } from '@cw/shared-types'

export interface AccountSetItem {
  id: string
  name: string
  code: string
}

export function getAccountSets(): Promise<ApiResponse<AccountSetItem[]>> {
  return request.get('/auth/account-sets')
}

export interface LoginForm {
  username: string
  password: string
  captcha: string
  captchaId: string
  targetAccountSetId?: string
}

export function login(data: LoginForm): Promise<LoginResponse> {
  return request.post('/auth/login', data) as unknown as Promise<LoginResponse>
}

export function getUserInfo(): Promise<ApiResponse<UserInfo>> {
  return request.get('/auth/userinfo')
}

export function getCaptcha(): Promise<CaptchaResponse> {
  return request.get('/auth/captcha') as unknown as Promise<CaptchaResponse>
}

export function logout(): Promise<ApiResponse<null>> {
  return request.post('/auth/logout')
}

export interface SwitchAccountSetResponse {
  code: number
  message: string
  username: string
  accountSetId: string
  accountSetName: string
}

export function switchAccountSet(accountSetId: string): Promise<SwitchAccountSetResponse> {
  return request.post('/auth/switch-account-set', {
    account_set_id: accountSetId,
  }) as unknown as Promise<SwitchAccountSetResponse>
}

export interface BackupImportResult {
  id: string
  name: string
  code: string
  fiscal_year: number
  backupAccountSetName: string | null
  imported: {
    accounts: number
    vouchers: number
    entries: number
  }
}

export function backupImport(
  file: File,
  name: string,
  code: string,
  fiscalYear?: number,
  startDate?: string
): Promise<ApiResponse<BackupImportResult>> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('name', name)
  formData.append('code', code)
  if (fiscalYear) formData.append('fiscal_year', String(fiscalYear))
  if (startDate) formData.append('start_date', startDate)
  return request.post('/auth/backup-import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export interface AcdImportResult {
  id: string
  name: string
  code: string
  fiscal_year: number
  imported: {
    accounts: number
    initBalances: number
    transferTypes: number
    transferItems: number
    vouchers: number
    voucherEntries: number
    reportDefinitions: number
  }
  warnings: string[]
}

export function acdImport(
  file: File,
  name: string,
  code: string,
  fiscalYear?: number,
  startDate?: string
): Promise<ApiResponse<AcdImportResult>> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('name', name)
  formData.append('code', code)
  if (fiscalYear) formData.append('fiscal_year', String(fiscalYear))
  if (startDate) formData.append('start_date', startDate)
  return request.post('/auth/acd-import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
