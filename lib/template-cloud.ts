// 교회 템플릿 클라우드 동기화 — Supabase templates 테이블.
// 비로그인 → template-storage(localStorage), 로그인 → templates 테이블.

import { getSupabaseClient } from './supabase';
import {
  listTemplates as listLocal,
  saveTemplate as saveLocal,
  removeTemplate as removeLocal,
  type ChurchTemplate,
} from './template-storage';
import type { PptFont, PptTheme } from './pptx';

async function getCurrentUserId(): Promise<string | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

function rowToTemplate(row: any): ChurchTemplate {
  const ts = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  return {
    id: row.id,
    name: row.name,
    createdAt: ts,
    font: (row.ppt_font ?? 'noto-serif-kr') as PptFont,
    theme: (row.ppt_theme ?? 'black') as PptTheme,
    ccliNumber: row.ccli_number ?? undefined,
    licenseLabel: row.license_label ?? undefined,
  };
}

export async function listTemplatesAsync(): Promise<ChurchTemplate[]> {
  const userId = await getCurrentUserId();
  if (!userId) return listLocal();

  const sb = getSupabaseClient()!;
  const { data, error } = await sb
    .from('templates')
    .select('id, name, ppt_font, ppt_theme, ccli_number, license_label, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[template-cloud] list 실패, 로컬 fallback:', error.message);
    return listLocal();
  }
  return (data ?? []).map(rowToTemplate);
}

export async function saveTemplateAsync(
  t: Omit<ChurchTemplate, 'id' | 'createdAt'>
): Promise<ChurchTemplate> {
  const userId = await getCurrentUserId();
  if (!userId) return saveLocal(t);

  const sb = getSupabaseClient()!;
  const { data, error } = await sb
    .from('templates')
    .insert({
      user_id: userId,
      name: t.name.trim() || '제목 없음',
      ppt_font: t.font,
      ppt_theme: t.theme,
      ccli_number: t.ccliNumber || null,
      license_label: t.licenseLabel || null,
    })
    .select('id, name, ppt_font, ppt_theme, ccli_number, license_label, created_at')
    .single();
  if (error || !data) {
    console.error('[template-cloud] save 실패:', error?.message);
    throw new Error(error?.message ?? '저장 실패');
  }
  return rowToTemplate(data);
}

export async function removeTemplateAsync(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    removeLocal(id);
    return;
  }
  const sb = getSupabaseClient()!;
  const { error } = await sb.from('templates').delete().eq('id', id);
  if (error) console.error('[template-cloud] remove 실패:', error.message);
}

export async function migrateTemplatesToCloud(): Promise<{ migrated: number }> {
  const userId = await getCurrentUserId();
  if (!userId) return { migrated: 0 };
  const sb = getSupabaseClient()!;
  const { count } = await sb
    .from('templates')
    .select('id', { count: 'exact', head: true });
  if ((count ?? 0) > 0) return { migrated: 0 };

  const local = listLocal();
  if (local.length === 0) return { migrated: 0 };

  const rows = local.map((t) => ({
    user_id: userId,
    name: t.name,
    ppt_font: t.font,
    ppt_theme: t.theme,
    ccli_number: t.ccliNumber || null,
    license_label: t.licenseLabel || null,
    created_at: new Date(t.createdAt).toISOString(),
  }));
  const { error } = await sb.from('templates').insert(rows);
  if (error) {
    console.error('[template-cloud] migrate 실패:', error.message);
    return { migrated: 0 };
  }
  return { migrated: local.length };
}
