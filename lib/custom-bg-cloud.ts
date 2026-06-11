// 내 배경(커스텀 배경) 클라우드 저장 — Supabase Storage + custom_backgrounds 테이블.
//
// 구조:
//   - 파일: Storage 버킷 'custom-backgrounds'의 {내 user_id}/{uuid}.(gif|jpg)
//     (버킷은 공개 읽기 — URL에 추측 불가능한 uuid가 들어가고, 쓰기·삭제는 본인 폴더만)
//   - 목록: custom_backgrounds 테이블(user_id, name, file_path, kind, size_bytes) — RLS로 본인 것만
//
// 제한: 인당 5개 × 10MB. "내 교회 배경을 저장해두고 매주 꺼내 쓴다"가 유료 구독의
// 간판 기능이라, 지금은 운영자 게이트(canUseCustomBg) 뒤에 있고 결제 연동 시 구독 체크로 바뀐다.

import { getSupabaseClient } from './supabase';
import { CUSTOM_BG_MAX_BYTES, type CustomBgKind } from './custom-bg';

const BUCKET = 'custom-backgrounds';
export const CUSTOM_BG_QUOTA = 5;

export type SavedBg = {
  id: string;
  name: string;
  url: string;       // 공개 읽기 URL — 스와치 표시와 PPT 출력에 그대로 사용
  kind: CustomBgKind;
  sizeBytes: number;
};

async function getUserId(): Promise<string | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

// 내 배경 목록 (최신순)
export async function listMyBackgrounds(): Promise<SavedBg[]> {
  const sb = getSupabaseClient();
  const userId = await getUserId();
  if (!sb || !userId) return [];
  const { data, error } = await sb
    .from('custom_backgrounds')
    .select('id, name, file_path, kind, size_bytes')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[custom-bg] 목록 실패:', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    url: sb.storage.from(BUCKET).getPublicUrl(r.file_path).data.publicUrl,
    kind: r.kind as CustomBgKind,
    sizeBytes: r.size_bytes,
  }));
}

// dataURL → Blob (업로드용)
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/data:(.*?);/)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// 저장 — 성공하면 저장된 항목을 돌려준다. 실패 사유는 Error 메시지로(호출 측이 토스트).
export async function saveBackground(name: string, dataUrl: string, kind: CustomBgKind): Promise<SavedBg> {
  const sb = getSupabaseClient();
  const userId = await getUserId();
  if (!sb || !userId) throw new Error('로그인하면 배경을 저장할 수 있어요');

  const existing = await listMyBackgrounds();
  if (existing.length >= CUSTOM_BG_QUOTA) {
    throw new Error(`배경은 최대 ${CUSTOM_BG_QUOTA}개까지 저장돼요 — 안 쓰는 걸 지워주세요`);
  }

  const blob = dataUrlToBlob(dataUrl);
  if (blob.size > CUSTOM_BG_MAX_BYTES) throw new Error('10MB가 넘어서 저장할 수 없어요');

  const ext = kind === 'gif' ? 'gif' : 'jpg';
  const filePath = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(filePath, blob, {
    contentType: blob.type,
    upsert: false,
  });
  if (upErr) throw new Error(`업로드 실패: ${upErr.message}`);

  const { data, error } = await sb
    .from('custom_backgrounds')
    .insert({ user_id: userId, name: name.trim() || '내 배경', file_path: filePath, kind, size_bytes: blob.size })
    .select('id, name, file_path, kind, size_bytes')
    .single();
  if (error) {
    // 행 기록 실패 시 올린 파일은 정리 (고아 파일 방지)
    await sb.storage.from(BUCKET).remove([filePath]);
    throw new Error(`저장 실패: ${error.message}`);
  }
  return {
    id: data.id,
    name: data.name,
    url: sb.storage.from(BUCKET).getPublicUrl(data.file_path).data.publicUrl,
    kind: data.kind as CustomBgKind,
    sizeBytes: data.size_bytes,
  };
}

export async function deleteBackground(bg: SavedBg): Promise<void> {
  const sb = getSupabaseClient();
  const userId = await getUserId();
  if (!sb || !userId) return;
  // url에서 파일 경로 복원 (publicUrl = .../object/public/{bucket}/{path})
  const path = decodeURIComponent(bg.url.split(`/object/public/${BUCKET}/`)[1] ?? '');
  if (path) await sb.storage.from(BUCKET).remove([path]);
  const { error } = await sb.from('custom_backgrounds').delete().eq('id', bg.id);
  if (error) console.warn('[custom-bg] 삭제 실패:', error.message);
}
