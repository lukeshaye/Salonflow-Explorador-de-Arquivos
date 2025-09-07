import { create } from 'zustand';
import type { User } from '@getmocha/users-service/react';

interface AppState {
  user: User | null;
  setUser: (user: User | null) => void;
  
  // Loading states
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  
  // Business settings
  businessSettings: BusinessSettings | null;
  setBusinessSettings: (settings: BusinessSettings | null) => void;
}

interface BusinessSettings {
  id: number;
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
  
  businessSettings: null,
  setBusinessSettings: (businessSettings) => set({ businessSettings }),
}));
