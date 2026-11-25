export const isProductionProfile = import.meta.env.VITE_PROFILE !== 'dev'
export const usesServerManagedAccount =
  isProductionProfile || import.meta.env.VITE_SERVER_MANAGED_ACCOUNT === 'true'
