import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
// 정확도 모드에서 큰 PDF 처리 시간 여유 확보. Vercel Hobby 플랜에서 함수 실행 한도가 늘어남.
export const maxDuration = 120;

const SYSTEM_PROMPT = `당신은 한국 CCM/찬양 악보 분석기입니다. 악보 이미지에서 가사만 추출해 섹션별로 분류합니다.

# 가사 추출 규칙
1. 코드(C, G7, Am 등), 마디번호, 박자표, 음표는 모두 무시하고 **가사만** 추출
2. 보통 한 곡입니다. 명백히 여러 곡이 있을 때만 분리하세요.
3. 가사 원문 그대로 추출. 줄바꿈은 아래 "# 줄바꿈 규칙"을 따를 것.
4. 곡 제목 추출. 안 보이면 "Untitled".

# 줄바꿈 규칙 (매우 중요 — 콘티 가독성 직결)
악보의 단순 줄바꿈(마디 단위 끊김)을 그대로 따라가지 마세요.
이 결과는 PPT/콘티 화면에 투영될 가사이므로 **의미와 호흡 단위로 줄을 재구성**합니다.

원칙:
- **한 호흡으로 부르는 구절**은 같은 줄로 묶기
- **의미가 끊기는 지점**(주어가 바뀌거나 행위가 마무리되는 지점)에서만 줄바꿈
- 너무 짧은 줄(1~3단어, 한국어 기준 약 8자 미만)은 앞·뒤 줄과 자연스럽게 합치기
- 너무 긴 줄(약 25자 초과)은 의미 분기점에서 끊되 한 호흡 내에서만 분할

예시 1 — 짧게 잘린 마디 합치기:
- 악보 그대로: "주 안에" / "내가 거하고" / "주 나의 안에" / "거하시면"
- 재구성: "주 안에 내가 거하고" / "주 나의 안에 거하시면"

예시 2 — 단어 단위 분할 합치기:
- 악보 그대로: "사랑" / "합니다" / "나의" / "예수"
- 재구성: "사랑합니다 나의 예수"

예시 3 — 호흡 단위 유지:
- 악보 그대로: "주여 나의" / "마음을 받으소서"
- 재구성: "주여 나의 마음을 받으소서"

같은 가사를 여러 번 반복하지 마세요(반복 기호는 곡 구조 판단에만 사용).
1·2절 stacked lyrics 분리 규칙은 그대로 적용하되, 분리한 각 절 안에서도 위 줄바꿈 규칙을 적용합니다.

# 섹션 type 분류
- "verse":     도입/절
- "prechorus": 후렴 직전 연결구간
- "chorus":    후렴/반복부 — 노래의 중심
- "bridge":    브릿지 — 후렴과 멜로디·가사가 명백히 다른 새로운 섹션
                · "가득해 가득해 가득해 가득해" 같은 짧은 반복구도 기본적으로 bridge로 분류
                · 사용자가 필요하면 ending으로 직접 바꿀 수 있음
- "ending":    (선택적) 엔딩 — Gemini는 사용하지 말 것. 사용자가 필요 시 직접 분류함.

# 라벨링 규칙 (정확히 따를 것)
- **절(verse) 라벨**:
  · 1절만 있으면 → label="Verse", verseNum=null
  · 여러 절 있으면 → label="Verse 1", "Verse 2", ... + verseNum=1, 2, ...
- **후렴(chorus) 라벨**:
  · 보통 label="후렴"
  · 후렴 가사 변형(A/B)이 있으면 label="후렴 1", "후렴 2"로 분리. type은 둘 다 "chorus" 유지.
- Pre-Chorus → label="Pre-Chorus"
- Bridge → label="Bridge"

# 1절·2절 처리 규칙 (매우 중요 — 한국 CCM 악보의 핵심 패턴)
악보에서 **같은 음표 아래에 두 줄 가사가 위/아래로 쌓여 있으면**:
  · 위쪽 = 1절 가사
  · 아래쪽 = 2절 가사

어떤 마디는 1절·2절이 같은 가사(단일 줄)이고, 어떤 마디만 다른 가사(두 줄)일 수 있음.

이 경우 Verse 1과 Verse 2를 **각각 완전한 섹션으로 분리** 생성:
  · Verse 1: 모든 마디에서 위쪽 가사(또는 단일 줄 공통 가사)를 이어붙임
  · Verse 2: 모든 마디에서 아래쪽 가사(또는 단일 줄 공통 가사)를 이어붙임

**예시**: 마디 1-3은 단일 가사("우리 모여 찬양"), 마디 4-5는 두 줄로 분리("사랑하네"/"노래하네") 라면:
  · Verse 1 = "우리 모여 찬양 + 사랑하네"
  · Verse 2 = "우리 모여 찬양 + 노래하네"
  · 공통 부분("우리 모여 찬양")은 양쪽 섹션에 동일하게 포함

# 섹션 통합/분리 규칙 (매우 중요)
- 한 후렴이 악보의 여러 시스템(줄)에 걸쳐 있어도 **반드시 하나의 chorus 섹션으로 통합**
- 후렴의 일부를 절대 bridge로 잘못 분류하지 말 것
- 같은 가사가 정확히 반복되면 한 번만 기재. 가사가 조금이라도 다르면 별도 섹션.
- 짧은 반복·변형 종결구는 **bridge로 분류** (ending은 사용자가 직접 분류)

# 반복 기호 처리 규칙
도돌이표, D.C., D.S., 코다(Coda) 같은 반복 기호는 곡 구조 판단에만 사용. 같은 가사를 여러 번 추출하지 말 것

반드시 다음 JSON 스키마로만 응답:
{
  "songs": [
    {
      "title": "곡 제목",
      "sections": [
        {
          "type": "verse",
          "label": "Verse",
          "verseNum": null,
          "text": "가사\\n줄바꿈"
        }
      ]
    }
  ]
}`;

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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { images, text, accuracyMode } = body as {
      images?: { data: string; mimeType: string }[];
      text?: string;
      accuracyMode?: boolean;
    };

    // 큰 이미지 요청은 Gemini 호출 전에 차단해 서버 메모리 사용량과
    // 함수 실행 타임아웃 가능성을 미리 낮춘다.
    if (images && images.length > 10) {
      return NextResponse.json({ error: '이미지는 10개 이하' }, { status: 400 });
    }

    if (
      images &&
      images.reduce((total, image) => total + image.data.length, 0) > 30 * 1024 * 1024
    ) {
      return NextResponse.json({ error: '총 용량 30MB 초과' }, { status: 400 });
    }

    if ((!images || images.length === 0) && !text) {
      return NextResponse.json(
        { error: '이미지 또는 텍스트가 필요합니다' },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // Pro 모델은 thinking 토큰으로 JSON 응답이 흔들릴 수 있어 Flash로 고정한다.
    // 정확도 모드는 temperature만 낮춰 가사 추출 변동성을 줄인다.
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: accuracyMode ? 0.05 : 0.2,
      },
      systemInstruction: SYSTEM_PROMPT,
    });

    const parts: any[] = [];
    // 정확도 안내를 user prompt에 넣어 Flash가 더 신중하게 가사를 추출하도록 유도한다.
    const accuracyInstruction =
      '정확도 우선 모드입니다. 가사를 한 글자도 빠뜨리지 말고 신중히 추출하세요.';
    if (images && images.length > 0) {
      for (const img of images) {
        parts.push({
          inlineData: {
            data: img.data,
            mimeType: img.mimeType,
          },
        });
      }
      parts.push({
        text: accuracyMode
          ? `이 악보를 분석해 JSON으로만 응답하세요. ${accuracyInstruction}`
          : '이 악보를 분석해 JSON으로만 응답하세요.',
      });
    } else if (text) {
      parts.push({
        text: accuracyMode
          ? `다음 가사를 분석해 JSON으로만 응답하세요. ${accuracyInstruction}\n\n${text}`
          : `다음 가사를 분석해 JSON으로만 응답하세요:\n\n${text}`,
      });
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
    });

    const responseText = result.response.text();
    const jsonStr = extractJSON(responseText);

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error('JSON 파싱 실패:', responseText);
      return NextResponse.json(
        { error: 'AI 응답을 JSON으로 변환할 수 없습니다', raw: responseText },
        { status: 500 }
      );
    }

    if (!parsed.songs || !Array.isArray(parsed.songs)) {
      return NextResponse.json(
        { error: 'songs 배열이 없는 응답', raw: parsed },
        { status: 500 }
      );
    }

    // 후처리: Gemini가 라벨링 규칙을 안 지킨 경우 보정
    // - 1절만 있으면 verseNum=null + label="Verse"로 단순화
    //   (사용자 요청: "verse가 1절밖에 없으면 그냥 verse야")
    for (const song of parsed.songs) {
      if (!Array.isArray(song.sections)) continue;
      const verses = song.sections.filter((s: any) => s.type === 'verse');
      if (verses.length === 1) {
        verses[0].label = 'Verse';
        verses[0].verseNum = null;
      }
    }

    return NextResponse.json({ songs: parsed.songs });
  } catch (err: any) {
    console.error('analyze error:', err);
    return NextResponse.json(
      { error: err.message || '분석 중 오류 발생' },
      { status: 500 }
    );
  }
}
