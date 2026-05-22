import axios, { type AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { ApiResponse } from '@cw/shared-types'

export type RequestConfig = AxiosRequestConfig & {
  /** 为 true 时不弹出全局错误提示（由调用方自行处理） */
  skipErrorToast?: boolean
  /** 为 true 时收到 401 不自动跳登录页（如切换操作员场景，密码错误应停留在当前对话框） */
  skipAuthRedirect?: boolean
}

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
    const config = (error.config || {}) as RequestConfig
    const status = error.response?.status
    const code = error.response?.data?.code
    const responseMessage = error.response?.data?.message
    const skipErrorToast = config.skipErrorToast === true

    // 401 未授权 - 清除登录信息并跳转
    if (status === 401) {
      // 调用方显式声明 skipAuthRedirect 时，由调用方自行处理（如切换操作员密码错误不踢到登录页）
      if (config.skipAuthRedirect) {
        return Promise.reject(error)
      }
      if (!isRedirecting) {
        isRedirecting = true
        ElMessage.warning(code === 40101 ? responseMessage || '账号已在其他地方登录，请重新登录' : '登录已过期，请重新登录')
        localStorage.removeItem('token')
        localStorage.removeItem('accountSetId')
        localStorage.removeItem('accountSetName')
        localStorage.removeItem('userInfo')
        localStorage.removeItem('permissions')
        setTimeout(() => {
          window.location.href = '/login'
          isRedirecting = false
        }, 500)
      }
      return Promise.reject(error)
    }

    if (status === 409 && code === 40901) {
      return Promise.reject(error)
    }

    // 403 无权限
    if (status === 403) {
      if (!skipErrorToast) {
        ElMessage.error(responseMessage || ERROR_MESSAGES[403])
      }
      return Promise.reject(error)
    }

    // 404 资源不存在
    if (status === 404) {
      if (!skipErrorToast) {
        ElMessage.error(responseMessage || ERROR_MESSAGES[404])
      }
      return Promise.reject(error)
    }

    // 500+ 服务器错误
    if (status && status >= 500) {
      if (!skipErrorToast) {
        ElMessage.error(responseMessage || ERROR_MESSAGES[status] || '服务器错误')
      }
      return Promise.reject(error)
    }

    // 其他错误（包括 400）
    const msg = responseMessage || ERROR_MESSAGES[status || 0] || error.message || '网络错误'
    if (!skipErrorToast) {
      ElMessage.error(msg)
    }
    return Promise.reject(error)
  }
)

// 通用请求方法（返回 code/data/total/summary）
const request = {
  get<T = unknown>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return instance.get(url, config as never) as unknown as Promise<ApiResponse<T>>
  },
  post<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return instance.post(url, data, config as never) as unknown as Promise<ApiResponse<T>>
  },
  put<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return instance.put(url, data, config as never) as unknown as Promise<ApiResponse<T>>
  },
  patch<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return instance.patch(url, data, config as never) as unknown as Promise<ApiResponse<T>>
  },
  delete<T = unknown>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return instance.delete(url, config as never) as unknown as Promise<ApiResponse<T>>
  },
  /** 下载二进制文件（如 Excel 导出），返回 Blob */
  download(url: string, config?: { params?: Record<string, unknown> }): Promise<Blob> {
    return instance.get(url, { ...config, responseType: 'blob' } as never) as unknown as Promise<Blob>
  },
}

export default request
