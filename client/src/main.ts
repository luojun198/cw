import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import './assets/styles.css'
import './styles/common.css'
import './styles/apple-element-override.css'
import { permission } from './directives/permission'
import { setupMessageBoxDefaults } from './plugins/messageBoxDefaults'
import { useUserStore } from './stores/user'
import { useLicenseStore } from './stores/license'

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()

  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
  }

  app.directive('permission', permission)
  app.use(pinia)

  await useLicenseStore().loadStatus(true)
  if (useLicenseStore().isValid) {
    await useUserStore().bootstrapAuth()
  }

  app.use(router)
  app.use(ElementPlus)
  setupMessageBoxDefaults()
  app.mount('#app')
}

void bootstrap()
