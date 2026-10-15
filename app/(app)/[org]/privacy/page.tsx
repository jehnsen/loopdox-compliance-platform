import { redirect } from 'next/navigation'

/** /[org]/privacy has no page of its own: start at the processing records. */
export default async function Page({ params }: PageProps<'/[org]/privacy'>) {
  const { org } = await params
  redirect(`/${org}/privacy/processing`)
}
