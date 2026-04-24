// 初始化数据库脚本
import { initDatabase } from '../db/index.ts'
import { initDefaultAccountSet } from './seedAccounts.ts'

initDatabase()
console.log('数据库 schema 初始化完成')

const result = initDefaultAccountSet()
console.log('默认账套已创建:', result)
