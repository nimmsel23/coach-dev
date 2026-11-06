// Huawei Health Kit — https://developer.huawei.com/consumer/en/health/
// Braucht Huawei-Developer-Account + AppGallery-Registrierung. Nicht
// konfiguriert, siehe liveAdapter.js.
import { makeLiveAdapter } from './liveAdapter.js';

export const huaweiAdapter = makeLiveAdapter({
  id: 'huawei_health',
  label: 'Huawei Health',
  docsUrl: 'https://developer.huawei.com/consumer/en/health/',
  note: 'Braucht Huawei-Developer-Account + AppGallery-Registrierung.',
});
