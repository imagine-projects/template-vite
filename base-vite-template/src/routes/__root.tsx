import { RouterContext } from "@/main";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ location }) => {
    console.log("beforeLoad __root", location.pathname);
  },
  component: () => (
    <>
      <Outlet />
      {import.meta.env.VITE_HIDE_DEVTOOLS !== "true" && (
        <TanStackRouterDevtools />
      )}
    </>
  ),
});
