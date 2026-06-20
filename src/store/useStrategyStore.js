import { create } from 'zustand';
import { STRATEGIES } from '../data/strategies';

const useStrategyStore = create((set, get) => ({
  // Strategy selection
  strategy: STRATEGIES[4], // Default: Bull Call Spread
  legs: JSON.parse(JSON.stringify(STRATEGIES[4].legs)),
  category: 'all',
  search: '',

  // Scenario parameters
  spot: 100,
  ivShift: 0,
  rate: 4.0,
  div: 0.0,
  range: 50,
  contracts: 100,

  // Greeks chart DTE slider (null = use each leg's own DTE)
  dteSlider: null,

  // Actions
  setStrategy: (strategy) =>
    set({
      strategy,
      legs: JSON.parse(JSON.stringify(strategy.legs)),
      dteSlider: null,
    }),

  setCategory: (category) => set({ category }),
  setSearch: (search) => set({ search }),

  setSpot: (spot) => set({ spot: Number(spot) }),
  setIvShift: (ivShift) => set({ ivShift: Number(ivShift) }),
  setRate: (rate) => set({ rate: Number(rate) }),
  setDiv: (div) => set({ div: Number(div) }),
  setRange: (range) => set({ range: Number(range) }),
  setContracts: (contracts) => set({ contracts: Number(contracts) }),
  setDteSlider: (dteSlider) => set({ dteSlider }),

  updateLeg: (index, field, value) =>
    set((state) => {
      const legs = [...state.legs];
      legs[index] = { ...legs[index], [field]: value };
      return { legs };
    }),

  addLeg: () =>
    set((state) => ({
      legs: [
        ...state.legs,
        { type: 'call', dir: 1, K: state.spot, dte: 45, iv: 0.30, qty: 1 },
      ],
    })),

  removeLeg: (index) =>
    set((state) => ({
      legs: state.legs.filter((_, i) => i !== index),
    })),

  resetLegs: () =>
    set((state) => ({
      legs: JSON.parse(JSON.stringify(state.strategy.legs)),
    })),

  // Filtered strategies for sidebar
  getFilteredStrategies: () => {
    const { category, search } = get();
    return STRATEGIES.filter((s) => {
      const matchCat = category === 'all' || s.cat === category;
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.zh.includes(q) ||
        s.desc.includes(q) ||
        s.cat.includes(q) ||
        s.tag.includes(q);
      return matchCat && matchSearch;
    });
  },
}));

export default useStrategyStore;
