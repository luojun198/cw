<template>
  <div class="page doc-form-page">
    <!-- 顶部工具栏 -->
    <div class="doc-form-header">
      <div class="doc-form-header__left">
        <el-button link size="small" @click="goBack"><el-icon><ArrowLeft /></el-icon>返回</el-button>
        <span class="doc-form-header__sep">/</span>
        <span class="doc-form-header__title">{{ pageTitle }}</span>
        <el-tag v-if="form.doc_no" size="small" style="margin-left:8px">{{ form.doc_no }}</el-tag>
        <el-tag v-if="form.status" :type="form.status === 'audited' ? 'success' : 'info'" size="small" style="margin-left:4px">
          {{ form.status === 'audited' ? '已审核' : '草稿' }}
        </el-tag>
        <span v-if="isView && form.maker" class="doc-form-header__meta">制单：{{ form.maker }}</span>
        <span v-if="isView && form.auditor" class="doc-form-header__meta">审核：{{ form.auditor }}</span>
      </div>
      <div class="doc-form-header__right">
        <template v-if="!isView">
          <el-button size="small" @click="goBack">取消</el-button>
          <el-button type="primary" size="small" :loading="saving" @click="handleSave">保存</el-button>
        </template>
        <template v-else>
          <el-button v-if="form.status === 'draft' && !isLocked" size="small" type="primary" @click="goEdit">编辑</el-button>
          <el-button size="small" @click="goPrint"><el-icon><Printer /></el-icon>打印</el-button>
          <el-tag v-if="isLocked" type="warning" size="small" effect="plain" style="margin-right:4px">🔒 已下推锁定</el-tag>
          <el-button v-if="canDispatch" type="warning" size="small" plain @click="goDispatch">
            缺货分析/智能下推
          </el-button>
          <el-button v-if="canGenPO" type="info" size="small" plain :loading="genningDoc === 'PQ'" @click="handleGenPurchaseDocs('PQ')">
            生成询价单
          </el-button>
          <el-button v-if="canGenPO" type="primary" size="small" :loading="genningDownstream" @click="handleGenDownstream">
            预览并生成下游单据
          </el-button>
          <el-button v-if="canPush" type="success" size="small" @click="handlePush">
            下推{{ pushLabel(form.doc_type) }}
          </el-button>
        </template>
      </div>
    </div>

    <!-- 单据头 -->
    <div class="doc-form-body">
      <el-form :model="form" label-width="80px" size="small" :disabled="isView">
        <el-row :gutter="16">
          <el-col :span="6">
            <el-form-item label="日期" required>
              <el-date-picker v-model="form.doc_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="单据号">
              <el-input :model-value="form.doc_no" disabled />
            </el-form-item>
          </el-col>
          <el-col v-if="hcol('warehouse')" :span="6">
            <el-form-item :label="isTransfer ? '调出仓' : '仓库'" :required="isTransfer || isShipment">
              <div style="display:flex;gap:4px;width:100%">
                <el-select v-model="form.warehouse_code" clearable filterable style="flex:1">
                  <el-option v-for="w in warehouses" :key="w.code" :label="`${w.code} ${w.name}`" :value="w.code" />
                </el-select>
                <el-button v-if="!isView" size="small" title="新增仓库" @click="openQuickArc('warehouse')"><el-icon><Plus /></el-icon></el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col v-if="hcol('partner')" :span="6">
            <el-form-item :label="isCustomerDoc ? '客户' : '往来单位'" :required="isCustomerDoc">
              <div style="display:flex;gap:4px;width:100%">
                <el-autocomplete
                  v-model="partnerSearch"
                  :fetch-suggestions="queryPartners"
                  :disabled="isView"
                  placeholder="编号/名称模糊搜索"
                  value-key="label"
                  clearable
                  style="flex:1"
                  @select="onPartnerSelect"
                  @clear="() => { form.partner_code = ''; partnerSearch = '' }"
                />
                <el-button v-if="!isView" size="small" :title="isCustomerDoc ? '新增客户' : '新增往来单位'" @click="openQuickArc('partner')"><el-icon><Plus /></el-icon></el-button>
              </div>
              <el-tag v-if="priceMode === 'sale' && currentPartner" size="small" type="success" effect="plain" style="margin-top:4px">
                {{ Number(currentPartner.price_level) || 1 }} 级售价
              </el-tag>
            </el-form-item>
          </el-col>
          <el-col v-if="hcol('biz_person')" :span="6">
            <el-form-item label="业务员">
              <div style="display:flex;gap:4px;width:100%">
                <el-select v-model="form.biz_person" filterable allow-create clearable default-first-option placeholder="选择/输入业务员" style="flex:1">
                  <el-option v-for="p in persons" :key="p.id" :value="p.name" :label="p.code ? `${p.code} ${p.name}` : p.name" />
                </el-select>
                <el-button size="small" title="新增人员到辅助核算" @click="openAuxAdd('person')"><el-icon><Plus /></el-icon></el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col v-if="hcol('dept')" :span="6">
            <el-form-item label="部门">
              <div style="display:flex;gap:4px;width:100%">
                <el-select v-model="form.dept_code" filterable allow-create clearable default-first-option placeholder="选择/输入部门" style="flex:1">
                  <el-option v-for="d in depts" :key="d.id" :value="d.code" :label="d.code ? `${d.code} ${d.name}` : d.name" />
                </el-select>
                <el-button size="small" title="新增部门到辅助核算" @click="openAuxAdd('dept')"><el-icon><Plus /></el-icon></el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col v-if="showIoCategory" :span="6">
            <el-form-item label="收发类别">
              <div style="display:flex;gap:4px;width:100%">
                <el-select v-model="form.io_category" filterable allow-create clearable default-first-option placeholder="选择/输入收发类别" style="flex:1">
                  <el-option v-for="c in ioCategoryOptions" :key="c" :value="c" :label="c" />
                </el-select>
                <el-button v-if="!isView" size="small" title="新增收发类别到字典" @click="quickDict('io')"><el-icon><Plus /></el-icon></el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col v-if="showTransport" :span="6">
            <el-form-item label="运输方式">
              <div style="display:flex;gap:4px;width:100%">
                <el-select v-model="form.transport_method" filterable allow-create clearable default-first-option placeholder="选择/输入运输方式" style="flex:1">
                  <el-option v-for="m in transportOptions" :key="m" :value="m" :label="m" />
                </el-select>
                <el-button v-if="!isView" size="small" title="新增运输方式到字典" @click="quickDict('transport')"><el-icon><Plus /></el-icon></el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col v-if="hcol('contract')" :span="6">
            <el-form-item label="合同号">
              <el-input v-model="form.contract_no" placeholder="可留空" />
            </el-form-item>
          </el-col>
          <el-col v-if="hcol('payment')" :span="6">
            <el-form-item label="付款方式">
              <el-select v-model="form.payment_type" clearable style="width:100%">
                <el-option label="现金" value="cash" />
                <el-option label="转账" value="transfer" />
                <el-option label="挂账" value="credit" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col v-if="hcol('settle_account')" :span="6">
            <el-form-item label="结算方式">
              <div style="display:flex;gap:4px;width:100%">
                <el-select v-model="form.settle_account" filterable allow-create clearable default-first-option placeholder="选择/输入结算方式" style="flex:1">
                  <el-option v-for="s in settleTypes" :key="s.id || s.code || s.name" :value="s.name" :label="s.name" />
                </el-select>
                <el-button v-if="!isView" size="small" title="新增结算方式" @click="quickAddSettle"><el-icon><Plus /></el-icon></el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col v-if="hcol('currency')" :span="6">
            <el-form-item label="币别">
              <div style="display:flex;gap:4px;width:100%">
                <el-select v-model="form.currency" filterable allow-create clearable default-first-option placeholder="CNY" style="flex:1">
                  <el-option v-for="c in currencyOptions" :key="c" :value="c" :label="c" />
                </el-select>
                <el-button v-if="!isView" size="small" title="新增币别到字典" @click="quickDict('currency')"><el-icon><Plus /></el-icon></el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col v-if="hcol('discount')" :span="6">
            <el-form-item label="整单折扣(折)">
              <el-input-number v-model="form.discount_rate" :min="0" :max="10" :precision="2" :controls="false" style="width:100%" placeholder="如9.9折填9.9，10折=原价" />
            </el-form-item>
          </el-col>
          <el-col v-if="hcol('expect_date')" :span="6">
            <el-form-item label="预计交期">
              <el-date-picker v-model="form.expect_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col v-if="hcol('credit')" :span="6">
            <el-form-item label="账期(天)">
              <el-input-number v-model="form.credit_days" :min="0" :precision="0" :controls="false" style="width:100%" />
            </el-form-item>
          </el-col>
          <template v-if="hcol('invoice')">
            <el-col :span="6">
              <el-form-item label="发票种类">
                <el-select v-model="form.invoice_type" clearable style="width:100%">
                  <el-option label="增值税专用发票" value="special" />
                  <el-option label="增值税普通发票" value="normal" />
                  <el-option label="收据" value="receipt" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="发票号">
                <el-input v-model="form.invoice_no" placeholder="可留空" />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="发票日期">
                <el-date-picker v-model="form.invoice_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
              </el-form-item>
            </el-col>
          </template>
          <el-col :span="6">
            <el-form-item label="经手人">
              <el-input v-model="form.operator" placeholder="可留空" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="备注">
              <el-input v-model="form.remark" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <!-- 关联单据链条 -->
      <div v-if="(sourceDocs && sourceDocs.length) || (targetDocs && targetDocs.length)" class="doc-relation-bar">
        <span v-if="sourceDocs && sourceDocs.length" class="relation-item">
          <span class="relation-label">上游来源：</span>
          <span v-for="sd in sourceDocs" :key="sd.id" class="target-doc-item" style="margin-right:12px; display:inline-flex; align-items:center;">
            <el-link type="primary" size="small" @click="viewRelationDoc(sd.id)">
              [{{ typeName(sd.doc_type) }}] {{ sd.doc_no }}
            </el-link>
            <el-tag size="small" :type="sd.status === 'audited' ? 'success' : 'info'" style="margin-left:4px">
              {{ sd.status === 'audited' ? '已审核' : '草稿' }}
            </el-tag>
          </span>
        </span>
        <span v-if="targetDocs && targetDocs.length" class="relation-item" style="margin-left:24px">
          <span class="relation-label">下游关联：</span>
          <span v-for="td in targetDocs" :key="td.id" class="target-doc-item" style="margin-right:12px; display:inline-flex; align-items:center;">
            <el-link type="primary" size="small" @click="viewRelationDoc(td.id)">
              [{{ typeName(td.doc_type) }}] {{ td.doc_no }}
            </el-link>
            <el-tag size="small" :type="td.status === 'audited' ? 'success' : 'info'" style="margin-left:4px">
              {{ td.status === 'audited' ? '已审核' : '草稿' }}
            </el-tag>
          </span>
        </span>
      </div>

      <!-- 已被下游引用锁定提示 -->
      <el-alert v-if="isLocked && isView" type="warning" show-icon :closable="false" style="margin-bottom:10px">
        本单已被下游单据引用并锁定，不可修改/删除；如需调整请先删除下游单据。
      </el-alert>

      <!-- 单据类型提示 -->
      <el-alert v-if="isTransfer && !isView" type="info" show-icon :closable="false" style="margin-bottom:10px">
        调拨单：<b>调出仓</b>在上方「调出仓」选择；<b>调入仓</b>在下表每行的「调入仓」列分别指定（可不同行不同仓）。
      </el-alert>
      <el-alert v-if="isCount && !isView" type="info" show-icon :closable="false" style="margin-bottom:10px">
        盘点单：「数量」列填写<b>实盘数量</b>（账面数由系统自动与实盘比较，盘盈自动入库、盘亏自动出库）。
      </el-alert>

      <!-- 明细行工具栏 -->
      <div class="doc-lines-toolbar">
        <template v-if="!isView">
          <el-button size="small" @click="addLine"><el-icon><Plus /></el-icon>添加行</el-button>
          <el-button v-if="showBinCol" size="small" @click="openQuickArc('bin')"><el-icon><Plus /></el-icon>新增库位</el-button>
          <el-button v-if="canSelectSource" size="small" type="primary" plain @click="sourcePickerVisible = true">
            <el-icon><Connection /></el-icon>选择源单（{{ typeName(sourceType || '') }}）
          </el-button>
          <template v-if="isProduction">
            <el-select v-model="selectedBom" placeholder="选择BOM" size="small" style="width:200px" clearable>
              <el-option v-for="b in boms" :key="b.id" :label="`${b.code} ${b.item_code}`" :value="b.id" />
            </el-select>
            <el-button size="small" :disabled="!selectedBom" @click="handleBomExplode">
              <el-icon><Connection /></el-icon>从BOM展开
            </el-button>
          </template>
        </template>
        <el-button v-if="isPurchaseOrSale" size="small" :loading="stockLoading" @click="loadRealtimeStock">
          <el-icon><Goods /></el-icon>查询实时库存
        </el-button>
        <el-popover v-if="canColScheme" placement="bottom-start" :width="220" trigger="click">
          <template #reference>
            <el-button size="small" plain><el-icon><Setting /></el-icon>列设置</el-button>
          </template>
          <div class="line-col-setting">
            <div class="line-col-setting__hd">
              <span>显示列</span>
              <el-button link type="primary" size="small" @click="router.push('/scm/col-schemes')">方案管理</el-button>
            </div>
            <el-checkbox-group v-model="lineVisibleKeys" class="line-col-setting__group">
              <el-checkbox v-for="c in availableLineOptCols" :key="c.key" :value="c.key" size="small">{{ c.label }}</el-checkbox>
            </el-checkbox-group>
            <div v-if="!availableLineOptCols.length" class="line-col-setting__empty">当前单据无可选列</div>
          </div>
        </el-popover>
        <span class="doc-lines-summary">
          合计数量：{{ fmt(totalQty) }}　合计金额：¥{{ fmt(totalAmount) }}
          <span v-if="isInvoice">　价税合计：¥{{ fmt(totalTaxAmount) }}</span>
        </span>
      </div>

      <!-- 明细表格 -->
      <el-table :data="lines" border size="small" :height="tableHeight" style="width:100%" @cell-click="handleCellClick" @cell-dblclick="handleCellDblClick" class="compact-data-table">
        <el-table-column label="#" width="44" align="center" fixed="left">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column label="编号" min-width="140" fixed="left" prop="item_code">
          <template #default="{ row, $index }">
            <template v-if="isView">
              <span>{{ row.item_code }}</span>
            </template>
            <template v-else>
              <ItemPicker v-if="isEditing($index, 'item_code')" v-model="row.item_code" :warehouse-code="row.warehouse_code || form.warehouse_code" auto-open :focus-search="itemPickerFocusSearch" :browsable="false" @pick="(item:any) => { onItemPick(row, item); stopEdit() }" />
              <div v-else class="editable-cell">{{ row.item_code || '点击选择物料' }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="名称" min-width="170" prop="item_name" show-overflow-tooltip />
        <el-table-column label="规格" min-width="120" prop="spec" show-overflow-tooltip />
        <el-table-column :label="isTransfer ? '调入仓' : '仓库'" width="130" prop="warehouse_code">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ row.warehouse_code }}</template>
            <template v-else>
              <el-select v-if="isEditing($index, 'warehouse_code')" v-model="row.warehouse_code" :placeholder="isTransfer ? '必填调入仓' : '覆盖头部仓库'" filterable clearable size="small" style="width:100%" @change="stopEdit" @visible-change="v => !v && stopEdit()" v-focus>
                <el-option v-for="w in warehouses" :key="w.code" :label="w.code" :value="w.code" />
              </el-select>
              <div v-else class="editable-cell">{{ row.warehouse_code }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column :label="isCount ? '实盘数量' : '数量'" width="110" align="right" prop="qty">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ row.qty }}</template>
            <template v-else>
              <el-input-number v-if="isEditing($index, 'qty')" v-model="row.qty" :min="0" :precision="3" size="small" :controls="false" style="width:100%" @change="recalcRow(row)" @blur="stopEdit" v-focus />
              <div v-else class="editable-cell">{{ row.qty }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="stockShown && lineColShown('realtime_stock')" label="实时库存" width="150" align="right">
          <template #default="{ row }"><span class="rt-stock">{{ stockText(row) }}</span></template>
        </el-table-column>
        <el-table-column v-if="isMr" label="来源" width="110" prop="source_type">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ SOURCE_TYPES[row.source_type] || '采购' }}</template>
            <template v-else>
              <el-select v-if="isEditing($index, 'source_type')" v-model="row.source_type" size="small" style="width:100%" @change="row.supplier_code = ''; stopEdit()" @visible-change="v => !v && stopEdit()" v-focus>
                <el-option v-for="(n, k) in SOURCE_TYPES" :key="k" :label="n" :value="k" />
              </el-select>
              <div v-else class="editable-cell">{{ SOURCE_TYPES[row.source_type] || '采购' }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="isMr" label="供应商/委外厂" width="190" prop="supplier_code">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ supplierLabel(row.supplier_code || row.item_supplier) }}</template>
            <template v-else>
              <el-select v-if="isEditing($index, 'supplier_code')" v-model="row.supplier_code" :placeholder="row.source_type === 'self' ? '自制无需' : '默认取物料'" :disabled="row.source_type === 'self'" filterable clearable size="small" style="width:100%" @change="stopEdit" @visible-change="v => !v && stopEdit()" v-focus>
                <el-option v-for="p in rowSupplierOptions(row)" :key="p.code" :label="`${p.code} ${p.name}`" :value="p.code" />
              </el-select>
              <div v-else class="editable-cell">{{ row.source_type === 'self' ? '—' : ((row.supplier_code || row.item_supplier) ? supplierLabel(row.supplier_code || row.item_supplier) : '点击选择') }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="showPushCol && isView" label="下推进度" width="120" align="center">
          <template #default="{ row }">
            <template v-if="(Number(row.qty) || 0) > 0">
              <span :class="(row.pushed_qty || 0) >= row.qty ? 'text-success' : ((row.pushed_qty || 0) > 0 ? 'text-warning' : 'text-muted')">
                {{ row.pushed_qty || 0 }} / {{ row.qty }}
              </span>
            </template>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column v-if="!isMr" label="单价" width="120" align="right" prop="price">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ row.price }}</template>
            <template v-else>
              <el-input-number v-if="isEditing($index, 'price')" v-model="row.price" :min="0" :precision="4" size="small" :controls="false" style="width:100%" @change="recalcRow(row)" @blur="stopEdit" v-focus />
              <div v-else class="editable-cell">{{ row.price }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="col('price_with_tax') && lineColShown('price_with_tax')" label="含税单价" width="120" align="right" prop="price_with_tax">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ row.price_with_tax }}</template>
            <template v-else>
              <el-input-number v-if="isEditing($index, 'price_with_tax')" v-model="row.price_with_tax" :min="0" :precision="4" size="small" :controls="false" style="width:100%" @change="recalcFromTaxPrice(row)" @blur="stopEdit" v-focus />
              <div v-else class="editable-cell">{{ row.price_with_tax }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="col('discount_rate') && lineColShown('discount_rate')" label="折扣(折)" width="90" align="right" prop="discount_rate">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ (Number(row.discount_rate) || 0) > 0 ? row.discount_rate + ' 折' : '—' }}</template>
            <template v-else>
              <el-input-number v-if="isEditing($index, 'discount_rate')" v-model="row.discount_rate" :min="0" :max="10" :precision="2" size="small" :controls="false" style="width:100%" @change="recalcRow(row)" @blur="stopEdit" v-focus />
              <div v-else class="editable-cell">{{ row.discount_rate }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }">{{ fmt(row.amount || 0) }}</template>
        </el-table-column>
        <el-table-column v-if="col('tax_rate') && lineColShown('tax_rate')" label="税率%" width="90" align="right" prop="tax_rate">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ row.tax_rate || 0 }}%</template>
            <template v-else>
              <el-input-number v-if="isEditing($index, 'tax_rate')" v-model="row.tax_rate" :min="0" :max="100" :precision="1" size="small" :controls="false" style="width:100%" @change="recalcTax(row)" @blur="stopEdit" v-focus />
              <div v-else class="editable-cell">{{ row.tax_rate }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="col('tax_amount') && lineColShown('tax_amount')" label="税额" width="110" align="right" prop="tax_amount">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ fmt(row.tax_amount || 0) }}</template>
            <template v-else>
              <el-input-number v-if="isEditing($index, 'tax_amount')" v-model="row.tax_amount" :min="0" :precision="2" size="small" :controls="false" style="width:100%" @blur="stopEdit" v-focus />
              <div v-else class="editable-cell">{{ row.tax_amount }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="col('tax_amount') && lineColShown('gross_amount')" label="价税合计" width="130" align="right" prop="gross_amount">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ fmt(grossOf(row)) }}</template>
            <template v-else>
              <el-input-number v-if="isEditing($index, 'gross_amount')" v-model="row.gross_amount" :min="0" :precision="2" size="small" :controls="false" style="width:100%" @change="recalcFromGross(row)" @blur="stopEdit" v-focus />
              <div v-else class="editable-cell">{{ fmt(grossOf(row)) }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="showBatchCols && lineColShown('batch_no')" label="批号" width="120" prop="batch_no">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ row.batch_no }}</template>
            <template v-else>
              <el-input v-if="isEditing($index, 'batch_no')" v-model="row.batch_no" size="small" :placeholder="row._batch && row._batchMode === 'manual' ? '手工选批必填' : '留空按单号'" @blur="stopEdit" v-focus />
              <div v-else class="editable-cell">{{ row.batch_no }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="showBatchCols && lineColShown('produce_date')" label="生产日期" width="140" prop="produce_date">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ row.produce_date }}</template>
            <template v-else>
              <el-date-picker v-if="isEditing($index, 'produce_date')" v-model="row.produce_date" type="date" value-format="YYYY-MM-DD" size="small" style="width:100%" @change="stopEdit" v-focus />
              <div v-else class="editable-cell">{{ row.produce_date }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="(showBatchCols || col('expire_date')) && lineColShown('expire_date')" label="保质期" width="140" prop="expire_date">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ row.expire_date }}</template>
            <template v-else>
              <el-date-picker v-if="isEditing($index, 'expire_date')" v-model="row.expire_date" type="date" value-format="YYYY-MM-DD" size="small" style="width:100%" @change="stopEdit" v-focus />
              <div v-else class="editable-cell">{{ row.expire_date }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="showBinCol && lineColShown('bin_no')" label="库位" width="130" prop="bin_no">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ row.bin_no }}</template>
            <template v-else>
              <el-select v-if="isEditing($index, 'bin_no')" v-model="row.bin_no" filterable clearable size="small" style="width:100%" @change="stopEdit" v-focus>
                <el-option v-for="b in binsForWh(row.warehouse_code)" :key="b.id" :value="b.code" :label="`${b.code} ${b.name}`" />
              </el-select>
              <div v-else class="editable-cell">{{ row.bin_no }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="showSerialCols" label="序列号" width="130" align="center">
          <template #default="{ row }">
            <template v-if="row._serial">
              <el-button v-if="!isView" link type="primary" size="small" @click="openSerialDialog(row)">
                {{ serialCount(row) }}/{{ Number(row.qty) || 0 }} 录入
              </el-button>
              <span v-else>{{ serialCount(row) }} 个</span>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column v-if="col('scrap_rate') && lineColShown('scrap_rate')" label="损耗%" width="90" align="right" prop="scrap_rate">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ row.scrap_rate || 0 }}%</template>
            <template v-else>
              <el-input-number v-if="isEditing($index, 'scrap_rate')" v-model="row.scrap_rate" :min="0" :max="100" :precision="2" size="small" :controls="false" style="width:100%" @blur="stopEdit" v-focus />
              <div v-else class="editable-cell">{{ row.scrap_rate }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="col('process_fee') && lineColShown('process_fee')" label="加工费" width="110" align="right" prop="process_fee">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ fmt(row.process_fee || 0) }}</template>
            <template v-else>
              <el-input-number v-if="isEditing($index, 'process_fee')" v-model="row.process_fee" :min="0" :precision="2" size="small" :controls="false" style="width:100%" @blur="stopEdit" v-focus />
              <div v-else class="editable-cell">{{ row.process_fee }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="form.status === 'audited'" label="成本单价" width="110" align="right">
          <template #default="{ row }">{{ row.unit_cost ? fmt(row.unit_cost) : '—' }}</template>
        </el-table-column>
        <el-table-column v-if="lineColShown('remark')" label="备注" min-width="120" prop="remark">
          <template #default="{ row, $index }">
            <template v-if="isView">{{ row.remark }}</template>
            <template v-else>
              <el-input v-if="isEditing($index, 'remark')" v-model="row.remark" size="small" @blur="stopEdit" v-focus />
              <div v-else class="editable-cell">{{ row.remark }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="!isView" label="" width="44" align="center" fixed="right">
          <template #default="{ $index }">
            <el-button link type="danger" size="small" @click="removeLine($index)">删</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 批量选择物料对话框（双击物料列触发） -->
    <ItemBatchPicker
      v-model="batchPickerVisible"
      @confirm="onBatchPickConfirm"
    />

    <!-- 选择源单对话框（订单→下游单据 反向选单，支持多对一合并） -->
    <SourceDocPicker
      v-if="sourceType"
      v-model="sourcePickerVisible"
      :source-doc-type="sourceType"
      :partner-code="form.partner_code"
      @confirm="onSourcePick"
    />

    <!-- 快捷新增 往来单位/仓库/库位 档案 -->
    <el-dialog v-model="quickArcVisible" :title="quickArcTitle" width="400px" append-to-body>
      <el-form label-width="72px" size="small">
        <el-form-item v-if="quickArcKind === 'bin'" label="仓库" required>
          <el-select v-model="quickArcForm.warehouse_code" filterable placeholder="选择仓库" style="width:100%">
            <el-option v-for="w in warehouses" :key="w.code" :label="`${w.code} ${w.name}`" :value="w.code" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="quickArcKind === 'partner'" label="类型" required>
          <el-select v-model="quickArcForm.partner_type" style="width:100%">
            <el-option label="客户" value="customer" />
            <el-option label="供应商" value="supplier" />
            <el-option label="双向" value="both" />
          </el-select>
        </el-form-item>
        <el-form-item label="编码" required>
          <el-input v-model="quickArcForm.code" placeholder="自动生成，可修改" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="quickArcForm.name" placeholder="名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="quickArcVisible = false">取消</el-button>
        <el-button type="primary" :loading="quickArcSaving" @click="confirmQuickArc">保存并选用</el-button>
      </template>
    </el-dialog>

    <!-- 快捷新增 业务员/部门 到辅助核算 -->
    <el-dialog v-model="auxAddVisible" :title="auxAddType === 'person' ? '新增人员（辅助核算）' : '新增部门（辅助核算）'" width="380px" append-to-body>
      <el-form label-width="64px" size="small">
        <el-form-item label="编码" required>
          <el-input v-model="auxAddForm.code" placeholder="自动生成，可修改" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="auxAddForm.name" :placeholder="auxAddType === 'person' ? '姓名' : '部门名称'" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="auxAddVisible = false">取消</el-button>
        <el-button type="primary" :loading="auxAddSaving" @click="confirmAuxAdd">保存并选用</el-button>
      </template>
    </el-dialog>

    <!-- 序列号录入对话框：每行一个序列号 -->
    <el-dialog v-model="serialDialogVisible" title="录入序列号" width="420px" append-to-body>
      <div style="margin-bottom:8px;color:var(--el-text-color-secondary);font-size:13px">
        {{ serialRow?.item_code }} {{ serialRow?.item_name || '' }} · 需 {{ Number(serialRow?.qty) || 0 }} 个（每行一个）
      </div>
      <el-input v-model="serialText" type="textarea" :rows="8" placeholder="每行一个序列号，可粘贴" />
      <div style="margin-top:6px;font-size:12px" :class="serialTextCount === (Number(serialRow?.qty) || 0) ? 'serial-ok' : 'serial-warn'">
        已填 {{ serialTextCount }} / {{ Number(serialRow?.qty) || 0 }}
      </div>
      <template #footer>
        <el-button @click="serialDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmSerials">确定</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onActivated, onDeactivated, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Plus, Connection, Goods, Printer, Setting } from '@element-plus/icons-vue'
import { scmApi, SOURCE_TYPES, type ScmDocType } from '@/api/scm'
import { LINE_OPT_COLS } from '@/config/scmColumns'
import { hasPermission } from '@/utils/permission'
import ItemPicker from '@/components/scm/ItemPicker.vue'
import ItemBatchPicker from '@/components/scm/ItemBatchPicker.vue'
import SourceDocPicker from '@/components/scm/SourceDocPicker.vue'

const route  = useRoute()
const router = useRouter()

// 路由模式判断
const isNew  = computed(() => route.name === 'ScmDocNew')
const isView = computed(() => route.name === 'ScmDocView')
const editId = computed(() => isNew.value ? null : (route.params.id as string))
const initDocType = computed(() => (route.query.doc_type as string) || '')
const initSourceDocId = computed(() => (route.query.source_doc_id as string) || '')

const types       = ref<ScmDocType[]>([])
const warehouses  = ref<any[]>([])
const allPartners = ref<any[]>([])
const persons     = ref<any[]>([])  // 业务员（人员核算档案）
const depts       = ref<any[]>([])  // 部门（部门核算档案）
const personCatId = ref('')         // 人员核算 类别id
const deptCatId   = ref('')         // 部门核算 类别id
const settleTypes = ref<any[]>([])  // 结算方式（出纳结算字典）
const currencyOptions = ref<string[]>(['CNY', 'USD', 'EUR', 'HKD', 'JPY', 'GBP'])  // 币别字典（scm:currencies 可覆盖）
const ioCategoryOptions = ref<string[]>([])   // 收发类别字典（scm:io_categories）
const transportOptions  = ref<string[]>([])   // 运输方式字典（scm:transport_methods）
const bins        = ref<any[]>([])  // 库位档案（参考用）
const partnerSearch = ref('')
const boms        = ref<any[]>([])
const selectedBom = ref('')
const saving      = ref(false)

const isProduction = computed(() => ['PL','PF','PB','PJ','AS','DS'].includes(form.value.doc_type))
const isInvoice    = computed(() => ['RP','RS'].includes(form.value.doc_type))
const isTransfer   = computed(() => form.value.doc_type === 'TR')
const isCount      = computed(() => form.value.doc_type === 'CK')
const isShipment   = computed(() => form.value.doc_type === 'SO')
const isMr         = computed(() => form.value.doc_type === 'MR')
// 销售类单据：往来单位（客户）必填（销售报价、销售订单、销售出库）
const isCustomerDoc = computed(() => ['SQ', 'SOa', 'SO'].includes(form.value.doc_type))

// 采购/销售类单据：支持「查询实时库存」（含订单/入出库/退货/发票）
const isPurchaseOrSale = computed(() => ['PQ','PO','PI','PR','RP','SQ','SOa','SO','SR','RS'].includes(form.value.doc_type))
// 收发类别（其他出入库/盘点/调拨）；运输方式（销售/采购出入库与退货）
const showIoCategory = computed(() => ['OI','OO','TR','CK'].includes(form.value.doc_type))
const showTransport  = computed(() => ['SO','SR','PI','PR'].includes(form.value.doc_type))

// ── 取价口径（多级售价/价格政策） ──────────────────────────────────────
const SALE_DOCS = ['SQ', 'SOa', 'SO', 'SR', 'RS']
const PURCHASE_DOCS = ['PQ', 'PO', 'PI', 'PR', 'RP']
const priceMode = computed<'sale' | 'purchase' | 'cost'>(() =>
  SALE_DOCS.includes(form.value.doc_type) ? 'sale'
    : PURCHASE_DOCS.includes(form.value.doc_type) ? 'purchase' : 'cost')
// 当前往来单位（用于销售取价等级）
const currentPartner = computed(() => allPartners.value.find((p: any) => p.code === form.value.partner_code))
// 按价格等级取售价（缺该档则回退一级售价）
function salePriceByLevel(item: any, level: any): number {
  const lv = [1, 2, 3].includes(Number(level)) ? Number(level) : 1
  const p = lv === 3 ? item.sale_price3 : lv === 2 ? item.sale_price2 : item.sale_price
  return Number(p) || Number(item.sale_price) || 0
}
// 开单按单据类型取价：销售→按客户等级售价；采购→进价；其他→参考成本
function pickItemPrice(item: any): number {
  if (priceMode.value === 'sale') return salePriceByLevel(item, currentPartner.value?.price_level)
  if (priceMode.value === 'purchase') return Number(item.purchase_price) || Number(item.ref_cost) || 0
  return Number(item.ref_cost) || Number(item.purchase_price) || 0
}
const stockShown = ref(false)
const stockLoading = ref(false)
const stockByWh = ref<Record<string, Record<string, number>>>({})
const stockTotal = ref<Record<string, number>>({})
async function loadRealtimeStock() {
  stockLoading.value = true
  try {
    const r = await scmApi.getStock()
    const byWh: Record<string, Record<string, number>> = {}
    const total: Record<string, number> = {}
    for (const s of (r.code === 0 ? (r.data || []) : []) as any[]) {
      const item = s.item_code; const wh = s.warehouse_code || ''; const qty = Number(s.qty) || 0
      if (!byWh[item]) byWh[item] = {}
      byWh[item][wh] = (byWh[item][wh] || 0) + qty
      total[item] = (total[item] || 0) + qty
    }
    stockByWh.value = byWh
    stockTotal.value = total
    stockShown.value = true
  } finally {
    stockLoading.value = false
  }
}
const stockNum = (v: number) => {
  const n = Number(v) || 0
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '')
}
function stockText(row: any): string {
  if (!row?.item_code) return '—'
  const total = stockTotal.value[row.item_code] || 0
  const wh = row.warehouse_code || form.value.warehouse_code
  if (wh) {
    const whQty = stockByWh.value[row.item_code]?.[wh] || 0
    return `本仓 ${stockNum(whQty)} / 合计 ${stockNum(total)}`
  }
  return `合计 ${stockNum(total)}`
}
// 缺料单行供应商候选：委外行→委外厂，其余→供应商/双向
function rowSupplierOptions(row: any) {
  if (row?.source_type === 'outsource') return allPartners.value.filter((p: any) => p.enabled !== 0 && p.is_outsource === 1)
  return allPartners.value.filter((p: any) => {
    const t = String(p.partner_type || '')
    return p.enabled !== 0 && (!t || /supplier|供应|both|2/i.test(t))
  })
}

// ── 单据类型字段配置（差异化表单）──
const parseCfg = (s?: string): string[] => { try { return s ? JSON.parse(s) : [] } catch { return [] } }
const typeConfig = computed(() => {
  const t = types.value.find(x => x.code === form.value.doc_type)
  return {
    header: parseCfg(t?.header_fields),
    line: parseCfg(t?.line_fields),
    required: parseCfg(t?.required_fields),
  }
})
// 表头字段块：有配置用配置，否则兜底显示往来单位+仓库（兼容未知类型）
const headerCols = computed<Set<string>>(() => new Set(typeConfig.value.header.length ? typeConfig.value.header : ['partner', 'warehouse']))
const hcol = (k: string) => headerCols.value.has(k)
// 明细列：有配置用配置，否则按旧逻辑兜底（发票类带税率税额）
const lineCols = computed<Set<string>>(() => {
  if (typeConfig.value.line.length) return new Set(typeConfig.value.line)
  const s = new Set(['item', 'warehouse', 'qty', 'price'])
  if (isInvoice.value) { s.add('tax_rate'); s.add('tax_amount') }
  return s
})
const col = (k: string) => lineCols.value.has(k)
// 批次列：配置开启 或 行内存在批次管理物料时显示
const showBatchCols = computed(() => col('batch_no') || lines.value.some((l: any) => l._batch))
// 序列号列：行内存在序列号管理物料时显示
const showSerialCols = computed(() => lines.value.some((l: any) => l._serial))
// 库位列：系统中已建库位档案时显示（参考用）
const showBinCol = computed(() => bins.value.length > 0)
const binsForWh = (wh: string) => bins.value.filter((b: any) => b.warehouse_code === (wh || form.value.warehouse_code))

// ── 列方案（管理员建方案分配用户；有 scm:colscheme 权限者可临时调整，无权限锁定）──
const canColScheme = computed(() => hasPermission('scm:colscheme'))
/** 被隐藏的明细列 key 集合：初始来自分配给当前用户的方案，有权限者可在 popover 内临时增减 */
const lineHidden = ref<Set<string>>(new Set())
const lineColShown = (key: string) => !lineHidden.value.has(key)
/** 每个可选列在当前单据类型下是否"本就会出现"（方案只能在可用列里做隐藏） */
function lineColAvailable(key: string): boolean {
  switch (key) {
    case 'realtime_stock': return stockShown.value
    case 'price_with_tax': return col('price_with_tax')
    case 'discount_rate':  return col('discount_rate')
    case 'tax_rate':       return col('tax_rate')
    case 'tax_amount':
    case 'gross_amount':   return col('tax_amount')
    case 'batch_no':
    case 'produce_date':   return showBatchCols.value
    case 'expire_date':    return showBatchCols.value || col('expire_date')
    case 'bin_no':         return showBinCol.value
    case 'scrap_rate':     return col('scrap_rate')
    case 'process_fee':    return col('process_fee')
    case 'remark':         return true
    default: return false
  }
}
const availableLineOptCols = computed(() => LINE_OPT_COLS.filter(c => lineColAvailable(c.key)))
/** popover 勾选模型：勾选=显示；改动只更新当前可用列的隐藏态（本地临时，不落库） */
const lineVisibleKeys = computed<string[]>({
  get: () => availableLineOptCols.value.filter(c => !lineHidden.value.has(c.key)).map(c => c.key),
  set: (vis: string[]) => {
    const visSet = new Set(vis)
    const next = new Set(lineHidden.value)
    for (const c of availableLineOptCols.value) {
      if (visSet.has(c.key)) next.delete(c.key)
      else next.add(c.key)
    }
    lineHidden.value = next
  },
})
async function loadLineColScheme() {
  const dt = form.value.doc_type
  if (!dt) return
  try {
    const res = await scmApi.getMyColScheme({ target: 'line', doc_type: dt })
    if (res.code === 0) lineHidden.value = new Set(res.data.hidden_cols || [])
  } catch { /* 无方案则全显示 */ }
}

const DOC_TITLE: Record<string, string> = {
  PI:'采购入库', PR:'采购退货', SO:'销售出库', SR:'销售退货',
  OI:'其他入库', OO:'其他出库', TR:'调拨单', CK:'盘点单',
  PL:'生产领用', PF:'完工入库', PS:'不良品入库', PB:'补料单', PJ:'退料单',
  WO:'委外发货', WI:'委外入库', AS:'组装单', DS:'拆卸单',
  PO:'采购订单', PQ:'采购询价', SQ:'销售报价', SOa:'销售订单',
  RP:'采购发票', RS:'销售发票', PAY:'付款单', RCV:'收款单', MR:'缺料单',
}

const pageTitle = computed(() => {
  const typeName = DOC_TITLE[form.value.doc_type] || form.value.doc_type || '单据'
  if (isNew.value) return `新增${typeName}`
  if (isView.value) return `查看${typeName}`
  return `编辑${typeName}`
})

const tableHeight = computed(() => 'calc(100vh - 290px)')

const form = ref<Record<string, any>>({
  doc_type: '', doc_no: '', doc_date: new Date().toISOString().slice(0, 10),
  warehouse_code: '', partner_code: '', operator: '', remark: '', status: 'draft', bom_id: '', source_doc_id: '',
  biz_person: '', dept_code: '', payment_type: '', settle_account: '', invoice_type: '', invoice_no: '', invoice_date: '',
  contract_no: '', currency: 'CNY', exchange_rate: 1, discount_rate: 0, expect_date: '', credit_days: 0,
  io_category: '', transport_method: '',
})
const lines = ref<Array<Record<string, any>>>([])

// 单据类型确定后（新增取路由、编辑/查看取加载结果）加载当前用户的列方案。
// 注意：必须在 form 定义之后再注册 watch，否则 immediate 求值时 form 处于 TDZ。
watch(() => form.value.doc_type, loadLineColScheme, { immediate: true })

const sourceDoc = ref<any>(null)
const sourceDocs = ref<any[]>([])
const targetDocs = ref<any[]>([])
const sourcePickerVisible = ref(false)

const PUSH_MAP: Record<string, string> = {
  PO: 'PI',   // 采购订单→采购入库
  PQ: 'PO',   // 采购询价→采购订单
  SOa:'SO',   // 销售订单→销售出库
  SQ: 'SOa',  // 销售报价→销售订单
}
const PUSH_LABEL: Record<string, string> = {
  PO: '采购入库', PQ: '采购订单', SOa:'销售出库', SQ:'销售订单',
}
// 下游单据 → 源单类型（PUSH_MAP 反向），用于「选择源单」反向选单
const SOURCE_MAP: Record<string, string> = {
  PI: 'PO', PO: 'PQ', SO: 'SOa', SOa: 'SQ',
}
function pushTarget(docType: string): string | undefined { return PUSH_MAP[docType] }
function pushLabel(docType: string): string { return PUSH_LABEL[docType] || '' }
// 当前单据可反向选择的源单类型（仅新增/编辑态可用）
const sourceType = computed(() => (!isView.value ? SOURCE_MAP[form.value.doc_type] : undefined))
// 是否显示「选择源单」：新增/编辑态 + 存在可选源单类型；
// 但若本单已有「异类型来源」（如缺料单下推的采购订单，来源是 MR 而非 PQ），则不再显示。
const canSelectSource = computed(() => {
  if (isView.value || !sourceType.value) return false
  if (sourceDocs.value.length && !sourceDocs.value.some(s => s.doc_type === sourceType.value)) return false
  return true
})

// 选择源单回调：把源单剩余明细追加到当前明细（支持多对一合并）
function onSourcePick(payload: { lines: any[]; partner_code: string }) {
  const incoming = payload.lines || []
  if (!incoming.length) return
  // 往来单位：表单为空则用源单的
  if (!form.value.partner_code && payload.partner_code) {
    form.value.partner_code = payload.partner_code
    const p = allPartners.value.find(x => x.code === payload.partner_code)
    partnerSearch.value = p ? `${p.code} ${p.name}` : payload.partner_code
  }
  // 每行补全仓库（用表单仓库兜底）并追加；去掉当前的空行
  const rows = incoming.map(l => ({ ...l, warehouse_code: l.warehouse_code || form.value.warehouse_code }))
  const kept = lines.value.filter(l => l.item_code)
  lines.value = [...kept, ...rows]
  ElMessage.success(`已带入 ${rows.length} 行明细`)
}

// 本单是否可下推：可查看、已审核、存在下推目标，且未完全下推
const fullyPushed = computed(() =>
  lines.value.length > 0 && lines.value.every(l => (Number(l.pushed_qty) || 0) >= (Number(l.qty) || 0))
)
const canPush = computed(() =>
  isView.value && form.value.status === 'audited' && !!pushTarget(form.value.doc_type) && !fullyPushed.value
)
// 本单是否已被下游引用（即被锁定）
const isLocked = computed(() => targetDocs.value.length > 0)
// 该类型单据是否参与下推链路（决定是否展示行级进度列）
const showPushCol = computed(() => !!pushTarget(form.value.doc_type))

function handlePush() {
  const target = PUSH_MAP[form.value.doc_type]
  if (!target) return
  router.push({ name: 'ScmDocNew', query: { doc_type: target, source_doc_id: editId.value } })
}

// 销售订单（SOa）已审核且未完全下推 → 可做缺货分析/智能下推（全页面）
const canDispatch = computed(() =>
  isView.value && form.value.doc_type === 'SOa' && form.value.status === 'audited' && !fullyPushed.value
)
function goDispatch() {
  if (editId.value) router.push({ name: 'ScmDocDispatch', params: { id: editId.value } })
}

// 供应商编码 → 展示文本
function supplierLabel(code?: string) {
  if (!code) return ''
  const p = allPartners.value.find((x: any) => x.code === code)
  return p ? `${p.code} ${p.name}` : code
}

// 缺料单（MR）已审核且未完全下推 → 可生成采购订单（按供应商拆单）
const canGenPO = computed(() =>
  isView.value && isMr.value && form.value.status === 'audited' && !fullyPushed.value
)
// 缺料单按行物料来源自动路由生成下游（采购→PO、委外→委外计划、自制→生产计划）
const genningDownstream = ref(false)
async function handleGenDownstream() {
  if (!editId.value) return
  router.push({ name: 'ScmMrPushPreview', params: { id: editId.value }, query: { from: 'view' } })
}

const genningDoc = ref<'' | 'PO' | 'PQ'>('')
async function handleGenPurchaseDocs(target: 'PO' | 'PQ') {
  if (!editId.value) return
  genningDoc.value = target
  try {
    const res = await scmApi.genPurchaseDocs(editId.value, target)
    if (res.code === 0) {
      const label = target === 'PQ' ? '询价单' : '采购订单'
      ElMessage.success(`已按供应商生成 ${res.data.created} 张${label}`)
      router.push({ name: 'ScmDocList', query: { doc_type: target } })
    }
  } finally {
    genningDoc.value = ''
  }
}

const typeName = (c: string) => DOC_TITLE[c] || c

function viewRelationDoc(id: string) {
  router.push(`/scm/docs/${id}`)
}

const fmt = (v: number) => (v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// 整单折扣（折）系数：N折=合计×N/10；<=0 表示不折扣
const headerDiscountFactor = computed(() => {
  const hd = Number(form.value.discount_rate) || 0
  return hd > 0 ? hd / 10 : 1
})
const totalQty       = computed(() => lines.value.reduce((s, l) => s + (Number(l.qty) || 0), 0))
const totalAmount    = computed(() => round2(lines.value.reduce((s, l) => s + (Number(l.amount) || 0), 0) * headerDiscountFactor.value))
const totalTaxAmount = computed(() => round2(lines.value.reduce((s, l) => s + (Number(l.amount) || 0) + (Number(l.tax_amount) || 0), 0) * headerDiscountFactor.value))
// 税额合计（含头部折扣）：落库到 scm_doc.total_tax，供单据列表「价税合计」列使用
const totalTax = computed(() => round2(lines.value.reduce((s, l) => s + (Number(l.tax_amount) || 0), 0) * headerDiscountFactor.value))

const editingCell = ref<{rowIndex: number, field: string} | null>(null)
/** 双击物料列时为 true，ItemPicker 聚焦下拉检索框 */
const itemPickerFocusSearch = ref(false)
/** 批量选择器是否可见 */
const batchPickerVisible = ref(false)

// ── 快捷新增 业务员/部门 到辅助核算 ────────────────────────
const auxAddVisible = ref(false)
const auxAddType = ref<'person' | 'dept'>('person')
const auxAddSaving = ref(false)
const auxAddForm = ref<{ code: string; name: string }>({ code: '', name: '' })
// 据现有档案编码自动推下一个号：沿用最大号的前缀与位宽，无则用默认前缀+001
function nextAuxCode(list: any[], defaultPrefix: string): string {
  const parsed = list
    .map(it => String(it.code || '').match(/^(.*?)(\d+)$/))
    .filter(Boolean)
    .map(m => ({ prefix: m![1], num: parseInt(m![2]), width: m![2].length }))
  if (!parsed.length) return `${defaultPrefix}001`
  parsed.sort((a, b) => b.num - a.num)
  const prefix = parsed[0].prefix
  const width = Math.max(parsed[0].width, 3)
  const max = Math.max(...parsed.filter(p => p.prefix === prefix).map(p => p.num))
  return `${prefix}${String(max + 1).padStart(width, '0')}`
}
function openAuxAdd(type: 'person' | 'dept') {
  auxAddType.value = type
  const list = type === 'person' ? persons.value : depts.value
  auxAddForm.value = { code: nextAuxCode(list, type === 'person' ? 'RY' : 'BM'), name: '' }
  auxAddVisible.value = true
}
async function confirmAuxAdd() {
  const { code, name } = auxAddForm.value
  if (!code.trim() || !name.trim()) return ElMessage.warning('编码和名称不能为空')
  const catId = auxAddType.value === 'person' ? personCatId.value : deptCatId.value
  if (!catId) return ElMessage.error('辅助核算未启用该类别，请先在「辅助核算」中初始化，或直接在上方输入')
  auxAddSaving.value = true
  try {
    const r = await scmApi.createAuxItem({ type: catId, code: code.trim(), name: name.trim() })
    if (r.code === 0) {
      ElMessage.success('已新增并选用')
      if (auxAddType.value === 'person') {
        const lr = await scmApi.getAuxItemsByCategory(catId); if (lr.code === 0) persons.value = lr.data || []
        form.value.biz_person = name.trim()
      } else {
        const lr = await scmApi.getAuxItemsByCategory(catId); if (lr.code === 0) depts.value = lr.data || []
        form.value.dept_code = code.trim()
      }
      auxAddVisible.value = false
    } else ElMessage.error(r.message || '新增失败')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '新增失败')
  } finally { auxAddSaving.value = false }
}

// ── 快捷新增 往来单位 / 仓库 / 库位 档案 ────────────────────
const quickArcVisible = ref(false)
const quickArcKind = ref<'partner' | 'warehouse' | 'bin'>('partner')
const quickArcSaving = ref(false)
const quickArcForm = ref<{ code: string; name: string; partner_type: string; warehouse_code: string }>({ code: '', name: '', partner_type: 'both', warehouse_code: '' })
const quickArcTitle = computed(() => quickArcKind.value === 'partner'
  ? (isCustomerDoc.value ? '新增客户' : '新增往来单位')
  : quickArcKind.value === 'warehouse' ? '新增仓库' : '新增库位')
// 按单据类型推断往来单位默认类型
function defaultPartnerType(): string {
  if (SALE_DOCS.includes(form.value.doc_type)) return 'customer'
  if (PURCHASE_DOCS.includes(form.value.doc_type) || ['WO', 'WI'].includes(form.value.doc_type)) return 'supplier'
  return 'both'
}
async function openQuickArc(kind: 'partner' | 'warehouse' | 'bin') {
  quickArcKind.value = kind
  quickArcForm.value = { code: '', name: '', partner_type: defaultPartnerType(), warehouse_code: form.value.warehouse_code || '' }
  quickArcVisible.value = true
  try {
    if (kind === 'partner') { const r = await scmApi.getPartnerNextNo(quickArcForm.value.partner_type); if (r.code === 0) quickArcForm.value.code = r.data.next_no }
    else if (kind === 'warehouse') { const r = await scmApi.getWarehouseNextNo(); if (r.code === 0) quickArcForm.value.code = r.data.next_no }
    else { quickArcForm.value.code = nextAuxCode(binsForWh(quickArcForm.value.warehouse_code), 'KW') }
  } catch { /* 取号失败留空，用户可手填 */ }
}
async function confirmQuickArc() {
  const f = quickArcForm.value
  if (!f.code.trim() || !f.name.trim()) return ElMessage.warning('编码和名称不能为空')
  if (quickArcKind.value === 'bin' && !f.warehouse_code) return ElMessage.warning('请先选择仓库')
  quickArcSaving.value = true
  try {
    if (quickArcKind.value === 'partner') {
      const r = await scmApi.createPartner({ code: f.code.trim(), name: f.name.trim(), partner_type: f.partner_type })
      if (r.code !== 0) throw new Error(r.message)
      const lr = await scmApi.getPartners({}); if (lr.code === 0) allPartners.value = lr.data
      form.value.partner_code = f.code.trim(); partnerSearch.value = `${f.code.trim()} ${f.name.trim()}`
    } else if (quickArcKind.value === 'warehouse') {
      const r = await scmApi.createWarehouse({ code: f.code.trim(), name: f.name.trim() })
      if (r.code !== 0) throw new Error(r.message)
      const lr = await scmApi.getWarehouses(); if (lr.code === 0) warehouses.value = lr.data
      form.value.warehouse_code = f.code.trim()
    } else {
      const r = await scmApi.createBin({ warehouse_code: f.warehouse_code, code: f.code.trim(), name: f.name.trim() })
      if (r.code !== 0) throw new Error(r.message)
      const lr = await scmApi.getBins(); if (lr.code === 0) bins.value = (lr.data || []).filter((b: any) => b.enabled !== 0)
    }
    ElMessage.success('已新增并选用')
    quickArcVisible.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '新增失败')
  } finally { quickArcSaving.value = false }
}

// ── 快捷新增 字典值（收发类别/运输方式/币别） ──────────────
async function quickDict(kind: 'io' | 'transport' | 'currency') {
  const meta = {
    io: { label: '收发类别', key: 'scm:io_categories', opts: ioCategoryOptions, set: (v: string) => form.value.io_category = v },
    transport: { label: '运输方式', key: 'scm:transport_methods', opts: transportOptions, set: (v: string) => form.value.transport_method = v },
    currency: { label: '币别', key: 'scm:currencies', opts: currencyOptions, set: (v: string) => form.value.currency = v },
  }[kind]
  try {
    const { value } = await ElMessageBox.prompt(`输入新${meta.label}`, `新增${meta.label}`, { inputPattern: /\S+/, inputErrorMessage: '不能为空' })
    const v = String(value).trim()
    if (meta.opts.value.includes(v)) { meta.set(v); return ElMessage.info('该值已存在，已选用') }
    const merged = [...meta.opts.value, v]
    await scmApi.saveParams([{ param_key: meta.key, param_value: merged.join(',') }])
    meta.opts.value = merged
    meta.set(v)
    ElMessage.success(`已新增${meta.label}：${v}`)
  } catch { /* 取消 */ }
}

// ── 快捷新增 结算方式（settle_type 表） ────────────────────
async function quickAddSettle() {
  try {
    const { value } = await ElMessageBox.prompt('输入结算方式名称', '新增结算方式', { inputPattern: /\S+/, inputErrorMessage: '不能为空' })
    const name = String(value).trim()
    const code = nextAuxCode(settleTypes.value, 'JS')
    const r = await scmApi.createSettleType({ code, name })
    if (r.code !== 0) throw new Error(r.message)
    const lr = await scmApi.getSettleTypes(); if (lr.code === 0) settleTypes.value = lr.data || []
    form.value.settle_account = name
    ElMessage.success(`已新增结算方式：${name}`)
  } catch (e: any) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e?.response?.data?.message || e.message)
  }
}

// ── 序列号录入 ────────────────────────────────────────────
const serialDialogVisible = ref(false)
const serialRow = ref<any>(null)
const serialText = ref('')
const parseSerialText = (t: string) => t.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)
const serialTextCount = computed(() => parseSerialText(serialText.value).length)
const serialCount = (row: any) => Array.isArray(row.serial_nos) ? row.serial_nos.length : parseSerialText(String(row.serial_nos || '')).length
function openSerialDialog(row: any) {
  serialRow.value = row
  const cur = Array.isArray(row.serial_nos) ? row.serial_nos : parseSerialText(String(row.serial_nos || ''))
  serialText.value = cur.join('\n')
  serialDialogVisible.value = true
}
function confirmSerials() {
  const arr = parseSerialText(serialText.value)
  const dup = arr.filter((s, i) => arr.indexOf(s) !== i)
  if (dup.length) return ElMessage.warning(`序列号重复：${[...new Set(dup)].join(', ')}`)
  if (serialRow.value) serialRow.value.serial_nos = arr
  serialDialogVisible.value = false
}
/** 触发批量选择的行索引（-1 表示追加到末尾） */
const batchPickerRowIndex = ref(-1)
const vFocus = {
  mounted: (el: HTMLElement) => {
    nextTick(() => {
      const input = (el.tagName === 'INPUT' ? el : el.querySelector('input')) as HTMLInputElement | null
      if (input) {
        input.focus()
        input.select()
      }
    })
  }
}

function isEditing(rowIndex: number, field: string) {
  return editingCell.value?.rowIndex === rowIndex && editingCell.value?.field === field
}

function handleCellClick(row: any, column: any) {
  if (isView.value) return
  const rowIndex = lines.value.indexOf(row)
  const field = column.property
  if (field === 'item_code') {
    itemPickerFocusSearch.value = false
    editingCell.value = { rowIndex, field }
    return
  }
  if (['warehouse_code', 'qty', 'price', 'price_with_tax', 'discount_rate', 'tax_rate', 'tax_amount', 'gross_amount', 'batch_no', 'produce_date', 'expire_date', 'bin_no', 'scrap_rate', 'process_fee', 'remark', 'supplier_code', 'source_type'].includes(field)) {
    // 价税合计为派生缓存字段，进入编辑前先补初值，避免输入框为空
    if (field === 'gross_amount' && row.gross_amount == null) row.gross_amount = round2(grossOf(row))
    editingCell.value = { rowIndex, field }
  }
}

function handleCellDblClick(row: any, column: any) {
  if (isView.value) return
  if (column.property !== 'item_code') return
  // 双击：打开全页面批量选择器
  stopEdit()
  batchPickerRowIndex.value = lines.value.indexOf(row)
  batchPickerVisible.value = true
}

/** 批量选择器确认回调：在触发行位置插入选中物料行 */
function onBatchPickConfirm(items: any[]) {
  if (!items.length) return
  const rowIndex = batchPickerRowIndex.value
  const newLines = items.map(item => ({
    item_code: item.code,
    item_name: item.name || '',
    spec: item.spec || '',
    supplier_code: item.supplier_code || '',
    source_type: item.source_type || 'purchase',
    item_supplier: item.supplier_code || '',
    warehouse_code: form.value.warehouse_code,
    qty: 0,
    price: pickItemPrice(item),
    amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    remark: '',
    price_with_tax: 0, discount_rate: 0, batch_no: '', produce_date: '', expire_date: '', bin_no: '', scrap_rate: 0, process_fee: 0,
    _sp: [Number(item.sale_price) || 0, Number(item.sale_price2) || 0, Number(item.sale_price3) || 0],
    _moq: Number(item.min_order_qty) || 0,
    _batch: Number(item.batch_flag) || 0,
    _batchMode: item.batch_out_mode || 'fifo',
    _serial: Number(item.serial_flag) || 0,
  }))
  if (rowIndex >= 0 && rowIndex < lines.value.length) {
    const currentRow = lines.value[rowIndex]
    // 若触发行是空行（无物料），用第一个替换它，其余插入后面
    if (!currentRow.item_code) {
      Object.assign(currentRow, newLines[0])
      recalcRow(currentRow)
      lines.value.splice(rowIndex + 1, 0, ...newLines.slice(1))
    } else {
      // 触发行有内容，在其后插入所有选中行
      lines.value.splice(rowIndex + 1, 0, ...newLines)
    }
  } else {
    // 追加到末尾
    lines.value.push(...newLines)
  }
  ElMessage.success(`已添加 ${items.length} 行物料`)
}

function stopEdit() {
  editingCell.value = null
  itemPickerFocusSearch.value = false
}

// 基础数据（类型/仓库/往来单位/业务员/部门/结算方式）仅需加载一次
async function loadMeta() {
  const [ts, ws, ps] = await Promise.all([scmApi.getDocTypes(), scmApi.getWarehouses(), scmApi.getPartners({})])
  if (ts.code === 0) types.value = ts.data
  if (ws.code === 0) warehouses.value = ws.data
  if (ps.code === 0) allPartners.value = ps.data
  // 复用财务辅助核算：业务员=人员、部门（aux_items.type 存类别id，需先解析类别）；失败不阻塞开单
  scmApi.getAuxCategories().then(async r => {
    if (r.code !== 0) return
    const cats = r.data || []
    personCatId.value = cats.find((c: any) => c.code === 'person')?.id || ''
    deptCatId.value = cats.find((c: any) => c.code === 'dept')?.id || ''
    if (personCatId.value) { const pr = await scmApi.getAuxItemsByCategory(personCatId.value); if (pr.code === 0) persons.value = pr.data || [] }
    if (deptCatId.value) { const dr = await scmApi.getAuxItemsByCategory(deptCatId.value); if (dr.code === 0) depts.value = dr.data || [] }
  }).catch(() => {})
  scmApi.getSettleTypes().then(r => { if (r.code === 0) settleTypes.value = r.data || [] }).catch(() => {})
  scmApi.getBins().then(r => { if (r.code === 0) bins.value = (r.data || []).filter((b: any) => b.enabled !== 0) }).catch(() => {})
  scmApi.getParams().then(r => {
    if (r.code !== 0) return
    const pv = (k: string) => r.data.find(p => p.param_key === k)?.param_value || ''
    const split = (s: string) => s.split(/[,，\s]+/).map(x => x.trim()).filter(Boolean)
    const cur = split(pv('scm:currencies')); if (cur.length) currencyOptions.value = cur
    ioCategoryOptions.value = split(pv('scm:io_categories'))
    transportOptions.value = split(pv('scm:transport_methods'))
  }).catch(() => {})
}

// 重置为空白表单
function resetForm() {
  form.value = {
    doc_type: '', doc_no: '', doc_date: new Date().toISOString().slice(0, 10),
    warehouse_code: '', partner_code: '', operator: '', remark: '', status: 'draft', bom_id: '', source_doc_id: '',
  biz_person: '', dept_code: '', payment_type: '', settle_account: '', invoice_type: '', invoice_no: '', invoice_date: '',
  contract_no: '', currency: 'CNY', exchange_rate: 1, discount_rate: 0, expect_date: '', credit_days: 0,
  }
  lines.value = []
  partnerSearch.value = ''
  selectedBom.value = ''
  editingCell.value = null
  sourceDoc.value = null
  sourceDocs.value = []
  targetDocs.value = []
}

// 当前路由对应的单据身份键：用于判断 keep-alive 复用时是否需要重新初始化
function currentDocKey() {
  return isNew.value
    ? `new|${initDocType.value}|${initSourceDocId.value}`
    : `${String(route.name)}|${editId.value || ''}`
}
let initedKey = ''
// 离开新增页后置位：下次激活时强制刷新为干净表单（避免复用同一实例时残留上一单数据）
let needReinitOnActivate = false

async function initForm() {
  initedKey = currentDocKey()
  resetForm()
  if (isNew.value) {
    form.value.doc_type = initDocType.value
    lines.value = [newLine()]
    if (form.value.doc_type) {
      try { const r = await scmApi.getDocNextNo(form.value.doc_type); if (r.code === 0) form.value.doc_no = r.data.next_no } catch { }
    }
    // 下推：从源单加载数据
    if (initSourceDocId.value) {
      form.value.source_doc_id = initSourceDocId.value
      await loadSourceDoc(initSourceDocId.value)
    }
  } else if (editId.value) {
    await loadDoc(editId.value)
  }
}

onMounted(async () => {
  await loadMeta()
  await initForm()
})

// keep-alive 会按缓存键复用同一组件实例（onMounted 不再重跑）。
// 复用时若不重新初始化，会出现 doc_type/明细等沿用上一单的数据：
//  · 下推/切换不同单据类型 → 单据身份键变化 → 重新初始化
//  · 新增页离开后再次进入（保存/取消/切菜单）→ needReinitOnActivate → 刷新为干净表单
onActivated(() => {
  if (needReinitOnActivate) { needReinitOnActivate = false; initForm(); return }
  if (currentDocKey() !== initedKey) initForm()
})

// 离开新增页时标记：下次回到新增页应是一张全新单据，而非残留的上一单。
// 注意 onDeactivated 触发时路由已切走，不能用 isNew.value 判断；
// 改用本实例初始化时记录的 initedKey（新增页以 "new|" 开头）。
onDeactivated(() => {
  if (initedKey.startsWith('new|')) needReinitOnActivate = true
})

async function loadDoc(id: string) {
  const res = await scmApi.getDoc(id)
  if (res.code !== 0) return
  const d = res.data as any
  form.value = {
    doc_type: d.doc_type, doc_no: d.doc_no, doc_date: d.doc_date,
    warehouse_code: d.warehouse_code || '', partner_code: d.partner_code || '',
    operator: d.operator || '', remark: d.remark || '', status: d.status,
    maker: d.maker || '', auditor: d.auditor || '', audited_at: d.audited_at || '',
    bom_id: d.bom_id || '', source_doc_id: d.source_doc_id || '',
    biz_person: d.biz_person || '', dept_code: d.dept_code || '', payment_type: d.payment_type || '',
    settle_account: d.settle_account || '', invoice_type: d.invoice_type || '', invoice_no: d.invoice_no || '',
    invoice_date: d.invoice_date || '', contract_no: d.contract_no || '', currency: d.currency || 'CNY',
    exchange_rate: d.exchange_rate ?? 1, discount_rate: d.discount_rate || 0, expect_date: d.expect_date || '', credit_days: d.credit_days || 0,
    io_category: d.io_category || '', transport_method: d.transport_method || '',
  }
  sourceDoc.value = d.source_doc || null
  sourceDocs.value = d.source_docs || (d.source_doc ? [d.source_doc] : [])
  targetDocs.value = d.target_docs || []
  if (d.bom_id) selectedBom.value = d.bom_id
  if (d.partner_code) {
    const p = allPartners.value.find(x => x.code === d.partner_code)
    partnerSearch.value = p ? `${p.code} ${p.name}` : d.partner_code
  }
  lines.value = (d.lines || []).map((l: any) => ({
    id: l.id, item_code: l.item_code, item_name: l.item_name || '', spec: l.spec || '',
    warehouse_code: l.warehouse_code || '', qty: l.qty, pushed_qty: l.pushed_qty || 0,
    price: l.price || 0, amount: l.amount || 0, unit_cost: l.unit_cost || 0,
    tax_rate: l.tax_rate || 0, tax_amount: l.tax_amount || 0, remark: l.remark || '',
    price_with_tax: l.price_with_tax || 0, discount_rate: l.discount_rate || 0, batch_no: l.batch_no || '',
    produce_date: l.produce_date || '', expire_date: l.expire_date || '', bin_no: l.bin_no || '', scrap_rate: l.scrap_rate || 0, process_fee: l.process_fee || 0,
    supplier_code: l.supplier_code || '', source_type: l.source_type || 'purchase', item_supplier: l.item_supplier || '',
    serial_nos: l.serial_nos ? (() => { try { return JSON.parse(l.serial_nos) } catch { return parseSerialText(String(l.serial_nos)) } })() : [],
    // 显示控制：据已有数据推断是否批次/序列号行（loadDoc 不含物料开关）
    _batch: (l.batch_no || l.produce_date || l.expire_date) ? 1 : 0,
    _serial: l.serial_nos ? 1 : 0,
  }))
}

// 监听 editId，如果跳转到关联的同类型页面，需要重新初始化数据
watch(editId, (newId) => {
  if (newId) {
    loadDoc(newId)
  }
})

// 从源单加载数据（订单下推）
async function loadSourceDoc(sourceId: string) {
  const res = await scmApi.getDoc(sourceId)
  if (res.code !== 0) return
  const s = res.data as any
  // 新建下游单时即展示上游来源（关联条），让下游单据知道来源
  sourceDoc.value = { id: s.id, doc_no: s.doc_no, doc_type: s.doc_type, status: s.status }
  sourceDocs.value = [sourceDoc.value]
  // 复制源单头部信息
  form.value.partner_code = s.partner_code || ''
  form.value.warehouse_code = s.warehouse_code || ''
  form.value.remark = s.remark || ''
  form.value.operator = s.operator || ''
  if (s.partner_code) {
    const p = allPartners.value.find(x => x.code === s.partner_code)
    partnerSearch.value = p ? `${p.code} ${p.name}` : s.partner_code
  }
  // 复制源单明细行：按「剩余可下推数量 = 数量 - 已下推」预填，已下推完的行跳过
  if (s.lines && s.lines.length) {
    const rows = s.lines
      .map((l: any) => ({ l, remain: (Number(l.qty) || 0) - (Number(l.pushed_qty) || 0) }))
      .filter(({ remain }: any) => remain > 0)
      .map(({ l, remain }: any) => {
        const price = Number(l.price) || 0
        return {
          item_code: l.item_code, item_name: l.item_name || '', spec: l.spec || '',
          warehouse_code: l.warehouse_code || form.value.warehouse_code,
          qty: remain, price, amount: Math.round(remain * price * 100) / 100, unit_cost: l.unit_cost || 0,
          tax_rate: 0, tax_amount: 0, remark: l.remark || '',
          source_line_id: l.id,
        }
      })
    // 若源单已全部下推完，至少保留一空行避免空表格
    lines.value = rows.length ? rows : [newLine()]
  }
}

watch(() => form.value.doc_type, () => {
  if (isProduction.value) scmApi.getBoms().then(r => { if (r.code === 0) boms.value = r.data })
})

function newLine(): Record<string, any> {
  return { item_code: '', item_name: '', spec: '', warehouse_code: form.value.warehouse_code, qty: 0, price: 0, amount: 0, tax_rate: 0, tax_amount: 0, remark: '',
    price_with_tax: 0, discount_rate: 0, batch_no: '', expire_date: '', scrap_rate: 0, process_fee: 0 }
}
function addLine() { lines.value.push(newLine()) }
function removeLine(i: number) { if (lines.value.length > 1) lines.value.splice(i, 1) }

const round2 = (v: number) => Math.round(v * 100) / 100
const round4 = (v: number) => Math.round(v * 10000) / 10000
// 价税合计 = 不含税金额 + 税额；优先取缓存字段，未初始化时即时计算兜底
const grossOf = (row: any) => Number(row.gross_amount != null ? row.gross_amount : (Number(row.amount) || 0) + (Number(row.tax_amount) || 0))
// 只算金额/税额（不改单价、含税单价），与后端 calcLine 一致
function applyAmounts(row: any) {
  const qty = Number(row.qty) || 0
  const price = Number(row.price) || 0
  const dr = Number(row.discount_rate) || 0
  const gross = qty * price
  // 折扣口径（中国式「折」）：dr 为折率，N折=原价×N/10；dr<=0 表示不折扣（原价）
  const factor = dr > 0 ? dr / 10 : 1
  row.amount = round2(gross * factor)
  row.discount_amount = round2(gross - row.amount)
  const tr = Number(row.tax_rate) || 0
  row.tax_amount = tr > 0 ? round2(row.amount * tr / 100) : (Number(row.tax_amount) || 0)
  // 同步价税合计缓存，供展示列与「价税合计反算」共用
  row.gross_amount = round2((Number(row.amount) || 0) + (Number(row.tax_amount) || 0))
}
// 编辑 数量/单价/折扣：同步含税单价 + 金额
function recalcRow(row: any) {
  const tr = Number(row.tax_rate) || 0
  if (tr > 0) row.price_with_tax = round4((Number(row.price) || 0) * (1 + tr / 100))
  applyAmounts(row)
}
// 编辑 税率：重算含税单价与税额
function recalcTax(row: any) {
  const tr = Number(row.tax_rate) || 0
  if (tr > 0) row.price_with_tax = round4((Number(row.price) || 0) * (1 + tr / 100))
  applyAmounts(row)
}
// 编辑 含税单价：反算不含税单价
function recalcFromTaxPrice(row: any) {
  const tr = Number(row.tax_rate) || 0
  const pwt = Number(row.price_with_tax) || 0
  row.price = tr > 0 ? round4(pwt / (1 + tr / 100)) : pwt
  applyAmounts(row)
}
// 编辑 价税合计：按 数量/税率/折扣 倒挤 不含税单价、金额、税额、含税单价
function recalcFromGross(row: any) {
  const qty = Number(row.qty) || 0
  const tr = Number(row.tax_rate) || 0
  const dr = Number(row.discount_rate) || 0
  const factor = dr > 0 ? dr / 10 : 1
  const gross = Number(row.gross_amount) || 0
  // 价税合计 = 不含税金额 × (1 + 税率) ⇒ 反推金额与税额
  const amount = tr > 0 ? round2(gross / (1 + tr / 100)) : round2(gross)
  row.amount = amount
  row.tax_amount = round2(gross - amount)
  // 金额 = 数量 × 单价 × 折率 ⇒ 反推单价（数量/折率为 0 时无法反推，保留原单价）
  if (qty > 0 && factor > 0) {
    row.price = round4(amount / (qty * factor))
    row.price_with_tax = tr > 0 ? round4(row.price * (1 + tr / 100)) : row.price
    row.discount_amount = round2(qty * row.price - amount)
  }
  // 回写缓存，保持与展示列一致（不调 applyAmounts，避免四舍五入回算导致跳动）
  row.gross_amount = round2((Number(row.amount) || 0) + (Number(row.tax_amount) || 0))
}
function onItemPick(row: any, item: any) {
  row.item_code = item.code
  row.item_name = item.name || ''
  row.spec = item.spec || ''
  // 缺料单等按行带供应商/来源的单据：选物料即按物料档案默认值回填（仅补空）
  if (!row.supplier_code) row.supplier_code = item.supplier_code || ''
  if (!row.source_type) row.source_type = item.source_type || 'purchase'
  row.item_supplier = item.supplier_code || ''
  row._sp = [Number(item.sale_price) || 0, Number(item.sale_price2) || 0, Number(item.sale_price3) || 0]
  row._moq = Number(item.min_order_qty) || 0
  row._batch = Number(item.batch_flag) || 0
  row._batchMode = item.batch_out_mode || 'fifo'
  row._serial = Number(item.serial_flag) || 0
  row.price = row.price || pickItemPrice(item)
  row.warehouse_code = row.warehouse_code || form.value.warehouse_code
  recalcRow(row)
}

// 往来单位 autocomplete
function queryPartners(query: string, cb: (s: any[]) => void) {
  const q = query.trim().toLowerCase()
  cb(allPartners.value
    .filter(p => !q || p.code.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q))
    .slice(0, 20)
    .map(p => ({ value: p.id, label: `${p.code} ${p.name}`, code: p.code, name: p.name }))
  )
}
async function onPartnerSelect(item: any) {
  form.value.partner_code = item.code
  partnerSearch.value = `${item.code} ${item.name}`
  // 销售单切换客户：若已有可重新取价的物料行，询问是否按新客户价格等级重新取价
  if (priceMode.value === 'sale') {
    const level = Number(item.price_level) || 1
    const pricedRows = lines.value.filter(l => l.item_code && Array.isArray(l._sp))
    if (pricedRows.length) {
      try {
        await ElMessageBox.confirm(`是否按客户「${item.name}」的 ${level} 级售价重新取价？（会覆盖已填单价）`, '价格等级', {
          confirmButtonText: '重新取价', cancelButtonText: '保持不变', type: 'info',
        })
        for (const row of pricedRows) {
          if (Array.isArray(row._sp)) {
            row.price = salePriceByLevel({ sale_price: row._sp[0], sale_price2: row._sp[1], sale_price3: row._sp[2] }, level)
            recalcRow(row)
          }
        }
        ElMessage.success(`已按 ${level} 级售价重新取价`)
      } catch { /* 用户选择保持不变 */ }
    }
  }
}

async function handleBomExplode() {
  if (!selectedBom.value) return
  const res = await scmApi.explodeBom(selectedBom.value, totalQty.value || 1)
  if (res.code === 0)
    lines.value = (res.data.lines || []).map((l: any) => ({
      item_code: l.item_code, item_name: l.item_name || '', spec: l.spec || '', warehouse_code: form.value.warehouse_code,
      qty: l.total_qty, price: 0, amount: 0, tax_rate: 0, tax_amount: 0, remark: '',
      price_with_tax: 0, discount_rate: 0, batch_no: '', expire_date: '', scrap_rate: Number(l.scrap_rate) || 0, process_fee: 0,
    }))
}

async function handleSave() {
  if (!form.value.doc_type || !form.value.doc_date) return ElMessage.warning('类型和日期不能为空')
  if (isTransfer.value && !form.value.warehouse_code) return ElMessage.warning('调拨单须指定调出仓')
  // 销售发货单：审核要扣库存、挂应收，故仓库与客户必填
  if (isShipment.value && !form.value.warehouse_code) return ElMessage.warning('销售出库单必须指定仓库')
  if (isCustomerDoc.value && !form.value.partner_code) return ElMessage.warning(`${DOC_TITLE[form.value.doc_type] || '当前单据'}必须指定客户（往来单位）`)
  const cleanLines = lines.value
    .filter(l => l.item_code && Number(l.qty) > 0)
    .map(l => ({
      id: l.id || undefined, item_code: l.item_code,
      warehouse_code: l.warehouse_code || form.value.warehouse_code,
      qty: Number(l.qty), price: Number(l.price) || 0, amount: Number(l.amount) || 0,
      unit_cost: l.unit_cost ?? undefined,
      tax_rate: Number(l.tax_rate) || 0, tax_amount: Number(l.tax_amount) || 0,
      remark: l.remark || '',
      price_with_tax: Number(l.price_with_tax) || 0, discount_rate: Number(l.discount_rate) || 0,
      batch_no: l.batch_no || '', produce_date: l.produce_date || null, expire_date: l.expire_date || null,
      serial_nos: Array.isArray(l.serial_nos) ? l.serial_nos : (l.serial_nos ? parseSerialText(String(l.serial_nos)) : undefined),
      bin_no: l.bin_no || null,
      scrap_rate: Number(l.scrap_rate) || 0, process_fee: Number(l.process_fee) || 0,
      source_line_id: l.source_line_id ?? undefined,
      supplier_code: l.supplier_code || null,
      source_type: l.source_type || null,
    }))
  if (!cleanLines.length) return ElMessage.warning('请添加至少一行物料')
  if (isTransfer.value && cleanLines.some(l => !l.warehouse_code)) return ElMessage.warning('调拨单每行须指定调入仓')
  // 序列号物料：序列号个数须等于数量
  const snBad = lines.value.find(l => l.item_code && l._serial && Number(l.qty) > 0 && serialCount(l) !== (Number(l.qty) || 0))
  if (snBad) return ElMessage.warning(`物料 ${snBad.item_code} 需录入 ${Number(snBad.qty) || 0} 个序列号（当前 ${serialCount(snBad)} 个）`)
  // 采购单据：起订量软校验（行数量低于物料最小订货量时确认）
  if (priceMode.value === 'purchase') {
    const below = lines.value.filter(l => l.item_code && Number(l.qty) > 0 && Number(l._moq) > 0 && Number(l.qty) < Number(l._moq))
    if (below.length) {
      const tip = below.slice(0, 5).map(l => `${l.item_code} ${l.item_name || ''}：${l.qty} < 起订量 ${l._moq}`).join('\n')
      try {
        await ElMessageBox.confirm(`以下物料数量低于最小订货量：\n${tip}${below.length > 5 ? `\n……共 ${below.length} 项` : ''}\n仍要保存吗？`, '起订量提示', {
          confirmButtonText: '仍要保存', cancelButtonText: '返回修改', type: 'warning',
        })
      } catch { return }
    }
  }
  saving.value = true
  try {
    const payload: Record<string, any> = { ...form.value, lines: cleanLines, total_qty: totalQty.value, total_amount: totalAmount.value, total_tax: totalTax.value }
    if (initSourceDocId.value) payload.source_doc_id = initSourceDocId.value
    // 组装/拆卸单：携带 BOM ID
    if (isProduction.value && selectedBom.value) payload.bom_id = selectedBom.value
    if (editId.value) {
      await scmApi.updateDoc(editId.value, payload)
    } else {
      await scmApi.createDoc(payload)
    }
    ElMessage.success('保存成功')
    goBack()
  } finally {
    saving.value = false
  }
}

function goBack() {
  const dt = form.value.doc_type || initDocType.value
  router.push(dt ? `/scm/docs?doc_type=${dt}` : '/scm/docs')
}
function goEdit() {
  router.push(`/scm/docs/${editId.value}/edit`)
}
function goPrint() {
  if (editId.value) router.push(`/scm/docs/${editId.value}/print`)
}
</script>

<style scoped>
.doc-form-page { display: flex; flex-direction: column; height: 100%; padding: 0; }
.doc-form-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color); flex-shrink: 0;
}
.doc-form-header__left { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.doc-form-header__sep { color: var(--el-text-color-placeholder); }
.doc-form-header__title { font-weight: 600; color: var(--el-text-color-primary); }
.doc-form-header__meta { margin-left: 10px; font-size: 12px; color: var(--el-text-color-secondary); }
.doc-form-header__right { display: flex; gap: 8px; }
.doc-form-body { flex: 1; overflow: auto; padding: 14px 16px; }
.doc-lines-toolbar {
  display: flex; align-items: center; gap: 8px; margin: 10px 0 8px;
}
.doc-lines-summary { margin-left: auto; font-size: 13px; color: var(--el-text-color-secondary); }
.rt-stock { color: var(--el-color-primary); font-size: 12px; }
.line-col-setting__hd {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 6px; font-size: 13px; font-weight: 600;
}
.line-col-setting__group { display: flex; flex-direction: column; gap: 2px; }
.line-col-setting__empty { color: var(--el-text-color-placeholder); font-size: 12px; padding: 6px 0; }

.compact-data-table :deep(.el-table__cell) {
  padding: 0;
}
.compact-data-table :deep(.cell) {
  padding: 0 4px;
  line-height: 28px;
}
.editable-cell {
  min-height: 28px;
  cursor: pointer;
  width: 100%;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.editable-cell:hover {
  background-color: var(--el-fill-color-light);
}
.doc-relation-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  padding: 8px 12px;
  background-color: var(--el-color-info-light-9);
  border: 1px dashed var(--el-border-color);
  border-radius: var(--radius-sm);
  margin-bottom: 12px;
  font-size: 13px;
  gap: 16px;
}
.relation-item {
  display: inline-flex;
  align-items: center;
}
.relation-label {
  font-weight: 600;
  color: var(--el-text-color-regular);
}
.target-doc-item {
  margin-right: 12px;
}
.text-success { color: var(--el-color-success); font-weight: 600; }
.text-warning { color: var(--el-color-warning); font-weight: 600; }
.text-muted { color: var(--el-text-color-placeholder); }
</style>
