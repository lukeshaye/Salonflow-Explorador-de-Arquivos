import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSupabaseAuth } from '../auth/SupabaseAuthProvider'; // 1. Usar o nosso hook de autenticação
import { supabase } from '../supabaseClient'; // 2. Importar o cliente Supabase
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { Package, Plus, Edit, Trash2, AlertTriangle, X } from 'lucide-react';
import type { ProductType } from '../../shared/types'; // Ajuste o caminho se necessário
import { CreateProductSchema } from '../../shared/types'; // Ajuste o caminho se necessário

// --- Definição de Tipos ---
interface ProductFormData {
  name: string;
  description?: string;
  price: number; // No formulário, usamos o valor em euros (ex: 10.50)
  quantity?: number;
  image_url?: string;
}

/**
 * Página para gerir os produtos do catálogo.
 */
export default function Products() {
  // 3. Obter o utilizador do nosso hook
  const { user } = useSupabaseAuth(); 
  
  // --- Estados do Componente ---
  const [products, setProducts] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductType | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormData>({
    resolver: zodResolver(CreateProductSchema) as any,
  });

  // --- Efeito para Carregar os Dados ---
  useEffect(() => {
    if (user) {
      fetchProducts();
    }
  }, [user]);

  /**
   * 4. Lógica para buscar os produtos no Supabase.
   */
  const fetchProducts = async () => {
    if (!user) return;
    setLoading(true);
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
    } catch (error) {
      console.error('Erro ao carregar produtos:', (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 5. Lógica para submeter o formulário (criar ou atualizar um produto).
   */
  const onSubmit = async (formData: ProductFormData) => {
    if (!user) return;

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
    } catch (error) {
      console.error('Erro ao salvar produto:', (error as Error).message);
    }
  };

  /**
   * 6. Lógica para apagar um produto.
   */
  const handleDeleteProduct = async (productId: number) => {
    const confirmDelete = window.confirm('Tem certeza que deseja excluir este produto?');
    if (!user || !confirmDelete) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId)
        .eq('user_id', user.id);

      if (error) throw error;

      await fetchProducts();
    } catch (error) {
      console.error('Erro ao excluir produto:', (error as Error).message);
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
    reset();
  };

  const formatCurrency = (value: number) => {
    // O valor vem em cêntimos, dividimos por 100 para formatar
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: 'EUR'
    }).format(value / 100);
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

        <div className="mt-8">
          {products.length === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum produto</h3>
              <p className="mt-1 text-sm text-gray-500">
                Comece adicionando produtos ao seu catálogo.
              </p>
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
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
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
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
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
                      onClick={() => handleDeleteProduct(product.id!)}
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
      </div>
    </Layout>
  );
}
