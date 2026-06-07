import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'node:fs';
import path from 'node:path';
import {
  isSupportedImageMime,
  rateLimit,
  rejectLargeRequest,
} from '@/lib/request-guards';

export const runtime = 'nodejs';
// 정확도 모드에서 큰 PDF 처리 시간 여유 확보. Vercel Hobby 플랜에서 함수 실행 한도가 늘어남.
export const maxDuration = 120;

// 악보 분석 규칙은 lib/prompts/score-analysis-rules.md에 분리해 두었다.
// 규칙만 손보고 싶을 때 코드를 안 건드려도 되도록 외부 파일로 뺀 것이다.
// 모듈 최상단에서 한 번만 읽고 서버 인스턴스 수명 동안 캐싱한다(cold start에서만 디스크 IO 발생).
const RULES_PATH = path.join(process.cwd(), 'lib', 'prompts', 'score-analysis-rules.md');
const SYSTEM_PROMPT = fs.readFileSync(RULES_PATH, 'utf-8');
const MAX_REQUEST_BYTES = 42 * 1024 * 1024;
const MAX_IMAGE_BASE64_BYTES = 30 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;
const MAX_HINT_CHARS = 8_000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 20;

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

    const limited = rateLimit(req, 'analyze', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (limited) return limited;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { images, text, accuracyMode, hint } = body as {
      images?: { data: string; mimeType: string }[];
      text?: string;
      accuracyMode?: boolean;
      // OCR 학습 힌트 — 클라이언트가 lib/ocr-learning.ts의 buildCorrectionHint()로 만든 텍스트.
      // 사용자 이전 수정 패턴을 system prompt 끝에 붙여 같은 실수를 줄인다.
      hint?: string;
    };

    if (typeof text === 'string' && text.length > MAX_TEXT_CHARS) {
      return NextResponse.json({ error: '텍스트가 너무 깁니다' }, { status: 400 });
    }

    if (hint !== undefined && (typeof hint !== 'string' || hint.length > MAX_HINT_CHARS)) {
      return NextResponse.json({ error: '힌트가 너무 깁니다' }, { status: 400 });
    }

    // 큰 이미지 요청은 Gemini 호출 전에 차단해 서버 메모리 사용량과
    // 함수 실행 타임아웃 가능성을 미리 낮춘다.
    if (images && images.length > 10) {
      return NextResponse.json({ error: '이미지는 10개 이하' }, { status: 400 });
    }

    if (
      images &&
      images.some(
        (image) =>
          !image ||
          typeof image.data !== 'string' ||
          !isSupportedImageMime(image.mimeType)
      )
    ) {
      return NextResponse.json({ error: '지원하지 않는 이미지 형식입니다' }, { status: 400 });
    }

    if (
      images &&
      images.reduce((total, image) => total + image.data.length, 0) > MAX_IMAGE_BASE64_BYTES
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
    // hint가 있으면 system prompt 끝에 붙여 사용자 수정 패턴을 학습한 것처럼 동작하도록 유도한다.
    const systemPrompt = hint && hint.trim() ? `${SYSTEM_PROMPT}${hint}` : SYSTEM_PROMPT;
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: accuracyMode ? 0.05 : 0.2,
      },
      systemInstruction: systemPrompt,
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
        { error: 'AI 응답을 JSON으로 변환할 수 없습니다' },
        { status: 500 }
      );
    }

    if (!parsed.songs || !Array.isArray(parsed.songs)) {
      return NextResponse.json(
        { error: 'songs 배열이 없는 응답' },
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
