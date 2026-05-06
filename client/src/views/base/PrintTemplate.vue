<template>
  <div class="print-template-page">
    <div class="page-header">
      <h2>打印模版管理</h2>
      <div class="header-actions">
        <el-button type="primary" @click="handleCreate">新增模版</el-button>
      </div>
    </div>

    <div class="page-content">
      <el-table :data="templates" border stripe v-loading="loading">
        <el-table-column prop="name" label="模版名称" min-width="200" />
        <el-table-column prop="paper_size" label="纸张规格" width="120">
          <template #default="{ row }">
            {{ getPaperSizeLabel(row.paper_size) }}
          </template>
        </el-table-column>
        <el-table-column label="纸张尺寸" width="150">
          <template #default="{ row }">
            {{ row.paper_width }}mm × {{ row.paper_height }}mm
          </template>
        </el-table-column>
        <el-table-column label="页边距" width="200">
          <template #default="{ row }">
            上{{ row.margin_top }}mm 下{{ row.margin_bottom }}mm 左{{ row.margin_left }}mm 右{{
              row.margin_right
            }}mm
          </template>
        </el-table-column>
        <el-table-column prop="is_default" label="默认模版" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.is_default" type="success">是</el-tag>
            <el-tag v-else type="info">否</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button
              v-if="!row.is_default"
              type="success"
              size="small"
              @click="handleSetDefault(row)"
            >
              设为默认
            </el-button>
            <el-button v-else type="info" size="small" disabled>当前默认</el-button>
            <el-button
              v-if="!row.is_default"
              type="danger"
              size="small"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 设计器对话框 -->
    <el-dialog
      v-model="designerVisible"
      :title="editingTemplate ? '编辑模版' : '新增模版'"
      width="95%"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <TemplateDesigner
        :template-id="editingTemplate?.id"
        @save="handleSaveTemplate"
        @cancel="designerVisible = false"
      />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { PrintTemplate } from '@/types/print'
import { useUserStore } from '@/stores/user'
import request from '@/api/request'
import TemplateDesigner from '@/components/print/TemplateDesigner.vue'

const userStore = useUserStore()
const loading = ref(false)
const templates = ref<PrintTemplate[]>([])
const designerVisible = ref(false)
const editingTemplate = ref<PrintTemplate | null>(null)

// 获取纸张规格标签
const getPaperSizeLabel = (size: string) => {
  const labels: Record<string, string> = {
    custom: '自定义',
    a4: 'A4',
    a5: 'A5',
  }
  return labels[size] || size
}

// 加载模版列表
const loadTemplates = async () => {
  loading.value = true
  try {
    if (!userStore.accountSetId) {
      ElMessage.error('未选择账套')
      return
    }

    const response = await request.get<PrintTemplate[]>('/base/print-templates', {
      params: { account_set_id: userStore.accountSetId },
    } as any)

    templates.value = response.data || []
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '加载模版列表失败')
  } finally {
    loading.value = false
  }
}

// 设置默认模版
const handleSetDefault = async (template: PrintTemplate) => {
  try {
    await ElMessageBox.confirm(`确定将"${template.name}"设为默认打印模版吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })

    await request.post(`/base/print-templates/default/${template.id}`)

    ElMessage.success('设置成功')
    await loadTemplates()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.message || '设置失败')
    }
  }
}

// 新增模版
const handleCreate = () => {
  editingTemplate.value = null
  designerVisible.value = true
}

// 编辑模版
const handleEdit = (template: PrintTemplate) => {
  editingTemplate.value = template
  designerVisible.value = true
}

// 保存模版
const handleSaveTemplate = async () => {
  designerVisible.value = false
  await loadTemplates()
  ElMessage.success('保存成功')
}

// 删除模版
const handleDelete = async (template: PrintTemplate) => {
  try {
    await ElMessageBox.confirm(`确定删除模版"${template.name}"吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })

    await request.delete(`/base/print-templates/${template.id}`)

    ElMessage.success('删除成功')
    await loadTemplates()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.message || '删除失败')
    }
  }
}

onMounted(() => {
  loadTemplates()
})
</script>

<style scoped>
.print-template-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e0e0e0;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.page-content {
  flex: 1;
  padding: 20px;
  overflow: auto;
}
</style>
