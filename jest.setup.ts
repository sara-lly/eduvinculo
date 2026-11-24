// Configuração global dos testes (jest-expo).
// Variáveis públicas fictícias: nenhum teste acessa a rede.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.invalid';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-000000000000000000000';
