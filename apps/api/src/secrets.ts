import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

const client = new SecretManagerServiceClient();

export async function resolveSecretValue(options: {
  envValue?: string;
  envSecretName?: string;
  projectId?: string;
  fallback?: string;
}): Promise<string> {
  if (options.envValue) {
    return options.envValue;
  }

  if (options.envSecretName) {
    const projectId = options.projectId ?? process.env.SECRET_MANAGER_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
      throw new Error(`Missing project ID to resolve secret ${options.envSecretName}.`);
    }

    const [version] = await client.accessSecretVersion({
      name: `projects/${projectId}/secrets/${options.envSecretName}/versions/latest`
    });

    const payload = version.payload?.data?.toString();
    if (!payload) {
      throw new Error(`Secret ${options.envSecretName} has no payload.`);
    }

    return payload;
  }

  if (options.fallback !== undefined) {
    return options.fallback;
  }

  throw new Error("Unable to resolve secret value.");
}
