/**
 * Supabase client module.
 * Uses CONFIG.supabase.url and CONFIG.supabase.anonKey (set via env at build time in production).
 */
(function () {
  'use strict';
  const url = (typeof CONFIG !== 'undefined' && CONFIG.supabase && CONFIG.supabase.url) ? CONFIG.supabase.url : '';
  const anonKey = (typeof CONFIG !== 'undefined' && CONFIG.supabase && CONFIG.supabase.anonKey) ? CONFIG.supabase.anonKey : '';
  if (!url || !anonKey) {
    console.warn('Supabase URL or anon key not configured. Set CONFIG.supabase.url and CONFIG.supabase.anonKey.');
  }
  window.supabase = window.supabase || (typeof supabase !== 'undefined' ? supabase.createClient(url, anonKey) : null);
})();
