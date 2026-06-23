<template>
  <div class="page param-page">
    <div class="page-header param-page-header">
      <div class="param-page-header__main">
        <h3>系统参数</h3>
        <span class="param-page-header__desc">账套级全局配置，保存后对凭证、主页取数等生效</span>
      </div>
      <el-button v-if="activeTab === 'ledger'" type="primary" size="small" @click="handleSave">保存</el-button>
    </div>

    <el-tabs v-model="activeTab" class="param-tabs">
      <!-- ── 总账 ── -->
      <el-tab-pane label="总账" name="ledger">
        <div class="param-sections">
          <section class="param-section param-section--basic">
            <header class="param-section__head">
              <span class="param-section__marker" aria-hidden="true"></span>
              <h4 class="param-section__title">
                基本信息
                <span class="param-section__sub">单位名称、凭证编号规则与账套只读信息</span>
              </h4>
            </header>
            <div class="param-section__body">
              <div class="param-basic-row">
                <el-form :model="form" label-width="96px" size="small" class="param-form param-form--inline">
                  <el-form-item label="使用单位名称">
                    <el-input v-model="form.unit_name" placeholder="默认取账套名称" clearable style="width: 200px" />
                  </el-form-item>
                  <el-form-item label="凭证编号规则">
                    <el-select v-model="form.voucher_no_rule" style="width: 148px">
                      <el-option label="按凭证类型编号" value="by_type" />
                      <el-option label="统一编号" value="unified" />
                    </el-select>
                  </el-form-item>
                </el-form>
                <div class="param-meta-inline">
                  <span class="param-meta-chip">
                    <label>建账日期</label>{{ meta.start_date || '—' }}
                  </span>
                  <span class="param-meta-chip">
                    <label>会计区间</label>{{ meta.current_year }}年第{{ meta.current_period }}期
                  </span>
                  <span class="param-meta-chip">
                    <label>科目级数</label>{{ form.account_levels }}级 ·
                    {{ form.account_code_lengths.slice(0, form.account_levels).join('-') }}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section class="param-section param-section--dashboard">
            <header class="param-section__head">
              <span class="param-section__marker" aria-hidden="true"></span>
              <h4 class="param-section__title">
                主页取数
                <span class="param-section__sub">控制主面板趋势图与统计指标分类</span>
              </h4>
            </header>
            <div class="param-section__body param-section__body--compact">
              <div class="dashboard-rule-panel">
                <span class="dashboard-rule-label">当前取数口径</span>
                <span class="dashboard-rule-current">{{ dashboardRuleSummary }}</span>
                <el-button type="primary" plain size="small" @click="openRulesDialog">
                  配置取数规则
                </el-button>
              </div>
            </div>
          </section>

          <section class="param-section param-section--switches">
            <header class="param-section__head">
              <span class="param-section__marker" aria-hidden="true"></span>
              <h4 class="param-section__title">
                业务开关
                <span class="param-section__sub">凭证流程与辅助核算相关功能</span>
              </h4>
            </header>
            <div class="param-section__body param-section__body--compact">
              <div class="param-switch-grid">
                <div class="param-switch-card">
                  <span class="param-switch-card__label">凭证审核</span>
                  <el-switch v-model="form.require_audit" size="small" inline-prompt active-text="开" inactive-text="关" />
                </div>
                <div class="param-switch-card">
                  <span class="param-switch-card__label">直接打印</span>
                  <el-switch v-model="form.direct_print" size="small" inline-prompt active-text="开" inactive-text="关" />
                </div>
                <div class="param-switch-card">
                  <span class="param-switch-card__label">凭证时序控制</span>
                  <el-switch v-model="form.voucher_time_control" size="small" inline-prompt active-text="开" inactive-text="关" />
                </div>
                <div class="param-switch-card">
                  <span class="param-switch-card__label">现金流核算</span>
                  <el-switch v-model="form.enable_cash_flow" size="small" inline-prompt active-text="开" inactive-text="关" />
                </div>
              </div>
            </div>
          </section>

          <BrandSettingsPanel :visible="brandPanelVisible" />

          <section class="param-section param-section--danger">
            <header class="param-section__head">
              <span class="param-section__marker" aria-hidden="true"></span>
              <h4 class="param-section__title">
                系统初始化
                <span class="param-section__sub">清理凭证或按标准模板重新初始化（危险操作）</span>
              </h4>
            </header>
            <div class="param-section__body param-section__body--compact">
              <SystemReinitializePanel
                :current-start-date="meta.start_date"
                :account-levels="form.account_levels"
                :account-code-lengths="form.account_code_lengths"
                @completed="handleReinitializeCompleted"
              />
            </div>
          </section>
        </div>
      </el-tab-pane>

      <!-- ── 出纳 ── -->
      <el-tab-pane label="出纳" name="cashier">
        <div class="param-sections">
          <section class="param-section param-section--basic">
            <header class="param-section__head">
              <span class="param-section__marker" aria-hidden="true"></span>
              <h4 class="param-section__title">凭证生成
                <span class="param-section__sub">出纳录入生成凭证时的默认参数</span>
              </h4>
            </header>
            <div class="param-section__body">
              <el-form label-width="130px" size="small">
                <el-form-item label="默认出纳凭证类型">
                  <el-select v-model="cashierForm.default_voucher_type_id" style="width:220px" placeholder="自动选最小编码">
                    <el-option v-for="vt in voucherTypes" :key="vt.id" :label="vt.name" :value="vt.id" />
                  </el-select>
                </el-form-item>
              </el-form>
            </div>
          </section>

          <section class="param-section param-section--danger">
            <header class="param-section__head">
              <span class="param-section__marker" aria-hidden="true"></span>
              <h4 class="param-section__title">出纳初始化
                <span class="param-section__sub">清空本账套出纳数据（危险操作，不可恢复）</span>
              </h4>
            </header>
            <div class="param-section__body param-section__body--compact">
              <ModuleResetPanel
                module-label="出纳"
                business-desc="清空出纳单据、期初余额、银行对账单"
                :reset-fn="() => cashierApi.reset()"
              />
            </div>
          </section>
        </div>
        <div style="padding:0 0 12px 0;display:flex;justify-content:flex-end">
          <el-button type="primary" size="small" @click="handleSaveCashier">保存</el-button>
        </div>
      </el-tab-pane>

      <!-- ── 资产 ── -->
      <el-tab-pane label="资产" name="asset">
        <div class="param-sections">
          <section class="param-section param-section--basic">
            <header class="param-section__head">
              <span class="param-section__marker" aria-hidden="true"></span>
              <h4 class="param-section__title">凭证生成
                <span class="param-section__sub">固定资产生成凭证时使用的凭证类型</span>
              </h4>
            </header>
            <div class="param-section__body">
              <el-form label-width="130px" size="small">
                <el-form-item label="折旧凭证类型">
                  <el-select v-model="assetForm.depr_voucher_type_id" style="width:220px" clearable placeholder="未设置则不带类型">
                    <el-option v-for="vt in voucherTypes" :key="vt.id" :label="vt.name" :value="vt.id" />
                  </el-select>
                </el-form-item>
                <el-form-item label="购买资产凭证类型">
                  <el-select v-model="assetForm.purchase_voucher_type_id" style="width:220px" clearable placeholder="未设置则不带类型">
                    <el-option v-for="vt in voucherTypes" :key="vt.id" :label="vt.name" :value="vt.id" />
                  </el-select>
                </el-form-item>
              </el-form>
            </div>
          </section>

          <section class="param-section param-section--basic">
            <header class="param-section__head">
              <span class="param-section__marker" aria-hidden="true"></span>
              <h4 class="param-section__title">折旧期间控制
                <span class="param-section__sub">折旧初始化与逐月计提顺序</span>
              </h4>
            </header>
            <div class="param-section__body">
              <el-form label-width="130px" size="small">
                <el-form-item label="折旧起始期间">
                  <el-date-picker
                    v-model="assetForm.depr_start_period"
                    type="month"
                    value-format="YYYY-MM"
                    placeholder="选择起始期间（如 2026-06）"
                    clearable
                    style="width:220px"
                  />
                </el-form-item>
                <el-form-item label=" ">
                  <span style="font-size:12px;color:var(--el-text-color-secondary);line-height:1.7">
                    设置后从该期间起须逐月计提折旧并生成凭证；前面月份未生成凭证时不允许计提后续月份。留空则不启用。
                  </span>
                </el-form-item>
              </el-form>
            </div>
          </section>

          <section class="param-section param-section--basic">
            <header class="param-section__head">
              <span class="param-section__marker" aria-hidden="true"></span>
              <h4 class="param-section__title">盘点科目
                <span class="param-section__sub">盘点生成盘盈/盘亏凭证时使用的对应科目（未配置回退 6901）</span>
              </h4>
            </header>
            <div class="param-section__body">
              <el-form label-width="130px" size="small">
                <el-form-item label="盘盈对应科目">
                  <div style="width:280px">
                    <AccountSelect v-model="assetForm.inventory_surplus_account" placeholder="盘盈凭证贷方科目" />
                  </div>
                </el-form-item>
                <el-form-item label="盘亏对应科目">
                  <div style="width:280px">
                    <AccountSelect v-model="assetForm.inventory_deficit_account" placeholder="盘亏凭证借方科目" />
                  </div>
                </el-form-item>
              </el-form>
            </div>
          </section>

          <section class="param-section param-section--danger">
            <header class="param-section__head">
              <span class="param-section__marker" aria-hidden="true"></span>
              <h4 class="param-section__title">资产初始化
                <span class="param-section__sub">清空本账套固定资产数据（危险操作，不可恢复）</span>
              </h4>
            </header>
            <div class="param-section__body param-section__body--compact">
              <ModuleResetPanel
                module-label="固定资产"
                two-mode
                business-desc="清空资产卡片、折旧、变动、盘点、工作量记录"
                all-desc="另清空 资产分类/部门/用途/状态/变动方式 等基础档案"
                :reset-fn="m => fixedAssetApi.reset(m)"
              />
            </div>
          </section>
        </div>
        <div style="padding:0 0 12px 0;display:flex;justify-content:flex-end">
          <el-button type="primary" size="small" @click="handleSaveAsset">保存</el-button>
        </div>
      </el-tab-pane>

      <!-- ── 供应链 ── -->
      <el-tab-pane label="供应链" name="supply">
        <div class="param-sections">
          <section class="param-section param-section--basic">
            <header class="param-section__head">
              <span class="param-section__marker" aria-hidden="true"></span>
              <h4 class="param-section__title">库存计价
                <span class="param-section__sub">出入库成本计算方式</span>
              </h4>
            </header>
            <div class="param-section__body">
              <el-form label-width="130px" size="small">
                <el-form-item label="计价方式">
                  <el-select v-model="scmForm.costing_method" style="width:220px" placeholder="默认移动加权平均">
                    <el-option v-for="(n,k) in SCM_COSTING" :key="k"
                      :label="COSTING_IMPLEMENTED.includes(k) ? n : n + '（开发中）'"
                      :value="k" :disabled="!COSTING_IMPLEMENTED.includes(k)" />
                  </el-select>
                </el-form-item>
                <el-form-item label=" ">
                  <span style="font-size:12px;color:var(--el-text-color-secondary);line-height:1.7">
                    目前仅「移动加权平均」已实现；全月平均/先进先出/后进先出/指定成本开发中（选用未实现方式将无法过账）。
                  </span>
                </el-form-item>
                <el-form-item label="可选币别">
                  <el-input v-model="scmForm.currencies" style="width:420px" placeholder="逗号分隔，如 CNY,USD,EUR；留空用默认" />
                </el-form-item>
                <el-form-item label="收发类别">
                  <el-input v-model="scmForm.io_categories" style="width:420px" placeholder="逗号分隔，如 领用,报废,盘盈,盘亏（其他出入库用）" />
                </el-form-item>
                <el-form-item label="运输方式">
                  <el-input v-model="scmForm.transport_methods" style="width:420px" placeholder="逗号分隔，如 自提,快递,物流,专车" />
                </el-form-item>
                <el-form-item label="单据编号规则">
                  <el-input v-model="scmForm.doc_no_rule" style="width:420px" placeholder="默认 {YYYY}{MM}-{CODE}-{SEQ:3}" />
                </el-form-item>
                <el-form-item label=" ">
                  <span style="font-size:12px;color:var(--el-text-color-secondary);line-height:1.7">
                    编号规则占位符：{YYYY}年 {YY}年后两位 {MM}月 {DD}日 {CODE}单据类型 {SEQ:n}序号(n位)。留空用默认。
                  </span>
                </el-form-item>
              </el-form>
            </div>
          </section>

          <section class="param-section param-section--basic">
            <header class="param-section__head">
              <span class="param-section__marker" aria-hidden="true"></span>
              <h4 class="param-section__title">负库存控制
                <span class="param-section__sub">按仓库控制出库、调拨、组装、拆卸、盘点等审核时是否允许库存为负</span>
              </h4>
            </header>
            <div class="param-section__body">
              <el-form label-width="130px" size="small">
                <el-form-item label="允许负库存仓库">
                  <el-select
                    v-model="scmForm.negative_stock_warehouses"
                    multiple
                    filterable
                    clearable
                    collapse-tags
                    collapse-tags-tooltip
                    placeholder="未选择则所有仓库均不允许负库存"
                    style="width:420px"
                  >
                    <el-option
                      v-for="warehouse in scmWarehouses"
                      :key="warehouse.code"
                      :label="`${warehouse.code} ${warehouse.name}`"
                      :value="warehouse.code"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item label=" ">
                  <span style="font-size:12px;color:var(--el-text-color-secondary);line-height:1.7">
                    勾选后，该仓库出库或因修改、反审核入库单造成库存为负时仍允许审核；未勾选仓库继续按库存不足拦截。
                  </span>
                </el-form-item>
              </el-form>
            </div>
          </section>

          <section class="param-section param-section--basic">
            <header class="param-section__head">
              <span class="param-section__marker" aria-hidden="true"></span>
              <h4 class="param-section__title">单据生成凭证对方科目
                <span class="param-section__sub">未填则使用标准科目兜底；往来单位配置了应收/应付科目时优先取单位科目</span>
              </h4>
            </header>
            <div class="param-section__body">
              <el-form label-width="150px" size="small">
                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-form-item label="应付账款（采购）">
                      <AccountSelect v-model="scmForm.acc_ap" :accounts="accountOptions" placeholder="默认 2202" style="width:100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="应收账款（销售）">
                      <AccountSelect v-model="scmForm.acc_ar" :accounts="accountOptions" placeholder="默认 1122" style="width:100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="主营业务收入">
                      <AccountSelect v-model="scmForm.acc_revenue" :accounts="accountOptions" placeholder="默认 6001" style="width:100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="主营业务成本">
                      <AccountSelect v-model="scmForm.acc_cost" :accounts="accountOptions" placeholder="默认 6401" style="width:100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="生产成本">
                      <AccountSelect v-model="scmForm.acc_production" :accounts="accountOptions" placeholder="默认 5001" style="width:100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="其他出入库对方科目">
                      <AccountSelect v-model="scmForm.acc_other" :accounts="accountOptions" placeholder="默认 1901 待处理财产损溢" style="width:100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="进项税（采购发票）">
                      <AccountSelect v-model="scmForm.acc_tax_input" :accounts="accountOptions" placeholder="默认 22210101" style="width:100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="销项税（销售发票）">
                      <AccountSelect v-model="scmForm.acc_tax_output" :accounts="accountOptions" placeholder="默认 22210105" style="width:100%" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
            </div>
          </section>
          <section class="param-section param-section--basic">
            <header class="param-section__head">
              <span class="param-section__marker" aria-hidden="true"></span>
              <h4 class="param-section__title">物料档案分级
                <span class="param-section__sub">参照会计科目分级，控制物料档案编码层级</span>
              </h4>
            </header>
            <div class="param-section__body">
              <el-form label-width="130px" size="small">
                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-form-item label="最大级次">
                      <el-input-number v-model="scmForm.item_levels" :min="1" :max="10" :controls="false" style="width:120px" />
                      <span style="margin-left:8px;font-size:12px;color:#909399">默认 4 级</span>
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="每级编码长度">
                      <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                        <template v-for="(_, index) in Array(scmForm.item_levels || 4)" :key="index">
                          <span v-if="index > 0" style="color: var(--el-text-color-secondary); font-size: 12px;">-</span>
                          <el-input-number
                            v-model="scmForm.item_code_lengths[index]"
                            :min="1"
                            :max="10"
                            :controls="false"
                            style="width: 52px;"
                          />
                        </template>
                      </div>
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
            </div>
          </section>

          <section class="param-section param-section--danger">
            <header class="param-section__head">
              <span class="param-section__marker" aria-hidden="true"></span>
              <h4 class="param-section__title">供应链初始化
                <span class="param-section__sub">清空本账套供应链数据（危险操作，不可恢复）</span>
              </h4>
            </header>
            <div class="param-section__body param-section__body--compact">
              <ModuleResetPanel
                module-label="供应链"
                two-mode
                business-desc="清空 单据/库存/出入库流水/批次/生产计划/往来台账/报工"
                all-desc="另清空 物料/物料分类/计量单位/往来单位/仓库/BOM 等基础档案（单据类型为系统预置，始终保留）"
                :reset-fn="m => scmApi.resetData(m)"
              />
            </div>
          </section>
        </div>
        <div style="padding:0 0 12px 0;display:flex;justify-content:flex-end">
          <el-button type="primary" size="small" @click="handleSaveScm">保存</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

    <DashboardRulesDialog
      v-model:visible="rulesDialogVisible"
      :accounting-standard="form.accounting_standard"
      v-model:rules-form="customRulesForm"
      :accounts="accountOptions"
      @update:accounting-standard="handleAccountingStandardChange"
      @confirm="confirmRulesDialog"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Setting } from '@element-plus/icons-vue'
import request from '@/api/request'
import { showError, showSuccess, showOperationError } from '@/composables/useMessage'
import { useSystemParamsStore } from '@/stores/systemParams'
import { useBaseDataStore } from '@/stores/baseData'
import DashboardRulesDialog from '@/components/system/DashboardRulesDialog.vue'
import BrandSettingsPanel from '@/components/system/BrandSettingsPanel.vue'
import SystemReinitializePanel from '@/components/system/SystemReinitializePanel.vue'
import ModuleResetPanel from '@/components/system/ModuleResetPanel.vue'
import AccountSelect from '@/components/base/AccountSelect.vue'
import type { Account } from '@/types/base'
import { scmApi, type ScmWarehouse } from '@/api/scm'
import { cashierApi } from '@/api/cashier'
import { fixedAssetApi } from '@/api/fixedAsset'

interface SystemParam {
  id?: string
  account_set_id?: string
  param_key: string
  param_value: string
}

type DashboardCategoryRules = {
  income: { codeRoots: string[]; nameKeywords: string[] }
  pureExpense: { codeRoots: string[]; nameKeywords: string[] }
  fee: { codeRoots: string[]; nameKeywords: string[] }
  cost: { codeRoots: string[]; nameKeywords: string[] }
}

const ACCOUNTING_STANDARD_LABELS: Record<string, string> = {
  auto: '自动识别',
  government: '政府会计制度',
  small_business: '小企业会计准则',
  enterprise: '新企业会计准则',
  custom: '自定义',
}

const DEFAULT_CUSTOM_RULES: DashboardCategoryRules = {
  income: { codeRoots: [], nameKeywords: [] },
  pureExpense: { codeRoots: [], nameKeywords: [] },
  fee: { codeRoots: [], nameKeywords: [] },
  cost: { codeRoots: [], nameKeywords: [] },
}

type RulesFormState = {
  incomeCodeRoots: string[]
  pureExpenseCodeRoots: string[]
  feeCodeRoots: string[]
  costCodeRoots: string[]
}

const EMPTY_RULES_FORM = (): RulesFormState => ({
  incomeCodeRoots: [],
  pureExpenseCodeRoots: [],
  feeCodeRoots: [],
  costCodeRoots: [],
})

const form = ref({
  unit_name: '',
  accounting_standard: 'auto',
  voucher_no_rule: 'by_type',
  require_audit: true,
  direct_print: false,
  voucher_time_control: false,
  enable_cash_flow: false,
  account_levels: 6,
  account_code_lengths: [4, 2, 2, 2, 2, 2, 2, 2, 2, 2],
})

const customRulesForm = ref<RulesFormState>(EMPTY_RULES_FORM())
const effectiveRulesForm = ref<RulesFormState>(EMPTY_RULES_FORM())
const storedDashboardRules = ref<DashboardCategoryRules | null>(null)

const rulesDialogVisible = ref(false)
const brandPanelVisible = ref(false)
const activeTab = ref('ledger')

// ── 出纳参数 ──────────────────────────────────────────────
interface VoucherType { id: string; code: string; name: string }
const voucherTypes = ref<VoucherType[]>([])
const cashierForm = ref({ default_voucher_type_id: '' })
const assetForm = ref({ depr_voucher_type_id: '', purchase_voucher_type_id: '', depr_start_period: '', inventory_surplus_account: '', inventory_deficit_account: '' })
const scmForm = ref({
  costing_method: '',
  acc_ap: '',
  acc_ar: '',
  acc_revenue: '',
  acc_cost: '',
  acc_production: '',
  acc_other: '',
  acc_tax_input: '',
  acc_tax_output: '',
  item_levels: 4,
  item_code_lengths: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  negative_stock_warehouses: [] as string[],
  currencies: '',
  io_categories: '',
  transport_methods: '',
  doc_no_rule: '',
})
const scmWarehouses = ref<ScmWarehouse[]>([])
const SCM_COSTING: Record<string, string> = { moving_avg: '移动加权平均', month_avg: '全月平均', fifo: '先进先出', lifo: '后进先出', specified: '指定成本' }
// 已实现的计价方式（其余在参数页禁选、过账时拦截）
const COSTING_IMPLEMENTED = ['moving_avg']
const SCM_ACC_KEYS = ['acc_ap','acc_ar','acc_revenue','acc_cost','acc_production','acc_other','acc_tax_input','acc_tax_output'] as const

async function fetchVoucherTypes() {
  if (voucherTypes.value.length) return
  try {
    const res = await request.get<VoucherType[]>('/base/voucher-types')
    voucherTypes.value = (res.data || []).sort((a, b) => a.code.localeCompare(b.code))
    // 若未设置参数，默认选最小 code
    if (!cashierForm.value.default_voucher_type_id && voucherTypes.value.length)
      cashierForm.value.default_voucher_type_id = voucherTypes.value[0].id
  } catch { /* ignore */ }
}

async function fetchScmWarehouses() {
  if (scmWarehouses.value.length) return
  try {
    const res = await scmApi.getWarehouses()
    scmWarehouses.value = (res.data || []).filter(w => w.enabled !== 0)
  } catch (error) {
    showOperationError('加载仓库列表', error)
  }
}

watch(activeTab, v => {
  if (v === 'cashier' || v === 'asset') fetchVoucherTypes()
  if (v === 'supply') fetchScmWarehouses()
})
const route = useRoute()
const baseDataStore = useBaseDataStore()

const accountOptions = computed<Account[]>(() => baseDataStore.accounts)

const dashboardRuleSummary = computed(() => {
  if (meta.value.resolved_accounting_standard_name) {
    return meta.value.resolved_accounting_standard_name
  }
  return ACCOUNTING_STANDARD_LABELS[form.value.accounting_standard] || '未设置'
})

const meta = ref({
  unit_name: '',
  start_date: '',
  current_year: new Date().getFullYear(),
  current_period: new Date().getMonth() + 1,
  resolved_accounting_standard_name: '',
  dashboard_rules_editable: false,
})

function normalizeCodeRoots(codes: string[]): string[] {
  return [...new Set(codes.map(item => String(item || '').trim()).filter(Boolean))]
}

function rulesToForm(rules: DashboardCategoryRules): RulesFormState {
  return {
    incomeCodeRoots: [...rules.income.codeRoots],
    pureExpenseCodeRoots: [...rules.pureExpense.codeRoots],
    feeCodeRoots: [...rules.fee.codeRoots],
    costCodeRoots: [...rules.cost.codeRoots],
  }
}

function formToRules(source: RulesFormState): DashboardCategoryRules {
  return {
    income: {
      codeRoots: normalizeCodeRoots(source.incomeCodeRoots),
      nameKeywords: [],
    },
    pureExpense: {
      codeRoots: normalizeCodeRoots(source.pureExpenseCodeRoots),
      nameKeywords: [],
    },
    fee: {
      codeRoots: normalizeCodeRoots(source.feeCodeRoots),
      nameKeywords: [],
    },
    cost: {
      codeRoots: normalizeCodeRoots(source.costCodeRoots),
      nameKeywords: [],
    },
  }
}

function hasAnyCustomRuleInput(formState: RulesFormState): boolean {
  return Object.values(formState).some(codes => codes.length > 0)
}

function matchAccountsByKeywords(accounts: Account[], keywords: string[]): string[] {
  if (keywords.length === 0) return []
  const codes = new Set<string>()
  for (const account of accounts) {
    const name = String(account.name || '')
    if (keywords.some(keyword => keyword && name.includes(keyword))) {
      codes.add(account.code)
    }
  }
  return [...codes]
}

function cloneRulesForm(source: RulesFormState): RulesFormState {
  return {
    incomeCodeRoots: [...source.incomeCodeRoots],
    pureExpenseCodeRoots: [...source.pureExpenseCodeRoots],
    feeCodeRoots: [...source.feeCodeRoots],
    costCodeRoots: [...source.costCodeRoots],
  }
}

function hydrateLegacyKeywordRules() {
  if (!storedDashboardRules.value || form.value.accounting_standard !== 'custom') return

  const mappings: Array<{ formKey: keyof RulesFormState; ruleKey: keyof DashboardCategoryRules }> = [
    { formKey: 'incomeCodeRoots', ruleKey: 'income' },
    { formKey: 'pureExpenseCodeRoots', ruleKey: 'pureExpense' },
    { formKey: 'feeCodeRoots', ruleKey: 'fee' },
    { formKey: 'costCodeRoots', ruleKey: 'cost' },
  ]

  for (const { formKey, ruleKey } of mappings) {
    if (customRulesForm.value[formKey].length > 0) continue
    const rule = storedDashboardRules.value[ruleKey]
    if (rule.codeRoots.length > 0) {
      customRulesForm.value[formKey] = [...rule.codeRoots]
      continue
    }
    if (rule.nameKeywords.length > 0) {
      customRulesForm.value[formKey] = matchAccountsByKeywords(
        accountOptions.value,
        rule.nameKeywords
      )
    }
  }
}

async function loadPresetForStandard(standard: string) {
  if (standard === 'custom') return
  try {
    const res = await request.get<DashboardCategoryRules>('/system/dashboard-rules-preview', {
      params: { standard },
    })
    customRulesForm.value = rulesToForm(res.data || DEFAULT_CUSTOM_RULES)
  } catch (error) {
    showOperationError('加载准则默认科目', error)
  }
}

async function ensureAccountsLoaded() {
  await baseDataStore.loadAccounts(true)
}

async function openRulesDialog() {
  await ensureAccountsLoaded()
  customRulesForm.value = cloneRulesForm(effectiveRulesForm.value)
  hydrateLegacyKeywordRules()
  rulesDialogVisible.value = true
}

async function handleAccountingStandardChange(value: string) {
  form.value.accounting_standard = value
  if (value === 'custom') {
    if (!hasAnyCustomRuleInput(customRulesForm.value)) {
      customRulesForm.value = cloneRulesForm(effectiveRulesForm.value)
    }
    return
  }
  await loadPresetForStandard(value)
}

function validateDashboardRules(): boolean {
  const rules = formToRules(customRulesForm.value)
  const allRules = [rules.income, rules.pureExpense, rules.fee, rules.cost]
  for (const rule of allRules) {
    for (const root of rule.codeRoots) {
      if (!/^[A-Za-z0-9]{1,20}$/.test(root)) {
        showError(`科目编码「${root}」格式无效，仅允许 1-20 位字母或数字`)
        return false
      }
    }
  }
  const hasAny = allRules.some(rule => rule.codeRoots.length > 0)
  if (form.value.accounting_standard === 'custom' && !hasAny) {
    showError('自定义取数规则至少需选择一类科目')
    return false
  }
  return true
}

function confirmRulesDialog() {
  if (!validateDashboardRules()) {
    return
  }
  rulesDialogVisible.value = false
}

async function fetchData() {
  try {
    const res = await request.get<SystemParam[]>('/system/params')
    const params = (res.data || []) as SystemParam[]
    for (const p of params) {
      if (p.param_key === 'unit_name') {
        form.value.unit_name = p.param_value || ''
      } else if (p.param_key === 'accounting_standard') {
        form.value.accounting_standard = p.param_value || 'auto'
      } else if (p.param_key === 'dashboard_category_rules') {
        try {
          const parsed = JSON.parse(p.param_value || '{}') as Partial<DashboardCategoryRules>
          const normalizedRules: DashboardCategoryRules = {
            income: {
              codeRoots: parsed.income?.codeRoots || [],
              nameKeywords: parsed.income?.nameKeywords || [],
            },
            pureExpense: {
              codeRoots: parsed.pureExpense?.codeRoots || [],
              nameKeywords: parsed.pureExpense?.nameKeywords || [],
            },
            fee: {
              codeRoots: parsed.fee?.codeRoots || [],
              nameKeywords: parsed.fee?.nameKeywords || [],
            },
            cost: {
              codeRoots: parsed.cost?.codeRoots || [],
              nameKeywords: parsed.cost?.nameKeywords || [],
            },
          }
          storedDashboardRules.value = normalizedRules
          customRulesForm.value = rulesToForm(normalizedRules)
        } catch {
          storedDashboardRules.value = DEFAULT_CUSTOM_RULES
          customRulesForm.value = rulesToForm(DEFAULT_CUSTOM_RULES)
        }
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
      } else if (p.param_key === 'cashier:default_voucher_type_id') {
        cashierForm.value.default_voucher_type_id = p.param_value || ''
      } else if (p.param_key === 'asset:depr_voucher_type_id') {
        assetForm.value.depr_voucher_type_id = p.param_value || ''
      } else if (p.param_key === 'asset:purchase_voucher_type_id') {
        assetForm.value.purchase_voucher_type_id = p.param_value || ''
      } else if (p.param_key === 'asset:depr_start_period') {
        assetForm.value.depr_start_period = p.param_value || ''
      } else if (p.param_key === 'asset:inventory_surplus_account') {
        assetForm.value.inventory_surplus_account = p.param_value || ''
      } else if (p.param_key === 'asset:inventory_deficit_account') {
        assetForm.value.inventory_deficit_account = p.param_value || ''
      } else if (p.param_key === 'scm:costing_method') {
        scmForm.value.costing_method = p.param_value || ''
      } else if (p.param_key === 'scm:item_levels') {
        scmForm.value.item_levels = parseInt(p.param_value) || 4
      } else if (p.param_key === 'scm:item_code_lengths') {
        const lengths = (p.param_value || '2,2,2,2').split(',').map(n => parseInt(n) || 2)
        lengths.forEach((len, i) => { if (i < 10) scmForm.value.item_code_lengths[i] = len })
      } else if (p.param_key === 'scm:negative_stock_warehouses') {
        try {
          const parsed = JSON.parse(p.param_value || '[]')
          scmForm.value.negative_stock_warehouses = Array.isArray(parsed)
            ? parsed.map(code => String(code || '').trim()).filter(Boolean)
            : []
        } catch {
          scmForm.value.negative_stock_warehouses = []
        }
      } else if (p.param_key === 'scm:currencies') {
        scmForm.value.currencies = p.param_value || ''
      } else if (p.param_key === 'scm:io_categories') {
        scmForm.value.io_categories = p.param_value || ''
      } else if (p.param_key === 'scm:transport_methods') {
        scmForm.value.transport_methods = p.param_value || ''
      } else if (p.param_key === 'scm:doc_no_rule') {
        scmForm.value.doc_no_rule = p.param_value || ''
      } else if (p.param_key.startsWith('scm:acc_')) {
        const k = p.param_key.slice('scm:'.length) as keyof typeof scmForm.value
        if (k in scmForm.value) (scmForm.value as any)[k] = p.param_value || ''
      }
    }
    const meta_ = (res as any).meta
    if (meta_) {
      meta.value = { ...meta.value, ...meta_ }
      if (meta_.dashboard_effective_rules) {
        effectiveRulesForm.value = rulesToForm(
          meta_.dashboard_effective_rules as DashboardCategoryRules
        )
      }
      if (!form.value.unit_name) {
        form.value.unit_name = meta_.unit_name || ''
      }
    }
  } catch (error) {
    showOperationError('加载系统参数', error)
  }
}

async function handleSave() {
  if (!validateDashboardRules()) {
    rulesDialogVisible.value = true
    return
  }
  try {
    const params: SystemParam[] = [
      { param_key: 'unit_name', param_value: form.value.unit_name },
      { param_key: 'accounting_standard', param_value: form.value.accounting_standard },
      {
        param_key: 'dashboard_category_rules',
        param_value: JSON.stringify(formToRules(customRulesForm.value)),
      },
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
    storedDashboardRules.value = formToRules(customRulesForm.value)
    await useSystemParamsStore().load(true)
    await fetchData()
    showSuccess('保存成功')
  } catch (error) {
    showOperationError('保存系统参数', error)
  }
}

async function handleSaveCashier() {
  try {
    await request.put('/cashier/params', {
      params: [{ param_key: 'cashier:default_voucher_type_id', param_value: cashierForm.value.default_voucher_type_id }],
    })
    showSuccess('保存成功')
  } catch (error) {
    showOperationError('保存出纳参数', error)
  }
}

async function handleSaveAsset() {
  try {
    await request.put('/asset/params', {
      params: [
        { param_key: 'asset:depr_voucher_type_id', param_value: assetForm.value.depr_voucher_type_id || '' },
        { param_key: 'asset:purchase_voucher_type_id', param_value: assetForm.value.purchase_voucher_type_id || '' },
        { param_key: 'asset:depr_start_period', param_value: assetForm.value.depr_start_period || '' },
        { param_key: 'asset:inventory_surplus_account', param_value: assetForm.value.inventory_surplus_account || '' },
        { param_key: 'asset:inventory_deficit_account', param_value: assetForm.value.inventory_deficit_account || '' },
      ],
    })
    showSuccess('保存成功')
  } catch (error) {
    showOperationError('保存资产参数', error)
  }
}

async function handleSaveScm() {
  try {
    const params = [
      { param_key: 'scm:costing_method', param_value: scmForm.value.costing_method || '' },
      ...SCM_ACC_KEYS.map(k => ({ param_key: `scm:${k}`, param_value: (scmForm.value as any)[k] || '' })),
      { param_key: 'scm:item_levels', param_value: String(scmForm.value.item_levels || 4) },
      { param_key: 'scm:item_code_lengths', param_value: scmForm.value.item_code_lengths.slice(0, scmForm.value.item_levels || 4).join(',') },
      { param_key: 'scm:negative_stock_warehouses', param_value: JSON.stringify(scmForm.value.negative_stock_warehouses || []) },
      { param_key: 'scm:currencies', param_value: scmForm.value.currencies || '' },
      { param_key: 'scm:io_categories', param_value: scmForm.value.io_categories || '' },
      { param_key: 'scm:transport_methods', param_value: scmForm.value.transport_methods || '' },
      { param_key: 'scm:doc_no_rule', param_value: scmForm.value.doc_no_rule || '' },
    ]
    await request.put('/scm/params', { params })
    showSuccess('保存成功')
  } catch (error) {
    showOperationError('保存供应链参数', error)
  }
}

async function handleReinitializeCompleted() {
  baseDataStore.invalidate()
  useSystemParamsStore().reset()
  await fetchData()
  showSuccess('系统初始化已完成，请检查科目与期初数据')
}

function syncBrandPanelFromRoute() {
  brandPanelVisible.value = route.query.openBrandSettings === '1'
}

watch(
  () => route.query.openBrandSettings,
  () => syncBrandPanelFromRoute()
)

onMounted(async () => {
  syncBrandPanelFromRoute()
  await fetchData()
  if (route.query.openDashboardRules === '1') {
    openRulesDialog()
  }
})
</script>

<style scoped>
.param-page {
  padding: 8px 12px 12px;
  gap: 10px;
}

.param-page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 2px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter, #e4e7ed);
}

.param-page-header__main {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.param-page-header__main h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
}

.param-page-header__desc {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  line-height: 1.4;
}

.param-tabs {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.param-tabs :deep(.el-tabs__header) {
  margin-bottom: 20px;
  background: transparent;
  border-bottom: none;
  padding: 0;
}
.param-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}
.param-tabs :deep(.el-tabs__item) {
  font-size: 16px;
  font-weight: 500;
  height: 48px;
  line-height: 48px;
  padding: 0 24px;
  color: var(--text-muted, #909399);
  border-radius: 12px;
  transition: all 0.2s;
  margin-right: 8px;
}
.param-tabs :deep(.el-tabs__item:hover) {
  background: rgba(18, 199, 174, 0.04);
  color: var(--mint-600, #0e9f8b);
}
.param-tabs :deep(.el-tabs__item.is-active) {
  font-size: 16px;
  font-weight: 700;
  color: var(--mint-700, #0A8576);
  background: var(--surface-brand-soft, #E8FBF7);
}
.param-tabs :deep(.el-tabs__active-bar) {
  display: none;
}
.param-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow-y: visible;
  padding: 0;
}
.param-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 200px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.param-sections {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 24px;
  align-items: start;
}

.param-section {
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.param-section--basic {
  --param-accent: var(--mint-500, #12C7AE);
}

.param-section--dashboard {
  --param-accent: var(--mint-500, #12C7AE);
}

.param-section--switches {
  --param-accent: var(--mint-500, #12C7AE);
}

.param-section--danger {
  --param-accent: #ff4d4f;
}

.param-section__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 24px 24px 16px;
  background: transparent;
  border-bottom: none;
}

.param-section__marker {
  flex-shrink: 0;
  width: 4px;
  height: 20px;
  border-radius: 4px;
  background: var(--param-accent);
  margin-top: 2px;
}

.param-section__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--mint-800, #0A8576);
  line-height: 1.4;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.param-section__sub {
  margin-left: 0;
  font-size: 13px;
  font-weight: 400;
  color: var(--text-muted, #909399);
}

.param-section__body {
  padding: 0 24px 24px;
}

.param-section__body--compact {
  padding: 0 24px 24px;
}

.param-form--inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px 24px;
}

.param-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.param-basic-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px 24px;
}

.param-meta-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.param-meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--mint-800, #0A8576);
  background: var(--mint-50, #E8FBF7);
  border: 1px solid rgba(18, 199, 174, 0.1);
  white-space: nowrap;
}

.param-meta-chip label {
  font-size: 12px;
  color: var(--mint-600, #0e9f8b);
  font-weight: 500;
}

.dashboard-rule-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  background: #f8fafc;
  padding: 12px 16px;
  border-radius: 12px;
}

.dashboard-rule-label {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
  flex-shrink: 0;
}

.dashboard-rule-current {
  font-size: 14px;
  font-weight: 600;
  color: var(--param-accent);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.param-switch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.param-switch-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid rgba(0, 0, 0, 0.04);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.param-switch-card:hover {
  background: #fff;
  box-shadow: 0 4px 12px rgba(18, 199, 174, 0.06);
  border-color: rgba(18, 199, 174, 0.2);
}

.param-switch-card__label {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary, #303133);
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .param-switch-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .param-meta-inline {
    margin-left: 0;
    width: 100%;
  }
}

@media (max-width: 640px) {
  .param-switch-grid {
    grid-template-columns: 1fr;
  }

  .param-page-header__main {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
}
</style>
