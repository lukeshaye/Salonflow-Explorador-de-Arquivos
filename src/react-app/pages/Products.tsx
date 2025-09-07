import { useState, useEffect, useMemo } from 'react'; // Adicionar useMemo
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSupabaseAuth } from '../auth/SupabaseAuthProvider';
import { supabase } from '../supabaseClient';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { Package, Plus, Edit, Trash2, AlertTriangle, X, Search, XCircle } from 'lucide-react'; // Adicionar ícones
import type { ProductType } from '../../shared/types';
import { CreateProductSchema } from '../../shared/types';
import { formatCurrency } from '../utils'; // IMPORTAR de utils.ts

// --- Definição de Tipos ---
interface ProductFormData {
  name: string;
  description?: string;
  price: number; // No formulário, usamos o valor em euros (ex: 10.50)
  quantity?: number;
  image_url?: string;
}

// Valores padrão para o formulário
const defaultFormValues: ProductFormData = {
  name: '',
  description: '',
  price: 0,
  quantity: 0,
  image_url: '',
};

/**
 * Página para gerir os produtos do catálogo.
 */
export default function Products() {
  const { user } = useSupabaseAuth(); 
  
  // --- Estados do Componente ---
  const [products, setProducts] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // NOVO: Estado para erros
  const [searchTerm, setSearchTerm] = useState(''); // NOVO: Estado para a busca
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductType | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false); // NOVO: Estado para modal de confirmação
  const [productToDelete, setProductToDelete] = useState<number | null>(null); // NOVO: Estado para guardar ID do produto a ser excluído

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormData>({
    resolver: zodResolver(CreateProductSchema) as any,
    defaultValues: defaultFormValues, // MELHORIA: Definindo valores padrão
  });

  // --- Efeito para Carregar os Dados ---
  useEffect(() => {
    if (user) {
      fetchProducts();
    }
  }, [user]);

  // --- Lógica de Filtragem Otimizada com useMemo ---
  const filteredProducts = useMemo(() => {
    if (!searchTerm) {
      return products;
    }
    const lowercasedTerm = searchTerm.toLowerCase();
    return products.filter((product: ProductType) =>
      product.name.toLowerCase().includes(lowercasedTerm) ||
      product.description?.toLowerCase().includes(lowercasedTerm)
    );
  }, [products, searchTerm]);

  /**
   * Lógica para buscar os produtos no Supabase.
   */
  const fetchProducts = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

      if (error) throw error;

      if (data) {
        setProducts(data);
      }
    } catch (err: any) {
      setError("Falha ao carregar produtos. Tente novamente mais tarde.");
      console.error('Erro ao carregar produtos:', err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Lógica para submeter o formulário (criar ou atualizar um produto).
   */
  const onSubmit = async (formData: ProductFormData) => {
    if (!user) return;
    setError(null);

    // **IMPORTANTE**: Converter o preço de euros para cêntimos antes de guardar na BD
    const productData = {
      ...formData,
      price: Math.round(Number(formData.price) * 100),
    };

    try {
      if (editingProduct) {
        // --- LÓGICA DE ATUALIZAÇÃO ---
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // --- LÓGICA DE CRIAÇÃO ---
        const { error } = await supabase
          .from('products')
          .insert([{ ...productData, user_id: user.id }]);

        if (error) throw error;
      }

      await fetchProducts();
      handleCloseModal();
    } catch (err: any) {
      setError("Erro ao salvar o produto. Verifique os dados e tente novamente.");
      console.error('Erro ao salvar produto:', err.message);
    }
  };

  /**
   * Lógica de exclusão refatorada com modal e atualização otimista
   */
  const requestDeleteProduct = (productId: number) => {
    setProductToDelete(productId);
    setIsConfirmModalOpen(true);
  };

  const handleDeleteProduct = async () => {
    if (!user || productToDelete === null) return;

    const originalProducts = [...products]; // Salva o estado original para rollback
    const productId = productToDelete;

    // Atualização Otimista: remove o item da UI imediatamente
    setProducts((prevProducts: ProductType[]) => prevProducts.filter((p: ProductType) => p.id !== productId));
    setIsConfirmModalOpen(false);
    setError(null);

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId)
        .eq('user_id', user.id);

      if (error) throw error; // Se houver erro, o catch será acionado

    } catch (err: any) {
      setError("Erro ao excluir o produto. A operação foi desfeita.");
      setProducts(originalProducts); // Rollback: restaura a lista de produtos
      console.error('Erro ao excluir produto:', err.message);
    } finally {
      setProductToDelete(null); // Limpa o ID
    }
  };
  
  // --- Funções Auxiliares ---
  const handleEditProduct = (product: ProductType) => {
    setEditingProduct(product);
    reset({
      name: product.name,
      description: product.description || '',
      price: product.price / 100, // **IMPORTANTE**: Converter de cêntimos para euros para o formulário
      quantity: product.quantity || 0,
      image_url: product.image_url || '',
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    reset(defaultFormValues); // Limpa o formulário para os valores padrão
    setError(null); // Limpa os erros do modal
  };

  const isLowStock = (quantity: number | null | undefined) => (quantity ?? 0) <= 5;

  // --- Renderização ---
  if (loading) {
    return (
      <Layout>
        <LoadingSpinner />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="sm:flex sm:items-center">
          <div className="sm:flex-auto">
            <h1 className="text-3xl font-bold text-gray-900">Produtos</h1>
            <p className="mt-2 text-gray-600">Gerencie o seu catálogo de produtos</p>
          </div>
          <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-gradient-to-r from-pink-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:from-pink-600 hover:to-violet-600 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Produto
            </button>
          </div>
        </div>

        {/* NOVO: Barra de Busca e Alerta de Erros */}
        <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative w-full sm:max-w-xs">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nome ou descrição..."
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-red-50 p-4 rounded-lg flex items-start text-red-700">
            <XCircle className="h-5 w-5 mr-3 flex-shrink-0" />
            <div>
              <h3 className="font-semibold">Ocorreu um erro</h3>
              <p className="text-sm">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        <div className="mt-8">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                {searchTerm ? 'Nenhum produto encontrado' : 'Nenhum produto'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm 
                  ? 'Tente ajustar os termos de busca.' 
                  : 'Comece adicionando produtos ao seu catálogo.'
                }
              </p>
              {!searchTerm && (
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-600 hover:to-violet-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Produto
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product: ProductType) => (
                <div
                  key={product.id}
                  className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200 hover:shadow-md transition-shadow"
                >
                  {product.image_url && (
                    <div className="h-48 w-full overflow-hidden">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-full w-full object-cover"
                        onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                  )}
                  
                  <div className="px-6 py-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">{product.name}</h3>
                        {product.description && (
                          <p className="text-sm text-gray-600 mt-1">{product.description}</p>
                        )}
                      </div>
                      {isLowStock(product.quantity) && (
                        <div className="flex items-center ml-3">
                          <AlertTriangle className="w-5 h-5 text-amber-500" />
                          <span className="text-xs text-amber-700 ml-1">Estoque baixo</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-lg font-bold text-green-600">
                        {formatCurrency(product.price)}
                      </div>
                      <div className={`text-sm ${isLowStock(product.quantity) ? 'text-amber-600 font-medium' : 'text-gray-600'}`}>
                        Estoque: {product.quantity || 0}
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-between space-x-3">
                    <button
                      onClick={() => handleEditProduct(product)}
                      className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Editar
                    </button>
                    
                    <button
                      onClick={() => requestDeleteProduct(product.id!)}
                      className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal de Criação/Edição */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={handleCloseModal}></div>

              <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <form onSubmit={handleSubmit(onSubmit as any)}>
                  <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900">
                        {editingProduct ? 'Editar Produto' : 'Novo Produto'}
                      </h3>
                      <button
                        type="button"
                        onClick={handleCloseModal}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-6 h-6" />
                      </button>
                    </div>

                    {/* MELHORIA: Exibição de Erro dentro do Modal */}
                    {error && (
                      <div className="bg-red-50 p-3 rounded-md mb-4 flex items-center">
                        <XCircle className="h-5 w-5 text-red-500 mr-2" />
                        <p className="text-sm text-red-700">{error}</p>
                      </div>
                    )}

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
                        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                          Descrição
                        </label>
                        <textarea
                          {...register('description')}
                          rows={3}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm"
                        />
                        {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="price" className="block text-sm font-medium text-gray-700">
                            Preço (€) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            {...register('price', { valueAsNumber: true })}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm"
                          />
                          {errors.price && <p className="mt-1 text-sm text-red-600">{errors.price.message}</p>}
                        </div>

                        <div>
                          <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
                            Quantidade *
                          </label>
                          <input
                            type="number"
                            {...register('quantity', { valueAsNumber: true })}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm"
                          />
                          {errors.quantity && <p className="mt-1 text-sm text-red-600">{errors.quantity.message}</p>}
                        </div>
                      </div>

                      <div>
                        <label htmlFor="image_url" className="block text-sm font-medium text-gray-700">
                          URL da Imagem
                        </label>
                        <input
                          type="url"
                          {...register('image_url')}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm"
                          placeholder="https://exemplo.com/imagem.jpg"
                        />
                        {errors.image_url && <p className="mt-1 text-sm text-red-600">{errors.image_url.message}</p>}
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-r from-pink-500 to-violet-500 text-base font-medium text-white hover:from-pink-600 hover:to-violet-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                    >
                      {isSubmitting ? 'Salvando...' : (editingProduct ? 'Atualizar' : 'Criar')}
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

        {/* NOVO: Modal de Confirmação de Exclusão */}
        {isConfirmModalOpen && (
          <div className="fixed inset-0 z-50 bg-gray-900 bg-opacity-60 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-bold text-gray-900">Confirmar Exclusão</h3>
              <p className="mt-2 text-sm text-gray-600">
                Tem certeza de que deseja excluir este produto? Esta ação não pode ser desfeita.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteProduct}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}