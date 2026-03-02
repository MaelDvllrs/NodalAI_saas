import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL et SUPABASE_SERVICE_KEY doivent être définis dans .env');
}

// Client avec service key (pour opérations backend)
export const supabase = createClient(supabaseUrl, supabaseKey);

// Client avec anon key (pour authentification)
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
export const supabaseClient = supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : supabase;
