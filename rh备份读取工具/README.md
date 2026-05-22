# 润衡软件 .acd 备份文件读取工具

## 说明
读取润衡财务软件生成的 .acd 备份文件, 解压其中的数据。

## .acd 文件格式
- 每个文件条目由三部分组成:
  1. 文件名: 32字节字段, 以0x00结尾, 0x20填充
  2. 元数据: 12字节
     - flag: 4字节 uint32 LE (通常为1)
     - uncompressed_size: 4字节 uint32 LE (解压后大小)
     - compressed_size: 4字节 uint32 LE (压缩后大小)
  3. zlib压缩数据: compressed_size字节 (以789c魔数开头)

- 空文件的 compressed_size=8, 解压后为0字节
- 文本文件使用 GBK 编码
- 报表模板为 .vts 格式 (二进制)

## 用法
```bash
# 查看备份文件清单
python acd_reader.py zw60xx行政事业单位20260415.acd

# 解压到指定目录
python acd_reader.py zw60xx行政事业单位20260415.acd ./output
```

## 作为模块使用
```python
from acd_reader import read_acd, print_manifest, print_file_content

entries = read_acd('backup.acd')
print_manifest(entries)
print_file_content(entries, 'rhsj\\kmbm.txt')
```

## 文件说明
| 文件名 | 说明 |
|--------|------|
| kmbm.txt | 科目编码表 |
| nc.txt | 年初余额 |
| pz.txt | 凭证数据 |
| kmzk.txt | 科目总账 |
| bbml.txt | 报表目录 |
| jzlx.txt | 结转类型 |
| pzlx.txt | 凭证类型 |
| xjll_xm.txt | 现金流量项目 |
| xt.txt | 系统参数 |
| data_stru.txt | 数据库建表SQL |
| b_user.txt | 用户表 |
| b_rights.txt | 权限表 |
| dlxx.txt | 登录日志 |
| fbgl.txt | 币别管理 |
| bb*.vts | 报表模板(二进制) |
