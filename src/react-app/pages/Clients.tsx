import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSupabaseAuth } from '../auth/SupabaseAuthProvider'; // 1. Usar o nosso hook de autenticação
import { supabase } from '../supabaseClient'; // 2. Importar o cliente Supabase
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { Users, Plus, Edit, Trash2, Phone, Mail, MessageCircle, X } from 'lucide-react';
import type { ClientType } from '../../shared/types'; // Ajuste o caminho se necessário
import { CreateClientSchema } from '../../shared/types'; // Ajuste o caminho se necessário

// --- Definição de Tipos ---
interface ClientFormData {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
}

/**
 * Página para gerir os clientes (Criar, Ler, Atualizar, Apagar).
 */
export default function Clients() {
  // 3. Obter o utilizador do nosso hook
  const { user } = useSupabaseAuth(); 
  
  // --- Estados do Componente ---
  const [clients, setClients] = useState<ClientType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientType | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormData>({
    resolver: zodResolver(CreateClientSchema),
  });

  // --- Efeito para Carregar os Dados ---
  // Este efeito é acionado assim que o componente é montado e o `user` está disponível.
  useEffect(() => {
    if (user) {
      fetchClients();
    }
  }, [user]);

  /**
   * 4. Lógica para buscar os clientes no Supabase.
   */
  const fetchClients = async () => {
    if (!user) return; // Salvaguarda para garantir que o utilizador existe.
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clients') // Nome da tabela no Supabase
        .select('*') // Seleciona todas as colunas
        .eq('user_id', user.id) // **IMPORTANTE**: Filtra os dados apenas para o utilizador atual
        .order('name', { ascending: true }); // Ordena por nome

      if (error) {
        throw error; // Lança um erro se a consulta falhar
      }

      if (data) {
        setClients(data); // Atualiza o estado com os clientes encontrados
      }
    } catch (error) {
      console.error('Erro ao carregar clientes:', (error as Error).message);
    } finally {
      setLoading(false); // Garante que o loading termina, mesmo com erro
    }
  };

  /**
   * 5. Lógica para submeter o formulário (criar ou atualizar um cliente).
   */
  const onSubmit = async (formData: ClientFormData) => {
    if (!user) return;

    try {
      if (editingClient) {
        // --- LÓGICA DE ATUALIZAÇÃO ---
        const { error } = await supabase
          .from('clients')
          .update(formData)
          .eq('id', editingClient.id) // Condição para saber qual cliente atualizar
          .eq('user_id', user.id); // Segurança adicional

        if (error) throw error;
      } else {
        // --- LÓGICA DE CRIAÇÃO ---
        const { error } = await supabase
          .from('clients')
          .insert([{ ...formData, user_id: user.id }]); // Adiciona o user_id ao novo registo

        if (error) throw error;
      }

      await fetchClients(); // Recarrega a lista de clientes para mostrar as alterações
      handleCloseModal(); // Fecha o modal
    } catch (error) {
      console.error('Erro ao salvar cliente:', (error as Error).message);
    }
  };

  /**
   * 6. Lógica para apagar um cliente.
   */
  const handleDeleteClient = async (clientId: number) => {
    // Usamos um modal customizado ou uma lógica diferente em vez do `window.confirm`
    const confirmDelete = window.confirm('Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.');
    if (!user || !confirmDelete) return;

    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId) // Condição para saber qual cliente apagar
        .eq('user_id', user.id); // Segurança adicional

      if (error) throw error;

      await fetchClients(); // Recarrega a lista
    } catch (error) {
      console.error('Erro ao excluir cliente:', (error as Error).message);
    }
  };
  
  // --- Funções Auxiliares (sem grandes alterações) ---
  const handleEditClient = (client: ClientType) => {
    setEditingClient(client);
    reset({
      name: client.name,
      phone: client.phone || '',
      email: client.email || '',
      notes: client.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingClient(null);
    reset();
  };
  
  const sendWhatsAppMessage = (client: ClientType) => {
    if (!client.phone) return;
    const message = `Olá ${client.name}! Como posso ajudá-lo hoje?`;
    const phoneNumber = client.phone.replace(/\D/g, ''); // Limpa o número
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  // --- Renderização ---
  if (loading) {
    return (
      <Layout>
        <LoadingSpinner />
      </Layout>
    );
  }

  // O JSX abaixo permanece praticamente idêntico, pois a lógica de UI não mudou.
  return (
    <Layout>
       <div className="px-4 sm:px-6 lg:px-8">
        <div className="sm:flex sm:items-center">
          <div className="sm:flex-auto">
            <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
            <p className="mt-2 text-gray-600">Gerencie a sua base de clientes</p>
          </div>
          <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-gradient-to-r from-pink-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:from-pink-600 hover:to-violet-600 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Cliente
            </button>
          </div>
        </div>

        <div className="mt-8">
          {clients.length === 0 ? (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum cliente</h3>
              <p className="mt-1 text-sm text-gray-500">
                Comece adicionando o seu primeiro cliente.
              </p>
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-600 hover:to-violet-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Cliente
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200 hover:shadow-md transition-shadow"
                >
                  <div className="px-6 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="bg-blue-100 rounded-full p-2">
                          <Users className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{client.name}</h3>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {client.phone && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Phone className="w-4 h-4 mr-2" />
                          {client.phone}
                        </div>
                      )}
                      
                      {client.email && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Mail className="w-4 h-4 mr-2" />
                          {client.email}
                        </div>
                      )}
                      
                      {client.notes && (
                        <div className="text-sm text-gray-600 mt-2">
                          <p className="italic">"{client.notes}"</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-between space-x-2">
                    <button
                      onClick={() => handleEditClient(client)}
                      className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Editar
                    </button>
                    
                    <button
                      onClick={() => handleDeleteClient(client.id!)}
                      className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Excluir
                    </button>
                    
                    {client.phone && (
                      <button
                        onClick={() => sendWhatsAppMessage(client)}
                        className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-green-300 shadow-sm text-sm font-medium rounded-md text-green-700 bg-white hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                      >
                        <MessageCircle className="w-4 h-4 mr-1" />
                        WhatsApp
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={handleCloseModal}></div>

              <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <form onSubmit={handleSubmit(onSubmit)}>
                  <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900">
                        {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
                      </h3>
                      <button
                        type="button"
                        onClick={handleCloseModal}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-6 h-6" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                          Nome *
                        </label>
                        <input
                          type="text"
                          {...register('name')}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm"
                        />
                        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
                      </div>

                      <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                          Telefone
                        </label>
                        <input
                          type="tel"
                          {...register('phone')}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm"
                        />
                        {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>}
                      </div>

                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                          Email
                        </label>
                        <input
                          type="email"
                          {...register('email')}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm"
                        />
                        {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
                      </div>

                      <div>
                        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                          Notas
                        </label>
                        <textarea
                          {...register('notes')}
                          rows={3}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm"
                          placeholder="Preferências, observações..."
                        />
                        {errors.notes && <p className="mt-1 text-sm text-red-600">{errors.notes.message}</p>}
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-r from-pink-500 to-violet-500 text-base font-medium text-white hover:from-pink-600 hover:to-violet-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                    >
                      {isSubmitting ? 'Salvando...' : (editingClient ? 'Atualizar' : 'Criar')}
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
