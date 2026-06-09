<template>
  <div class="group-nav-container">
    <div v-if="currentGroup">
      <div class="group-nav-header">
        <h1 class="group-nav-title">
          <component :is="currentGroup.icon" v-if="currentGroup.icon" class="group-nav-icon" />
          {{ currentGroup.title }}
        </h1>
      </div>

      <template v-if="currentFlowConfig && currentFlowConfig.layout === 'flow'">
        <ProcessFlow
          :config="currentFlowConfig"
          :availableItems="availableItems"
          :iconResolver="getIcon"
        />
      </template>
      <template v-else-if="currentFlowConfig && currentFlowConfig.layout === 'bento'">
        <BentoGrid
          :group="currentGroup"
          :iconResolver="getIcon"
        />
      </template>
      <template v-else>
        <!-- Fallback if not configured, use Bento Grid by default -->
        <BentoGrid
          :group="currentGroup"
          :iconResolver="getIcon"
        />
      </template>
    </div>
    <div v-else>
      <el-empty class="group-nav-empty" description="未找到对应模块分组" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { NavGroup } from '@/config/navigation'
import { groupFlowMap } from '@/config/flowConfig'
import ProcessFlow from './components/ProcessFlow.vue'
import BentoGrid from './components/BentoGrid.vue'

const route = useRoute()
const router = useRouter()

const menuGroups = inject('layoutMenuGroups') as Ref<NavGroup[]> | undefined

const currentGroup = computed(() => {
  if (!menuGroups?.value) return null
  const title = route.params.groupTitle
  return menuGroups.value.find(g => g.title === title) || null
})

const currentFlowConfig = computed(() => {
  if (!currentGroup.value) return null
  return groupFlowMap[currentGroup.value.title] || null
})

const availableItems = computed(() => {
  if (!currentGroup.value) return []
  const items: any[] = []
  if (currentGroup.value.children) {
    items.push(...currentGroup.value.children)
  }
  if (currentGroup.value.subGroups) {
    currentGroup.value.subGroups.forEach(sg => items.push(...sg.items))
  }
  return items
})

const routes = router.getRoutes()

function getIcon(path: string) {
  const cleanPath = path.split('?')[0]
  const match = routes.find(r => r.path === cleanPath || r.path === path)
  return match?.meta?.icon || 'Menu'
}
</script>

<style scoped>
/* 浅色系渐变背景 + 极淡装饰图案，整页不再纯白 */
.group-nav-container {
  position: relative;
  padding: 40px;
  min-height: 100vh;
  box-sizing: border-box;
  background:
    radial-gradient(1100px 520px at 12% -8%, rgba(64, 158, 255, 0.10), transparent 60%),
    radial-gradient(900px 480px at 92% 4%, rgba(156, 106, 222, 0.09), transparent 60%),
    radial-gradient(800px 600px at 78% 102%, rgba(20, 184, 166, 0.08), transparent 60%),
    linear-gradient(135deg, #fbfdff 0%, #f4f7fb 100%);
}

/* 极淡圆点纹理叠加层 */
.group-nav-container::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(64, 110, 180, 0.05) 1.5px, transparent 1.5px);
  background-size: 26px 26px;
}

/* 内容区限宽居中并置于纹理之上
   注意：.main-view > * 全局规则把本容器变成了 flex 纵列，
   若仅用 margin:0 auto 会让子项收缩成内容宽度（导致 bento 网格塌成单列），
   故显式 width:100% 占满，再用 max-width + margin 居中。 */
.group-nav-container > div {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

.group-nav-header {
  margin-bottom: 20px;
}

.group-nav-title {
  font-size: 32px;
  font-weight: 700;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 16px;
  letter-spacing: 1px;
}

.group-nav-icon {
  width: 36px;
  height: 36px;
  color: #409eff;
}

.group-nav-empty {
  margin-top: 100px;
}
</style>
