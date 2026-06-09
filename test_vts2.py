import os, sys, glob
import re

vts_files = glob.glob(r'D:\BDKF\cw0523\**\*.vts', recursive=True)
if not vts_files:
    sys.exit(0)

test_file = vts_files[0]
with open(test_file, 'rb') as f:
    data = f.read()

# Try a different approach: extract all printable ascii sequences
ascii_strings = re.findall(b'[a-zA-Z0-9_(),=+*/-]{5,}', data)
for s in ascii_strings[:50]:
    s_str = s.decode('ascii')
    if '(' in s_str or '=' in s_str:
        print(s_str)
