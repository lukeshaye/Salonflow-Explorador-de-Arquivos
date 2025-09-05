import { useState, useEffect } from 'react';
import { useSupabaseAuth } from '../auth/SupabaseAuthProvider'; // 1. Usar o nosso hook de autenticação
import { supabase } from '../supabaseClient'; // 2. Importar o cliente Supabase
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { Calendar, DollarSign, TrendingUp, MessageCircle } from 'lucide-react';
import type { AppointmentType } from '../../shared/types'; // Ajuste o caminho se necessário

// --- Definição de Tipos para os dados do Dashboard ---
interface DashboardKPIs {
  dailyEarnings: number;
  dailyAppointments: number;
  avgTicket: number;
}
interface WeeklyEarning {
  entry_date: string;
  earnings: number;
}
interface ServicePopularity {
  service: string;
  count: number;
}
interface ProfessionalPerformance {
  professional: string;
  count: number;
}

/**
 * Página principal que mostra uma visão geral do negócio.
 */
export default function Dashboard() {
  const { user } = useSupabaseAuth(); // Obter utilizador
  
  // --- Estados do Componente ---
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<AppointmentType[]>([]);
  const [weeklyEarnings, setWeeklyEarnings] = useState<WeeklyEarning[]>([]);
  const [popularServices, setPopularServices] = useState<ServicePopularity[]>([]);
  const [professionalPerformance, setProfessionalPerformance] = useState<ProfessionalPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Efeito para Carregar os Dados ---
  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  /**
   * 3. Orquestra todas as buscas de dados para o dashboard em paralelo.
   */
  const fetchDashboardData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Executa todas as promessas de busca de dados simultaneamente
      const [
        kpisData, 
        appointmentsData, 
        weeklyData, 
        servicesData, 
        performanceData
      ] = await Promise.all([
        fetchKPIs(),
        fetchTodayAppointments(),
        fetchWeeklyEarnings(),
        fetchPopularServices(),
        fetchProfessionalPerformance()
      ]);

      // Atualiza todos os estados de uma vez
      setKpis(kpisData);
      setTodayAppointments(appointmentsData || []);
      setWeeklyEarnings(weeklyData || []);
      setPopularServices(servicesData || []);
      setProfessionalPerformance(performanceData || []);

    } catch (error) {
      console.error('Erro ao carregar dados do dashboard:', (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // --- Funções de Busca de Dados Específicas ---

  const fetchKPIs = async (): Promise<DashboardKPIs> => {
    if (!user) return { dailyEarnings: 0, dailyAppointments: 0, avgTicket: 0 };

    const today = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD

    // Busca agendamentos de hoje para calcular tudo a partir deles
    const { data: appointmentsToday, error } = await supabase
      .from('appointments')
      .select('price')
      .eq('user_id', user.id)
      .like('appointment_date', `${today}%`);
    
    if (error) throw error;
    
    const dailyAppointments = appointmentsToday?.length || 0;
    const dailyEarnings = appointmentsToday?.reduce((sum, app) => sum + app.price, 0) || 0;
    const avgTicket = dailyAppointments > 0 ? dailyEarnings / dailyAppointments : 0;

    return { dailyEarnings, dailyAppointments, avgTicket };
  };

  const fetchTodayAppointments = async (): Promise<AppointmentType[] | null> => {
     if (!user) return null;
     const today = new Date().toISOString().split('T')[0];
     const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', user.id)
        .like('appointment_date', `${today}%`)
        .order('appointment_date', { ascending: true });
    if (error) throw error;
    return data;
  };

  const fetchWeeklyEarnings = async (): Promise<WeeklyEarning[] | null> => {
    if (!user) return null;
    const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('financial_entries')
      .select('entry_date, amount')
      .eq('user_id', user.id)
      .eq('type', 'receita')
      .gte('entry_date', sevenDaysAgo);

    if (error) throw error;

    // Agregação no frontend
    const earningsByDay: { [key: string]: number } = {};
    if (data) {
        for (const entry of data) {
            earningsByDay[entry.entry_date] = (earningsByDay[entry.entry_date] || 0) + entry.amount;
        }
    }
    return Object.entries(earningsByDay).map(([date, earnings]) => ({ entry_date: date, earnings }));
  };
  
  const fetchPopularServices = async (): Promise<ServicePopularity[] | null> => {
      if(!user) return null;
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('appointments')
        .select('service')
        .eq('user_id', user.id)
        .gte('appointment_date', thirtyDaysAgo);

      if (error) throw error;
      
      // Contagem no frontend
      const serviceCounts = data?.reduce((acc, { service }) => {
          acc[service] = (acc[service] || 0) + 1;
          return acc;
      }, {} as Record<string, number>) || {};

      return Object.entries(serviceCounts)
          .map(([service, count]) => ({ service, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
  };

  const fetchProfessionalPerformance = async (): Promise<ProfessionalPerformance[] | null> => {
      if(!user) return null;
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('appointments')
        .select('professional')
        .eq('user_id', user.id)
        .gte('appointment_date', thirtyDaysAgo);

      if (error) throw error;
      
      // Contagem no frontend
      const profCounts = data?.reduce((acc, { professional }) => {
          acc[professional] = (acc[professional] || 0) + 1;
          return acc;
      }, {} as Record<string, number>) || {};

      return Object.entries(profCounts)
          .map(([professional, count]) => ({ professional, count }))
          .sort((a, b) => b.count - a.count);
  };


  // --- Funções Auxiliares (sem alterações) ---
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: 'EUR'
    }).format(value / 100);
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('pt-PT', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const sendWhatsAppReminder = (appointment: AppointmentType) => {
    const message = `Olá ${appointment.client_name}! Lembrete do seu agendamento para ${appointment.service} hoje às ${formatTime(appointment.appointment_date)} com ${appointment.professional}. Até já! 😊`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  // --- Renderização ---
  if (loading) {
    return <Layout><LoadingSpinner /></Layout>;
  }

  return (
    <Layout>
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Visão Geral</h1>
          <p className="mt-2 text-gray-600">Acompanhe o desempenho do seu negócio</p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 mb-8">
          <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="bg-green-100 rounded-md p-3">
                    <DollarSign className="h-6 w-6 text-green-600" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Ganhos do Dia</dt>
                    <dd className="text-lg font-semibold text-gray-900">
                      {kpis ? formatCurrency(kpis.dailyEarnings) : '€0,00'}
                    </dd>
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
                    <Calendar className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Agendamentos Hoje</dt>
                    <dd className="text-lg font-semibold text-gray-900">
                      {kpis ? kpis.dailyAppointments : 0}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="bg-purple-100 rounded-md p-3">
                    <TrendingUp className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Ticket Médio</dt>
                    <dd className="text-lg font-semibold text-gray-900">
                      {kpis ? formatCurrency(kpis.avgTicket) : '€0,00'}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white shadow-sm rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Agendamentos de Hoje</h3>
            </div>
            <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {todayAppointments.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">
                  Nenhum agendamento para hoje
                </div>
              ) : (
                todayAppointments.map((appointment) => (
                  <div key={appointment.id} className="px-6 py-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900">
                            {formatTime(appointment.appointment_date)} - {appointment.client_name}
                          </p>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            appointment.is_confirmed 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {appointment.is_confirmed ? 'Confirmado' : 'Pendente'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {appointment.service} • {appointment.professional} • {formatCurrency(appointment.price)}
                        </p>
                      </div>
                      <button
                        onClick={() => sendWhatsAppReminder(appointment)}
                        className="ml-4 inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-green-700 bg-green-100 hover:bg-green-200 transition-colors"
                      >
                        <MessageCircle className="w-3 h-3 mr-1" />
                        Lembrete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="bg-white shadow-sm rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Ganhos da Semana</h3>
            </div>
            <div className="p-6">
              {weeklyEarnings.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  Sem dados para exibir
                </div>
              ) : (
                <div className="space-y-3">
                  {weeklyEarnings.map((day, index) => {
                    const maxEarnings = Math.max(...weeklyEarnings.map(d => d.earnings));
                    const percentage = maxEarnings > 0 ? (day.earnings / maxEarnings) * 100 : 0;
                    
                    return (
                      <div key={index} className="flex items-center">
                        <div className="w-16 text-xs text-gray-600">
                          {new Date(day.entry_date + 'T00:00:00').toLocaleDateString('pt-PT', { 
                            day: '2-digit', 
                            month: '2-digit' 
                          })}
                        </div>
                        <div className="flex-1 mx-3">
                          <div className="bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                        <div className="w-20 text-xs font-medium text-right">
                          {formatCurrency(day.earnings)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
