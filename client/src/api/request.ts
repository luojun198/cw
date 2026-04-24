import axios from 'axios'
import { ElMessage } from 'element-plus'
import { ApiResponse, LoginResponse, UserInfo, CaptchaResponse } from '@cw/shared-types'

const instance = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

instance.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    const accountSetId = localStorage.getItem('accountSetId')
    if (accountSetId) {
      config.headers['X-AccountSet-Id'] = accountSetId
    }
    return config
  },
  error => Promise.reject(error)
)

// 防止重复跳转
let isRedirecting = false

// 错误码映射
const ERROR_MESSAGES: Record<number, string> = {
  400: '请求参数错误',
  401: '未授权，请重新登录',
  403: '无权限访问',
  404: '请求的资源不存在',
  500: '服务器内部错误',
  502: '网关错误',
  503: '服务暂时不可用',
  504: '网关超时',
}

instance.interceptors.response.use(
  response => response.data as any,
  error => {
    const status = error.response?.status
    const responseMessage = error.response?.data?.message

    // 401 未授权 - 清除登录信息并跳转
    if (status === 401) {
      if (!isRedirecting) {
        isRedirecting = true
        ElMessage.warning('登录已过期，请重新登录')
        localStorage.removeItem('token')
        localStorage.removeItem('accountSetId')
        localStorage.removeItem('accountSetName')
        localStorage.removeItem('userInfo')
        setTimeout(() => {
          window.location.href = '/login'
          isRedirecting = false
        }, 500)
      }
      return Promise.reject(error)
    }

    // 403 无权限
    if (status === 403) {
      ElMessage.error(responseMessage || ERROR_MESSAGES[403])
      return Promise.reject(error)
    }

    // 404 资源不存在
    if (status === 404) {
      ElMessage.error(responseMessage || ERROR_MESSAGES[404])
      return Promise.reject(error)
    }

    // 500+ 服务器错误
    if (status && status >= 500) {
      ElMessage.error(responseMessage || ERROR_MESSAGES[status] || '服务器错误')
      return Promise.reject(error)
    }

    // 其他错误（包括 400）
    const msg = responseMessage || ERROR_MESSAGES[status || 0] || error.message || '网络错误'
    ElMessage.error(msg)
    return Promise.reject(error)
  }
)

// 通用请求方法（返回 code/data/total/summary）
const request = {
  get<T = unknown>(url: string, config?: unknown): Promise<ApiResponse<T>> {
    return instance.get(url, config as never) as unknown as Promise<ApiResponse<T>>
  },
  post<T = unknown>(url: string, data?: unknown, config?: unknown): Promise<ApiResponse<T>> {
    return instance.post(url, data, config as never) as unknown as Promise<ApiResponse<T>>
  },
  put<T = unknown>(url: string, data?: unknown, config?: unknown): Promise<ApiResponse<T>> {
    return instance.put(url, data, config as never) as unknown as Promise<ApiResponse<T>>
  },
  delete<T = unknown>(url: string, config?: unknown): Promise<ApiResponse<T>> {
    return instance.delete(url, config as never) as unknown as Promise<ApiResponse<T>>
  },
}

export default request
