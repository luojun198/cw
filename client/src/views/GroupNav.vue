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
/* 浅灰蓝背景叠加微光晕 */
.group-nav-container {
  position: relative;
  padding: 40px;
  min-height: 100vh;
  box-sizing: border-box;
  background-color: #f8fafc;
  overflow: hidden;
}

/* 光晕效果 (弥散阴影) */
.group-nav-container::before {
  content: '';
  position: absolute;
  top: -20%;
  left: -10%;
  width: 60%;
  height: 60%;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, transparent 70%);
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
  background: radial-gradient(circle, rgba(168, 85, 247, 0.06) 0%, transparent 70%);
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
  color: #1d1d1f;
  display: flex;
  align-items: center;
  gap: 12px;
  letter-spacing: -0.5px;
}

.group-nav-icon {
  width: 32px;
  height: 32px;
  color: #007AFF;
}

.group-nav-empty {
  margin-top: 100px;
}
</style>
