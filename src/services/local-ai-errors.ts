import { LocalizedError, message, type TranslationKey } from '../i18n/core';

export type LocalAiErrorCode =
  | 'mobile_build_required'
  | 'runtime_unavailable'
  | 'model_unavailable'
  | 'image_preparation_failed'
  | 'image_dimensions_invalid'
  | 'invalid_model_output';

const errorKeys: Record<LocalAiErrorCode, TranslationKey> = {
  mobile_build_required: 'ai.mobileBuildRequired',
  runtime_unavailable: 'ai.runtimeUnavailable',
  model_unavailable: 'ai.modelUnavailable',
  image_preparation_failed: 'ai.imagePreparationFailed',
  image_dimensions_invalid: 'ai.imageDimensionsInvalid',
  invalid_model_output: 'ai.invalidModelOutput',
};

export function localAiError(code: LocalAiErrorCode): LocalizedError {
  return new LocalizedError(message(errorKeys[code]));
}

export function throwLocalAiError(code: LocalAiErrorCode): never {
  throw localAiError(code);
}
