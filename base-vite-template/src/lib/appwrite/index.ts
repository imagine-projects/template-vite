import { Client, Account } from "appwrite";

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;

if (!endpoint) {
  throw new Error("VITE_APPWRITE_ENDPOINT is not set");
}

const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;

if (!projectId) {
  throw new Error("VITE_APPWRITE_PROJECT_ID is not set");
}

const appwriteClient = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId);

const account = new Account(appwriteClient)

export {
  appwriteClient,
  account,
};
