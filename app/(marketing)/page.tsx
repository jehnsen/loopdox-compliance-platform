import { redirect } from 'next/navigation'

/** The marketing site is separate; the app root goes to sign-in. */
export default function RootPage() {
  redirect('/login')
}
