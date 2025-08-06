import { RouterContext } from "@/main";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

const currentUrl = new URL(window.location.href);
const isEmbedded = currentUrl.searchParams.get("embedded") === "true";

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ location }) => {
    console.log("beforeLoad __root", location.pathname);
  },
  component: () => (
    <>
      <Outlet />
      {!isEmbedded && <TanStackRouterDevtools />}
    </>
  ),
});
