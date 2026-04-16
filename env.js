/*
 * Public runtime configuration for browser code.
 *
 * Keep only values that are safe to expose to clients.
 * Never put Supabase service_role keys here.
 */
(function setRuntimeEnv(globalObj) {
  const existing = globalObj.ENV || {};

  globalObj.ENV = {
    ...existing,
    SUPABASE_URL: existing.SUPABASE_URL || "https://khiwkbnqjjycmwonbhqu.supabase.co",
    SUPABASE_ANON_KEY: existing.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoaXdrYm5xamp5Y213b25iaHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3MjM1NDYsImV4cCI6MjA3ODI5OTU0Nn0.SHCSkMuUl3IY-A76cGXwLRXQNcLF-hOa19Tu8jOSWaU",
    SUPABASE_WORKSHEETS_BUCKET: existing.SUPABASE_WORKSHEETS_BUCKET || "worksheets"
  };
})(window);
