import {
  ErpServiceItem,
  ServiceCategoryItem,
  ServiceSubcategoryItem,
} from '../modules/types';

export interface ServicesRealtimeCallbacks {
  onCategories: (items: ServiceCategoryItem[]) => void;
  onSubcategories: (items: ServiceSubcategoryItem[]) => void;
  onServices: (items: ErpServiceItem[]) => void;
  onError?: (err: unknown) => void;
}

/**
 * Direct client-side Firestore realtime listeners have been removed along with
 * client Firebase Authentication. Service catalog state synchronizes exclusively
 * via authenticated backend /api/erp/services endpoints.
 */
export function subscribeServicesModuleRealtime(
  _callbacks: ServicesRealtimeCallbacks
): () => void {
  return () => {};
}
