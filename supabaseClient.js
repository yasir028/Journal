import { createClient } from '@supabase/supabase-js'

// PASTE YOUR SUPABASE URL HERE inside the quotes
const supabaseUrl = 'https://mknmiwnonoqxsgabhjkn.supabase.co'

// PASTE YOUR "ANON PUBLIC" KEY HERE inside the quotes
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbm1pd25vbm9xeHNnYWJoamtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NzY1NTMsImV4cCI6MjA4MTA1MjU1M30.HIo8R-un-Jlirzx8s_AtYw40r_CzAonGIv-UScZCwRk'

export const supabase = createClient(supabaseUrl, supabaseKey)