import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSupabaseAuth } from '../auth/SupabaseAuthProvider';
import { supabase } from '../supabaseClient';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { DollarSign, TrendingUp, TrendingDown, Plus, Edit, Trash2, X, FileText, AlertCircle } from 'lucide-react';
import type { FinancialEntryType } from '../../shared/types';
import { CreateFinancialEntrySchema } from '../../shared/types';
import { formatCurrency, formatDate } from '../utils'; // NOVO: Importando do utils.ts
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// O formulário continuará a usar um número para o valor, facilitando a validação.
// A conversão de e para cêntimos será feita na submissão e ao editar.
interface FinancialFormData {
    description: string;
    amount: number; // O usuário insere em euros (ex: 10.50)
    type: 'receita' | 'despesa';
    entry_type: 'pontual' | 'fixa';
    entry_date: string;
}

// MELHORIA: Valores padrão para o formulário, facilitando o reset.
const defaultFormValues: FinancialFormData = {
    description: '',
    amount: 0,
    type: 'receita',
    entry_type: 'pontual',
    entry_date: new Date().toISOString().split('T')[0], // Data de hoje como padrão
};

export default function Financial() {
  const { user } = useSupabaseAuth(); 
  
  // --- Estados do Componente ---
  const [entries, setEntries] = useState<FinancialEntryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FinancialEntryType | null>(null);
  const [error, setError] = useState<string | null>(null); // NOVO: Estado para erros da API
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false); // NOVO: Estado para modal de confirmação
  const [entryToDelete, setEntryToDelete] = useState<number | null>(null); // NOVO: Estado para guardar ID a ser excluído
  const [kpis, setKpis] = useState({
    monthlyRevenue: 0, // Os valores aqui serão mantidos em cêntimos
    monthlyExpenses: 0,
    netProfit: 0,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FinancialFormData>({
    resolver: zodResolver(CreateFinancialEntrySchema),
    defaultValues: defaultFormValues, // MELHORIA: Definindo valores padrão
  });
  
  // --- Efeitos ---
  useEffect(() => {
    if (user) {
      fetchEntriesAndKPIs();
    }
  }, [user]);

  // --- Funções de Busca de Dados ---
  const fetchEntriesAndKPIs = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // MELHORIA: Usamos Promise.all para carregar dados em paralelo.
      const [entriesData, kpisData] = await Promise.all([
        fetchEntries(),
        fetchKPIs()
      ]);
      
      if (entriesData) setEntries(entriesData);
      if (kpisData) {
         setKpis({
            ...kpisData,
            netProfit: kpisData.monthlyRevenue - kpisData.monthlyExpenses,
        });
      }

    } catch (err: any) {
      setError("Falha ao carregar dados financeiros. Tente novamente mais tarde.");
      console.error("Erro ao carregar dados financeiros:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchEntries = async () => {
    if (!user) return [];
    const { data, error } = await supabase
      .from('financial_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('entry_date', { ascending: false });

    if (error) throw error;
    return data || [];
  };
  
  const fetchKPIs = async () => {
     if (!user) return { monthlyRevenue: 0, monthlyExpenses: 0 };
    
    const currentMonth = new Date().toISOString().slice(0, 7); // Formato YYYY-MM

    const { data: monthlyEntries, error } = await supabase
      .from('financial_entries')
      .select('amount, type')
      .eq('user_id', user.id)
      .like('entry_date', `${currentMonth}%`);

    if (error) throw error;

    // CORREÇÃO CRÍTICA: A lógica de cálculo opera com inteiros (cêntimos), evitando erros.
    const kpisResult = (monthlyEntries || []).reduce((acc: { monthlyRevenue: number; monthlyExpenses: number }, entry: { amount: number; type: string }) => {
        if (entry.type === 'receita') {
          acc.monthlyRevenue += entry.amount;
        } else if (entry.type === 'despesa') {
          acc.monthlyExpenses += entry.amount;
        }
        return acc;
      }, { monthlyRevenue: 0, monthlyExpenses: 0 });

    return kpisResult;
  };

  // --- Funções de Manipulação de Dados (CRUD) ---
  const onSubmit = async (formData: FinancialFormData) => {
    if (!user) return;
    setError(null);
    
    // CORREÇÃO CRÍTICA: A conversão para cêntimos é feita aqui, de forma segura.
    // Usamos Math.round para evitar problemas com dízimas no input do usuário.
    const entryData = {
      ...formData,
      amount: Math.round(formData.amount * 100),
    };

    try {
      const { error } = editingEntry
        ? await supabase.from('financial_entries').update(entryData).eq('id', editingEntry.id)
        : await supabase.from('financial_entries').insert([{ ...entryData, user_id: user.id }]);
      
      if (error) throw error;

      await fetchEntriesAndKPIs(); // Recarrega todos os dados para refletir a mudança
      handleCloseModal();
    } catch (err: any) {
      setError("Erro ao salvar a entrada financeira. Verifique os dados e tente novamente.");
      console.error('Erro ao salvar entrada financeira:', err.message);
    }
  };
  
  // MELHORIA: Separa a solicitação da execução da exclusão para usar um modal
  const requestDeleteEntry = (entryId: number) => {
    setEntryToDelete(entryId);
    setIsConfirmModalOpen(true);
  };

  const handleDeleteEntry = async () => {
    if (!user || entryToDelete === null) return;
    
    setIsConfirmModalOpen(false);
    setError(null);

    try {
      const { error } = await supabase
        .from('financial_entries')
        .delete()
        .eq('id', entryToDelete)
        .eq('user_id', user.id);
      
      if (error) throw error;

      // OTIMIZAÇÃO: Remove o item do estado localmente para uma UI mais rápida
      setEntries((prevEntries: FinancialEntryType[]) => prevEntries.filter((e: FinancialEntryType) => e.id !== entryToDelete));
      
      // E depois recalcula os KPIs sem recarregar toda a lista
      const kpisData = await fetchKPIs();
      if (kpisData) {
          setKpis({
              ...kpisData,
              netProfit: kpisData.monthlyRevenue - kpisData.monthlyExpenses,
          });
      }
      
    } catch (err: any) {
      setError("Erro ao excluir a entrada financeira.");
      console.error('Erro ao excluir entrada financeira:', err.message);
    } finally {
      setEntryToDelete(null); // Limpa o ID após a operação
    }
  };

  // --- Funções Auxiliares da UI ---
  const handleEditEntry = (entry: FinancialEntryType) => {
    setEditingEntry(entry);
    reset({
      ...entry,
      // CORREÇÃO CRÍTICA: Converte de cêntimos para euros ao preencher o formulário.
      amount: entry.amount / 100,
      entry_date: entry.entry_date.split('T')[0], // Garante formato YYYY-MM-DD
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingEntry(null);
    reset(defaultFormValues); // Limpa o formulário para os valores padrão
    setError(null); // Limpa os erros do modal
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text("Relatório Financeiro - SalonFlow", 14, 16);
    autoTable(doc, {
        startY: 20,
        head: [['Data', 'Descrição', 'Tipo', 'Valor']],
        body: entries.map((e: FinancialEntryType) => [
            formatDate(e.entry_date),
            e.description,
            e.type === 'receita' ? 'Receita' : 'Despesa',
            formatCurrency(e.amount)
        ]),
    });
    doc.save('relatorio_financeiro.pdf');
  };
  
  // --- Renderização ---
  if (loading) {
    return <Layout><LoadingSpinner /></Layout>;
  }

  return (
    <Layout>
      <div className="px-4 sm:px-6 lg:px-8">
        {/* Cabeçalho e botões de ação */}
        <div className="sm:flex sm:items-center">
          <div className="sm:flex-auto">
            <h1 className="text-3xl font-bold text-gray-900">Financeiro</h1>
            <p className="mt-2 text-gray-600">Controle completo das suas finanças</p>
          </div>
          <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none space-x-3">
             <button
              type="button"
              onClick={handleExportPDF}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2"
            >
              <FileText className="w-4 h-4 mr-2" />
              Exportar PDF
            </button>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-gradient-to-r from-pink-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:from-pink-600 hover:to-violet-600 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Entrada
            </button>
          </div>
        </div>
        
        {/* MELHORIA: Exibição de Erro Global da Página */}
        {error && !isModalOpen && !isConfirmModalOpen && (
            <div className="bg-red-50 p-4 rounded-md my-4 flex items-center">
                <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
                <p className="text-sm text-red-700">{error}</p>
            </div>
        )}

        {/* KPIs */}
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="bg-green-100 rounded-md p-3">
                    <TrendingUp className="h-6 w-6 text-green-600" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Receitas do Mês</dt>
                    <dd className="text-lg font-semibold text-gray-900">{formatCurrency(kpis.monthlyRevenue)}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="bg-red-100 rounded-md p-3">
                    <TrendingDown className="h-6 w-6 text-red-600" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Despesas do Mês</dt>
                    <dd className="text-lg font-semibold text-gray-900">{formatCurrency(kpis.monthlyExpenses)}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="bg-blue-100 rounded-md p-3">
                    <DollarSign className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Lucro Líquido</dt>
                    <dd className="text-lg font-semibold text-gray-900">{formatCurrency(kpis.netProfit)}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabela de Entradas */}
        <div className="mt-8">
          <div className="bg-white shadow-sm rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Lançamentos Recentes</h3>
            </div>
            {entries.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhuma entrada financeira</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Comece registrando uma receita ou despesa.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDate(entry.entry_date)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.description}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${entry.type === 'receita' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {entry.type === 'receita' ? 'Receita' : 'Despesa'}
                          </span>
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${entry.type === 'receita' ? 'text-green-600' : 'text-red-600'}`}>
                          {entry.type === 'receita' ? '+' : '-'}{formatCurrency(entry.amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button onClick={() => handleEditEntry(entry)} className="text-indigo-600 hover:text-indigo-900 mr-3"><Edit className="w-4 h-4" /></button>
                          {/* MELHORIA: Chama a função que abre o modal de confirmação */}
                          <button onClick={() => requestDeleteEntry(entry.id!)} className="text-red-600 hover:text-red-900"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        
        {/* Modal de Criação/Edição */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={handleCloseModal}></div>
              <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <form onSubmit={handleSubmit(onSubmit)}>
                  <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900">{editingEntry ? 'Editar Entrada' : 'Nova Entrada'}</h3>
                      <button type="button" onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                    </div>
                    {/* MELHORIA: Exibição de Erro dentro do Modal */}
                    {error && (
                        <div className="bg-red-50 p-3 rounded-md mb-4 flex items-center">
                            <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="description" className="block text-sm font-medium text-gray-700">Descrição *</label>
                        <input type="text" {...register('description')} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm" />
                        {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
                      </div>
                      <div>
                        <label htmlFor="amount" className="block text-sm font-medium text-gray-700">Valor (€) *</label>
                        <input type="number" step="0.01" {...register('amount', { valueAsNumber: true })} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm" />
                        {errors.amount && <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>}
                      </div>
                      <div>
                        <label htmlFor="type" className="block text-sm font-medium text-gray-700">Tipo *</label>
                        <select {...register('type')} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm">
                          <option value="">Selecione...</option>
                          <option value="receita">Receita</option>
                          <option value="despesa">Despesa</option>
                        </select>
                        {errors.type && <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>}
                      </div>
                      <div>
                        <label htmlFor="entry_type" className="block text-sm font-medium text-gray-700">Frequência *</label>
                        <select {...register('entry_type')} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm">
                          <option value="">Selecione...</option>
                          <option value="pontual">Pontual</option>
                          <option value="fixa">Fixa</option>
                        </select>
                        {errors.entry_type && <p className="mt-1 text-sm text-red-600">{errors.entry_type.message}</p>}
                      </div>
                      <div>
                        <label htmlFor="entry_date" className="block text-sm font-medium text-gray-700">Data *</label>
                        <input type="date" {...register('entry_date')} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm" />
                        {errors.entry_date && <p className="mt-1 text-sm text-red-600">{errors.entry_date.message}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                    <button type="submit" disabled={isSubmitting} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-r from-pink-500 to-violet-500 text-base font-medium text-white hover:from-pink-600 hover:to-violet-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50">
                      {/* MELHORIA: Feedback visual durante o envio */}
                      {isSubmitting ? 'Salvando...' : (editingEntry ? 'Atualizar' : 'Criar')}
                    </button>
                    <button type="button" onClick={handleCloseModal} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm" disabled={isSubmitting}>
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* MELHORIA: Modal de Confirmação de Exclusão */}
        {isConfirmModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen">
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setIsConfirmModalOpen(false)}></div>
              <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-sm mx-auto text-center">
                 <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                    <AlertCircle className="h-6 w-6 text-red-600" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mt-4">Confirmar Exclusão</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Tem a certeza que deseja excluir esta entrada? Esta ação não pode ser desfeita.
                </p>
                <div className="mt-6 flex justify-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsConfirmModalOpen(false)}
                    className="px-4 py-2 bg-white text-gray-800 rounded-md border border-gray-300 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteEntry}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}