<template>
  <div class="page">
    <div class="page-header">
      <h3>系统参数</h3>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </div>

    <el-card>
      <el-form :model="form" label-width="180px">
        <el-form-item label="凭证编号规则">
          <el-select v-model="form.voucher_no_rule" style="width: 300px">
            <el-option label="按凭证类型编号" value="by_type" />
            <el-option label="统一编号" value="unified" />
          </el-select>
          <div class="form-tip">按凭证类型编号：记-001、收-001；统一编号：001、002</div>
        </el-form-item>

        <el-form-item label="凭证审核">
          <el-switch v-model="form.require_audit" />
          <span class="form-label-tip">{{ form.require_audit ? '需要审核后才能过账' : '可以直接过账' }}</span>
          <div class="form-tip">开启后，凭证必须审核后才能过账；关闭后，凭证可以直接过账</div>
        </el-form-item>

        <el-form-item label="科目级数">
          <el-input-number v-model="form.account_levels" :min="1" :max="10" style="width: 200px" />
          <div class="form-tip">设置科目最大层级数，默认为 6 级</div>
        </el-form-item>

        <el-form-item label="科目长度">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <template v-for="(length, index) in form.account_code_lengths" :key="index">
              <span v-if="index > 0">-</span>
              <el-input-number
                v-model="form.account_code_lengths[index]"
                :min="1"
                :max="9"
                style="width: 80px"
                :disabled="index >= form.account_levels"
              />
            </template>
          </div>
          <div class="form-tip">
            设置每级科目的编码长度，例如：4-2-2-2-2-2 表示第一级4位，第二级2位，以此类推
          </div>
        </el-form-item>

      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import request from '@/api/request'
import { showSuccess, showOperationError } from '@/composables/useMessage'

interface SystemParam {
  id?: string
  account_set_id?: string
  param_key: string
  param_value: string
}

const form = ref({
  voucher_no_rule: 'by_type',
  require_audit: true,
  account_levels: 6,
  account_code_lengths: [4, 2, 2, 2, 2, 2, 2, 2, 2, 2],
})

async function fetchData() {
  try {
    const paramsRes = await request.get<SystemParam[]>('/system/params')

    // 加载系统参数
    const params = paramsRes.data || []
    for (const p of params) {
      if (p.param_key === 'voucher_no_rule') {
        form.value.voucher_no_rule = p.param_value || 'by_type'
      } else if (p.param_key === 'require_audit') {
        form.value.require_audit = p.param_value === 'true'
      } else if (p.param_key === 'account_levels') {
        form.value.account_levels = parseInt(p.param_value) || 6
      } else if (p.param_key === 'account_code_lengths') {
        try {
          const lengths = JSON.parse(p.param_value)
          if (Array.isArray(lengths)) {
            form.value.account_code_lengths = lengths
          }
        } catch {
          // 保持默认值
        }
      }
    }
  } catch (error) {
    showOperationError('加载系统参数', error)
  }
}

async function handleSave() {
  try {
    const params: SystemParam[] = [
      { param_key: 'voucher_no_rule', param_value: form.value.voucher_no_rule },
      { param_key: 'require_audit', param_value: String(form.value.require_audit) },
      { param_key: 'account_levels', param_value: String(form.value.account_levels) },
      { param_key: 'account_code_lengths', param_value: JSON.stringify(form.value.account_code_lengths.slice(0, form.value.account_levels)) },
    ]

    await request.put('/system/params', { params })
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

