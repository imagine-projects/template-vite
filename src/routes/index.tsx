import { useAuth } from "@/hooks/use-auth";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen flex flex-col p-8">
      <div className="flex-grow flex flex-col justify-center items-center gap-4 text-center">
        <h1 className="text-2xl">Welcome to your Imagine app!</h1>

        {user ? (
          <>
            <p>You are logged in as {user.email}</p>
            <button onClick={() => signOut.mutate()} className="text-blue-500 underline">
              Sign out
            </button>
          </>
        ) : (
          <>
            <p>You are not logged in. Sign in to continue.</p>
            <Link to="/sign-in" search={{
              redirect: location.pathname,
            }} className="text-blue-500 underline">
              Sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
