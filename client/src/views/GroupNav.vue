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

function getIcon(path: string): string {
  const cleanPath = path.split('?')[0]
  const match = routes.find(r => r.path === cleanPath || r.path === path)
  return (match?.meta?.icon as string) || 'Menu'
}
</script>

<style scoped>
/* 薄荷泡沫底叠加双色微光晕（薄荷 + 泡沫蓝） */
.group-nav-container {
  position: relative;
  padding: 40px;
  min-height: 100vh;
  box-sizing: border-box;
  background: var(--grad-rinse, #f3faf9);
  overflow: hidden;
}

/* 光晕效果 (弥散泡泡) */
.group-nav-container::before {
  content: '';
  position: absolute;
  top: -20%;
  left: -10%;
  width: 60%;
  height: 60%;
  background: radial-gradient(circle, rgba(18, 199, 174, 0.10) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

.group-nav-container::after {
  content: '';
  position: absolute;
  bottom: -20%;
  right: -10%;
  width: 50%;
  height: 50%;
  background: radial-gradient(circle, rgba(46, 132, 245, 0.08) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

.group-nav-container > div {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

.group-nav-header {
  margin-bottom: 32px;
}

.group-nav-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-strong, #0c2a2e);
  display: flex;
  align-items: center;
  gap: 12px;
  letter-spacing: -0.5px;
}

/* 标题图标置于薄荷泡泡底座中 */
.group-nav-icon {
  width: 40px;
  height: 40px;
  padding: 8px;
  box-sizing: border-box;
  border-radius: var(--radius-pill, 999px);
  background: var(--surface-brand-soft, #e8fbf7);
  color: var(--mint-600, #0aa694);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

.group-nav-empty {
  margin-top: 100px;
}
</style>
