/**
 * Dockerode stub for testing
 * Avoids loading the real dockerode which pulls in ssh2 with native bindings
 */

class DockerStub {
  getEvents() {
    return Promise.resolve({
      on: () => {},
      destroy: () => {},
    });
  }

  listContainers() {
    return Promise.resolve([]);
  }

  getContainer() {
    return {
      inspect: () => Promise.resolve({}),
      logs: () => Promise.resolve(''),
      exec: () => Promise.resolve({ start: () => Promise.resolve({}) }),
    };
  }

  ping() {
    return Promise.resolve();
  }
}

export = DockerStub;
