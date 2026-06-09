<template>
  <div class="process-flow-container">
    <div class="flow-diagram">
      <div class="flow-main-track">
        <template v-for="(node, index) in config.mainNodes" :key="node.id">
          <!-- 节点块 -->
          <div class="flow-step">
            <!-- 主节点 -->
            <router-link
              :to="getRoutePath(node)"
              class="flow-card main-card"
              :class="[`theme-${node.color || 'blue'}`, { 'is-disabled': !canAccess(node) }]"
              @click.prevent="!canAccess(node) && $event.preventDefault()"
            >
              <div class="flow-card-art">
                <NavCardArt
                  :palette="nodeArt(node, index).palette"
                  :variant="nodeArt(node, index).variant"
                  :icon="getIcon(node)"
                />
              </div>
              <div class="flow-card-body">
                <span class="card-title">{{ getTitle(node) }}</span>
              </div>
            </router-link>

            <!-- 分支节点 -->
            <div v-if="node.branches && node.branches.length > 0" class="flow-branches">
              <div class="branch-vertical-line"></div>
              <router-link
                v-for="(branch, bIndex) in node.branches"
                :key="branch.id"
                :to="getRoutePath(branch)"
                class="flow-card branch-card"
                :class="[`theme-${branch.color || 'orange'}`, { 'is-disabled': !canAccess(branch) }]"
                @click.prevent="!canAccess(branch) && $event.preventDefault()"
              >
                <div class="flow-card-art">
                  <NavCardArt
                    :palette="nodeArt(branch, index * 10 + bIndex + 3).palette"
                    :variant="nodeArt(branch, index * 10 + bIndex + 3).variant"
                    :icon="getIcon(branch)"
                  />
                </div>
                <div class="flow-card-body">
                  <span class="card-title">{{ getTitle(branch) }}</span>
                </div>
              </router-link>
            </div>
          </div>

          <!-- 连接箭头 (如果有 next，或者是主链路除了最后一个之外都有连接线) -->
          <div class="flow-arrow" v-if="index < (config.mainNodes?.length || 0) - 1">
            <div class="arrow-line">
              <div class="arrow-light"></div>
            </div>
            <div class="arrow-head"></div>
          </div>
        </template>
      </div>
    </div>

    <!-- 辅助节点区 -->
    <div class="flow-aux-track" v-if="config.auxNodes && config.auxNodes.length > 0">
      <h3 class="aux-title">辅助功能</h3>
      <div class="aux-grid">
        <router-link
          v-for="(aux, auxIndex) in config.auxNodes"
          :key="aux.id"
          :to="getRoutePath(aux)"
          class="flow-card aux-card"
          :class="[`theme-${aux.color || 'cyan'}`, { 'is-disabled': !canAccess(aux) }]"
          @click.prevent="!canAccess(aux) && $event.preventDefault()"
        >
          <div class="flow-card-art">
            <NavCardArt
              :palette="nodeArt(aux, auxIndex + 5).palette"
              :variant="nodeArt(aux, auxIndex + 5).variant"
              :icon="getIcon(aux)"
            />
          </div>
          <div class="flow-card-body">
            <span class="card-title">{{ getTitle(aux) }}</span>
          </div>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ModuleFlowConfig, FlowNode } from '@/config/flowConfig'
import { getFlowArt, type NavArt } from '@/config/navArt'
import NavCardArt from './NavCardArt.vue'

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

// 依据 FlowNode.color 取淡彩插画配置
function nodeArt(node: FlowNode, index: number): NavArt {
  return getFlowArt(node.color, index)
}
</script>

<style scoped>
.process-flow-container {
  padding: 24px 0;
  display: flex;
  flex-direction: column;
  gap: 48px;
}

.flow-diagram {
  overflow-x: auto;
  padding: 20px 10px;
}

.flow-main-track {
  display: flex;
  align-items: flex-start;
  min-width: max-content;
}

/* 节点容器 */
.flow-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

/* 卡片基础样式 */
.flow-card {
  display: flex;
  flex-direction: column;
  width: 150px;
  height: 140px;
  background: #ffffff;
  border: 1px solid #ebeef5;
  border-radius: 16px;
  text-decoration: none;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  position: relative;
  z-index: 2;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.flow-card:hover:not(.is-disabled) {
  transform: translateY(-5px);
  border-color: #dcdfe6;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.12);
}

.flow-card.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(1);
  background: #f5f7fa;
}

/* 插画区：节点主体视觉 */
.flow-card-art {
  position: relative;
  flex: 1;
  min-height: 0;
  transition: transform 0.3s ease;
}

.flow-card:hover:not(.is-disabled) .flow-card-art {
  transform: scale(1.07);
}

/* 标题（完整显示，无"进入"与箭头） */
.flow-card-body {
  flex-shrink: 0;
  min-height: 42px;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border-top: 1px solid #f2f3f5;
}

.card-title {
  width: 100%;
  color: #303133;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.25;
  text-align: center;
  /* 短标题单行、超长标题最多两行，均完整显示 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 连接箭头 */
.flow-arrow {
  width: 60px;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin: 0 10px;
}

.arrow-line {
  flex: 1;
  height: 2px;
  background: #dcdfe6;
  position: relative;
  overflow: hidden;
}

.arrow-light {
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(90deg, transparent, #409eff, transparent);
  animation: flowLight 2s infinite linear;
}

@keyframes flowLight {
  0% { left: -100%; }
  100% { left: 200%; }
}

.arrow-head {
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 8px solid #dcdfe6;
  margin-left: 2px;
}

/* 分支节点 */
.flow-branches {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 30px;
  gap: 20px;
  position: relative;
}

.branch-vertical-line {
  position: absolute;
  top: -30px;
  left: 50%;
  width: 2px;
  height: 30px;
  background: #dcdfe6;
  transform: translateX(-50%);
  z-index: 1;
}

.branch-card {
  height: 120px;
}

/* 辅助区 */
.flow-aux-track {
  background: #f9fafc;
  border-radius: 20px;
  padding: 24px;
  border: 1px solid #ebeef5;
}

.aux-title {
  font-size: 16px;
  color: #909399;
  margin: 0 0 20px 0;
  font-weight: 500;
}

.aux-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.aux-card {
  width: 130px;
  height: 120px;
}

/* 主题色 hover 光晕（沿用语义色） */
.theme-blue:hover:not(.is-disabled) { box-shadow: 0 12px 26px rgba(64, 158, 255, 0.22); border-color: #8cc5ff; }
.theme-green:hover:not(.is-disabled) { box-shadow: 0 12px 26px rgba(103, 194, 58, 0.22); border-color: #a4da89; }
.theme-orange:hover:not(.is-disabled) { box-shadow: 0 12px 26px rgba(230, 162, 60, 0.22); border-color: #f3d19e; }
.theme-purple:hover:not(.is-disabled) { box-shadow: 0 12px 26px rgba(156, 39, 176, 0.22); border-color: #d199df; }
.theme-red:hover:not(.is-disabled) { box-shadow: 0 12px 26px rgba(245, 108, 108, 0.22); border-color: #fab6b6; }
.theme-cyan:hover:not(.is-disabled) { box-shadow: 0 12px 26px rgba(0, 188, 212, 0.22); border-color: #8be5f0; }
</style>
