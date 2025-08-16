import { useAuth } from '@/hooks/use-auth'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/dashboard')({
  component: RouteComponent,
})

function RouteComponent() {
  const { user } = useAuth();

  return <div>Hello protected dashboard! {user?.email}</div>
}
