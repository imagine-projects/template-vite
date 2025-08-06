import { useEffect } from 'react'

export function ConfigureImaginePreviewToken({ children }: { children: React.ReactNode }) {
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
    }
  }

  useEffect(() => {
    handlePreviewToken();
  }, [])

  return (
    <>
      {children}
    </>
  )
}
