<script setup lang="ts">
import { ref, computed } from 'vue'
import { Calendar, ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import type { VoucherFilters } from '@/composables/useVoucherQuery'

interface Props {
  filters: VoucherFilters
  layout?: 'inline' | 'grouped'
  enableStatus?: boolean
  enableYearPeriod?: boolean
  enableVoucherType?: boolean
  enableAccount?: boolean
  enableAuxiliary?: boolean
  enableSort?: boolean
  auxCategories?: any[]
  voucherTypes?: any[]
  accounts?: any[]
  auxItemsMap?: Record<string, any[]>
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'inline',
  enableStatus: false,
  enableYearPeriod: false,
  enableVoucherType: false,
  enableAccount: false,
  enableAuxiliary: false,
  enableSort: false,
  auxCategories: () => [],
  voucherTypes: () => [],
  accounts: () => [],
  auxItemsMap: () => ({}),
})

const emit = defineEmits<{
  search: []
  sortChange: [field: string, order: 'asc' | 'desc']
  loadAccounts: []
  loadAuxItems: [categoryId: string]
}>()

const showDateDialog = ref(false)
const tempDateRange = ref<string[]>([])
const filterExpanded = ref(false)

const years = computed(() => {
  const currentYear = new Date().getFullYear()
  return Array.from({ length: 5 }, (_, i) => currentYear - i)
})

const dateRangeLabel = computed(() => {
  const [start, end] = props.filters.dateRange || []
  if (start && end) return `${start} ~ ${end}`
  if (start) return `${start} 起`
  return '日期范围'
})

const hasScopeGroup = computed(
  () => props.enableStatus || props.enableYearPeriod || props.enableVoucherType
)

const hasAuxGroup = computed(
  () => props.enableAuxiliary && props.auxCategories.length > 0
)

const statusLabels: Record<string, string> = {
  draft: '只录入',
  audited: '已审核',
  posted: '已记账',
}

const activeFilterCount = computed(() => {
  let count = 0
  const f = props.filters
  if (f.keyword?.trim()) count++
  if (f.status) count++
  if (f.dateRange?.length) count++
  if (f.year != null) count++
  if (f.period != null) count++
  if (f.voucherTypeIds?.length) count++
  if (f.accountIds?.length) count++
  if (f.auxItems) {
    for (const ids of Object.values(f.auxItems)) {
      if (Array.isArray(ids) && ids.length) count++
    }
  }
  if (f.auxFields) {
    for (const val of Object.values(f.auxFields)) {
      if (val != null && val !== '') count++
    }
  }
  return count
})

const filterSummary = computed(() => {
  const parts: string[] = []
  const f = props.filters
  if (f.keyword?.trim()) parts.push(`关键词「${f.keyword.trim()}」`)
  if (f.status) parts.push(statusLabels[f.status] || f.status)
  if (f.dateRange?.length === 2 && f.dateRange[0] && f.dateRange[1]) {
    parts.push(`${f.dateRange[0]}~${f.dateRange[1]}`)
  } else if (dateRangeLabel.value !== '日期范围') {
    parts.push(dateRangeLabel.value)
  }
  if (f.year != null) parts.push(`${f.year}年`)
  if (f.period != null) parts.push(`${f.period}月`)
  if (f.voucherTypeIds?.length) parts.push(`类型${f.voucherTypeIds.length}项`)
  if (f.accountIds?.length) parts.push(`科目${f.accountIds.length}项`)
  if (activeFilterCount.value === 0) return '未设置筛选条件，点击展开'
  if (parts.length <= 2) return parts.join(' · ')
  return `已设 ${activeFilterCount.value} 项：${parts.slice(0, 2).join(' · ')}…`
})

function confirmDateRange() {
  props.filters.dateRange = [...tempDateRange.value]
  showDateDialog.value = false
  emit('search')
}

function clearDateRange() {
  tempDateRange.value = []
  props.filters.dateRange = []
  showDateDialog.value = false
  emit('search')
}

function parseFieldOptions(optionsJson: string | null): string[] {
  if (!optionsJson) return []
  try {
    const parsed = JSON.parse(optionsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function openDateDialog() {
  tempDateRange.value = [...props.filters.dateRange]
  showDateDialog.value = true
}
</script>

<template>
  <el-card class="voucher-filter-card" shadow="never">
    <!-- 分组布局（可折叠，默认收起） -->
    <div v-if="layout === 'grouped'" class="filter-panel-wrap">
      <div class="filter-bar-compact">
        <el-button class="filter-toggle-btn" text @click="filterExpanded = !filterExpanded">
          <el-icon>
            <ArrowDown v-if="!filterExpanded" />
            <ArrowUp v-else />
          </el-icon>
          {{ filterExpanded ? '收起筛选' : '展开筛选' }}
        </el-button>
        <span class="filter-summary-text" :title="filterSummary">{{ filterSummary }}</span>
        <div class="filter-bar-actions">
          <el-button type="primary" @click="emit('search')">查询</el-button>
          <slot name="actions" />
        </div>
      </div>

      <el-collapse-transition>
        <div v-show="filterExpanded" class="filter-panel filter-panel--grouped">
          <div class="filter-group filter-group--search">
            <span class="filter-group-label">检索</span>
            <div class="filter-group-body">
              <el-input
                v-model="filters.keyword"
                class="filter-keyword-input"
                placeholder="凭证号 / 摘要 / 金额 / 制单人 / 科目 / 辅助核算"
                clearable
                @keyup.enter="emit('search')"
              />
            </div>
          </div>

          <div v-if="hasScopeGroup" class="filter-group">
            <span class="filter-group-label">范围</span>
            <div class="filter-group-body">
              <el-select
                v-if="enableStatus"
                v-model="filters.status"
                placeholder="凭证状态"
                class="filter-control filter-control--sm"
                clearable
                @change="emit('search')"
              >
                <el-option label="全部状态" value="" />
                <el-option label="只录入" value="draft" />
                <el-option label="已审核" value="audited" />
                <el-option label="已记账" value="posted" />
              </el-select>

              <el-button class="filter-date-btn" @click="openDateDialog">
                <el-icon><Calendar /></el-icon>
                {{ dateRangeLabel }}
              </el-button>

              <template v-if="enableYearPeriod">
                <el-select
                  v-model="filters.year"
                  placeholder="会计年度"
                  class="filter-control filter-control--xs"
                  clearable
                  @change="emit('search')"
                >
                  <el-option label="全部年份" :value="(null as any)" />
                  <el-option v-for="y in years" :key="y" :label="`${y}年`" :value="y" />
                </el-select>
                <el-select
                  v-model="filters.period"
                  placeholder="会计期间"
                  class="filter-control filter-control--xs"
                  clearable
                  @change="emit('search')"
                >
                  <el-option label="全部月份" :value="(null as any)" />
                  <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
                </el-select>
              </template>

              <el-select
                v-if="enableVoucherType"
                v-model="filters.voucherTypeIds"
                placeholder="凭证类型"
                class="filter-control filter-control--md"
                multiple
                collapse-tags
                collapse-tags-tooltip
                clearable
                @change="emit('search')"
              >
                <el-option label="全部类型" value="" />
                <el-option v-for="vt in voucherTypes" :key="vt.id" :label="vt.name" :value="vt.id" />
              </el-select>
            </div>
          </div>

          <div v-if="enableAccount" class="filter-group">
            <span class="filter-group-label">科目</span>
            <div class="filter-group-body">
              <el-select
                v-model="filters.accountIds"
                placeholder="选择科目（可多选）"
                class="filter-control filter-control--lg"
                multiple
                collapse-tags
                collapse-tags-tooltip
                clearable
                filterable
                @focus="emit('loadAccounts')"
                @change="emit('search')"
              >
                <el-option
                  v-for="acc in accounts"
                  :key="acc.id"
                  :label="`${acc.code} ${acc.name}`"
                  :value="acc.id"
                />
              </el-select>
            </div>
          </div>

          <div v-if="hasAuxGroup" class="filter-group">
            <span class="filter-group-label">辅助</span>
            <div class="filter-group-body">
              <template v-for="cat in auxCategories" :key="cat.id">
                <el-select
                  v-model="filters.auxItems[cat.id]"
                  :placeholder="cat.name"
                  class="filter-control filter-control--md"
                  multiple
                  collapse-tags
                  collapse-tags-tooltip
                  clearable
                  filterable
                  @focus="emit('loadAuxItems', cat.id)"
                  @change="emit('search')"
                >
                  <el-option
                    v-for="item in auxItemsMap[cat.id] || []"
                    :key="item.id"
                    :label="item.name"
                    :value="item.id"
                  />
                </el-select>
                <template v-for="field in cat.fields || []" :key="field.id">
                  <el-input
                    v-if="field.field_type === 'text' || field.field_type === 'number'"
                    v-model="filters.auxFields[`${cat.id}_${field.field_key}`]"
                    :placeholder="field.field_name"
                    class="filter-control filter-control--md"
                    clearable
                    @change="emit('search')"
                  />
                  <el-select
                    v-else-if="field.field_type === 'select'"
                    v-model="filters.auxFields[`${cat.id}_${field.field_key}`]"
                    :placeholder="field.field_name"
                    class="filter-control filter-control--md"
                    clearable
                    @change="emit('search')"
                  >
                    <el-option
                      v-for="opt in parseFieldOptions(field.options_json)"
                      :key="opt"
                      :label="opt"
                      :value="opt"
                    />
                  </el-select>
                  <el-date-picker
                    v-else-if="field.field_type === 'date'"
                    v-model="filters.auxFields[`${cat.id}_${field.field_key}`]"
                    type="date"
                    :placeholder="field.field_name"
                    value-format="YYYY-MM-DD"
                    class="filter-control filter-control--md"
                    clearable
                    @change="emit('search')"
                  />
                </template>
              </template>
            </div>
          </div>

          <div v-if="enableSort" class="filter-group">
            <span class="filter-group-label">排序</span>
            <div class="filter-group-body">
              <el-select
                v-model="filters.sortField"
                placeholder="排序字段"
                class="filter-control filter-control--sort"
                @change="emit('sortChange', filters.sortField, filters.sortOrder)"
              >
                <el-option label="凭证日期" value="voucher_date" />
                <el-option label="凭证号" value="voucher_no" />
                <el-option label="借方金额" value="debit_amount" />
                <el-option label="贷方金额" value="credit_amount" />
                <el-option label="创建时间" value="created_at" />
              </el-select>
              <el-select
                v-model="filters.sortOrder"
                placeholder="排序方式"
                class="filter-control filter-control--xs"
                @change="emit('sortChange', filters.sortField, filters.sortOrder)"
              >
                <el-option label="升序" value="asc" />
                <el-option label="降序" value="desc" />
              </el-select>
            </div>
          </div>
        </div>
      </el-collapse-transition>
    </div>

    <!-- 单行布局（兼容旧页） -->
    <div v-else class="filter-row">
      <el-input
        v-model="filters.keyword"
        placeholder="凭证号/摘要/金额/制单人/记账人/科目/辅助核算"
        style="width: 360px"
        clearable
        @keyup.enter="emit('search')"
      />
      <el-select
        v-if="enableStatus"
        v-model="filters.status"
        placeholder="状态"
        style="width: 120px"
        @change="emit('search')"
      >
        <el-option label="全部" value="" />
        <el-option label="只录入" value="draft" />
        <el-option label="已审核" value="audited" />
        <el-option label="已记账" value="posted" />
      </el-select>
      <el-button :icon="Calendar" circle @click="openDateDialog" />
      <template v-if="enableYearPeriod">
        <el-select v-model="filters.year" placeholder="年度" style="width: 100px" clearable @change="emit('search')">
          <el-option label="全部年份" :value="(null as any)" />
          <el-option v-for="y in years" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-select v-model="filters.period" placeholder="月份" style="width: 100px" clearable @change="emit('search')">
          <el-option label="全部月份" :value="(null as any)" />
          <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
        </el-select>
      </template>
      <el-select
        v-if="enableVoucherType"
        v-model="filters.voucherTypeIds"
        placeholder="凭证类型"
        style="width: 180px"
        multiple
        collapse-tags
        collapse-tags-tooltip
        clearable
        @change="emit('search')"
      >
        <el-option label="全部类型" value="" />
        <el-option v-for="vt in voucherTypes" :key="vt.id" :label="vt.name" :value="vt.id" />
      </el-select>
      <el-select
        v-if="enableAccount"
        v-model="filters.accountIds"
        placeholder="科目"
        style="width: 180px"
        multiple
        collapse-tags
        collapse-tags-tooltip
        clearable
        filterable
        @focus="emit('loadAccounts')"
        @change="emit('search')"
      >
        <el-option
          v-for="acc in accounts"
          :key="acc.id"
          :label="`${acc.code} ${acc.name}`"
          :value="acc.id"
        />
      </el-select>
      <template v-if="enableAuxiliary">
        <template v-for="cat in auxCategories" :key="cat.id">
          <el-select
            v-model="filters.auxItems[cat.id]"
            :placeholder="cat.name"
            style="width: 150px"
            multiple
            collapse-tags
            collapse-tags-tooltip
            clearable
            filterable
            @focus="emit('loadAuxItems', cat.id)"
            @change="emit('search')"
          >
            <el-option
              v-for="item in auxItemsMap[cat.id] || []"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
          <template v-for="field in cat.fields || []" :key="field.id">
            <el-input
              v-if="field.field_type === 'text' || field.field_type === 'number'"
              v-model="filters.auxFields[`${cat.id}_${field.field_key}`]"
              :placeholder="field.field_name"
              style="width: 150px"
              clearable
              @change="emit('search')"
            />
            <el-select
              v-else-if="field.field_type === 'select'"
              v-model="filters.auxFields[`${cat.id}_${field.field_key}`]"
              :placeholder="field.field_name"
              style="width: 150px"
              clearable
              @change="emit('search')"
            >
              <el-option
                v-for="opt in parseFieldOptions(field.options_json)"
                :key="opt"
                :label="opt"
                :value="opt"
              />
            </el-select>
            <el-date-picker
              v-else-if="field.field_type === 'date'"
              v-model="filters.auxFields[`${cat.id}_${field.field_key}`]"
              type="date"
              :placeholder="field.field_name"
              value-format="YYYY-MM-DD"
              style="width: 150px"
              clearable
              @change="emit('search')"
            />
          </template>
        </template>
      </template>
      <template v-if="enableSort">
        <el-select
          v-model="filters.sortField"
          placeholder="排序字段"
          style="width: 130px"
          @change="emit('sortChange', filters.sortField, filters.sortOrder)"
        >
          <el-option label="凭证日期" value="voucher_date" />
          <el-option label="凭证号" value="voucher_no" />
          <el-option label="借方金额" value="debit_amount" />
          <el-option label="贷方金额" value="credit_amount" />
          <el-option label="创建时间" value="created_at" />
        </el-select>
        <el-select
          v-model="filters.sortOrder"
          placeholder="排序方式"
          style="width: 100px"
          @change="emit('sortChange', filters.sortField, filters.sortOrder)"
        >
          <el-option label="升序" value="asc" />
          <el-option label="降序" value="desc" />
        </el-select>
      </template>
      <el-button type="primary" @click="emit('search')">查询</el-button>
      <div v-if="$slots.actions" class="voucher-filter-actions">
        <slot name="actions" />
      </div>
    </div>
  </el-card>

  <el-dialog v-model="showDateDialog" title="选择日期范围" width="300px">
    <el-form label-width="80px">
      <el-form-item label="开始日期">
        <el-date-picker
          v-model="tempDateRange[0]"
          type="date"
          placeholder="选择开始日期"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="结束日期">
        <el-date-picker
          v-model="tempDateRange[1]"
          type="date"
          placeholder="选择结束日期"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showDateDialog = false">取消</el-button>
      <el-button @click="clearDateRange">清空</el-button>
      <el-button type="primary" @click="confirmDateRange">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.voucher-filter-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

/* 分组布局 */
.filter-panel-wrap {
  width: 100%;
}

.filter-bar-compact {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}

.filter-toggle-btn {
  flex-shrink: 0;
  padding: 0 6px !important;
  height: 28px !important;
  font-size: 12px !important;
  color: #48484a !important;
  font-weight: 600;
}

.filter-toggle-btn .el-icon {
  margin-right: 2px;
}

.filter-summary-text {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-bar-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
}

.filter-bar-actions :deep(.el-button) {
  height: 28px;
  padding: 0 12px;
  font-size: 12px;
}

.filter-panel--grouped {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.filter-group {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 10px;
  background: #fafbfc;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.filter-group-label {
  flex-shrink: 0;
  width: 40px;
  font-size: 12px;
  font-weight: 600;
  color: #6e6e73;
  line-height: 28px;
  text-align: right;
}

.filter-group-body {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.filter-group--search .filter-group-body {
  flex: 1;
}

.filter-keyword-input {
  flex: 1;
  min-width: 240px;
  max-width: 100%;
}

.filter-control--xs {
  width: 100px;
}

.filter-control--sm {
  width: 120px;
}

.filter-control--md {
  width: 160px;
}

.filter-control--lg {
  width: 280px;
  max-width: 100%;
}

.filter-control--sort {
  width: 120px;
}

.filter-date-btn {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}
</style>
