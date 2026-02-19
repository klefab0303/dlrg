// supabase.js
// Verbindet die App mit deiner Supabase-Datenbank.
// ERSETZE die beiden Werte unten mit deinen eigenen Daten (Schritt-für-Schritt-Anleitung weiter unten).

const SUPABASE_URL = 'https://DEINE-PROJEKT-URL.supabase.co';
const SUPABASE_ANON_KEY = 'DEIN-ANON-PUBLIC-KEY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
