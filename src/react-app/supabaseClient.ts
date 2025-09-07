import { createClient } from '@supabase/supabase-js';

// --- Variáveis de Ambiente ---
// É uma boa prática armazenar estas chaves em variáveis de ambiente
// (ex: .env.local) para maior segurança, mas para este projeto,
// vamos mantê-las aqui para simplicidade.
// Elas são encontradas em: Project Settings > API no seu dashboard do Supabase.

const supabaseUrl = 'https://tuotvaxancyrxeqljqjs.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1b3R2YXhhbmN5cnhlcWxqcWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTcyMjEsImV4cCI6MjA3MjY3MzIyMX0.2t2eSZ1-T1BVBffafCwSnHsNSERkcsZYN9FpqGbrWPI';

/**
 * Cria e exporta a instância do cliente Supabase.
 * Esta instância única será usada em toda a aplicação para interagir
 * com o seu banco de dados, autenticação e outros serviços do Supabase.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
