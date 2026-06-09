import os, sys, re
import glob

vts_files = glob.glob(r'D:\BDKF\cw0523\**\*.vts', recursive=True)
if not vts_files:
    print('No vts files found')
    sys.exit(0)

test_file = vts_files[0]
print('Testing:', test_file)
with open(test_file, 'rb') as f:
    data = f.read()

# Try to find sequences of readable characters (likely GBK encoded text)
# GBK characters: \x81-\xfe \x40-\xfe
import string
res = []
current = bytearray()
for b in data:
    if 32 <= b <= 126 or b >= 128:
        current.append(b)
    else:
        if len(current) > 4:
            try:
                text = current.decode('gbk')
                # Filter out garbage
                if any('\u4e00' <= c <= '\u9fff' for c in text) or any(c in '()+-*/=' for c in text):
                    res.append(text)
            except:
                pass
        current = bytearray()

for i, text in enumerate(res[:30]):
    print(f"{i}: {text}")
