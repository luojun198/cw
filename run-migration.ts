import { runMigrations } from './server/src/db/migrations.ts'
import { migrations } from './server/src/db/migrationList.ts'

console.log('开始执行数据库迁移...')
try {
  runMigrations(migrations)
  console.log('迁移完成')
} catch (error) {
  console.error('迁移失败:', error)
  process.exit(1)
}
