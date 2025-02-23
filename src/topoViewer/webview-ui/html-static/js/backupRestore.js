var files = [];
var filteredFiles = [];
var OriginalModelFileName;

// environments variables
var routerName
var routerID
var routerKind
var routerUsername
var routerPassword
var workingDirectory
var clabName

// Define default kind credential
const supportedRouterKindsDefaultCredential = [
	["srl", "admin", "NokiaSrl1!"],
	["nokia_srl", "admin", "NokiaSrl1!"],
	["vr-sros", "admin", "admin"],
	["nokia_sros", "admin", "admin"],
	["vr-vmx", "admin", "admin@123"],
	["vr-juniper_vmx", "admin", "admin@123"],
	["vr-xrv9k", "clab", "clab@123"],
	["vr-cisco_xrv9k", "clab", "clab@123"]
];

// Function to check if a router kind is supported
function isRouterKindSupported(routerKind) {
	return supportedRouterKindsDefaultCredential.some(function(entry) {
		const kind = entry[0]; // Extract the router kind from the entry
		return kind === routerKind;
	});
}

function getCredentialsForRouterKind(routerKind) {
	// Find the entry for the given router kind
	const credentialEntry = supportedRouterKindsDefaultCredential.find(function(entry) {
		const kind = entry[0];
		return kind === routerKind;
	});

	// Check if the credential entry was found
	if (credentialEntry) {
		const [, user, password] = credentialEntry; // Destructure to get user and password
		return {
			user,
			password
		};
	}

	return null; // Return null if not found
}

async function backupRestoreNodeConfig(event) {
	// init environments variables
	environments = await getEnvironments(event);
	console.log("linkImpairment - environments: ", environments)
	workingDirectory = environments["working-directory"];
	clabName = environments["clab-name"];
	nodeData = findCytoElementByLongname(environments["EnvCyTopoJsonBytes"], globalSelectedNode)
	routerName = globalSelectedNode;
	routerID = nodeData["data"]["extraData"]["longname"]
	routerKind = nodeData["data"]["extraData"]["kind"];
	credentials = getCredentialsForRouterKind(routerKind);
	routerUsername = credentials.user
	routerPassword = credentials.password

	// console.log("backupRestoreNodeConfig - credentials: ", routerUsername + ":" + routerPassword)
	// console.log("backupRestoreNodeConfig - routerName: ", routerName)
	console.log("backupRestoreNodeConfig - routerID: ", routerID)

	// if (supportedRouterKinds.includes(routerKind)) {
	if (isRouterKindSupported(routerKind)) {

		// init the backupRestore monaco editor
		initializeMonacoEditor()

		// init the running config to be loaded
		handleLoadRunningConfig(event)

		// Remove all Overlayed Panel
		// Get all elements with the class "panel-overlay"
		var panelOverlays = document.getElementsByClassName("panel-overlay");
		// Loop through each element and set its display to 'none'
		for (var i = 0; i < panelOverlays.length; i++) {
			panelOverlays[i].style.display = "none";
		}

		try {
			document.getElementById("panel-backup-restore").style.display = "block";
			document.getElementById("panel-backup-restore").style.height = "calc(85vh - 50px)";
			document.getElementById("editor-container").style.height = "calc(80vh - 80px)";

			// Output the values to console
			console.log('routerID:', routerID);
			console.log('routerName:', routerName);

			// Update the text of the file browser title
			const fileBrowserTitle = document.getElementById('diff-panel-title');
			if (fileBrowserTitle && routerID) {
				fileBrowserTitle.textContent = `${routerName}`;
			}
			if (routerName) {
				loadFileList(routerName);
			} else {
				console.error('No routerName specified in URL');
			}

			const searchInput = document.getElementById('search-input');
			searchInput.addEventListener('input', (event) => {
				const filter = event.target.value.toLowerCase();
				console.log("filter", filter)
				filterFileList(filter);

			});

			// Add event listener to the buttonRestoreConfig
			const buttonRestoreConfig = document.getElementById('buttonRestoreConfig');
			buttonRestoreConfig.addEventListener('click', handleRestoreConfig);

			// Add event listener to the buttonBackupConfig
			const buttonBackupConfig = document.getElementById('buttonBackupConfig');
			buttonBackupConfig.addEventListener('click', handleBackupConfig);

			// Add event listener to the buttonLoadRunningConfig
			const buttonLoadRunningConfig = document.getElementById('buttonLoadRunningConfig');
			buttonLoadRunningConfig.addEventListener('click', handleLoadRunningConfig);


		} catch (error) {
			console.error('Error executing restore configuration:', error);
		}
	} else {
		appendMessage(
			`Router Kind ${routerKind} is not supported for backup-restore`,
		);
		bulmaToast.toast({
			message: `Sorry, Router Kind ${routerKind} is not supported for backup-restore 👨‍💻`,
			type: "is-warning is-size-6 p-3",
			duration: 4000,
			position: "top-center",
			closeOnClick: true,
		});
	}
}

// Function to initialize the Monaco Editor with default content
function initializeMonacoEditor() {
	// Create the original and modified models with default messages
	const originalModel = monaco.editor.createModel(
		'Please select the configuration file you wish to restore.. \nthen click "Restore Saved Config. \nThe selected config will be displayed here. \n\n\nMeanwhile please enjoy this poem.\n \n Die Eule \n ----\n Abends gegen neune \n In der alten scheune \n Hört man ein Geheule \n So ruft die Schleireule \n Schlafen nachts die Leute \n Jagt sie ihre Beute \n Schuhu Schuhu \n Um mitternacht ist Ruh\n\n',
		'text/plain'
	);
	const modifiedModel = monaco.editor.createModel(
		'Please click the "Backup Running Config" button to save the current configuration. \nThe results of the backup will be displayed here.',
		'text/plain'
	);

	// Set up the diff editor with the created models
	diffEditor.setModel({
		original: originalModel,
		modified: modifiedModel
	});
}

// Monaco Editor setup
require.config({
	paths: {
		'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/min/vs'
	}
});


require(['vs/editor/editor.main'], function() {
	const colorScheme = detectColorScheme();
	let vsCodeTheme = "vs"; // Default theme
	if (colorScheme === "dark") {
		vsCodeTheme = "vs-dark";
	} else if (colorScheme !== "light") {
		console.log("unsupported colorScheme: ", colorScheme);
	}

	// Initialize the Monaco Editor with configuration options
	window.diffEditor = monaco.editor.createDiffEditor(document.getElementById('editor-container'), {
		theme: vsCodeTheme,
		originalEditable: false,
		readOnly: true,
		smoothScrolling: false,
		fontFamily: "menlo",
		fontSize: 11,
		fontLigatures: true,
		enableSplitViewResizing: true,
		automaticLayout: true,
		splitViewDefaultRatio: 0.52,
		renderGutterMenu: false,
	});

	// Call the initialization function to set default content
	initializeMonacoEditor();

	// Ensure the editor layout adjusts when the window resizes
	window.addEventListener('resize', () => {
		diffEditor.layout();
	});

	// Adjust the layout after initialization
	diffEditor.layout();
});

// Function to handle loading running configuration
async function handleLoadRunningConfig(event) {
	event.preventDefault(); // Prevent default form submission if inside a form
	var configName = OriginalModelFileName;

	// Output the values to console
	console.log('############################################################');
	console.log('routerID:', routerID);
	console.log('routerName:', routerName);

	const arg01 = routerID; // Replace with actual arguments as needed
	const arg02 = routerName; // Replace with actual arguments as needed
	const arg03 = 'get'; // Replace with actual arguments as needed

	try {
		actionName = "backupRestoreScript";

		showLoadingSpinnerGlobal()
		appendMessage(
			"Loading Running Config",
		);
		bulmaToast.toast({
			message: `Alright, we're Loading the Running Config. Stay chill, folks. 😎👨‍💻`,
			type: "is-warning is-size-6 p-3",
			duration: 4000,
			position: "top-center",
			closeOnClick: true,
		});

		console.log("handleLoadRunningConfig - showLoadingSpinner")
		var postPayload = [];

		// Create an object with attributes and values
		var payload = {
			routerKind: routerKind,
			routerID: routerID,
			routerUsername: routerUsername,
			routerPassword: routerPassword,
			configNamePrefix: routerName,
			backupPath: `${workingDirectory}/html-public/${clabName}/node-backup/${routerName}`,
			action: "running"
		};

		var postPayloadJSON = JSON.stringify(payload);
		postPayload[0] = postPayloadJSON;
		await sendRequestToEndpointPost("/node-backup-restore", postPayload);

		loadFileList(routerName);
		loadFileContentModified(`${routerName}-running.cfg`);
		hideLoadingSpinnerGlobal()

		

	} catch (error) {
		console.error('Error executing load running configuration:', error);
	}
}

// Function to handle restore configuration
async function handleRestoreConfig(event) {
	event.preventDefault(); // Prevent default form submission if inside a form
	var configName = OriginalModelFileName;

	// Output the values to console
	console.log('############################################################');
	console.log('routerID:', routerID);
	console.log('routerName:', routerName);
	console.log("OriginalModelFileName: ", OriginalModelFileName);
	console.log("configName: ", configName);

	try {
		actionName = "backupRestoreScript";

		showLoadingSpinnerGlobal()
		appendMessage(
			"Restoring up the Config",
		);
		bulmaToast.toast({
			message: `Alright, we're restoring the config. Stay chill, folks. 😎👨‍💻`,
			type: "is-warning is-size-6 p-3",
			duration: 4000,
			position: "top-center",
			closeOnClick: true,
		});
		var postPayload = [];

		// Create an object with attributes and values
		var payload = {
			routerKind: routerKind,
			routerID: routerID,
			routerUsername: routerUsername,
			routerPassword: routerPassword,
			configNamePrefix: configName,
			backupPath: `${workingDirectory}/html-public/${clabName}/node-backup/${routerName}`,
			action: "restore"
		};

		var postPayloadJSON = JSON.stringify(payload);
		postPayload[0] = postPayloadJSON;
		console.log("handleRestoreConfig - postPayload : ", postPayload);
		await sendRequestToEndpointPost("/node-backup-restore", postPayload);
		loadFileList(routerName);

		// update running config
		// Create an object with attributes and values
		var payload = {
			routerKind: routerKind,
			routerID: routerID,
			routerUsername: routerUsername,
			routerPassword: routerPassword,
			configNamePrefix: routerName,
			backupPath: `${workingDirectory}/html-public/${clabName}/node-backup/${routerName}`,
			action: "running"
		};

		var postPayloadJSON = JSON.stringify(payload);
		postPayload[0] = postPayloadJSON;
		await sendRequestToEndpointPost("/node-backup-restore", postPayload);

		// loadFileList(routerName);
		loadFileContentModified(`${routerName}-running.cfg`);

		hideLoadingSpinnerGlobal()

	} catch (error) {
		console.error('Error executing restore configuration:', error);
	}
}

// Function to handle backup configuration
async function handleBackupConfig(event) {
	event.preventDefault(); // Prevent default form submission if inside a form
	var configName = OriginalModelFileName;

	// Output the values to console
	console.log('############################################################');
	console.log('routerID:', routerID);
	console.log('routerName:', routerName);
	console.log("OriginalModelFileName: ", OriginalModelFileName);

	const arg01 = routerID; // Replace with actual arguments as needed
	const arg02 = routerName; // Replace with actual arguments as needed
	const arg03 = 'backup'; // Replace with actual arguments as needed

	try {
		actionName = "backupRestoreScript";

		showLoadingSpinnerGlobal()
		appendMessage(
			"Backing up the Config",
		);
		bulmaToast.toast({
			message: `Alright, we're making the config backup. Stay chill, folks. 😎👨‍💻`,
			type: "is-warning is-size-6 p-3",
			duration: 4000,
			position: "top-center",
			closeOnClick: true,
		});

		var postPayload = [];

		// Create an object with attributes and values
		var payload = {
			routerKind: routerKind,
			routerID: routerID,
			routerUsername: routerUsername,
			routerPassword: routerPassword,
			configNamePrefix: routerName,
			backupPath: `${workingDirectory}/html-public/${clabName}/node-backup/${routerName}`,
			action: "backup"
		};

		var postPayloadJSON = JSON.stringify(payload);
		postPayload[0] = postPayloadJSON;
		console.log("handleBackupConfig - postPayload : ", postPayload);
		await sendRequestToEndpointPost("/node-backup-restore", postPayload);
		loadFileList(routerName);

		hideLoadingSpinnerGlobal()

	} catch (error) {
		console.error('Error executing backup configuration:', error);
	}
}

function loadFileList(routerName) {
	fetch(`/files?RouterName=${encodeURIComponent(routerName)}`)
		.then(response => response.json())
		.then(data => {
			if (!data || !data.files || data.files.length === 0) {
				console.warn('No backup files found for this router.');
				// Handle empty response here, e.g., show a message to the user
				renderFileList([]);
			} else {
				files = data.files;
				let filteredFileList = files.filter(file => !file.includes('running'));

				console.log("loadFileList: ", filteredFileList)
				renderFileList(filteredFileList);
			}
		})
		.catch(error => console.error('Error fetching file list:', error));
}

function renderFileList(fileList) {
	const panel = document.getElementById('panel-file-browser');
	const searchBox = panel.firstElementChild;
	const searchInput = document.getElementById('search-input');
	const searchValue = searchInput.value;

	panel.innerHTML = '';
	panel.appendChild(searchBox);

	fileList.forEach(file => {
		const fileElement = document.createElement('a');
		fileElement.classList.add('panel-block');
		fileElement.innerHTML = `
			      <span class="panel-icon">
			        <i class="fas fa-book" aria-hidden="true"></i>
			      </span>
			      ${file}
			    `;
		fileElement.addEventListener('click', () => loadFileContentOriginal(file));
		panel.appendChild(fileElement);
	});

	searchInput.value = searchValue;
	searchInput.focus();
}

function filterFileList(filter) {
	console.log("filteredFiles() - filter: ", filter)
	console.log("filteredFiles() - files: ", files)

	filteredFiles = files.filter(file => file.toLowerCase().includes(filter));

	console.log("filteredFiles() - filteredFiles: ", filteredFiles)

	renderFileList(filteredFiles);
}

function loadFileContentOriginal(fileName) {
	showLoadingSpinnerGlobal();

	// set Global Var
	OriginalModelFileName = fileName;
	console.log("OriginalModelFileName", OriginalModelFileName)

	// Get the current URL
	const currentUrl = new URL(window.location.href);

	// Get query parameters using URLSearchParams
	const params = new URLSearchParams(currentUrl.search);

	// Output the values to console
	console.log('routerID:', routerID);
	console.log('routerName:', routerName);

	fetch(`/file?RouterName=${encodeURIComponent(routerName)}&name=${encodeURIComponent(fileName)}`)
		.then(response => response.json())
		.then(data => {
			if (data.success) {
				const originalModel = monaco.editor.createModel(data.content, 'text/plain');
				diffEditor.setModel({
					original: originalModel,
					modified: diffEditor.getModel()
						.modified
				});
			} else {
				console.error('Error loading file content:', data.message);
			}
			hideLoadingSpinnerGlobal();
		})
		.catch(error => {
			console.error('Error fetching file content:', error);
			hideLoadingSpinnerGlobal();
		});
}

function loadFileContentModified(fileName) {
	showLoadingSpinnerGlobal();

	// set Global Var
	OriginalModelFileName = fileName;
	console.log("OriginalModelFileName", OriginalModelFileName)

	// Get the current URL
	const currentUrl = new URL(window.location.href);

	// Get query parameters using URLSearchParams
	const params = new URLSearchParams(currentUrl.search);

	// Output the values to console
	console.log('routerID:', routerID);
	console.log('routerName:', routerName);

	fetch(`/file?RouterName=${encodeURIComponent(routerName)}&name=${encodeURIComponent(fileName)}`)
		.then(response => response.json())
		.then(data => {
			if (data.success) {
				const modifiedModel = monaco.editor.createModel(data.content, 'text/plain');
				diffEditor.setModel({
					original: diffEditor.getModel()
						.original,
					modified: modifiedModel
				});
			} else {
				console.error('Error loading file content:', data.message);
			}
			hideLoadingSpinnerGlobal();
		})
		.catch(error => {
			console.error('Error fetching file content:', error);
			hideLoadingSpinnerGlobal();
		});
}