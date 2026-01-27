/**
 * useAppToasts - app-level toast wiring.
 */
import { useToasts } from "../../components/ui/Toast";

import { useCustomNodeErrorToast } from "./useAppContentHelpers";

interface AppToastsParams {
  customNodeError: string | null;
  clearCustomNodeError: () => void;
}

export function useAppToasts({ customNodeError, clearCustomNodeError }: AppToastsParams) {
  const { toasts, addToast, dismissToast } = useToasts();

  useCustomNodeErrorToast(customNodeError, addToast, clearCustomNodeError);

  return { toasts, dismissToast };
}
