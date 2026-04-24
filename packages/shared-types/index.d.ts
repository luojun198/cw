export interface ApiResponse<T = unknown> {
  code: number
  message?: string
  data: T
  total?: number
  summary?: Record<string, unknown>
}

export interface LoginResponse {
  code: number
  token: string
  message?: string
  user: UserInfo
  accountSetId?: string
  accountSetName?: string
}

export interface UserInfo {
  id: string
  username: string
  nickname: string
  role: string
  roleName: string
  accountSetId: string
  accountSetName: string
}

export interface CaptchaResponse {
  code: number
  captchaId: string
  captchaUrl: string
}
