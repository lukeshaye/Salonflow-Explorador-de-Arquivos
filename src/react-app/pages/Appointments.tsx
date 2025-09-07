import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSupabaseAuth } from '../auth/SupabaseAuthProvider'; // 1. Usar o nosso hook de autenticação
import { useAppStore } from '../../shared/store'; // Importar a store global
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { Plus, X } from 'lucide-react';
import { Calendar as BigCalendar, momentLocalizer, View, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import type { AppointmentType, ClientType } from '../../shared/types'; // Ajuste o caminho se necessário
import { CreateAppointmentSchema } from '../../shared/types'; // Ajuste o caminho se necessário

// --- Configuração e Tipos ---
moment.locale('pt');
const localizer = momentLocalizer(moment);

interface AppointmentFormData {
  client_id: number;
  service: string;
  price: number;
  professional: string;
  appointment_date: string;
  is_confirmed?: boolean;
}

interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resource: AppointmentType;
}

/**
 * Página para gerir os agendamentos num calendário interativo.
 */
export default function Appointments() {
  const { user } = useSupabaseAuth(); // 3. Obter o utilizador do nosso hook
  
  // Usar a store global
  const { 
    appointments, 
    clients, 
    professionals, 
    loading, 
    fetchAppointments, 
    fetchClients, 
    fetchProfessionals,
    addAppointment,
    updateAppointment,
    deleteAppointment
  } = useAppStore();

  // --- Estados do Componente ---
  const [error, setError] = useState<string | null>(null); // Para feedback de erros ao utilizador
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false); // Controla a visibilidade da modal de exclusão
  const [appointmentToDelete, setAppointmentToDelete] = useState<number | null>(null); // Armazena o ID do agendamento a ser excluído
  const [editingAppointment, setEditingAppointment] = useState<AppointmentType | null>(null);
  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState(new Date());

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AppointmentFormData>({
    resolver: zodResolver(CreateAppointmentSchema) as any,
  });

  // --- Efeito para Carregar os Dados ---
  useEffect(() => {
    if (user) {
      const fetchData = async () => {
        setError(null); // Limpar erros anteriores a cada novo carregamento
        try {
          // Executar todas as queries em paralelo usando a store
          await Promise.all([
            fetchAppointments(user.id),
            fetchClients(user.id),
            fetchProfessionals(user.id)
          ]);
        } catch (err: any) {
          console.error('Erro ao carregar dados:', err.message);
          setError("Ocorreu uma falha ao carregar os dados. Por favor, tente novamente mais tarde.");
        }
      };
      fetchData();
    }
  }, [user, fetchAppointments, fetchClients, fetchProfessionals]);


  /**
   * 5. Lógica para submeter o formulário (criar ou atualizar).
   */
  const onSubmit = async (data: AppointmentFormData) => {
    if (!user) return;

    setError(null); // Limpar erros anteriores
    const appointmentData = {
      ...data,
      price: Math.round(Number(data.price) * 100), // Conversão segura para cêntimos
      client_id: data.client_id, // Já é um número
      is_confirmed: data.is_confirmed ?? false,
    };

    try {
      if (editingAppointment) {
        // --- ATUALIZAÇÃO ---
        await updateAppointment({ ...editingAppointment, ...appointmentData });
      } else {
        // --- CRIAÇÃO ---
        await addAppointment(appointmentData, user.id);
      }

      handleCloseModal();
    } catch (error) {
      console.error('Erro ao salvar agendamento:', (error as Error).message);
      setError("Não foi possível salvar o agendamento. Tente novamente.");
    }
  };

  /**
   * 6. Lógica para apagar um agendamento.
   */
  const requestDeleteAppointment = (appointmentId: number) => {
    setAppointmentToDelete(appointmentId);
    setIsConfirmModalOpen(true);
    setError(null); // Limpar erros antigos
  };

  const handleDeleteAppointment = async () => {
    if (!user || appointmentToDelete === null) return;

    try {
      await deleteAppointment(appointmentToDelete);
      setIsConfirmModalOpen(false); // Fecha a modal
    } catch (err: any) {
      console.error('Erro ao excluir:', err.message);
      setError("Não foi possível excluir o agendamento. Tente novamente.");
    } finally {
      // Limpa o estado independentemente do resultado
      setAppointmentToDelete(null);
    }
  };

  // --- Funções Auxiliares e de Interação com o Calendário (sem grandes alterações) ---

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingAppointment(null);
    reset();
  };

  const handleSelectSlot = useCallback(({ start }: { start: Date }) => {
    const appointmentDateTime = moment(start).format('YYYY-MM-DDTHH:mm');
    setValue('appointment_date', appointmentDateTime);
    setIsModalOpen(true);
  }, [setValue]);

  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    handleEditAppointment(event.resource);
  }, []);

  const handleEditAppointment = (appointment: AppointmentType) => {
    setEditingAppointment(appointment);
    const appointmentDate = new Date(appointment.appointment_date);
    
    reset({
      client_id: appointment.client_id, // Usar o ID do cliente
      service: appointment.service,
      price: appointment.price / 100, // Converter cêntimos para euros
      professional: appointment.professional,
      appointment_date: moment(appointmentDate).format('YYYY-MM-DDTHH:mm'),
      is_confirmed: appointment.is_confirmed,
    });
    setIsModalOpen(true);
  };

  // --- Conversão de dados para o formato do Calendário ---
  const calendarEvents: CalendarEvent[] = appointments.map((appointment: AppointmentType) => {
    // Encontra o cliente correspondente no estado 'clients'
    const client = clients.find((c: ClientType) => c.id === appointment.client_id);
    
    // Cria um título descritivo. Usa um fallback caso o cliente não seja encontrado.
    const title = `${client ? client.name : 'Cliente desconhecido'} - ${appointment.service}`;

    const start = new Date(appointment.appointment_date);
    const end = moment(start).add(1, 'hours').toDate(); // Manter a duração padrão de 1 hora
    
    return {
      id: appointment.id!,
      title: title,
      start,
      end,
      resource: appointment,
    };
  });

  const eventStyleGetter = (event: CalendarEvent) => {
    const backgroundColor = event.resource.is_confirmed ? '#10b981' : '#f59e0b';
    return {
      style: { backgroundColor, borderRadius: '5px', opacity: 0.8, color: 'white', border: '0px', display: 'block' }
    };
  };

  // --- Renderização ---
  if (loading.appointments || loading.clients || loading.professionals) {
    return <Layout><LoadingSpinner /></Layout>;
  }

  return (
    <Layout>
      {/* Exibição de Erro Global */}
      {error && (
        <div className="mb-4 p-4 bg-red-100 border-l-4 border-red-500 text-red-700">
          <p className="font-bold">Erro</p>
          <p>{error}</p>
        </div>
      )}
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="sm:flex sm:items-center">
          <div className="sm:flex-auto">
            <h1 className="text-3xl font-bold text-gray-900">Agendamentos</h1>
            <p className="mt-2 text-gray-600">Gerencie todos os seus agendamentos</p>
          </div>
          <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-gradient-to-r from-pink-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:from-pink-600 hover:to-violet-600 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Agendamento
            </button>
          </div>
        </div>

        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div style={{ height: '600px' }}>
            <BigCalendar
              localizer={localizer}
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              view={view}
              onView={setView}
              date={date}
              onNavigate={setDate}
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
              selectable
              eventPropGetter={eventStyleGetter}
              messages={{
                next: 'Próximo',
                previous: 'Anterior',
                today: 'Hoje',
                month: 'Mês',
                week: 'Semana',
                day: 'Dia',
                agenda: 'Agenda',
                date: 'Data',
                time: 'Hora',
                event: 'Evento',
                noEventsInRange: 'Nenhum agendamento neste período',
                showMore: (total: number) => `+ Ver mais (${total})`,
              }}
              min={moment().startOf('day').add(8, 'hours').toDate()}
              max={moment().startOf('day').add(20, 'hours').toDate()}
            />
          </div>
        </div>

        {isModalOpen && (
           <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={handleCloseModal}></div>
              <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <form onSubmit={handleSubmit(onSubmit as any)}>
                  <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900">{editingAppointment ? 'Editar Agendamento' : 'Novo Agendamento'}</h3>
                      <button type="button" onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="client_id" className="block text-sm font-medium text-gray-700">Cliente *</label>
                        <select
                          {...register('client_id', { valueAsNumber: true })}
                          id="client_id"
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm"
                        >
                          <option value="">Selecione um cliente</option>
                          {clients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.name}
                            </option>
                          ))}
                        </select>
                        {errors.client_id && <p className="mt-1 text-sm text-red-600">{errors.client_id.message}</p>}
                      </div>
                      <div>
                        <label htmlFor="service" className="block text-sm font-medium text-gray-700">Serviço *</label>
                        <input type="text" {...register('service')} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm" />
                        {errors.service && <p className="mt-1 text-sm text-red-600">{errors.service.message}</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="price" className="block text-sm font-medium text-gray-700">Preço (€) *</label>
                          <input type="number" step="0.01" {...register('price', { valueAsNumber: true })} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm" />
                          {errors.price && <p className="mt-1 text-sm text-red-600">{errors.price.message}</p>}
                        </div>
                        <div>
                          <label htmlFor="professional" className="block text-sm font-medium text-gray-700">Profissional *</label>
                          <select
                            {...register('professional')}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm"
                          >
                            <option value="">Selecione um profissional</option>
                            {professionals.map((professional) => (
                              <option key={professional.id} value={professional.name}>
                                {professional.name}
                              </option>
                            ))}
                          </select>
                          {errors.professional && <p className="mt-1 text-sm text-red-600">{errors.professional.message}</p>}
                        </div>
                      </div>
                      <div>
                        <label htmlFor="appointment_date" className="block text-sm font-medium text-gray-700">Data e Hora *</label>
                        <input type="datetime-local" {...register('appointment_date')} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500 sm:text-sm" />
                        {errors.appointment_date && <p className="mt-1 text-sm text-red-600">{errors.appointment_date.message}</p>}
                      </div>
                      <div className="flex items-center">
                        <input id="is_confirmed" type="checkbox" {...register('is_confirmed')} className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded" />
                        <label htmlFor="is_confirmed" className="ml-2 block text-sm text-gray-900">Agendamento confirmado</label>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                    <button type="submit" disabled={isSubmitting} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-r from-pink-500 to-violet-500 text-base font-medium text-white hover:from-pink-600 hover:to-violet-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50">
                      {isSubmitting ? 'Salvando...' : (editingAppointment ? 'Atualizar' : 'Criar')}
                    </button>
                    <button type="button" onClick={handleCloseModal} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Confirmação de Exclusão */}
        {isConfirmModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
              <h3 className="text-xl font-bold text-gray-900">Confirmar Exclusão</h3>
              <p className="mt-2 text-sm text-gray-600">
                Tem a certeza de que deseja excluir este agendamento? Esta ação não pode ser revertida.
              </p>
              
              {/* Exibição de Erro na Modal */}
              {error && <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">{error}</div>}

              <div className="mt-6 flex justify-end gap-3">
                <button 
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleDeleteAppointment} 
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
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
