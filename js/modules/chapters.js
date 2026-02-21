/**
 * Chapters / Books Module
 *
 * Uses your existing Books and Chapters tables (id int8, name, chapter_num, free, etc.).
 * Access to locked chapter content is enforced by RLS: only users with an active
 * subscription can read chapters where free = false.
 */

import { getSupabaseClient } from './supabase.js';

/**
 * Fetch all books (for library/chapter list).
 * Uses existing schema: id, name, created_at.
 */
export async function getBooks() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('books')
    .select('id, name, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching books:', error);
    return [];
  }
  return (data ?? []).map((b) => ({ ...b, title: b.name || 'Untitled' }));
}

/**
 * Fetch chapters for a book. Uses existing schema: id, chapter_num, free, (title, released_at if present).
 */
export async function getChapters(bookId) {
  const supabase = getSupabaseClient();
  if (!supabase || bookId == null) return [];

  const { data, error } = await supabase
    .from('chapters')
    .select('id, title, chapter_num, free, released_at')
    .eq('book_id', bookId)
    .order('chapter_num', { ascending: true });

  if (error) {
    console.error('Error fetching chapters:', error);
    return [];
  }
  const list = data ?? [];
  return list.map((ch) => ({
    id: ch.id,
    title: ch.title || `Chapter ${ch.chapter_num}`,
    sort_order: ch.chapter_num,
    is_free: ch.free,
    released_at: ch.released_at,
  }));
}

/**
 * Fetch a single chapter's full content. RLS validates subscription (free vs locked).
 */
export async function getChapterContent(chapterId) {
  const supabase = getSupabaseClient();
  if (!supabase || chapterId == null) return null;

  let query = supabase
    .from('chapters')
    .select('id, title, content, free, book_id, chapter_num')
    .eq('id', chapterId);

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('Error fetching chapter content:', error);
    return null;
  }
  if (!data) return null;
  return {
    id: data.id,
    title: data.title || `Chapter ${data.chapter_num}`,
    content: data.content ?? '',
    is_free: data.free,
    book_id: data.book_id,
    sort_order: data.chapter_num,
  };
}

/**
 * Get chapter metadata (free, released_at) to decide access before fetching content.
 */
export async function getChapterMeta(chapterId) {
  const supabase = getSupabaseClient();
  if (!supabase || chapterId == null) return null;

  const { data, error } = await supabase
    .from('chapters')
    .select('id, free, released_at')
    .eq('id', chapterId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    is_free: data.free,
    released_at: data.released_at,
  };
}
