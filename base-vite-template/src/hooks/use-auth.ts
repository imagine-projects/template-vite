import { account, appwriteClient } from "@/lib/appwrite";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function useAuth() {
  const queryClient = useQueryClient();
  const [isConfigured, setIsConfigured] = useState(false);
  const { data: user, isPending } = useQuery({
    queryKey: ["auth", "user"],
    queryFn: () => account.get(),
    enabled: isConfigured,
  });

  const deleteSession = async () => {
    try {
      await account.deleteSession("current");
    } catch (error) {
      console.error(error);
    }
  }

  const signOut = useMutation({
    mutationFn: deleteSession,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "user"] });
      window.location.reload();
    }
  });

  const handleImaginePreviewToken = () => {
    const previewTokenInLocalStorage = localStorage.getItem("imaginePreviewToken");

    if (previewTokenInLocalStorage) {
      appwriteClient.setJWT(previewTokenInLocalStorage);
    }

    setIsConfigured(true);
  }

  useEffect(() => {
    handleImaginePreviewToken();
  }, []);

  return {
    isPending,
    user,
    isAuthenticated: !!user,
    signOut,
  };
}
