#!/usr/bin/env python3
"""PPT 글꼴 임베드용 서브셋 글꼴을 만든다 (본명조 + 나눔고딕).

왜:
  PPT에 글꼴을 통째로 심으면 한글 글꼴이 7MB+라 파일이 너무 커진다.
  찬양 가사는 상용 한글(KS X 1001 완성형 2,350자)로 거의 100% 커버되므로,
  그만큼만 남겨 ~1MB로 줄인 뒤 pptx-embed-fonts로 PPT에 심는다.
  (드물게 빠지는 글자는 보는 PC의 기본 글꼴로 대체 — 실제로 거의 안 생김)

필요 도구:  pip install fonttools
실행:       python3 scripts/gen-subset-font.py
결과:       public/fonts/noto-serif-kr-kr.otf   (~1MB)
            public/fonts/nanum-gothic-kr.ttf    (~1MB)
"""
import os
import urllib.request
from fontTools import subset
from fontTools.ttLib import TTFont

# 서브셋 대상 글꼴 목록 — (다운로드 URL, 임시 경로, 출력 경로)
# 나눔고딕은 구글 폰트 공식 저장소의 OFL 라이선스 TTF를 쓴다(재배포 허용).
FONTS = [
    (
        'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Serif/SubsetOTF/KR/NotoSerifKR-Regular.otf',
        '/tmp/NotoSerifKR-Regular.otf',
        'public/fonts/noto-serif-kr-kr.otf',
    ),
    (
        'https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Regular.ttf',
        '/tmp/NanumGothic-Regular.ttf',
        'public/fonts/nanum-gothic-kr.ttf',
    ),
]

# 상용 한글 2,350자 — KS X 1001 완성형 영역(리드 0xB0~0xC8, 트레일 0xA1~0xFE)을
# EUC-KR로 디코딩해 정확히 그 글자만 추린다.
# (파이썬 'euc-kr' 인코딩은 cp949처럼 전체 11,172자를 통과시키므로 바이트 범위로 직접 한정)
chars = []
for lead in range(0xB0, 0xC9):
    for trail in range(0xA1, 0xFF):
        try:
            ch = bytes([lead, trail]).decode('euc-kr')
            if 0xAC00 <= ord(ch) <= 0xD7A3:
                chars.append(ch)
        except Exception:
            pass

extra = ''.join(chr(c) for c in range(0x20, 0x7F))        # ASCII(영문·숫자·기호)
extra += ''.join(chr(c) for c in range(0x3130, 0x3190))   # 호환 자모
extra += '…·—–―‘’“”•※★☆♪♬○●「」『』【】〔〕'  # 자주 쓰는 기호(따옴표는 곡선형)
text = ''.join(chars) + extra
print('포함 글자 수:', len(set(text)))

os.makedirs('public/fonts', exist_ok=True)
charset_path = '/tmp/charset.txt'
with open(charset_path, 'w', encoding='utf-8') as f:
    f.write(text)

for src_url, src, out in FONTS:
    if not os.path.exists(src):
        print('다운로드:', src_url)
        urllib.request.urlretrieve(src_url, src)

    subset.main([
        src,
        '--text-file=' + charset_path,
        '--output-file=' + out,
        '--layout-features=*',
        '--no-hinting',
        '--desubroutinize',
    ])
    # PPT 임베드 시 addText의 fontFace와 이 family 이름이 정확히 일치해야 글꼴이 연결된다.
    family = TTFont(out)['name'].getDebugName(1)
    print('완료:', out, '→', round(os.path.getsize(out) / 1048576, 2), 'MB', '· family =', family)
