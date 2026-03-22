import { getSupabaseClient } from './supabase.js';

export async function fetchWorksheetMetadata() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, data: [], message: 'Supabase client not initialized' };
  }

  const { data, error } = await supabase
    .from('worksheets')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, data: [], message: error.message };
  }

  return { success: true, data: data || [] };
}

export async function downloadWorksheet(worksheetId) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: 'Supabase client not initialized' };
  }

  const { data, error } = await supabase
    .from('worksheets')
    .select('file_path')
    .eq('id', worksheetId)
    .single();

  if (error || !data?.file_path) {
    return { success: false, message: 'Worksheet file not found' };
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from('Worksheets')
    .createSignedUrl(data.file_path, 60);

  if (signedError || !signedData?.signedUrl) {
    return { success: false, message: signedError?.message || 'Failed to create download link' };
  }

  window.open(signedData.signedUrl, '_blank');
  return { success: true, message: 'Download started' };
}