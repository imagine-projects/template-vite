import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/_auth/configure-preview-token')({
  component: RouteComponent,
})

function RouteComponent() {
  const getPreviewTokenFromUrl = () => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get("imaginePreviewToken");
  }

  const handlePreviewToken = () => {
    const previewTokenInUrl = getPreviewTokenFromUrl();

    if (previewTokenInUrl) {
      localStorage.setItem("imaginePreviewToken", previewTokenInUrl);
      // remove the token from the url
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("imaginePreviewToken");
      window.history.replaceState({}, "", newUrl.toString());
    } else {
      window.location.href = "/";
    }
  }

  useEffect(() => {
    handlePreviewToken();
  })

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      Configuring Preview Token...
    </div>
  )
}
