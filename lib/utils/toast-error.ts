import { toast } from 'sonner'
import { isApiError } from '@/lib/api/client'

/** Shows the server's plain-language error, or a fallback. */
export function toastError(error: unknown, fallback = 'Something went wrong. Try again.'): void {
  toast.error(isApiError(error) ? error.message : fallback)
}
