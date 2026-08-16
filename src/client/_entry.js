// internal build shim: expose client plugin body to the loader wrapper.
import { apply, inject } from './index';
self.__dsh_model_retry_settings_entry__ = { apply, inject };
