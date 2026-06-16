<template>
  <div class="bento-grid-container">
    <template v-if="group.subGroups && group.subGroups.length > 0">
      <div v-for="(sg, index) in group.subGroups" :key="sg.label" class="bento-section">
        <div class="section-head">
          <span class="section-dot"></span>
          <h2 class="section-title">{{ sg.label }}</h2>
          <span class="section-count">{{ sg.items.length }} 项</span>
        </div>
        <div class="bento-grid">
          <router-link
            v-for="(item, i) in sg.items"
            :key="item.path"
            :to="item.path"
            class="bento-card"
            :class="[variantClass(index * 7 + i), { 'bento-card--featured': i === 0 && sg.items.length >= 4 }]"
          >
            <span class="bento-bubble bento-bubble--lg" aria-hidden="true"></span>
            <span class="bento-bubble bento-bubble--sm" aria-hidden="true"></span>
            <div class="bento-icon-wrapper">
              <el-icon class="bento-icon">
                <component :is="iconResolver(item.path)" />
              </el-icon>
            </div>
            <div class="bento-info">
              <span class="bento-title">{{ item.title }}</span>
              <span v-if="i === 0 && sg.items.length >= 4" class="bento-hint">常用入口</span>
            </div>
            <el-icon class="bento-action-icon"><Right /></el-icon>
          </router-link>
        </div>
      </div>
    </template>
    <template v-else-if="group.children && group.children.length > 0">
      <div class="bento-section">
        <div class="bento-grid">
          <router-link
            v-for="(item, i) in group.children"
            :key="item.path"
            :to="item.path"
            class="bento-card"
            :class="[variantClass(i), { 'bento-card--featured': i === 0 && group.children.length >= 4 }]"
          >
            <span class="bento-bubble bento-bubble--lg" aria-hidden="true"></span>
            <span class="bento-bubble bento-bubble--sm" aria-hidden="true"></span>
            <div class="bento-icon-wrapper">
              <el-icon class="bento-icon">
                <component :is="iconResolver(item.path)" />
              </el-icon>
            </div>
            <div class="bento-info">
              <span class="bento-title">{{ item.title }}</span>
              <span v-if="i === 0 && group.children.length >= 4" class="bento-hint">常用入口</span>
            </div>
            <el-icon class="bento-action-icon"><Right /></el-icon>
          </router-link>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Right } from '@element-plus/icons-vue'

defineProps<{
  group: any
  iconResolver: (path: string) => string
}>()

/* 财务洗头膏设计系统：薄荷 / 泡沫蓝 / 虹彩淡紫 / 暖橙 / 珊瑚 / 泡沫浅薄荷 六套令牌色变体 */
const variants = ['mint', 'blue', 'lilac', 'amber', 'rose', 'foam']

function variantClass(index: number) {
  return `is-${variants[index % variants.length]}`
}
</script>

<style scoped>
.bento-grid-container {
  padding: var(--space-2) 0;
}

.bento-section {
  margin-bottom: var(--space-8);
}

/* 小节标题：薄荷圆点 + 标题 + 数量胶囊 */
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
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
  margin: 0;
}

.section-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--mint-700);
  background: var(--surface-brand-soft);
  border: 1px solid var(--border-brand);
  padding: 1px 8px;
  border-radius: var(--radius-pill);
}

/* 便当盒网格：特色卡跨 2 列，形成不对称律动 */
.bento-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  grid-auto-flow: dense;
  gap: var(--space-4);
}

.bento-card {
  position: relative;
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
  overflow: hidden;
}

.bento-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: var(--border-brand);
}

.bento-card:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--focus-ring), var(--shadow-sm);
  border-color: var(--brand);
}

/* 特色卡（每节首卡）：跨两列，泡沫渐变底 + 泡泡装饰 */
.bento-card--featured {
  grid-column: span 2;
  min-height: 112px;
  background: var(--grad-foam);
  border-color: var(--border-brand);
}

.bento-bubble {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 30%, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.18) 55%, transparent 100%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--dur-base) var(--ease-out);
}

.bento-card--featured .bento-bubble {
  opacity: 1;
}

.bento-card:hover .bento-bubble {
  opacity: 1;
}

.bento-bubble--lg {
  width: 92px;
  height: 92px;
  right: -26px;
  top: -34px;
}

.bento-bubble--sm {
  width: 34px;
  height: 34px;
  right: 64px;
  bottom: -12px;
}

.bento-icon-wrapper {
  position: relative;
  z-index: 1;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-pill);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
  transition: transform var(--dur-base) var(--ease-bubble);
}

.bento-card:hover .bento-icon-wrapper {
  transform: scale(1.06);
}

.bento-card--featured .bento-icon-wrapper {
  width: 54px;
  height: 54px;
}

.bento-icon {
  font-size: 20px;
}

.bento-card--featured .bento-icon {
  font-size: 24px;
}

.bento-info {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
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

.bento-card--featured .bento-title {
  font-size: 17px;
}

.bento-hint {
  font-size: 11px;
  font-weight: 600;
  color: var(--mint-700);
  letter-spacing: 0.5px;
}

.bento-action-icon {
  position: relative;
  z-index: 1;
  color: var(--ink-300);
  font-size: 16px;
  transition: transform var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}

.bento-card:hover .bento-action-icon {
  transform: translateX(3px);
  color: var(--brand);
}

/* === 令牌色变体（图标气泡） === */
.is-mint .bento-icon-wrapper { background: var(--mint-100); color: var(--mint-700); }
.is-blue .bento-icon-wrapper { background: var(--blue-100); color: var(--blue-700); }
.is-lilac .bento-icon-wrapper { background: #EDE9FF; color: #6F5FD8; }
.is-amber .bento-icon-wrapper { background: var(--warning-soft); color: #B97A14; }
.is-rose .bento-icon-wrapper { background: var(--danger-soft); color: #D7434A; }
.is-foam .bento-icon-wrapper { background: var(--surface-brand-soft); color: var(--mint-600); }

/* 窄屏：特色卡退化为单列宽 */
@media (max-width: 640px) {
  .bento-card--featured {
    grid-column: span 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bento-card,
  .bento-icon-wrapper,
  .bento-action-icon,
  .bento-bubble {
    transition: none;
  }
  .bento-card:hover {
    transform: none;
  }
}
</style>
