<template>
  <span :class="['amount-display', colorClass]">{{ formattedAmount }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatAmount } from '@/utils/format'

interface Props {
  value: number | string | null | undefined
  showColor?: boolean
  showSign?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showColor: true,
  showSign: false,
})

const numValue = computed(() => {
  if (props.value === null || props.value === undefined || props.value === '') return 0
  return typeof props.value === 'string' ? parseFloat(props.value) : props.value
})

const formattedAmount = computed(() => {
  const formatted = formatAmount(numValue.value)
  if (props.showSign && numValue.value > 0) {
    return '+' + formatted
  }
  return formatted
})

const colorClass = computed(() => {
  if (!props.showColor) return ''
  if (numValue.value < 0) return 'amount-negative'
  if (numValue.value > 0) return 'amount-positive'
  return 'amount-zero'
})
</script>

<style scoped>
.amount-display {
  font-family: 'Courier New', monospace;
}

.amount-positive {
  color: #67c23a;
}

.amount-negative {
  color: #f56c6c;
}

.amount-zero {
  color: #909399;
}
</style>
