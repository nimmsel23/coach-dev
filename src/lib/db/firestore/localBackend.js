/** Guard access to the owner's local catalog backend in public product builds. */
export function createLocalFitnessFetch({ product, fetchImpl }) {
  return async (...args) => {
    if (product) throw new Error('local_fitness_backend_unavailable');
    return fetchImpl(...args);
  };
}

export const isProductBuild = import.meta.env?.VITE_VOS_PRODUCT_BUILD === '1';
export const localFitnessFetch = createLocalFitnessFetch({
  product: isProductBuild,
  fetchImpl: (...args) => globalThis.fetch(...args),
});
