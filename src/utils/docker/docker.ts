import * as vscode from "vscode";
import type Dockerode from "dockerode";

import { dockerClient, outputChannel } from "../../globals";
import { ContainerAction, ImagePullPolicy } from "../consts";

// Internal helper to pull the docker image using dockerode client
async function pullDockerImage(image: string): Promise<boolean> {
  if (!dockerClient) {
    outputChannel.debug("pullDockerImage() failed: docker client unavailable.");
    return false;
  }

  return vscode.window.withProgress<boolean>(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Pulling Docker image ${image}`,
      cancellable: false
    },
    async () => {
      outputChannel.info(`Pulling image ${image}`);
      try {
        const stream = await dockerClient.pull(image);
        await new Promise<void>((resolve, reject) => {
          dockerClient.modem.followProgress(stream, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });

        vscode.window.showInformationMessage(`Successfully pulled image '${image}'`);
        outputChannel.info(`Successfully pulled image '${image}'`);
        return true;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        outputChannel.error(`Failed to pull image '${image}': ${message}`);
        vscode.window.showErrorMessage(`Failed to pull image '${image}': ${message}`);
        return false;
      }
    }
  );
}

// Checks if docker image is available locally, and handles the pull policy
export async function checkAndPullDockerImage(
  image: string,
  imagePullPolicy: ImagePullPolicy
): Promise<boolean> {
  if (!dockerClient) {
    outputChannel.debug("pullDockerImage() failed: docker client unavailable.");
    return false;
  }
  outputChannel.debug(`Checking docker image '${image}'`);

  // Check if image exists locally
  let imageExists = false;
  try {
    await dockerClient.getImage(image).inspect();
    imageExists = true;
    outputChannel.debug(`Docker image '${image}' found locally`);
  } catch {
    outputChannel.debug(`Docker image '${image}' not found locally`);
  }

  if (!imageExists) {
    switch (imagePullPolicy) {
      case ImagePullPolicy.Never:
        outputChannel.debug(
          `Pull policy is 'never', skipping image pull for missing image ${image}`
        );
        break;

      case ImagePullPolicy.Missing:
        outputChannel.debug(`Pull policy is 'missing', Pulling missing image '${image}'`);
        imageExists = await pullDockerImage(image);
        break;

      case ImagePullPolicy.Always:
        outputChannel.debug(`Pull policy is 'always', Pulling missing image '${image}'`);
        imageExists = await pullDockerImage(image);
        break;

      default:
        break;
    }
  } else if (imageExists && imagePullPolicy == ImagePullPolicy.Always) {
    outputChannel.debug(`Pull policy is 'always', Pulling available image '${image}'`);
    imageExists = await pullDockerImage(image);
  }

  return imageExists;
}

// Basic wrapper to safely return the name of a container based on the Dockerode.Container obj
async function getContainerName(container: Dockerode.Container): Promise<string> {
  let ctrName: string;
  try {
    ctrName = (await container.inspect()).Name;
  } catch {
    ctrName = container.id;
  }

  return ctrName;
}

export async function runContainerAction(
  containerId: string,
  action: ContainerAction
): Promise<void> {
  if (!dockerClient) {
    outputChannel.debug("runContainerAction() failed: docker client unavailable.");
    return;
  }

  if (!containerId) {
    vscode.window.showErrorMessage(`Failed to ${action} container. Container ID nil.`);
    return;
  }

  const container = dockerClient.getContainer(containerId);
  if (!container) {
    vscode.window.showErrorMessage(`Unable to ${action} container: Failed to get '${containerId}'`);
    return;
  }

  const ctrName = await getContainerName(container);

  try {
    switch (action) {
      case ContainerAction.Start:
        await container.start();
        break;
      case ContainerAction.Stop:
        await container.stop();
        break;
      case ContainerAction.Pause:
        await container.pause();
        break;
      case ContainerAction.Unpause:
        await container.unpause();
        break;
    }
    const msg = `${action}: Success for '${ctrName}'`;
    outputChannel.info(msg);
    vscode.window.showInformationMessage(msg);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const msg = `Failed to ${action} container ${ctrName}: ${message}`;
    outputChannel.error(msg);
    vscode.window.showErrorMessage(msg);
  }
}

export async function startContainer(containerId: string): Promise<void> {
  return runContainerAction(containerId, ContainerAction.Start);
}

export async function stopContainer(containerId: string): Promise<void> {
  return runContainerAction(containerId, ContainerAction.Stop);
}

export async function pauseContainer(containerId: string): Promise<void> {
  return runContainerAction(containerId, ContainerAction.Pause);
}

export async function unpauseContainer(containerId: string): Promise<void> {
  return runContainerAction(containerId, ContainerAction.Unpause);
}
