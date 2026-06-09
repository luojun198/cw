<template>
  <div class="bento-grid-container">
    <template v-if="group.subGroups && group.subGroups.length > 0">
      <div v-for="(sg, sgIndex) in group.subGroups" :key="sg.label" class="bento-section">
        <h2 class="bento-subtitle">{{ sg.label }}</h2>
        <div class="bento-grid">
          <router-link
            v-for="(item, index) in sg.items"
            :key="item.path"
            :to="item.path"
            class="bento-card"
          >
            <div class="bento-art">
              <NavCardArt
                :palette="subGroupArts[sgIndex][index].palette"
                :variant="subGroupArts[sgIndex][index].variant"
                :icon="iconResolver(item.path)"
              />
            </div>
            <div class="bento-body">
              <span class="bento-title">{{ item.title }}</span>
            </div>
          </router-link>
        </div>
      </div>
    </template>
    <template v-else-if="group.children && group.children.length > 0">
      <div class="bento-section">
        <div class="bento-grid">
          <router-link
            v-for="(item, index) in group.children"
            :key="item.path"
            :to="item.path"
            class="bento-card"
          >
            <div class="bento-art">
              <NavCardArt
                :palette="childrenArts[index].palette"
                :variant="childrenArts[index].variant"
                :icon="iconResolver(item.path)"
              />
            </div>
            <div class="bento-body">
              <span class="bento-title">{{ item.title }}</span>
            </div>
          </router-link>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getNavArt, type NavArt } from '@/config/navArt'
import NavCardArt from './NavCardArt.vue'

const props = defineProps<{
  group: any
  iconResolver: (path: string) => string
}>()

// 预计算每张卡片的插画配置（相邻卡片不同形状/色板，营造多风格）
const childrenArts = computed<NavArt[]>(() =>
  (props.group.children || []).map((_: any, i: number) => getNavArt(props.group.title, i))
)

const subGroupArts = computed<NavArt[][]>(() =>
  (props.group.subGroups || []).map((sg: any, sgi: number) =>
    sg.items.map((_: any, i: number) => getNavArt(props.group.title, sgi * 7 + i))
  )
)
</script>

<style scoped>
.bento-grid-container {
  padding: 6px 0;
}

.bento-section {
  margin-bottom: 28px;
}

.bento-subtitle {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
}

.bento-subtitle::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 16px;
  background: #ffd700;
  border-radius: 2px;
  margin-right: 10px;
}

/* 与凭证管理（ProcessFlow）卡片完全一致的方形卡，横向多列密排 */
.bento-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.bento-card {
  display: flex;
  flex-direction: column;
  width: 150px;
  height: 140px;
  background: #ffffff;
  border: 1px solid #ebeef5;
  border-radius: 16px;
  text-decoration: none;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.bento-card:hover {
  transform: translateY(-5px);
  border-color: #dcdfe6;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.12);
}

/* 插画区：卡片主体视觉 */
.bento-art {
  position: relative;
  flex: 1;
  min-height: 0;
  transition: transform 0.3s ease;
}

.bento-card:hover .bento-art {
  transform: scale(1.07);
}

/* 底部：标题（完整显示，无"进入"与箭头） */
.bento-body {
  flex-shrink: 0;
  min-height: 44px;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border-top: 1px solid #f2f3f5;
}

.bento-title {
  width: 100%;
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  line-height: 1.25;
  text-align: center;
  /* 短标题单行、超长标题最多两行，均完整显示 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
