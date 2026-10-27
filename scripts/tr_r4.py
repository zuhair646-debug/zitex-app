p = '/app/backend/translate.py'; s = open(p).read()
old = """               if re.search(r'[A-Za-z]', w) and not re.search(r'\\d', w) and not (w.replace('-', '').isupper() and len(w) <= 6) and w.lower() not in ('zenrex', 'store')
               and not (target in ('zh', 'ja', 'ko') and w.lower() in ('iphone', 'ipad', 'airpods', 'imac'))]
        # Chinese/Japanese/Korean natively keep model words (华为 Mate 60 Pro): fine once the brand is in native script.
        if bad and target in ('zh', 'ja', 'ko') and any(re.search(_SCRIPT_RX[n], text) for n in _NATIVE[target].split('|')):
            bad = []"""
assert old in s
s = s.replace(old, """               if re.search(r'[A-Za-z]', w) and not re.search(r'\\d', w) and not (w.replace('-', '').isupper() and len(w) <= 3)
               and w.lower() not in ('zenrex', 'store')]""")
old = "and req.target_lang not in ('zh', 'ja', 'ko') else '')"
assert old in s
s = s.replace(old, "else '')")
s = s.replace("""            "Chinese '苹果笔记本电脑 Pro 16 M3 Max' is WRONG, write it fully in Chinese characters. Only digit codes like M3, 16, 20K stay.\"""",
              """            "Chinese '苹果笔记本电脑 Pro 16 M3 Max' is WRONG — write '苹果笔记本电脑 专业版 16 M3 顶配版'; 'iPhone 15 Pro' → '苹果手机 15 专业版'; "
            "Japanese 'アイフォーン 15 プロ'; Korean '아이폰 15 프로'. Only digit codes like M3, 16, 20K stay.\"""")
s = s.replace("""Chinese: 苹果/iPhone→苹果, 小米, 戴尔, 联想, 三星, 华为; \"""",
              """Chinese: iPhone→苹果手机, MacBook→苹果笔记本电脑, Pro→专业版, Max→顶配版, Ultra→至尊版, Watch→手表, 小米, 戴尔, 联想, 三星, 华为; "
    "Japanese: アイフォーン, マックブック プロ; Korean: 아이폰, 맥북 프로; \"""")
s = s.replace("(M3, S3, 15, 128GB, XPS, GT, USB-C, 5G)", "(M3, S3, 15, 128GB, USB-C, 5G). Product-line words like Pro, Max, Ultra, Plus, Mini, Air, Watch, Book MUST be translated/transliterated too")
s = s.replace("_RULES_VERSION = 'r3'", "_RULES_VERSION = 'r4'")
open(p, 'w').write(s)
print('ok', s.count('顶配版'))
