import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login, getUserInfo } from '@/api/auth'
import type { LoginForm } from '@/api/auth'
import type { LoginResponse, UserInfo } from '@cw/shared-types'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token') || '')
  const userInfo = ref<UserInfo | null>(null)
  const accountSetId = ref<string>(localStorage.getItem('accountSetId') || '')
  const accountSetName = ref<string>(localStorage.getItem('accountSetName') || '')
  const currentYear = ref<number>(new Date().getFullYear())
  const rememberMe = ref(localStorage.getItem('rememberMe') === 'true')
  const permissions = ref<string[]>(JSON.parse(localStorage.getItem('permissions') || '[]'))

  const isLoggedIn = computed(() => !!token.value)

  async function loginAction(form: LoginForm) {
    const res = (await login(form)) as LoginResponse
    applyLoginResponse(res)
    return res
  }

  function applyLoginResponse(res: LoginResponse) {
    token.value = res.token
    userInfo.value = res.user as UserInfo
    accountSetId.value = res.accountSetId || res.user.accountSetId || ''
    accountSetName.value = res.accountSetName || res.user.accountSetName || ''
    permissions.value = res.user.permissions || []
    localStorage.setItem('token', res.token)
    localStorage.setItem('permissions', JSON.stringify(res.user.permissions || []))
    if (res.accountSetId || res.user.accountSetId) {
      localStorage.setItem('accountSetId', res.accountSetId || res.user.accountSetId)
    }
    if (res.accountSetName || res.user.accountSetName) {
      localStorage.setItem('accountSetName', res.accountSetName || res.user.accountSetName)
    }
  }

  async function fetchUserInfo() {
    if (!token.value) return
    const res = await getUserInfo()
    userInfo.value = res.data as UserInfo
    permissions.value = (res.data as UserInfo).permissions || []
    localStorage.setItem('permissions', JSON.stringify((res.data as UserInfo).permissions || []))
  }

  function logout() {
    token.value = ''
    userInfo.value = null
    accountSetId.value = ''
    accountSetName.value = ''
    rememberMe.value = false
    permissions.value = []
    localStorage.removeItem('token')
    localStorage.removeItem('accountSetId')
    localStorage.removeItem('accountSetName')
    localStorage.removeItem('rememberMe')
    localStorage.removeItem('permissions')
  }

  function setAccountSet(id: string, name: string, newToken?: string) {
    accountSetId.value = id
    accountSetName.value = name
    localStorage.setItem('accountSetId', id)
    localStorage.setItem('accountSetName', name)
    if (newToken) {
      token.value = newToken
      localStorage.setItem('token', newToken)
    }
  }

  return {
    token,
    userInfo,
    accountSetId,
    accountSetName,
    currentYear,
    rememberMe,
    permissions,
    isLoggedIn,
    loginAction,
    applyLoginResponse,
    fetchUserInfo,
    logout,
    setAccountSet,
  }
})
