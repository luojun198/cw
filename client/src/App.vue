<template>
  <el-config-provider :locale="zhCn" :dialog="dialogDefaults">
    <router-view />
  </el-config-provider>
</template>

<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'

const dialogDefaults = {
  draggable: true,
  overflow: true,
}
</script>
