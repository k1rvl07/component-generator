import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as util from "node:util";
import * as vscode from "vscode";

const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);
const copyFile = util.promisify(fs.copyFile);
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);

let terminal: vscode.Terminal;
let workspaceRoot: string;

interface ComponentData {
	directory: string;
	name: string;
	componentType: string;
	language: string;
	style?: string;
	stories: boolean;
	test?: string;
	context: boolean;
	hooks: boolean;
	folderStructure: string;
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Extension "Component Generator" is now active!');

	const disposable = vscode.commands.registerCommand(
		"extension.createComponent",
		async (uri: vscode.Uri) => {
			if (!uri) {
				vscode.window.showErrorMessage("No folder selected.");
				return;
			}

			if (!vscode.workspace.workspaceFolders) {
				vscode.window.showErrorMessage(
					"No workspace folder is open. Please open a workspace.",
				);
				return;
			}

			const folderPath = uri.fsPath;
			workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
			const relativePath = path.relative(workspaceRoot, folderPath);

			console.log("Selected folder path:", folderPath);
			console.log("Workspace root:", workspaceRoot);
			console.log("Relative path:", relativePath);

			try {
				await checkAndCopyPlopFiles(context.extensionPath, workspaceRoot);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to setup Plop: ${error}`);
				return;
			}

			const data = await promptUserForComponentData(folderPath, relativePath);
			if (!data) {
				vscode.window.showInformationMessage("Component creation canceled.");
				return;
			}

			try {
				await generateComponents(data, folderPath);
				vscode.window.showInformationMessage(
					`Components successfully created in "${relativePath}"!`,
				);
			} catch (error) {
				if (error instanceof Error) {
					vscode.window.showErrorMessage(
						`Failed to generate components: ${error.message}`,
					);
				} else {
					vscode.window.showErrorMessage(
						`Failed to generate components: ${String(error)}`,
					);
				}
			}
		},
	);

	context.subscriptions.push(disposable);
}

export function deactivate() {
	console.log('Extension "Component Generator" is now deactivated.');
	if (terminal) {
		terminal.dispose();
	}
}

async function checkAndCopyPlopFiles(
	extensionPath: string,
	workspaceRoot: string,
): Promise<void> {
	const plopFilePath = path.join(workspaceRoot, "plopfile.js");
	const plopGeneratorsDir = path.join(workspaceRoot, "plop_generators");
	const templatesDir = path.join(workspaceRoot, "templates");

	const extensionResourcesDir = path.join(extensionPath, "src", "resources");
	const extensionPlopFile = path.join(extensionResourcesDir, "plopfile.js");
	const extensionGeneratorsDir = path.join(
		extensionResourcesDir,
		"plop_generators",
	);
	const extensionTemplatesDir = path.join(extensionResourcesDir, "templates");

	const isPlopInstalled = await checkPlopInstalled(workspaceRoot);
	if (!isPlopInstalled) {
		const installPlop = await vscode.window.showInformationMessage(
			"Plop is not installed. Do you want to install it?",
			"Yes",
			"No",
		);

		if (installPlop === "Yes") {
			await installPlopDependencies(workspaceRoot);
		} else {
			throw new Error("Plop is required to generate components.");
		}
	}

	const isBiome = await isBiomeInstalled(workspaceRoot);
	if (!isBiome) {
		const installBiomeOption = await vscode.window.showInformationMessage(
			"Biome is not installed. Do you want to install it?",
			"Yes",
			"No",
		);

		if (installBiomeOption === "Yes") {
			await installBiome(workspaceRoot);
		} else {
			vscode.window.showWarningMessage(
				"Biome is not installed. Code formatting will be skipped.",
			);
		}
	}

	await checkAndUpdatePlopFile(extensionPlopFile, plopFilePath);

	await checkAndUpdateComponentGenerator(
		extensionGeneratorsDir,
		plopGeneratorsDir,
	);

	if (!fs.existsSync(templatesDir)) {
		const createTemplatesDir = await vscode.window.showInformationMessage(
			"templates folder not found. Do you want to create it?",
			"Yes",
			"No",
		);

		if (createTemplatesDir === "Yes") {
			if (!fs.existsSync(extensionTemplatesDir)) {
				throw new Error(
					`templates folder not found in extension resources: ${extensionTemplatesDir}`,
				);
			}

			await mkdir(templatesDir);

			const files = await readdir(extensionTemplatesDir);
			for (const file of files) {
				const sourceFile = path.join(extensionTemplatesDir, file);
				const destFile = path.join(templatesDir, file);
				await copyFile(sourceFile, destFile);
			}

			vscode.window.showInformationMessage(
				"templates folder and files created successfully.",
			);
		} else {
			throw new Error("templates folder is required to generate components.");
		}
	} else {
		await checkMissingAndModifiedTemplates(extensionTemplatesDir, templatesDir);
	}
}

async function checkPlopInstalled(workspaceRoot: string): Promise<boolean> {
	const packageJsonPath = path.join(workspaceRoot, "package.json");

	if (!fs.existsSync(packageJsonPath)) {
		return false;
	}

	const packageJsonContent = await readFile(packageJsonPath, "utf8");
	const packageJson = JSON.parse(packageJsonContent);

	return packageJson.dependencies?.plop || packageJson.devDependencies?.plop;
}

async function installPlopDependencies(workspaceRoot: string): Promise<void> {
	if (!terminal || terminal.exitStatus !== undefined) {
		terminal = vscode.window.createTerminal("Component Generator");
	}

	terminal.sendText("npm install plop --save-dev");
	terminal.show();

	vscode.window.showInformationMessage("Installing Plop... Please wait.");
}

async function checkAndUpdatePlopFile(
	extensionPlopFile: string,
	plopFilePath: string,
): Promise<void> {
	if (!fs.existsSync(plopFilePath)) {
		const createPlopFile = await vscode.window.showInformationMessage(
			"plopfile.js not found. Do you want to create it?",
			"Yes",
			"No",
		);

		if (createPlopFile === "Yes") {
			await copyFile(extensionPlopFile, plopFilePath);
			vscode.window.showInformationMessage("plopfile.js created successfully.");
		} else {
			throw new Error("plopfile.js is required to generate components.");
		}
	} else {
		const userContent = await readFile(plopFilePath, "utf8");

		if (userContent.trim() === "") {
			const defaultContent = await readFile(extensionPlopFile, "utf8");
			await writeFile(plopFilePath, defaultContent, "utf8");
			vscode.window.showInformationMessage(
				"plopfile.js was empty and has been replaced with the default version.",
			);
			return;
		}

		const importRegex =
			/import\s+componentGenerator\s+from\s+["']\.\/plop_generators\/componentGenerator\.js["'];/;
		const hasImport = importRegex.test(userContent);

		const usageRegex = /componentGenerator\(\s*plop\s*\)\s*;?/;
		const hasUsage = usageRegex.test(userContent);

		if (!hasImport || !hasUsage) {
			const defaultContent = await readFile(extensionPlopFile, "utf8");
			const updatedContent = addMissingImportsAndUsage(
				userContent,
				defaultContent,
			);
			await writeFile(plopFilePath, updatedContent, "utf8");
			vscode.window.showInformationMessage(
				"plopfile.js has been updated with missing imports and usage.",
			);
		}
	}
}

async function checkAndUpdateComponentGenerator(
	extensionGeneratorsDir: string,
	plopGeneratorsDir: string,
): Promise<void> {
	const componentGeneratorPath = path.join(
		plopGeneratorsDir,
		"componentGenerator.js",
	);
	const extensionComponentGeneratorPath = path.join(
		extensionGeneratorsDir,
		"componentGenerator.js",
	);

	if (!fs.existsSync(plopGeneratorsDir)) {
		const createGeneratorsDir = await vscode.window.showInformationMessage(
			"plop_generators folder not found. Do you want to create it and componentGenerator.js in it?",
			"Yes",
			"No",
		);

		if (createGeneratorsDir === "Yes") {
			await mkdir(plopGeneratorsDir);
			vscode.window.showInformationMessage(
				"plop_generators folder created successfully.",
			);

			await copyFile(extensionComponentGeneratorPath, componentGeneratorPath);
			vscode.window.showInformationMessage(
				"componentGenerator.js created successfully.",
			);
		} else {
			throw new Error(
				"plop_generators folder is required to generate components.",
			);
		}
	} else {
		if (!fs.existsSync(componentGeneratorPath)) {
			const createComponentGenerator =
				await vscode.window.showInformationMessage(
					"componentGenerator.js not found. Do you want to create it?",
					"Yes",
					"No",
				);

			if (createComponentGenerator === "Yes") {
				await copyFile(extensionComponentGeneratorPath, componentGeneratorPath);
				vscode.window.showInformationMessage(
					"componentGenerator.js created successfully.",
				);
			} else {
				throw new Error(
					"componentGenerator.js is required to generate components.",
				);
			}
		} else {
			const userContent = await readFile(componentGeneratorPath, "utf8");
			const defaultContent = await readFile(
				extensionComponentGeneratorPath,
				"utf8",
			);

			if (userContent !== defaultContent) {
				const restoreGenerator = await vscode.window.showInformationMessage(
					"componentGenerator.js has been modified. Do you want to restore it to the default version?",
					"Yes",
					"No",
				);

				if (restoreGenerator === "Yes") {
					await copyFile(
						extensionComponentGeneratorPath,
						componentGeneratorPath,
					);
					vscode.window.showInformationMessage(
						"componentGenerator.js has been restored to the default version.",
					);
				}
			}
		}
	}
}

function addMissingImportsAndUsage(
	userContent: string,
	defaultContent: string,
): string {
	const importRegex =
		/import\s+componentGenerator\s+from\s+["']\.\/plop_generators\/componentGenerator\.js["'];/;

	const usageRegex = /componentGenerator\(\s*plop\s*\)\s*;?/;

	let updatedContent = userContent;

	if (!importRegex.test(updatedContent)) {
		updatedContent = `import componentGenerator from "./plop_generators/componentGenerator.js";\n${updatedContent}`;
	}

	if (!usageRegex.test(updatedContent)) {
		updatedContent = updatedContent.replace(
			/export\s+default\s+function\s*\(plop\)\s*\{/,
			(match) => `${match}\n  componentGenerator(plop);`,
		);
	}

	return updatedContent;
}

async function checkMissingAndModifiedTemplates(
	extensionTemplatesDir: string,
	templatesDir: string,
): Promise<void> {
	const extensionFiles = await readdir(extensionTemplatesDir);
	const userFiles = await readdir(templatesDir);

	const missingFiles = extensionFiles.filter(
		(file) => !userFiles.includes(file),
	);
	if (missingFiles.length > 0) {
		const addAll = await vscode.window.showInformationMessage(
			`The following template files are missing: ${missingFiles.join(", ")}. Do you want to add them?`,
			"Yes",
			"No",
		);

		if (addAll === "Yes") {
			for (const file of missingFiles) {
				const sourceFile = path.join(extensionTemplatesDir, file);
				const destFile = path.join(templatesDir, file);
				await copyFile(sourceFile, destFile);
			}
			vscode.window.showInformationMessage(
				"Missing template files added successfully.",
			);
		}
	}

	const modifiedFiles: string[] = [];
	for (const file of extensionFiles) {
		if (userFiles.includes(file)) {
			const extensionFileContent = await readFile(
				path.join(extensionTemplatesDir, file),
				"utf8",
			);
			const userFileContent = await readFile(
				path.join(templatesDir, file),
				"utf8",
			);

			if (extensionFileContent !== userFileContent) {
				modifiedFiles.push(file);
			}
		}
	}

	if (modifiedFiles.length > 0) {
		const restoreAll = await vscode.window.showInformationMessage(
			`The following template files have been modified: ${modifiedFiles.join(", ")}. Do you want to restore them to the default version?`,
			"Yes",
			"No",
		);

		if (restoreAll === "Yes") {
			for (const file of modifiedFiles) {
				const sourceFile = path.join(extensionTemplatesDir, file);
				const destFile = path.join(templatesDir, file);
				await copyFile(sourceFile, destFile);
			}
			vscode.window.showInformationMessage(
				"Modified template files restored successfully.",
			);
		}
	}
}

async function promptUserForComponentData(
	folderPath: string,
	relativePath: string,
): Promise<ComponentData[] | null> {
	const namesInput = await vscode.window.showInputBox({
		prompt: "Enter component names (separated by spaces):",
		placeHolder: "ComponentName1 ComponentName2",
		validateInput: (value) => {
			if (!value || value.trim().length === 0) {
				return "Please enter at least one component name.";
			}
			const names = value.split(" ");
			for (const name of names) {
				if (!/^[a-zA-Z0-9_]*$/.test(name)) {
					return "Component names can only contain English letters, numbers, and underscores.";
				}
			}
			return null;
		},
	});
	if (namesInput === undefined) return null;

	const uniqueNames = [
		...new Set(namesInput.split(" ").filter((name) => name.trim() !== "")),
	];

	const componentType = await promptForSelection(
		["Functional Component", "Class Component"],
		"Choose component type:",
	);
	if (componentType === undefined) return null;

	const language = await promptForSelection(
		["JavaScript", "TypeScript"],
		"Choose language:",
	);
	if (language === undefined) return null;

	const style = await promptForSelection(
		["No", "CSS", "SCSS", "Styled Components"],
		"Choose styling method:",
	);
	if (style === undefined) return null;

	const stories = await promptForSelection(
		["No", "Yes"],
		"Do you want to add a Storybook story?",
	);
	if (stories === undefined) return null;

	const testFramework = await promptForSelection(
		["No", "Jest", "React Testing Library", "Cypress"],
		"Choose test framework:",
	);
	if (testFramework === undefined) return null;

	const contextOption = await promptForSelection(
		["No", "Yes"],
		"Do you want to add React Context?",
	);
	if (contextOption === undefined) return null;

	const hooks = await promptForSelection(
		["No", "Yes"],
		"Do you want to add custom hooks?",
	);
	if (hooks === undefined) return null;

	const folderStructure = await promptForSelection(
		["Flat", "Grouped"],
		"Choose folder structure:",
	);
	if (folderStructure === undefined) return null;

	return uniqueNames.map((name) => ({
		directory: relativePath,
		name,
		componentType,
		language,
		style: style === "No" ? undefined : style,
		stories: stories === "Yes",
		test: testFramework === "No" ? undefined : testFramework,
		context: contextOption === "Yes",
		hooks: hooks === "Yes",
		folderStructure,
	}));
}

async function promptForSelection(
	options: string[],
	placeHolder: string,
): Promise<string | undefined> {
	const selection = await vscode.window.showQuickPick(options, {
		placeHolder,
		canPickMany: false,
		ignoreFocusOut: true,
		matchOnDescription: true,
		matchOnDetail: true,
	});
	return selection;
}

async function isBiomeInstalled(workspaceRoot: string): Promise<boolean> {
	const packageJsonPath = path.join(workspaceRoot, "package.json");

	if (!fs.existsSync(packageJsonPath)) {
		return false;
	}

	const packageJsonContent = await readFile(packageJsonPath, "utf8");
	const packageJson = JSON.parse(packageJsonContent);

	return packageJson.dependencies?.biome || packageJson.devDependencies?.biome;
}

async function installBiome(workspaceRoot: string): Promise<void> {
	if (!terminal || terminal.exitStatus !== undefined) {
		terminal = vscode.window.createTerminal("Component Generator");
	}

	terminal.sendText("npm install --save-dev @biomejs/biome");
	terminal.show();

	vscode.window.showInformationMessage("Installing Biome... Please wait.");
}

async function generateComponents(
	componentsData: ComponentData[],
	folderPath: string,
): Promise<void> {
	const clearCommand = os.platform() === "win32" ? "cls" : "clear";

	if (!terminal || terminal.exitStatus !== undefined) {
		terminal = vscode.window.createTerminal("Component Generator");
	}

	const isBiome = await isBiomeInstalled(workspaceRoot);

	for (const data of componentsData) {
		const componentPath = path.join(folderPath, data.name);
		if (fs.existsSync(componentPath)) {
			vscode.window.showErrorMessage(
				`A component with the name "${data.name}" already exists in "${path.relative(workspaceRoot, folderPath)}".`,
			);
			continue;
		}

		const dataString = JSON.stringify(data);
		terminal.sendText(clearCommand);
		terminal.sendText(`$env:PLOP_DATA='${dataString}'; npx plop component`);

		if (isBiome) {
			terminal.sendText(
				`npx biome format --write ${path.join(folderPath, data.name)}`,
			);
		}
	}

	terminal.show();

	vscode.window.showInformationMessage(
		`Components successfully created in "${path.relative(workspaceRoot, folderPath)}"!`,
	);
}
