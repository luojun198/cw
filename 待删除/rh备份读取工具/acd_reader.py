#!/usr/bin/env python3
"""
润衡软件 .acd 备份文件读取工具
用法: python acd_reader.py <acd文件路径> [输出目录]

.acd 文件格式:
  每个文件条目:
    - 文件名: 32字节(以0x00结尾, 0x20填充)
    - 元数据: 12字节
      - flag: 4字节 (uint32 LE, 通常为1)
      - uncompressed_size: 4字节 (uint32 LE)
      - compressed_size: 4字节 (uint32 LE)
    - zlib压缩数据: compressed_size字节 (以789c开头)
"""

import struct, zlib, os, sys


def read_acd(acd_path, out_dir=None, encoding='gbk'):
    """读取.acd备份文件, 返回文件列表和内容"""
    with open(acd_path, 'rb') as f:
        data = f.read()

    pos = 0
    entries = []

    while pos < len(data):
        # 读取文件名 (null-terminated, 0x20填充, 32字节字段)
        name_bytes = b''
        i = pos
        while i < pos + 32 and i < len(data):
            b = data[i]
            if b == 0x00:
                break
            name_bytes += bytes([b])
            i += 1

        if not name_bytes or len(name_bytes) < 3:
            break

        filename = name_bytes.decode(encoding, errors='replace')

        # 跳过null和填充空格
        null_pos = data.index(0x00, pos)
        field_end = null_pos + 1
        while field_end < len(data) and data[field_end] == 0x20:
            field_end += 1

        # 读取元数据: flag + uncompressed_size + compressed_size
        if field_end + 12 > len(data):
            break

        flag = struct.unpack('<I', data[field_end:field_end+4])[0]
        uncomp_size = struct.unpack('<I', data[field_end+4:field_end+8])[0]
        comp_size = struct.unpack('<I', data[field_end+8:field_end+12])[0]

        zlib_start = field_end + 12
        if zlib_start + comp_size > len(data):
            break

        zlib_data = data[zlib_start:zlib_start+comp_size]

        try:
            decompressed = zlib.decompress(zlib_data)
        except Exception as e:
            print(f"解压失败: {filename}: {e}")
            break

        entry = {
            'filename': filename,
            'flag': flag,
            'uncompressed_size': uncomp_size,
            'compressed_size': comp_size,
            'data': decompressed,
        }
        entries.append(entry)

        # 如果指定了输出目录, 写入文件
        if out_dir:
            rel_path = filename.replace('\\', '/')
            out_path = os.path.join(out_dir, rel_path)
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, 'wb') as f:
                f.write(decompressed)

        pos = zlib_start + comp_size

    return entries


def print_manifest(entries):
    """打印文件清单"""
    text_files = []
    vts_files = []
    empty_files = []

    for e in entries:
        fn = e['filename']
        size = e['uncompressed_size']
        if size == 0:
            empty_files.append(fn)
        elif fn.endswith('.vts'):
            vts_files.append((fn, size))
        else:
            text_files.append((fn, size))

    print("=" * 60)
    print(f"  共 {len(entries)} 个文件, {len(text_files)+len(vts_files)} 个有内容, {len(empty_files)} 个空文件")
    print("=" * 60)

    print("\n【有内容的文本文件】")
    for fn, size in text_files:
        print(f"  {fn}  ({size:,} bytes)")

    print(f"\n【报表模板 (.vts)】")
    for fn, size in vts_files:
        print(f"  {fn}  ({size:,} bytes)")

    print(f"\n【空文件】")
    for fn in empty_files:
        print(f"  {fn}")


def print_file_content(entries, filename, encoding='gbk'):
    """打印指定文件的内容"""
    for e in entries:
        if e['filename'] == filename:
            text = e['data'].decode(encoding, errors='replace')
            print(text)
            return
    print(f"文件不存在: {filename}")


def main():
    if len(sys.argv) < 2:
        print("润衡软件 .acd 备份文件读取工具")
        print("用法:")
        print("  python acd_reader.py <acd文件>              # 查看清单")
        print("  python acd_reader.py <acd文件> <输出目录>    # 解压到目录")
        sys.exit(1)

    acd_path = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.path.exists(acd_path):
        print(f"文件不存在: {acd_path}")
        sys.exit(1)

    entries = read_acd(acd_path, out_dir)

    if out_dir:
        print(f"已解压 {len(entries)} 个文件到: {out_dir}")

    print_manifest(entries)


if __name__ == '__main__':
    main()
