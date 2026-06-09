<template>
  <div class="unified-track-container">
    <div class="unified-card">
      <div class="track-header">
        <div class="track-header-left">
          <h3 class="track-title">核心业务流程</h3>
          <span class="track-subtitle">按标准步骤完成日常业务流转</span>
        </div>
      </div>

      <div class="track-body">
        <div class="flow-main-track">
          <template v-for="(node, index) in config.mainNodes" :key="node.id">
            <!-- 节点 -->
            <div class="flow-step">
              <router-link
                :to="getRoutePath(node)"
                class="node-action"
                :class="[{ 'is-disabled': !canAccess(node) }]"
                @click.prevent="!canAccess(node) && $event.preventDefault()"
              >
                <div class="node-icon-wrapper" :class="`bg-${node.color || 'blue'}`">
                  <el-icon class="node-icon" :class="`text-${node.color || 'blue'}`">
                    <component :is="getIcon(node)" />
                  </el-icon>
                </div>
                <div class="node-info">
                  <span class="node-title">{{ getTitle(node) }}</span>
                </div>
              </router-link>

              <!-- 分支节点 -->
              <div v-if="node.branches && node.branches.length > 0" class="branch-container">
                <div class="branch-line"></div>
                <router-link
                  v-for="branch in node.branches"
                  :key="branch.id"
                  :to="getRoutePath(branch)"
                  class="node-action branch-action"
                  :class="[{ 'is-disabled': !canAccess(branch) }]"
                  @click.prevent="!canAccess(branch) && $event.preventDefault()"
                >
                  <div class="node-icon-wrapper" :class="`bg-${branch.color || 'orange'}`">
                    <el-icon class="node-icon" :class="`text-${branch.color || 'orange'}`">
                      <component :is="getIcon(branch)" />
                    </el-icon>
                  </div>
                  <div class="node-info">
                    <span class="node-title">{{ getTitle(branch) }}</span>
                  </div>
                </router-link>
              </div>
            </div>

            <!-- 连接线 (除了最后一个节点) -->
            <div class="flow-connector" v-if="index < (config.mainNodes?.length || 0) - 1">
              <div class="connector-line">
                <div class="connector-light"></div>
              </div>
              <el-icon class="connector-arrow"><ArrowRight /></el-icon>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 辅助节点区使用 Bento 风格 -->
    <div class="aux-track" v-if="config.auxNodes && config.auxNodes.length > 0">
      <h3 class="section-title">辅助操作</h3>
      <div class="bento-grid">
        <router-link
          v-for="aux in config.auxNodes"
          :key="aux.id"
          :to="getRoutePath(aux)"
          class="bento-card"
          :class="[{ 'is-disabled': !canAccess(aux) }]"
          @click.prevent="!canAccess(aux) && $event.preventDefault()"
        >
          <div class="bento-icon-wrapper" :class="`bg-${aux.color || 'cyan'}`">
            <el-icon class="bento-icon" :class="`text-${aux.color || 'cyan'}`">
              <component :is="getIcon(aux)" />
            </el-icon>
          </div>
          <div class="bento-info">
            <span class="bento-title">{{ getTitle(aux) }}</span>
          </div>
          <el-icon class="bento-action-icon"><Right /></el-icon>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowRight, Right } from '@element-plus/icons-vue'
import type { ModuleFlowConfig, FlowNode } from '@/config/flowConfig'

const props = defineProps<{
  config: ModuleFlowConfig
  availableItems: any[]
  iconResolver: (path: string) => string
}>()

function findMenuItem(node: FlowNode) {
  if (!node.path) return null
  return props.availableItems.find(item => item.path === node.path || item.path.split('?')[0] === node.path?.split('?')[0])
}

function canAccess(node: FlowNode) {
  return !!findMenuItem(node)
}

function getTitle(node: FlowNode) {
  const item = findMenuItem(node)
  return node.title || item?.title || '未知功能'
}

function getRoutePath(node: FlowNode) {
  const item = findMenuItem(node)
  return item?.path || node.path || ''
}

function getIcon(node: FlowNode) {
  if (node.icon) return node.icon
  const item = findMenuItem(node)
  return item ? props.iconResolver(item.path) : 'Menu'
}
</script>

<style scoped>
.unified-track-container {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* 统一进度轨主卡片 */
.unified-card {
  background: #ffffff;
  border-radius: 20px;
  border: 1px solid #f0f2f5;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  padding: 32px;
}

.track-header {
  margin-bottom: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.track-title {
  font-size: 18px;
  font-weight: 600;
  color: #1d1d1f;
  margin: 0 0 4px 0;
}

.track-subtitle {
  font-size: 13px;
  color: #86868b;
}

/* 轨道主体 */
.track-body {
  overflow-x: auto;
  padding-bottom: 20px;
}

.flow-main-track {
  display: flex;
  align-items: flex-start;
  min-width: max-content;
}

/* 节点容器 */
.flow-step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.node-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-decoration: none;
  cursor: pointer;
  padding: 16px 24px;
  border-radius: 16px;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.node-action:hover:not(.is-disabled) {
  background: rgba(0, 0, 0, 0.02);
  transform: translateY(-4px);
}

.node-action.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: grayscale(1);
}

/* 微高光图标底座 */
.node-icon-wrapper {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6), 0 4px 12px rgba(0, 0, 0, 0.04);
}

.node-icon {
  font-size: 24px;
}

.node-info {
  text-align: center;
}

.node-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d1d1f;
  white-space: nowrap;
}

/* 连接器 */
.flow-connector {
  display: flex;
  align-items: center;
  margin: 40px 16px 0;
  width: 80px;
  position: relative;
}

.connector-line {
  flex: 1;
  height: 2px;
  background: #e5e5ea;
  border-radius: 1px;
  position: relative;
  overflow: hidden;
}

.connector-light {
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(0, 122, 255, 0.5), transparent);
  animation: light-sweep 2s infinite linear;
}

@keyframes light-sweep {
  0% { left: -100%; }
  100% { left: 200%; }
}

.connector-arrow {
  color: #c7c7cc;
  font-size: 14px;
  margin-left: 2px;
}

/* 分支 */
.branch-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
  position: relative;
}

.branch-line {
  position: absolute;
  top: -24px;
  left: 50%;
  width: 2px;
  height: 24px;
  background: #e5e5ea;
  transform: translateX(-50%);
}

.branch-action {
  padding: 12px 16px;
}
.branch-action .node-icon-wrapper {
  width: 44px;
  height: 44px;
  border-radius: 12px;
}
.branch-action .node-icon {
  font-size: 20px;
}
.branch-action .node-title {
  font-size: 13px;
}

/* === Bento 辅助区 === */
.aux-track {
  margin-top: 8px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #86868b;
  margin-bottom: 20px;
}

.bento-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

.bento-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #ffffff;
  border: 1px solid #f0f2f5;
  border-radius: 16px;
  padding: 16px;
  text-decoration: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  transition: all 0.25s ease;
}

.bento-card:hover:not(.is-disabled) {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
  border-color: #e5e5ea;
}

.bento-card.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(1);
}

.bento-icon-wrapper {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bento-icon {
  font-size: 18px;
}

.bento-info {
  flex: 1;
  min-width: 0;
}

.bento-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d1d1f;
  display: block;
}

.bento-action-icon {
  color: #c7c7cc;
  font-size: 16px;
  transition: transform 0.2s ease, color 0.2s ease;
}

.bento-card:hover .bento-action-icon {
  transform: translateX(2px);
  color: #007AFF;
}

/* === 颜色变体 (Mac风格马卡龙色系) === */
.bg-blue { background: #eaf2ff; } .text-blue { color: #007AFF; }
.bg-cyan { background: #e4f8f9; } .text-cyan { color: #32ADE6; }
.bg-purple { background: #f2eaff; } .text-purple { color: #AF52DE; }
.bg-pink { background: #ffeaef; } .text-pink { color: #FF2D55; }
.bg-orange { background: #ffefe1; } .text-orange { color: #FF9500; }
.bg-green { background: #e8f8ec; } .text-green { color: #34C759; }
.bg-yellow { background: #fff8d6; } .text-yellow { color: #FFCC00; }
.bg-indigo { background: #eaebff; } .text-indigo { color: #5856D6; }
</style>
