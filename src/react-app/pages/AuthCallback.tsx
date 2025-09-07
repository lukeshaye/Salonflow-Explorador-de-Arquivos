import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabaseAuth } from '../auth/SupabaseAuthProvider';
import LoadingSpinner from '../components/LoadingSpinner';

/**
 * Esta página atua como o ponto de retorno após uma autenticação OAuth (ex: Google).
 * A sua principal função é aguardar que o SupabaseAuthProvider processe
 * as informações da sessão presentes na URL e, em seguida, redirecionar o usuário.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const { user, loading } = useSupabaseAuth();

  useEffect(() => {
    // Este efeito é executado sempre que o estado de 'loading' ou 'user' muda.
    
    // Aguardamos que o SupabaseAuthProvider termine de verificar a sessão (loading === false).
    if (!loading) {
      if (user) {
        // Se um usuário for encontrado, significa que o login foi bem-sucedido.
        // Redirecionamos para o dashboard principal da aplicação.
        // `replace: true` substitui a página de callback no histórico do navegador.
        navigate('/dashboard', { replace: true });
      } else {
        // Se, após o carregamento, não houver usuário, algo falhou no processo.
        // Redirecionamos de volta para a página inicial para que possam tentar novamente.
        navigate('/', { replace: true });
      }
    }
  }, [user, loading, navigate]);

  // Enquanto o processo de autenticação está em andamento, exibimos um spinner
  // para fornecer feedback visual ao usuário.
  return <LoadingSpinner />;
}
