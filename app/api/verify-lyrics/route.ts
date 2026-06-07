import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  isSupportedImageMime,
  rateLimit,
  rejectLargeRequest,
} from '@/lib/request-guards';

export const runtime = 'nodejs';
// 검증도 추출과 동일한 이미지 처리 시간을 가질 수 있어 maxDuration 동일.
export const maxDuration = 120;

// 오타 검토 SYSTEM_PROMPT — 추출용과 다르게,
// "분류·정리하지 말고 OCR 오인 부분만 골라내라" 가 핵심.
//
// 자연스러운 한국어 교정(예: "주꼐" → "주께")은 OK지만,
// 찬양 특유 어휘("주여" "임하소서" "엘로하" "할렐루야" 등)는 건드리지 말 것을 강조.
const SYSTEM_PROMPT = `당신은 한국 CCM/찬양 가사 추출 결과의 OCR 오류 검토자입니다.

원본 악보 이미지와 이미 추출된 가사를 비교해서, **OCR로 인한 오타나 빠진 글자만** 정확히 짚어주세요.

# 검토 규칙

1. **OCR 오타·빠진 글자만 잡기**
   - 예: "주꼐" (잘못) ← "주께" (원본)
   - 예: "사 랑하다" (띄어쓰기 오류) ← "사랑하다"
   - 예: "있으리" (잘못) ← "있으리라" (원본 글자 빠짐)

2. **건드리지 말 것**
   - 찬양 특유 어휘: "주여", "임하소서", "엘로하", "할렐루야", "주의 보좌", "셰키나", "임마누엘" 등
   - 종교적 표현은 일반 한국어 기준으로 "교정"하지 말 것
   - 의미 변화 없는 띄어쓰기 차이는 무시 (단, 한 단어가 글자 단위로 쪼개진 명백한 OCR 오류는 잡기)
   - 시적·운율적 변형 (예: "사랑하옵나이다", "그리하오소서") 은 그대로 보존

3. **추측 금지**
   - 원본 이미지에서 명확히 보이지 않는 글자에 대해서는 의심 표시 X
   - 흐릿하거나 가려진 부분 추정 X

4. **응답 형식**
   - 의심되는 substring을 정확히 그대로 (가공·정규화 X) 반환
   - section.text 안에 정확히 존재하는 substring만 사용 (검색·매칭 가능해야 함)
   - 가능한 한 짧게 — 단어 또는 짧은 구절 단위
   - 의심 없으면 빈 배열

# 응답 JSON 스키마

{
  "songs": [
    {
      "songIdx": 0,
      "sections": [
        {
          "sectionIdx": 0,
          "suspects": ["주꼐", "사 랑하다"]
        }
      ]
    }
  ]
}

- 의심 없는 곡/섹션은 응답에서 생략 가능
- songs 배열 비어있으면 "모두 정확함" 의미`;
const MAX_REQUEST_BYTES = 42 * 1024 * 1024;
const MAX_IMAGE_BASE64_BYTES = 30 * 1024 * 1024;
const MAX_SONGS = 80;
const MAX_SECTIONS = 400;
const MAX_EXTRACTED_TEXT_CHARS = 500_000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 10;

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    return text.slice(first, last + 1);
  }
  return text.trim();
}

export async function POST(req: NextRequest) {
  try {
    const sizeError = rejectLargeRequest(req, MAX_REQUEST_BYTES);
    if (sizeError) return sizeError;

    const limited = rateLimit(req, 'verify-lyrics', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (limited) return limited;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { images, songs } = body as {
      images?: { data: string; mimeType: string }[];
      songs?: { title: string; sections: { label: string; text: string }[] }[];
    };

    if (!images || images.length === 0) {
      return NextResponse.json(
        { error: '원본 이미지가 필요합니다' },
        { status: 400 }
      );
    }
    if (!songs || songs.length === 0) {
      return NextResponse.json(
        { error: '검토할 곡이 없습니다' },
        { status: 400 }
      );
    }

    if (images.length > 10) {
      return NextResponse.json({ error: '이미지는 10개 이하' }, { status: 400 });
    }

    if (
      images.some(
        (image) =>
          !image ||
          typeof image.data !== 'string' ||
          !isSupportedImageMime(image.mimeType)
      )
    ) {
      return NextResponse.json({ error: '지원하지 않는 이미지 형식입니다' }, { status: 400 });
    }

    const sectionCount = songs.reduce((total, song) => total + (song.sections?.length ?? 0), 0);
    const extractedTextLength = songs.reduce(
      (total, song) =>
        total +
        (song.title?.length ?? 0) +
        (song.sections ?? []).reduce((sum, section) => sum + (section.text?.length ?? 0), 0),
      0
    );
    if (
      songs.length > MAX_SONGS ||
      sectionCount > MAX_SECTIONS ||
      extractedTextLength > MAX_EXTRACTED_TEXT_CHARS
    ) {
      return NextResponse.json({ error: '검토할 가사 분량이 너무 큽니다' }, { status: 400 });
    }

    // 이미지 + 추출 결과 총합이 너무 크면 거절 (Gemini 토큰 한도 보호)
    const imageBytes = images.reduce((t, i) => t + i.data.length, 0);
    if (imageBytes > MAX_IMAGE_BASE64_BYTES) {
      return NextResponse.json({ error: '이미지 총 용량 30MB 초과' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.05, // 검토는 최대한 보수적으로
      },
      systemInstruction: SYSTEM_PROMPT,
    });

    // 추출 결과를 markdown 형태로 인라인 — 모델이 비교하기 쉽게
    const extractedDump = songs
      .map(
        (s, i) =>
          `## 곡 #${i} — ${s.title}\n` +
          s.sections
            .map(
              (sec, j) =>
                `### 섹션 #${j} (${sec.label})\n\`\`\`\n${sec.text}\n\`\`\``
            )
            .join('\n\n')
      )
      .join('\n\n');

    const parts: any[] = [];
    for (const img of images) {
      parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
    }
    parts.push({
      text:
        '위는 원본 악보 이미지(들)입니다. 아래는 이미 추출된 가사입니다. ' +
        '두 가지를 비교해서 OCR 오류로 의심되는 substring만 JSON으로 응답하세요.\n\n' +
        extractedDump,
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
    });
    const responseText = result.response.text();
    const jsonStr = extractJSON(responseText);

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error('검토 JSON 파싱 실패:', responseText);
      return NextResponse.json(
        { error: 'AI 응답을 JSON으로 변환할 수 없습니다' },
        { status: 500 }
      );
    }

    // 응답 정규화 — songs 배열이 없거나 비어있으면 의심 없음
    const out = Array.isArray(parsed.songs) ? parsed.songs : [];
    return NextResponse.json({ songs: out });
  } catch (err: any) {
    console.error('verify-lyrics error:', err);
    return NextResponse.json(
      { error: err.message || '검토 중 오류 발생' },
      { status: 500 }
    );
  }
}
