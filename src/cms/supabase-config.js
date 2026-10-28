// Public Supabase settings for the admin panel and the content sync. The publishable key is
// meant for browsers; writes are guarded by row-level security (only addresses in
// private.jjel_admins may update public.jjel_content or upload to the jjel-images bucket).
export const SUPABASE_URL = 'https://eeasibbhydlpoaomjwsn.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_JVSmEqHIPZvTveG9cPehJQ_TZC81HQW';
export const CONTENT_TABLE = 'jjel_content';
export const IMAGE_BUCKET = 'jjel-images';
