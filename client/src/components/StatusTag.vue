<template>
  <el-tag :type="tagType" :size="size">{{ statusText }}</el-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  status: 'draft' | 'audited' | 'posted' | string
  size?: 'large' | 'default' | 'small'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'default',
})

type TagType = 'success' | 'warning' | 'info' | 'danger' | 'primary'

const statusMap: Record<string, { text: string; type: TagType }> = {
  draft: { text: '草稿', type: 'info' },
  audited: { text: '已审核', type: 'warning' },
  posted: { text: '已过账', type: 'success' },
}

const statusText = computed(() => {
  return statusMap[props.status]?.text || props.status
})

const tagType = computed<TagType>(() => {
  return statusMap[props.status]?.type || 'info'
})
</script>
