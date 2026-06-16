<template>
  <div class="unified-track-container">
    <div class="unified-card">
      <div class="track-header">
        <div class="track-header-left">
          <h3 class="track-title">核心业务流程</h3>
          <span class="track-subtitle">按标准步骤完成日常业务流转</span>
        </div>
        <span class="track-steps-pill">{{ config.mainNodes?.length || 0 }} 个步骤</span>
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
                :aria-disabled="!canAccess(node)"
                @click.prevent="!canAccess(node) && $event.preventDefault()"
              >
                <div class="node-icon-wrapper" :class="`is-${node.color || 'blue'}`">
                  <span class="node-step-no">{{ String(index + 1).padStart(2, '0') }}</span>
                  <el-icon class="node-icon">
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
                  :aria-disabled="!canAccess(branch)"
                  @click.prevent="!canAccess(branch) && $event.preventDefault()"
                >
                  <div class="node-icon-wrapper" :class="`is-${branch.color || 'orange'}`">
                    <el-icon class="node-icon">
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
            <div class="flow-connector" v-if="index < (config.mainNodes?.length || 0) - 1" aria-hidden="true">
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
      <div class="section-head">
        <span class="section-dot"></span>
        <h3 class="section-title">辅助操作</h3>
      </div>
      <div class="bento-grid">
        <router-link
          v-for="aux in config.auxNodes"
          :key="aux.id"
          :to="getRoutePath(aux)"
          class="bento-card"
          :class="[{ 'is-disabled': !canAccess(aux) }]"
          :aria-disabled="!canAccess(aux)"
          @click.prevent="!canAccess(aux) && $event.preventDefault()"
        >
          <div class="bento-icon-wrapper" :class="`is-${aux.color || 'cyan'}`">
            <el-icon class="bento-icon">
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
  const exactMatch = props.availableItems.find(item => item.path === node.path)
  if (exactMatch) return exactMatch
  return props.availableItems.find(item => item.path.split('?')[0] === node.path?.split('?')[0])
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
  gap: var(--space-8);
}

/* 统一进度轨主卡片 — 泡沫白卡 */
.unified-card {
  background: var(--surface-card);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm), var(--sheen);
  padding: var(--space-8);
}

.track-header {
  margin-bottom: var(--space-10);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.track-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
  margin: 0 0 4px 0;
}

.track-subtitle {
  font-size: 13px;
  color: var(--text-muted);
}

.track-steps-pill {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--mint-700);
  background: var(--surface-brand-soft);
  border: 1px solid var(--border-brand);
  padding: 4px 12px;
  border-radius: var(--radius-pill);
}

/* 轨道主体 */
.track-body {
  overflow-x: auto;
  padding-bottom: var(--space-5);
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
  gap: var(--space-4);
  text-decoration: none;
  cursor: pointer;
  padding: var(--space-4) var(--space-6);
  border-radius: var(--radius-md);
  transition: transform var(--dur-base) var(--ease-bubble),
    background var(--dur-base) var(--ease-out);
}

.node-action:hover:not(.is-disabled) {
  background: var(--surface-brand-soft);
  transform: translateY(-4px);
}

.node-action:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.node-action.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: grayscale(1);
}

/* 圆形泡泡图标底座 + 步骤序号 */
.node-icon-wrapper {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-pill);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65), var(--shadow-xs);
  transition: box-shadow var(--dur-base) var(--ease-out);
}

.node-action:hover:not(.is-disabled) .node-icon-wrapper {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65), var(--shadow-mint);
}

.node-step-no {
  position: absolute;
  top: -6px;
  right: -8px;
  min-width: 22px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--grad-bubble);
  color: var(--white);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-xs);
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
  color: var(--text-strong);
  white-space: nowrap;
}

/* 连接器 — 薄荷流光 */
.flow-connector {
  display: flex;
  align-items: center;
  margin: 44px 12px 0;
  width: 76px;
  position: relative;
}

.connector-line {
  flex: 1;
  height: 2px;
  background: var(--ink-200);
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
  background: linear-gradient(90deg, transparent, rgba(18, 199, 174, 0.65), transparent);
  animation: light-sweep 2s infinite linear;
}

@keyframes light-sweep {
  0% { left: -100%; }
  100% { left: 200%; }
}

.connector-arrow {
  color: var(--mint-400);
  font-size: 14px;
  margin-left: 2px;
}

/* 分支 — 薄荷虚线下挂 */
.branch-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  margin-top: var(--space-4);
  position: relative;
}

.branch-line {
  position: absolute;
  top: -24px;
  left: 50%;
  width: 0;
  height: 24px;
  border-left: 2px dashed var(--mint-300);
  transform: translateX(-50%);
}

.branch-action {
  padding: var(--space-3) var(--space-4);
}
.branch-action .node-icon-wrapper {
  width: 44px;
  height: 44px;
}
.branch-action .node-icon {
  font-size: 20px;
}
.branch-action .node-title {
  font-size: 13px;
}

/* === Bento 辅助区（与 BentoGrid 同语言） === */
.aux-track {
  margin-top: var(--space-2);
}

.section-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
}

.section-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--grad-bubble);
  flex-shrink: 0;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong);
  margin: 0;
}

.bento-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: var(--space-4);
}

.bento-card {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-4) var(--space-5);
  min-height: 84px;
  text-decoration: none;
  cursor: pointer;
  box-shadow: var(--shadow-xs), var(--sheen);
  transition: transform var(--dur-base) var(--ease-bubble),
    box-shadow var(--dur-base) var(--ease-out),
    border-color var(--dur-base) var(--ease-out);
}

.bento-card:hover:not(.is-disabled) {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: var(--border-brand);
}

.bento-card:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--focus-ring), var(--shadow-sm);
  border-color: var(--brand);
}

.bento-card.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(1);
}

.bento-icon-wrapper {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-pill);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
}

.bento-icon {
  font-size: 20px;
}

.bento-info {
  flex: 1;
  min-width: 0;
}

.bento-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bento-action-icon {
  color: var(--ink-300);
  font-size: 16px;
  transition: transform var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}

.bento-card:hover .bento-action-icon {
  transform: translateX(3px);
  color: var(--brand);
}

/* === 流程色语义 → 设计令牌（图标气泡） === */
.is-blue { background: var(--blue-100); color: var(--blue-700); }
.is-green { background: var(--mint-100); color: var(--mint-700); }
.is-orange { background: var(--warning-soft); color: #B97A14; }
.is-purple { background: #EDE9FF; color: #6F5FD8; }
.is-red { background: var(--danger-soft); color: #D7434A; }
.is-cyan { background: var(--surface-brand-soft); color: var(--mint-600); }
.is-yellow { background: var(--warning-soft); color: #B97A14; }
.is-pink { background: var(--danger-soft); color: #D7434A; }
.is-indigo { background: var(--blue-100); color: var(--blue-700); }

@media (prefers-reduced-motion: reduce) {
  .node-action,
  .bento-card,
  .bento-action-icon,
  .node-icon-wrapper {
    transition: none;
  }
  .node-action:hover:not(.is-disabled),
  .bento-card:hover:not(.is-disabled) {
    transform: none;
  }
  .connector-light {
    animation: none;
    display: none;
  }
}
</style>
