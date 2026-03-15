import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ContentOptimizationHints } from "@/types/feedbackLoop";

interface OptimizationState {
  hints: ContentOptimizationHints | null;
  lastFetchedAt: string | null;   // ISO datetime string
  isEnabled: boolean;             // controls injection into generation prompt
}

interface OptimizationActions {
  setHints: (hints: ContentOptimizationHints) => void;
  clearHints: () => void;
  toggleEnabled: () => void;
  setEnabled: (enabled: boolean) => void;
}

export type OptimizationStore = OptimizationState & OptimizationActions;

export const useOptimizationStore = create<OptimizationStore>()(
  persist(
    (set) => ({
      // State
      hints: null,
      lastFetchedAt: null,
      isEnabled: true,

      // Actions
      setHints: (hints) =>
        set({ hints, lastFetchedAt: new Date().toISOString() }),
      clearHints: () =>
        set({ hints: null, lastFetchedAt: null }),
      toggleEnabled: () =>
        set((state) => ({ isEnabled: !state.isEnabled })),
      setEnabled: (enabled) =>
        set({ isEnabled: enabled }),
    }),
    {
      name: "optimization-store-v1",
      partialize: (state) => ({
        hints: state.hints,
        lastFetchedAt: state.lastFetchedAt,
        isEnabled: state.isEnabled,
      }),
    }
  )
);
