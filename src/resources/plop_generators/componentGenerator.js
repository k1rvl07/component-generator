import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function (plop) {
	plop.setGenerator("component", {
		description: "Create a new React component",
		prompts: [],
		actions: (data) => {
			const plopData = process.env.PLOP_DATA
				? JSON.parse(process.env.PLOP_DATA)
				: {};
			const mergedData = { ...data, ...plopData };

			const {
				directory,
				name,
				componentType,
				language,
				style,
				stories,
				test,
				context,
				hooks,
			} = mergedData;

			if (!name || !directory) {
				throw new Error("Name and directory are required!");
			}

			const fileExtension = language === "ts" ? "tsx" : "jsx";
			const indexExtension = language === "ts" ? "ts" : "js";

			console.log("Generating component with data:", mergedData);

			const templatesDir = path.join(__dirname, "../templates");

			const componentTemplate =
				componentType === "class"
					? path.join(templatesDir, "class.hbs")
					: path.join(templatesDir, "fc.hbs");

			const indexTemplate = path.join(templatesDir, "index.hbs");
			const styleTemplate = path.join(templatesDir, "style.hbs");
			const storiesTemplate = path.join(templatesDir, "stories.hbs");
			const testTemplate = path.join(
				templatesDir,
				`test.${test === "cypress" ? "cypress" : "jest"}.hbs`,
			);
			const contextTemplate = path.join(templatesDir, "context.hbs");
			const hooksTemplate = path.join(templatesDir, "useCustomHook.hbs");

			const templates = [
				componentTemplate,
				indexTemplate,
				styleTemplate,
				storiesTemplate,
				testTemplate,
				contextTemplate,
				hooksTemplate,
			];

			for (const template of templates) {
				if (!fs.existsSync(template)) {
					throw new Error(`Template file not found: ${template}`);
				}
			}

			const templateData = {
				name,
				style,
				language,
			};

			const actions = [];

			actions.push({
				type: "add",
				path: `${directory}/${name}/${name}.${fileExtension}`,
				templateFile: componentTemplate,
				data: templateData,
			});

			actions.push({
				type: "add",
				path: `${directory}/${name}/index.${indexExtension}`,
				templateFile: indexTemplate,
				data: templateData,
			});

			if (style && style === "Yes") {
				let styleExtension = "css";
				if (style === "scss") {
					styleExtension = "scss";
				} else if (style === "styled components") {
					styleExtension = "js";
				}

				actions.push({
					type: "add",
					path: `${directory}/${name}/${name}.module.${styleExtension}`,
					templateFile: styleTemplate,
					data: templateData,
				});
			}

			if (stories && stories === "Yes") {
				actions.push({
					type: "add",
					path: `${directory}/${name}/${name}.stories.${fileExtension}`,
					templateFile: storiesTemplate,
					data: templateData,
				});
			}

			if (test && test === "Yes") {
				actions.push({
					type: "add",
					path: `${directory}/${name}/${name}.test.${fileExtension}`,
					templateFile: testTemplate,
					data: templateData,
				});
			}

			if (context && context === "Yes") {
				actions.push({
					type: "add",
					path: `${directory}/${name}/${name}Context.${fileExtension}`,
					templateFile: contextTemplate,
					data: templateData,
				});
			}

			if (hooks && hooks === "Yes") {
				actions.push({
					type: "add",
					path: `${directory}/${name}/use${name}.${fileExtension}`,
					templateFile: hooksTemplate,
					data: templateData,
				});
			}

			return actions;
		},
	});
}
