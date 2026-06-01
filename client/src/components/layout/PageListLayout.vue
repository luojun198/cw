<template>
  <div :class="embedded ? 'page-list-embedded' : 'page page-list'">
    <header v-if="title || $slots.header || $slots.actions" class="page-header">
      <h3 v-if="title">{{ title }}</h3>
      <slot name="header" />
      <div v-if="$slots.actions" class="page-header-actions">
        <slot name="actions" />
      </div>
    </header>
    <div v-if="$slots.filters" class="filter-row">
      <slot name="filters" />
    </div>
    <div :class="embedded ? 'page-list-embedded__body' : 'page-list__body'">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="pagination-bar">
      <slot name="footer" />
    </footer>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  /** 嵌入已有 .page 容器时使用，不再重复包裹 .page */
  embedded?: boolean
}>()
</script>

<style scoped>
.page-list-embedded {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.page-list-embedded__body {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>