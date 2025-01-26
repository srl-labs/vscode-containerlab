// reusable commonn functions 

async function callGoFunction(goFunctionName, arg01, arg02, arg03) {
	console.log(`callGoFunction Called with ${goFunctionName}`);
	console.log(`Parameter01: ${arg01}`);
	console.log(`Parameter02: ${arg02}`);

	const data = {
		param1: arg01,
		param2: arg02,
		param3: arg03 // Add param3 if needed
	};

	try {
		const response = await fetch(goFunctionName, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(data),
		});

		if (!response.ok) {
			throw new Error("Network response was not ok");
		}

		const responseData = await response.json();
		return responseData;
	} catch (error) {
		console.error("Error:", error);
		throw error;
	}
}


// async function getEnvironments(event) {
// 	try {
// 		const environments = await sendRequestToEndpointGetV2("/get-environments");

// 		// Handle the response data
// 		if (environments && typeof environments === 'object' && Object.keys(environments).length > 0) {
// 			console.log("Valid non-empty JSON response received:", environments);
// 			return environments

// 		} else {
// 			console.log("Empty or invalid JSON response received");
// 		}
// 	} catch (error) {
// 		console.error("Error occurred:", error);
// 		// Handle errors as needed
// 	}
// }

/**
 * Fetches environment configurations based on the deployment type.
 * 
 * @param {Event} event - The event triggering the function.
 * @returns {Promise<Object|null>} - Returns the environments object or null if an error occurs.
 */
async function getEnvironments(event) {
    // Define deployment type using const to prevent reassignment and scope pollution
    const deploymentType = "vs-code";

    if (deploymentType === "vs-code") {
        try {
            // Await the fetch call to ensure the promise resolves before proceeding
            const response = await fetch(window.jsonFileUrlDataEnvironment);

            // Check if the response is successful
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
            }

            // Await the JSON parsing of the response
            const environments = await response.json();

            // Log the fetched environments for debugging purposes
            console.log("Fetched Environments:", environments);

            // Return the parsed environments object
            return environments;

        } catch (error) {
            // Log any errors that occur during the fetch or parsing process
            console.error("Error occurred while fetching environments:", error);
            // Optionally, handle the error further or rethrow
            return null;
        }

    } else {
        try {
            // Await the custom function that sends a request to an endpoint
            const environments = await sendRequestToEndpointGetV2("/get-environments");

            // Validate the response data
            if (environments && typeof environments === 'object' && Object.keys(environments).length > 0) {
                console.log("Valid non-empty JSON response received:", environments);
                return environments;
            } else {
                console.log("Empty or invalid JSON response received");
                return null;
            }
        } catch (error) {
            // Log any errors that occur during the request
            console.error("Error occurred while fetching environments from endpoint:", error);
            // Optionally, handle the error further or rethrow
            return null;
        }
    }
}



async function postPythonAction(event, commandList) {
	try {
		showLoadingSpinnerGlobal()
		const pythonActionRespons = await sendRequestToEndpointPost("/python-action", commandList);

		// Handle the response data
		if (pythonActionRespons && typeof pythonActionRespons === 'object' && Object.keys(pythonActionRespons).length > 0) {
			hideLoadingSpinnerGlobal();
			console.log("Valid non-empty JSON response received:", pythonActionRespons);
			return pythonActionRespons
		} else {
			console.log("Empty or invalid JSON response received");
		}
	} catch (error) {
		hideLoadingSpinnerGlobal();
		console.error("Error occurred:", error);
		// Handle errors as needed
	}
}

// Function to find a cytoJson element from cytoTopologyJson from getEnvironments() by id and retrieve its attributes
function findCytoElementById(jsonArray, id) {
	const cytoElement = jsonArray.find(obj => obj.data.id === id);
	if (cytoElement) {
		return cytoElement;
	} else {
		return null; // Handle case where person with given name is not found
	}
}

// Function to find a cytoJson element from cytoTopologyJson from getEnvironments() by name and retrieve its attributes
function findCytoElementByName(jsonArray, name) {
	const cytoElement = jsonArray.find(obj => obj.data.name === name);
	if (cytoElement) {
		return cytoElement;
	} else {
		return null; // Handle case where person with given name is not found
	}
}

// Function to find a cytoJson element from cytoTopologyJson from getEnvironments() by longname and retrieve its attributes
function findCytoElementByLongname(jsonArray, longname) {
	const cytoElement = jsonArray.find(obj => obj.data && obj.data.extraData && obj.data.extraData.longname === longname);
	if (cytoElement) {
		return cytoElement;
	} else {
		return null; // Handle case where element with given longname is not found
	}
}


// argsList is list
async function sendRequestToEndpointPost(endpointName, argsList = []) {
	console.log(`callGoFunction Called with ${endpointName}`);
	console.log(`Parameters:`, argsList);

	const data = {};
	argsList.forEach((arg, index) => {
		data[`param${index + 1}`] = arg;
	});

	try {
		const response = await fetch(endpointName, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(data),
		});

		if (!response.ok) {
			throw new Error("Network response was not ok");
		}

		const responseData = await response.json();
		return responseData;
	} catch (error) {
		console.error("Error:", error);
		throw error;
	}
}

async function sendRequestToEndpointGet(endpointName, argsList = []) {
	console.log(`callGoFunction Called with ${endpointName}`);
	console.log(`Parameters:`, argsList);

	// Construct the query string from argsList
	const params = new URLSearchParams();
	argsList.forEach((arg, index) => {
		params.append(`param${index + 1}`, arg);
	});

	try {
		const response = await fetch(endpointName, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		});

		console.log(response)

		if (!response.ok) {
			throw new Error("Network response was not ok");
		}

		const responseData = await response.json();
		return responseData;
	} catch (error) {
		console.error("Error:", error);
		throw error;
	}
}

async function sendRequestToEndpointGetV2(endpointName, argsList = []) {
	console.log(`callGoFunction Called with ${endpointName}`);
	console.log(`Parameters:`, argsList);

	// Construct the query string from argsList
	const params = new URLSearchParams();
	argsList.forEach((arg, index) => {
		params.append(`param${index + 1}`, arg);
	});

	const urlWithParams = `${endpointName}?${params.toString()}`;

	try {
		const response = await fetch(urlWithParams, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		});


		if (!response.ok) {
			throw new Error("Network response was not ok");
		}

		const responseData = await response.json();

		console.log(responseData);

		return responseData;
	} catch (error) {
		console.error("Error:", error);
		throw error;
	}
}

/**
 * Sends a GET request with param1, param2, etc.
 * - Retries up to `maxRetries` times if the request times out (AbortError).
 * - Retries up to `maxRetries` times if the response is not OK (HTTP error).
 * @param {string} endpointName - Full endpoint URL (e.g., "https://example.com/api").
 * @param {Array} [argsList=[]] - Array mapped to param1, param2, etc.
 * @param {Object} [options={}] - Config options for retries, timeouts, logging, etc.
 * @param {number} [options.maxRetries=2] - Total number of attempts on error or timeout.
 * @param {number} [options.timeoutMs=5000] - Timeout (ms) for each request attempt.
 * @param {boolean} [options.debug=false] - Whether to log extra debugging info.
 * @returns {Promise<any>} Parsed response if successful (JSON or text).
 * @throws {Error} If all attempts fail (timeout or non-OK responses).
 */
async function sendRequestToEndpointGetV3(
	endpointName,
	argsList = [], {
		maxRetries = 2,
		timeoutMs = 5000,
		debug = true,
	} = {}
) {
	// Build the query string: param1, param2, etc.
	const params = new URLSearchParams();
	argsList.forEach((arg, index) => {
		params.append(`param${index + 1}`, arg);
	});

	const urlWithParams = `${endpointName}?${params.toString()}`;

	// We'll retry up to `maxRetries` times total (including the initial attempt).
	// E.g. if maxRetries=2, we do attempt #1, then retry #2 on fail/timeout.
	let attemptCount = 0;

	while (attemptCount < maxRetries) {
		attemptCount++;

		// Create a fresh AbortController for each attempt
		const controller = new AbortController();
		const timeoutId = setTimeout(() => {
			controller.abort();
		}, timeoutMs);

		try {
			if (debug) {
				console.log(`Attempt #${attemptCount} of ${maxRetries} --> ${urlWithParams}`);
			}

			// Perform the fetch
			const response = await fetch(urlWithParams, {
				method: "GET",
				signal: controller.signal, // attach the abort signal
			});

			// Clear the timeout if we got here before it triggered
			clearTimeout(timeoutId);

			// Check for HTTP errors
			if (!response.ok) {
				if (debug) {
					console.warn(`Response not OK. Status = ${response.status}`);
				}

				// If we've reached the final attempt, throw; otherwise, loop again
				if (attemptCount === maxRetries) {
					const errorBody = await response.text();
					throw new Error(`HTTP error! Status: ${response.status}, Body: ${errorBody}`);
				}

				// Retry on next iteration of the loop
				continue;
			}

			// If we get here, the response is OK. Parse it based on content type.
			const contentType = response.headers.get("Content-Type") || "";
			if (contentType.includes("application/json")) {
				return await response.json();
			} else {
				return await response.text();
			}
		} catch (error) {
			clearTimeout(timeoutId);

			// If this is an AbortError, it indicates a timeout triggered.
			if (error.name === "AbortError") {
				if (debug) {
					console.warn(
						`Timeout exceeded (${timeoutMs} ms). Attempt #${attemptCount} of ${maxRetries} failed.`
					);
				}

				// If we've already used our final attempt, throw
				if (attemptCount === maxRetries) {
					throw new Error(`Request aborted due to timeout after ${timeoutMs} ms.`);
				}

				// Otherwise, continue to retry
				continue;
			} else {
				// Some other kind of fetch or network error
				// (e.g. offline, DNS failure, CORS issue, etc.)
				if (debug) {
					console.error(`Network error on attempt #${attemptCount}:`, error);
				}
				throw error;
			}
		}
	}
}


// Function to detect light or dark mode
function detectColorScheme() {
	// Check if the browser supports the prefers-color-scheme media feature
	if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
		// Dark mode is enabled
		applyTheme('dark');

		return 'dark';
	} else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
		// Light mode is enabled
		applyTheme('light');

		return 'light';
	} else {
		// No preference or the browser does not support this media feature
		applyTheme('light');

		return 'no-preference';
	}
}

function applyTheme(theme) {
	document.getElementById('root').setAttribute(`data-theme`, `${theme}`);
	console.log(document.getElementById('root').getAttribute(`data-theme`))
}


function showLoadingSpinnerGlobal() {
	document.getElementById('loading-spinner-global')
		.style.display = 'block';
	document.getElementById('loading-spinner-global')
		.style.zIndex = '9999';
	document.getElementById('panel-backup-restore')
		.style.zIndex = '9998';
}

function hideLoadingSpinnerGlobal() {
	document.getElementById('loading-spinner-global')
		.style.display = 'none';
}