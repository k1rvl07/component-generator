"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const util = require("node:util");
const vscode = require("vscode");
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);
const copyFile = util.promisify(fs.copyFile);
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
let terminal;
let workspaceRoot;
function activate(context) {
    console.log('Extension "Component Generator" is now active!');
    const disposable = vscode.commands.registerCommand("extension.createComponent", (uri) => __awaiter(this, void 0, void 0, function* () {
        if (!uri) {
            vscode.window.showErrorMessage("No folder selected.");
            return;
        }
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage("No workspace folder is open. Please open a workspace.");
            return;
        }
        const folderPath = uri.fsPath;
        workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const relativePath = path.relative(workspaceRoot, folderPath);
        console.log("Selected folder path:", folderPath);
        console.log("Workspace root:", workspaceRoot);
        console.log("Relative path:", relativePath);
        try {
            yield checkAndCopyPlopFiles(context.extensionPath, workspaceRoot);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to setup Plop: ${error}`);
            return;
        }
        const data = yield promptUserForComponentData(folderPath, relativePath);
        if (!data) {
            vscode.window.showInformationMessage("Component creation canceled.");
            return;
        }
        try {
            yield generateComponents(data, folderPath);
            vscode.window.showInformationMessage(`Components successfully created in "${relativePath}"!`);
        }
        catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Failed to generate components: ${error.message}`);
            }
            else {
                vscode.window.showErrorMessage(`Failed to generate components: ${String(error)}`);
            }
        }
    }));
    context.subscriptions.push(disposable);
}
function deactivate() {
    console.log('Extension "Component Generator" is now deactivated.');
    if (terminal) {
        terminal.dispose();
    }
}
function checkAndCopyPlopFiles(extensionPath, workspaceRoot) {
    return __awaiter(this, void 0, void 0, function* () {
        const plopFilePath = path.join(workspaceRoot, "plopfile.js");
        const plopGeneratorsDir = path.join(workspaceRoot, "plop_generators");
        const templatesDir = path.join(workspaceRoot, "templates");
        const extensionResourcesDir = path.join(extensionPath, "out", "resources");
        const extensionPlopFile = path.join(extensionResourcesDir, "plopfile.js");
        const extensionGeneratorsDir = path.join(extensionResourcesDir, "plop_generators");
        const extensionTemplatesDir = path.join(extensionResourcesDir, "templates");
        // Проверка и настройка Biome
        yield checkAndSetupBiome(workspaceRoot, extensionPath);
        const isPlopInstalled = yield checkPlopInstalled(workspaceRoot);
        if (!isPlopInstalled) {
            const installPlop = yield vscode.window.showInformationMessage("Plop is not installed. Do you want to install it?", "Yes", "No");
            if (installPlop === "Yes") {
                yield installPlopDependencies(workspaceRoot);
            }
            else {
                throw new Error("Plop is required to generate components.");
            }
        }
        yield checkAndUpdatePlopFile(extensionPlopFile, plopFilePath);
        yield checkAndUpdateComponentGenerator(extensionGeneratorsDir, plopGeneratorsDir);
        if (!fs.existsSync(templatesDir)) {
            const createTemplatesDir = yield vscode.window.showInformationMessage("templates folder not found. Do you want to create it?", "Yes", "No");
            if (createTemplatesDir === "Yes") {
                if (!fs.existsSync(extensionTemplatesDir)) {
                    throw new Error(`templates folder not found in extension resources: ${extensionTemplatesDir}`);
                }
                yield mkdir(templatesDir);
                const files = yield readdir(extensionTemplatesDir);
                for (const file of files) {
                    const sourceFile = path.join(extensionTemplatesDir, file);
                    const destFile = path.join(templatesDir, file);
                    yield copyFile(sourceFile, destFile);
                }
                vscode.window.showInformationMessage("templates folder and files created successfully.");
            }
            else {
                throw new Error("templates folder is required to generate components.");
            }
        }
        else {
            yield checkMissingAndModifiedTemplates(extensionTemplatesDir, templatesDir);
        }
    });
}
function checkAndSetupBiome(workspaceRoot, extensionPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const biomeJsonPath = path.join(workspaceRoot, "biome.json");
        const extensionBiomeJsonPath = path.join(extensionPath, "out", "resources", "biome.json");
        const isBiomeInstalled = yield isBiomePackageInstalled(workspaceRoot);
        const isBiomeJsonExists = fs.existsSync(biomeJsonPath);
        // Если Biome не установлен и файл отсутствует
        if (!isBiomeInstalled && !isBiomeJsonExists) {
            const installBiomeAndAddConfig = yield vscode.window.showInformationMessage("Biome is not installed and biome.json is missing. Do you want to install Biome and add the configuration file?", "Yes", "No");
            if (installBiomeAndAddConfig === "Yes") {
                yield installBiome(workspaceRoot);
                yield copyFile(extensionBiomeJsonPath, biomeJsonPath);
                vscode.window.showInformationMessage("Biome installed and biome.json added successfully.");
            }
        }
        // Если Biome установлен, но файл отсутствует
        else if (isBiomeInstalled && !isBiomeJsonExists) {
            const addBiomeConfig = yield vscode.window.showInformationMessage("biome.json is missing. Do you want to add the configuration file?", "Yes", "No");
            if (addBiomeConfig === "Yes") {
                yield copyFile(extensionBiomeJsonPath, biomeJsonPath);
                vscode.window.showInformationMessage("biome.json added successfully.");
            }
        }
        // Если Biome не установлен, но файл существует
        else if (!isBiomeInstalled && isBiomeJsonExists) {
            const installBiomeOption = yield vscode.window.showInformationMessage("Biome is not installed. Do you want to install it?", "Yes", "No");
            if (installBiomeOption === "Yes") {
                yield installBiome(workspaceRoot);
                vscode.window.showInformationMessage("Biome installed successfully.");
            }
        }
    });
}
function isBiomePackageInstalled(workspaceRoot) {
    return __awaiter(this, void 0, void 0, function* () {
        const biomePath = path.join(workspaceRoot, "node_modules", ".bin", "biome");
        if (fs.existsSync(biomePath)) {
            return true;
        }
        try {
            const { execSync } = require("node:child_process");
            const command = os.platform() === "win32" ? "where biome" : "which biome";
            execSync(command);
            return true;
        }
        catch (_error) {
            return false;
        }
    });
}
function installBiome(_workspaceRoot) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!terminal || terminal.exitStatus !== undefined) {
            terminal = vscode.window.createTerminal("Component Generator");
        }
        terminal.sendText("npm install --save-dev @biomejs/biome");
        terminal.show();
        vscode.window.showInformationMessage("Installing Biome... Please wait.");
    });
}
function checkPlopInstalled(workspaceRoot) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const packageJsonPath = path.join(workspaceRoot, "package.json");
        if (!fs.existsSync(packageJsonPath)) {
            return false;
        }
        const packageJsonContent = yield readFile(packageJsonPath, "utf8");
        const packageJson = JSON.parse(packageJsonContent);
        return ((_a = packageJson.dependencies) === null || _a === void 0 ? void 0 : _a.plop) || ((_b = packageJson.devDependencies) === null || _b === void 0 ? void 0 : _b.plop);
    });
}
function installPlopDependencies(_workspaceRoot) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!terminal || terminal.exitStatus !== undefined) {
            terminal = vscode.window.createTerminal("Component Generator");
        }
        terminal.sendText("npm install plop --save-dev");
        terminal.show();
        vscode.window.showInformationMessage("Installing Plop... Please wait.");
    });
}
function checkAndUpdatePlopFile(extensionPlopFile, plopFilePath) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!fs.existsSync(plopFilePath)) {
            const createPlopFile = yield vscode.window.showInformationMessage("plopfile.js not found. Do you want to create it?", "Yes", "No");
            if (createPlopFile === "Yes") {
                yield copyFile(extensionPlopFile, plopFilePath);
                vscode.window.showInformationMessage("plopfile.js created successfully.");
            }
            else {
                throw new Error("plopfile.js is required to generate components.");
            }
        }
        else {
            const userContent = yield readFile(plopFilePath, "utf8");
            if (userContent.trim() === "") {
                const defaultContent = yield readFile(extensionPlopFile, "utf8");
                yield writeFile(plopFilePath, defaultContent, "utf8");
                vscode.window.showInformationMessage("plopfile.js was empty and has been replaced with the default version.");
                return;
            }
            const importRegex = /import\s+componentGenerator\s+from\s+["']\.\/plop_generators\/componentGenerator\.js["'];/;
            const hasImport = importRegex.test(userContent);
            const usageRegex = /componentGenerator\(\s*plop\s*\)\s*;?/;
            const hasUsage = usageRegex.test(userContent);
            if (!hasImport || !hasUsage) {
                const defaultContent = yield readFile(extensionPlopFile, "utf8");
                const updatedContent = addMissingImportsAndUsage(userContent, defaultContent);
                yield writeFile(plopFilePath, updatedContent, "utf8");
                vscode.window.showInformationMessage("plopfile.js has been updated with missing imports and usage.");
            }
        }
    });
}
function checkAndUpdateComponentGenerator(extensionGeneratorsDir, plopGeneratorsDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const componentGeneratorPath = path.join(plopGeneratorsDir, "componentGenerator.js");
        const extensionComponentGeneratorPath = path.join(extensionGeneratorsDir, "componentGenerator.js");
        if (!fs.existsSync(plopGeneratorsDir)) {
            const createGeneratorsDir = yield vscode.window.showInformationMessage("plop_generators folder not found. Do you want to create it and componentGenerator.js in it?", "Yes", "No");
            if (createGeneratorsDir === "Yes") {
                yield mkdir(plopGeneratorsDir);
                vscode.window.showInformationMessage("plop_generators folder created successfully.");
                yield copyFile(extensionComponentGeneratorPath, componentGeneratorPath);
                vscode.window.showInformationMessage("componentGenerator.js created successfully.");
            }
            else {
                throw new Error("plop_generators folder is required to generate components.");
            }
        }
        else {
            if (!fs.existsSync(componentGeneratorPath)) {
                const createComponentGenerator = yield vscode.window.showInformationMessage("componentGenerator.js not found. Do you want to create it?", "Yes", "No");
                if (createComponentGenerator === "Yes") {
                    yield copyFile(extensionComponentGeneratorPath, componentGeneratorPath);
                    vscode.window.showInformationMessage("componentGenerator.js created successfully.");
                }
                else {
                    throw new Error("componentGenerator.js is required to generate components.");
                }
            }
            else {
                const userContent = yield readFile(componentGeneratorPath, "utf8");
                const defaultContent = yield readFile(extensionComponentGeneratorPath, "utf8");
                if (userContent !== defaultContent) {
                    const restoreGenerator = yield vscode.window.showInformationMessage("componentGenerator.js has been modified. Do you want to restore it to the default version?", "Yes", "No");
                    if (restoreGenerator === "Yes") {
                        yield copyFile(extensionComponentGeneratorPath, componentGeneratorPath);
                        vscode.window.showInformationMessage("componentGenerator.js has been restored to the default version.");
                    }
                }
            }
        }
    });
}
function addMissingImportsAndUsage(userContent, _defaultContent) {
    const importRegex = /import\s+componentGenerator\s+from\s+["']\.\/plop_generators\/componentGenerator\.js["'];/;
    const usageRegex = /componentGenerator\(\s*plop\s*\)\s*;?/;
    let updatedContent = userContent;
    if (!importRegex.test(updatedContent)) {
        updatedContent = `import componentGenerator from "./plop_generators/componentGenerator.js";\n${updatedContent}`;
    }
    if (!usageRegex.test(updatedContent)) {
        updatedContent = updatedContent.replace(/export\s+default\s+function\s*\(plop\)\s*\{/, (match) => `${match}\n  componentGenerator(plop);`);
    }
    return updatedContent;
}
function checkMissingAndModifiedTemplates(extensionTemplatesDir, templatesDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const extensionFiles = yield readdir(extensionTemplatesDir);
        const userFiles = yield readdir(templatesDir);
        const missingFiles = extensionFiles.filter((file) => !userFiles.includes(file));
        if (missingFiles.length > 0) {
            const addAll = yield vscode.window.showInformationMessage(`The following template files are missing: ${missingFiles.join(", ")}. Do you want to add them?`, "Yes", "No");
            if (addAll === "Yes") {
                for (const file of missingFiles) {
                    const sourceFile = path.join(extensionTemplatesDir, file);
                    const destFile = path.join(templatesDir, file);
                    yield copyFile(sourceFile, destFile);
                }
                vscode.window.showInformationMessage("Missing template files added successfully.");
            }
        }
        const modifiedFiles = [];
        for (const file of extensionFiles) {
            if (userFiles.includes(file)) {
                const extensionFileContent = yield readFile(path.join(extensionTemplatesDir, file), "utf8");
                const userFileContent = yield readFile(path.join(templatesDir, file), "utf8");
                if (extensionFileContent !== userFileContent) {
                    modifiedFiles.push(file);
                }
            }
        }
        if (modifiedFiles.length > 0) {
            const restoreAll = yield vscode.window.showInformationMessage(`The following template files have been modified: ${modifiedFiles.join(", ")}. Do you want to restore them to the default version?`, "Yes", "No");
            if (restoreAll === "Yes") {
                for (const file of modifiedFiles) {
                    const sourceFile = path.join(extensionTemplatesDir, file);
                    const destFile = path.join(templatesDir, file);
                    yield copyFile(sourceFile, destFile);
                }
                vscode.window.showInformationMessage("Modified template files restored successfully.");
            }
        }
    });
}
function promptUserForComponentData(_folderPath, relativePath) {
    return __awaiter(this, void 0, void 0, function* () {
        const namesInput = yield vscode.window.showInputBox({
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
        if (namesInput === undefined) {
            return null;
        }
        const uniqueNames = [...new Set(namesInput.split(" ").filter((name) => name.trim() !== ""))];
        const componentType = yield promptForSelection(["Functional Component", "Class Component"], "Choose component type:");
        if (componentType === undefined) {
            return null;
        }
        const language = yield promptForSelection(["JavaScript", "TypeScript"], "Choose language:");
        if (language === undefined) {
            return null;
        }
        const style = yield promptForSelection(["No", "CSS", "SCSS", "Styled Components"], "Choose styling method:");
        if (style === undefined) {
            return null;
        }
        const stories = yield promptForSelection(["No", "Yes"], "Do you want to add a Storybook story?");
        if (stories === undefined) {
            return null;
        }
        const testFramework = yield promptForSelection(["No", "Jest", "React Testing Library", "Cypress"], "Choose test framework:");
        if (testFramework === undefined) {
            return null;
        }
        const contextOption = yield promptForSelection(["No", "Yes"], "Do you want to add React Context?");
        if (contextOption === undefined) {
            return null;
        }
        const hooks = yield promptForSelection(["No", "Yes"], "Do you want to add custom hooks?");
        if (hooks === undefined) {
            return null;
        }
        const folderStructure = yield promptForSelection(["Flat", "Grouped"], "Choose folder structure:");
        if (folderStructure === undefined) {
            return null;
        }
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
    });
}
function promptForSelection(options, placeHolder) {
    return __awaiter(this, void 0, void 0, function* () {
        const selection = yield vscode.window.showQuickPick(options, {
            placeHolder,
            canPickMany: false,
            ignoreFocusOut: true,
            matchOnDescription: true,
            matchOnDetail: true,
        });
        return selection;
    });
}
function generateComponents(componentsData, folderPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const clearCommand = os.platform() === "win32" ? "cls" : "clear";
        if (!terminal || terminal.exitStatus !== undefined) {
            terminal = vscode.window.createTerminal("Component Generator");
        }
        const isBiome = yield isBiomePackageInstalled(workspaceRoot);
        for (const data of componentsData) {
            const componentPath = path.join(folderPath, data.name);
            if (fs.existsSync(componentPath)) {
                vscode.window.showErrorMessage(`A component with the name "${data.name}" already exists in "${path.relative(workspaceRoot, folderPath)}".`);
                continue;
            }
            const dataString = JSON.stringify(data);
            terminal.sendText(clearCommand);
            terminal.sendText(`$env:PLOP_DATA='${dataString}'; npx plop component`);
            if (isBiome) {
                terminal.sendText(`npx biome format --write ${path.join(folderPath, data.name)}`);
            }
        }
        terminal.show();
        vscode.window.showInformationMessage(`Components successfully created in "${path.relative(workspaceRoot, folderPath)}"!`);
    });
}
//# sourceMappingURL=extension.js.map