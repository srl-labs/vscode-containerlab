// Check globalVariables.js for initiation


// if (isVscodeDeployment) {
//     // aarafat-tag:
//     // In a VS Code webview, the global function `acquireVsCodeApi()` is available.
//     // Call it to obtain the VS Code API object, which facilitates communication
//     // between the webview and the extension host.
//     vsCode = acquireVsCodeApi();
// }

// Map to track pending requests: requestId -> {resolve, reject}
const pendingRequests = new Map();
let requestCounter = 0;

/**
 * sendMessageToVscodeEndpointPost(functionName, payload)
 *
 * Sends a message to the VS Code extension, requesting that the specified
 * backend function (identified by `functionName`) be executed with the given payload.
 * Returns a Promise that resolves with the result from the extension, or rejects
 * if the backend returns an error.
 */
function sendMessageToVscodeEndpointPost(endpoint, payload) {

    console.log (`sendMessageToVscodeEndpointPost endpoint is ${endpoint} called`)

    return new Promise((resolve, reject) => {
        // Generate a unique request ID.
        const requestId = `req_${Date.now()}_${++requestCounter}`;

        // Store the promise handlers to be called upon receiving the response.
        pendingRequests.set(requestId, { resolve, reject });

        // Send a message to the extension host.
        vsCode.postMessage({
            type: 'POST',
            requestId: requestId,
            endpointName: endpoint,
            payload: JSON.stringify(payload) // Explicit serialization of the payload.

        });
    });
}

// Listen for messages from the extension.
window.addEventListener('message', (event) => {
    const msg = event.data; // The message data sent from the extension.
    if (msg && msg.type === 'POST_RESPONSE') {
        const { requestId, result, error } = msg;
        // Retrieve the corresponding pending request.
        const pending = pendingRequests.get(requestId);
        if (!pending) {
            console.warn("Received response for unknown requestId:", requestId);
            return;
        }

        // Remove the pending request now that we've received a response.
        pendingRequests.delete(requestId);

        // Resolve or reject the promise based on whether an error was returned.
        if (error) {
            pending.reject(new Error(error));
        } else {
            pending.resolve(result);
        }
    }
});

