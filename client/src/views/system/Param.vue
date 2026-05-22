<template>
  <div class="page">
    <div class="page-header">
      <h3>系统参数</h3>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </div>

    <el-card>
      <el-form :model="form" label-width="180px">
        <el-form-item label="使用单位名称">
          <el-input
            v-model="form.unit_name"
            style="width: 300px"
            placeholder="请输入使用单位名称"
          />
          <div class="form-tip">用于凭证打印时显示的单位名称，默认取账套名称</div>
        </el-form-item>

        <el-form-item label="建账日期">
          <span class="readonly-value">{{ meta.start_date || '—' }}</span>
        </el-form-item>

        <el-form-item label="当前会计区间">
          <span class="readonly-value"
            >{{ meta.current_year }} 年 第 {{ meta.current_period }} 期</span
          >
        </el-form-item>

        <el-divider />

        <el-form-item label="凭证编号规则">
          <el-select v-model="form.voucher_no_rule" style="width: 300px">
            <el-option label="按凭证类型编号" value="by_type" />
            <el-option label="统一编号" value="unified" />
          </el-select>
          <div class="form-tip">按凭证类型编号：记-001、收-001；统一编号：001、002</div>
        </el-form-item>

        <el-form-item label="凭证审核">
          <el-switch v-model="form.require_audit" active-text="开启" inactive-text="关闭" />
          <span class="form-label-tip">{{ form.require_audit ? '已开启' : '已关闭' }}</span>
          <div class="form-tip">开启后，凭证必须审核后才能记账；关闭后，凭证可以直接记账</div>
        </el-form-item>

        <el-form-item label="直接打印">
          <el-switch v-model="form.direct_print" active-text="开启" inactive-text="关闭" />
          <span class="form-label-tip">{{ form.direct_print ? '已开启' : '已关闭' }}</span>
          <div class="form-tip">开启后，点击打印按钮将跳过预览窗口，直接发送打印任务到打印机</div>
        </el-form-item>

        <el-form-item label="凭证时序控制">
          <el-switch v-model="form.voucher_time_control" active-text="开启" inactive-text="关闭" />
          <span class="form-label-tip">{{ form.voucher_time_control ? '已开启' : '已关闭' }}</span>
          <div class="form-tip">开启后，不允许录入日期早于已有凭证的新凭证</div>
        </el-form-item>

        <el-form-item label="启用现金流核算">
          <el-switch v-model="form.enable_cash_flow" active-text="开启" inactive-text="关闭" />
          <span class="form-label-tip">{{ form.enable_cash_flow ? '已开启' : '已关闭' }}</span>
          <div class="form-tip">关闭后，凭证录入时不显示现金流输入框</div>
        </el-form-item>

        <el-divider />

        <el-form-item label="科目级数">
          <span class="readonly-value">{{ form.account_levels }} 级</span>
          <div class="form-tip">科目级数在建立账套时指定，不可修改</div>
        </el-form-item>

        <el-form-item label="科目长度">
          <span class="readonly-value">
            {{ form.account_code_lengths.slice(0, form.account_levels).join(' - ') }}
          </span>
          <div class="form-tip">科目长度在建立账套时指定，不可修改</div>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import request from '@/api/request'
import { showSuccess, showOperationError } from '@/composables/useMessage'
import { useSystemParamsStore } from '@/stores/systemParams'

interface SystemParam {
  id?: string
  account_set_id?: string
  param_key: string
  param_value: string
}

const form = ref({
  unit_name: '',
  voucher_no_rule: 'by_type',
  require_audit: true,
  direct_print: false,
  voucher_time_control: false,
  enable_cash_flow: false,
  account_levels: 6,
  account_code_lengths: [4, 2, 2, 2, 2, 2, 2, 2, 2, 2],
})

const meta = ref({
  unit_name: '',
  start_date: '',
  current_year: new Date().getFullYear(),
  current_period: new Date().getMonth() + 1,
})

async function fetchData() {
  try {
    const res = await request.get<SystemParam[]>('/system/params')
    const params = (res.data || []) as SystemParam[]
    for (const p of params) {
      if (p.param_key === 'unit_name') {
        form.value.unit_name = p.param_value || ''
      } else if (p.param_key === 'voucher_no_rule') {
        form.value.voucher_no_rule = p.param_value || 'by_type'
      } else if (p.param_key === 'require_audit') {
        form.value.require_audit = p.param_value === 'true'
      } else if (p.param_key === 'direct_print') {
        form.value.direct_print = p.param_value === 'true'
      } else if (p.param_key === 'voucher_time_control') {
        form.value.voucher_time_control = p.param_value === 'true'
      } else if (p.param_key === 'enable_cash_flow') {
        form.value.enable_cash_flow = p.param_value === 'true'
      } else if (p.param_key === 'account_levels') {
        form.value.account_levels = parseInt(p.param_value) || 6
      } else if (p.param_key === 'account_code_lengths') {
        try {
          const lengths = JSON.parse(p.param_value)
          if (Array.isArray(lengths)) form.value.account_code_lengths = lengths
        } catch {
          /* 保持默认值 */
        }
      }
    }
    // 读取 meta（单位名称、建账日期、当前期间）
    const raw = res as any
    if (raw.meta) {
      meta.value = { ...meta.value, ...raw.meta }
      // 若 system_params 中没有 unit_name，用 meta 中的值（账套名称）作为初始值
      if (!form.value.unit_name) {
        form.value.unit_name = raw.meta.unit_name || ''
      }
    }
  } catch (error) {
    showOperationError('加载系统参数', error)
  }
}

async function handleSave() {
  try {
    const params: SystemParam[] = [
      { param_key: 'unit_name', param_value: form.value.unit_name },
      { param_key: 'voucher_no_rule', param_value: form.value.voucher_no_rule },
      { param_key: 'require_audit', param_value: String(form.value.require_audit) },
      { param_key: 'direct_print', param_value: String(form.value.direct_print) },
      { param_key: 'voucher_time_control', param_value: String(form.value.voucher_time_control) },
      { param_key: 'enable_cash_flow', param_value: String(form.value.enable_cash_flow) },
      { param_key: 'account_levels', param_value: String(form.value.account_levels) },
      {
        param_key: 'account_code_lengths',
        param_value: JSON.stringify(
          form.value.account_code_lengths.slice(0, form.value.account_levels)
        ),
      },
    ]
    await request.put('/system/params', { params })
    await useSystemParamsStore().load(true)
    showSuccess('保存成功')
  } catch (error) {
    showOperationError('保存系统参数', error)
  }
}

onMounted(fetchData)
</script>

<style scoped>
.page {
  padding: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h3 {
  margin: 0;
}
.form-tip {
  color: #909399;
  font-size: 12px;
  margin-top: 4px;
}
.form-label-tip {
  margin-left: 12px;
  color: #606266;
  font-size: 14px;
}
.readonly-value {
  color: #606266;
  font-size: 14px;
  line-height: 32px;
}
</style>
