// 예배 순서 템플릿 클라우드 저장 — Supabase worship_orders 테이블.
// conti-cloud.ts와 같은 패턴이지만 localStorage fallback 없음 —
// 이 기능 자체가 로그인 + 운영자/프리미엄 전용이라 비로그인 경로가 없다.
//
// DB 스키마 (docs/worship-orders.sql):
//   worship_orders.id         uuid
//   worship_orders.user_id    uuid (RLS로 본인 것만)
//   worship_orders.name       text — 템플릿 이름 ("주일 낮예배" 등)
//   worship_orders.doc (jsonb) = { blocks: WorshipBlock[] }
//   created_at / updated_at

import { getSupabaseClient } from './supabase';
import type { WorshipBlock } from './worship-order';

export type SavedWorshipOrder = {
  id: string;
  name: string;
  savedAt: number; // ms — 목록 정렬·표시용
  blocks: WorshipBlock[];
};

async function getCurrentUserId(): Promise<string | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

function rowToOrder(row: any): SavedWorshipOrder {
  const payload = row.doc ?? {};
  const savedAtSource = row.updated_at ?? row.created_at;
  return {
    id: row.id,
    name: row.name,
    savedAt: savedAtSource ? new Date(savedAtSource).getTime() : 0,
    blocks: Array.isArray(payload.blocks) ? payload.blocks : [],
  };
}

// 내 템플릿 목록 (최근 수정 순)
export async function listWorshipOrders(): Promise<SavedWorshipOrder[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const sb = getSupabaseClient()!;
  const { data, error } = await sb
    .from('worship_orders')
    .select('id, name, doc, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('[worship-cloud] list 실패:', error.message);
    return [];
  }
  return (data ?? []).map(rowToOrder);
}

// 새 템플릿 저장
export async function saveWorshipOrder(name: string, blocks: WorshipBlock[]): Promise<SavedWorshipOrder> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('로그인하면 저장돼요');
  const sb = getSupabaseClient()!;
  const { data, error } = await sb
    .from('worship_orders')
    .insert({ user_id: userId, name: name.trim() || '제목 없음', doc: { blocks } })
    .select('id, name, doc, created_at, updated_at')
    .single();
  if (error || !data) throw new Error(error?.message ?? '저장 실패');
  return rowToOrder(data);
}

// 기존 템플릿 덮어쓰기 — "우리 교회 템플릿"을 매주 갱신하는 경로
export async function updateWorshipOrder(id: string, name: string, blocks: WorshipBlock[]): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('로그인하면 저장돼요');
  const sb = getSupabaseClient()!;
  const { error } = await sb
    .from('worship_orders')
    .update({ name: name.trim() || '제목 없음', doc: { blocks }, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// 템플릿 삭제
export async function removeWorshipOrder(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;
  const sb = getSupabaseClient()!;
  const { error } = await sb.from('worship_orders').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
