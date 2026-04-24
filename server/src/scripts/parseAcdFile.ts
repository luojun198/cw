/**
 * ACD 文件解析工具
 * 用于解析会计软件的 .acd 备份文件格式
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

interface AcdFileEntry {
  fileName: string;
  offset: number;
  compressedSize: number;
  uncompressedSize: number;
  data?: Buffer;
}

interface AcdFileData {
  entries: AcdFileEntry[];
  tables: Map<string, string>;
}

/**
 * 解析 ACD 文件
 */
export function parseAcdFile(filePath: string): AcdFileData {
  const buffer = fs.readFileSync(filePath);
  const entries: AcdFileEntry[] = [];
  const tables = new Map<string, string>();

  let offset = 0;

  // 解析文件索引
  console.log(`文件大小: ${buffer.length} 字节\n`);

  while (offset < buffer.length - 50) {
    // 查找 "rhsj\" 标记
    const marker = Buffer.from('rhsj\\');
    const markerIndex = buffer.indexOf(marker, offset);

    if (markerIndex === -1 || markerIndex > buffer.length - 50) {
      break;
    }

    console.log(`找到标记位置: ${markerIndex}`);

    // 读取文件名（从 rhsj\ 之后开始）
    const fileNameStart = markerIndex;
    let fileNameEnd = fileNameStart + 5; // 跳过 "rhsj\"

    // 查找文件名结束位置（遇到 .txt 或 .vts 后的 \0）
    while (fileNameEnd < buffer.length && buffer[fileNameEnd] !== 0) {
      fileNameEnd++;
    }

    const fullFileName = buffer.toString('utf8', fileNameStart, fileNameEnd);
    const fileName = fullFileName.substring(5); // 去掉 "rhsj\"

    console.log(`文件名: ${fileName}`);

    // 验证文件名格式
    if (!fileName.match(/^[\w]+\.(txt|vts)$/)) {
      console.log(`  跳过（格式不匹配）`);
      offset = markerIndex + 1;
      continue;
    }

    // 文件名后面有填充字节，然后是数据头
    // 格式: [文件名]\0[填充] [flag:1] [unknown:8] [compressed:4] [zlib_data]
    // 数据头共 12 字节

    // 从文件名结束位置开始，跳过 \0 和空格填充，找到 flag 字节
    let dataHeaderStart = fileNameEnd + 1; // 跳过 \0

    // 跳过空格填充（0x20）找到非填充字节
    while (dataHeaderStart < buffer.length && buffer[dataHeaderStart] === 0x20) {
      dataHeaderStart++;
    }

    // 检查是否有足够的空间读取头部（12字节）
    if (dataHeaderStart + 12 > buffer.length) {
      console.log(`  跳过（数据头不完整）`);
      offset = markerIndex + 1;
      continue;
    }

    // 读取数据头
    const flag = buffer[dataHeaderStart];
    // 跳过 8 字节未知字段
    const compressedSize = buffer.readUInt32LE(dataHeaderStart + 9);
    const uncompressedSize = 0; // 暂时设为 0，实际解压后才知道

    console.log(`  数据头位置: ${dataHeaderStart} (相对标记: +${dataHeaderStart - markerIndex})`);
    console.log(`  标志: ${flag}, 压缩大小: ${compressedSize}`);

    // 验证大小是否合理（避免读取错误数据）
    if (compressedSize > 10 * 1024 * 1024) {
      console.log(`  跳过（大小异常）`);
      offset = markerIndex + 1;
      continue;
    }

    // 读取压缩数据（数据头 12 字节后）
    const compressedDataStart = dataHeaderStart + 12;
    const compressedDataEnd = compressedDataStart + compressedSize;

    if (compressedDataEnd > buffer.length) {
      console.log(`  跳过（数据不完整）`);
      offset = markerIndex + 1;
      continue;
    }

    const compressedData = buffer.slice(compressedDataStart, compressedDataEnd);

    entries.push({
      fileName,
      offset: fileNameStart,
      compressedSize,
      uncompressedSize,
      data: compressedData
    });

    console.log(`  ✓ 添加到解析队列`);

    // 移动到下一个条目
    offset = compressedDataEnd;
  }

  console.log(`\n共发现 ${entries.length} 个数据表\n`);

  // 解压缩数据
  for (const entry of entries) {
    if (entry.data && entry.compressedSize > 0) {
      try {
        // 尝试解压缩（zlib inflate）
        const decompressed = zlib.inflateSync(entry.data);
        const content = decompressed.toString('utf8');
        tables.set(entry.fileName, content);
        console.log(`✓ 解压成功: ${entry.fileName} (${content.length} 字符)`);
      } catch (err) {
        // 如果是空数据，直接存储空字符串
        if (entry.compressedSize === 8 && entry.uncompressedSize === 0) {
          tables.set(entry.fileName, '');
          console.log(`✓ 空表: ${entry.fileName}`);
        } else {
          console.warn(`✗ 解压失败: ${entry.fileName}`, (err as Error).message);
        }
      }
    }
  }

  return { entries, tables };
}

/**
 * 导出为 JSON 格式
 */
export function exportToJson(acdData: AcdFileData, outputPath: string): void {
  const result: Record<string, any> = {};

  for (const [tableName, content] of acdData.tables) {
    // 解析表数据（假设是制表符分隔的文本格式）
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      result[tableName] = [];
      continue;
    }

    // 第一行是列名
    const headers = lines[0].split('\t');
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t');
      const row: Record<string, string> = {};

      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j] || '';
      }

      rows.push(row);
    }

    result[tableName] = rows;
  }

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\n✓ 导出完成: ${outputPath}`);
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('用法: tsx parseAcdFile.ts <acd文件路径> [输出json路径]');
    process.exit(1);
  }

  const acdFilePath = args[0];
  const outputPath = args[1] || acdFilePath.replace('.acd', '.json');

  console.log(`\n解析 ACD 文件: ${acdFilePath}\n`);

  try {
    const acdData = parseAcdFile(acdFilePath);
    console.log(`\n共解析 ${acdData.tables.size} 个数据表`);

    exportToJson(acdData, outputPath);

    // 显示关键表信息
    console.log('\n关键数据表:');
    const keyTables = ['kmbm.txt', 'pzlx.txt', 'nc.txt', 'bbml.txt'];
    for (const tableName of keyTables) {
      if (acdData.tables.has(tableName)) {
        const content = acdData.tables.get(tableName)!;
        const lines = content.split('\n').filter(line => line.trim());
        console.log(`  - ${tableName}: ${lines.length - 1} 条记录`);
      }
    }
  } catch (err) {
    console.error('解析失败:', err);
    process.exit(1);
  }
}

// 运行主函数
main();
