<template>
  <div class="bento-grid-container">
    <template v-if="group.subGroups && group.subGroups.length > 0">
      <div v-for="(sg, index) in group.subGroups" :key="sg.label" class="bento-section">
        <h2 class="section-title">{{ sg.label }}</h2>
        <div class="bento-grid">
          <router-link
            v-for="(item, i) in sg.items"
            :key="item.path"
            :to="item.path"
            class="bento-card"
          >
            <div class="bento-icon-wrapper" :class="getColorClass(index * 7 + i)">
              <el-icon class="bento-icon" :class="getTextColorClass(index * 7 + i)">
                <component :is="iconResolver(item.path)" />
              </el-icon>
            </div>
            <div class="bento-info">
              <span class="bento-title">{{ item.title }}</span>
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
          >
            <div class="bento-icon-wrapper" :class="getColorClass(i)">
              <el-icon class="bento-icon" :class="getTextColorClass(i)">
                <component :is="iconResolver(item.path)" />
              </el-icon>
            </div>
            <div class="bento-info">
              <span class="bento-title">{{ item.title }}</span>
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

const props = defineProps<{
  group: any
  iconResolver: (path: string) => string
}>()

const colors = ['blue', 'cyan', 'purple', 'orange', 'green', 'indigo', 'pink', 'yellow']

function getColorClass(index: number) {
  return `bg-${colors[index % colors.length]}`
}

function getTextColorClass(index: number) {
  return `text-${colors[index % colors.length]}`
}
</script>

<style scoped>
.bento-grid-container {
  padding: 8px 0;
}

.bento-section {
  margin-bottom: 32px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #1d1d1f;
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

.bento-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
  border-color: #e5e5ea;
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
