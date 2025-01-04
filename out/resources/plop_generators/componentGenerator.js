import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function (plop) {
  plop.setHelper('if_eq', function (a, b, opts) {
    if (a === b) {
      return opts.fn(this);
    } else {
      return opts.inverse(this);
    }
  });

  plop.setHelper('toLowerCase', function (str) {
    return str.toLowerCase();
  });

  plop.setGenerator("component", {
    description: "Create a new React component",
    prompts: [],
    actions: (data) => {
      const plopData = process.env.PLOP_DATA ? JSON.parse(process.env.PLOP_DATA) : {};
      const mergedData = { ...data, ...plopData };

      const { directory, name, componentType, language, style, stories, test, context, hooks, folderStructure } =
        mergedData;

      if (!name || !directory) {
        throw new Error("Name and directory are required!");
      }

      const fileExtension = language === "TypeScript" ? "tsx" : "jsx";
      const indexExtension = language === "TypeScript" ? "ts" : "js";

      console.log("Generating component with data:", mergedData);

      const templatesDir = path.join(__dirname, "../templates");

      const componentTemplate =
        componentType === "Class Component"
          ? path.join(templatesDir, "class.hbs")
          : path.join(templatesDir, "fc.hbs");

      const indexTemplate = path.join(templatesDir, "index.hbs");
      const styleTemplate = path.join(templatesDir, "style.hbs");
      const styledTemplate = path.join(templatesDir, "styled.hbs");
      const storiesTemplate = path.join(templatesDir, "stories.hbs");
      const testTemplate = path.join(
        templatesDir,
        `test.${test === "Cypress" ? "cypress" : "jest"}.hbs`,
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
        styledTemplate
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
        folderStructure,
        hooks
      };

      const actions = [];

      const componentBasePath = `${directory}/${name}`;

      if (folderStructure === "Grouped") {
        actions.push({
          type: "add",
          path: `${componentBasePath}/index.${indexExtension}`,
          templateFile: indexTemplate,
          data: templateData,
        });

        actions.push({
          type: "add",
          path: `${componentBasePath}/${name}.${fileExtension}`,
          templateFile: componentTemplate,
          data: templateData,
        });

        if (style && style !== "No") {
          if (style === "Styled Components") {
            actions.push({
              type: "add",
              path: `${componentBasePath}/styles/${name}.styled.${fileExtension}`,
              templateFile: path.join(templatesDir, "styled.hbs"),
              data: templateData,
            });
          } else {
            const styleExtension = style === "SCSS" ? "scss" : "css";
            actions.push({
              type: "add",
              path: `${componentBasePath}/styles/${name}.module.${styleExtension}`,
              templateFile: styleTemplate,
              data: templateData,
            });
          }
        }

        if (stories) {
          actions.push({
            type: "add",
            path: `${componentBasePath}/stories/${name}.stories.${fileExtension}`,
            templateFile: storiesTemplate,
            data: templateData,
          });
        }

        if (test && test !== "No") {
          actions.push({
            type: "add",
            path: `${componentBasePath}/tests/${name}.test.${fileExtension}`,
            templateFile: testTemplate,
            data: templateData,
          });
        }

        if (context) {
          actions.push({
            type: "add",
            path: `${componentBasePath}/context/${name}Context.${fileExtension}`,
            templateFile: contextTemplate,
            data: templateData,
          });
        }

        if (hooks) {
          actions.push({
            type: "add",
            path: `${componentBasePath}/hooks/use${name}.${fileExtension}`,
            templateFile: hooksTemplate,
            data: templateData,
          });
        }
      } else {
        actions.push({
          type: "add",
          path: `${componentBasePath}/index.${indexExtension}`,
          templateFile: indexTemplate,
          data: templateData,
        });

        actions.push({
          type: "add",
          path: `${componentBasePath}/${name}.${fileExtension}`,
          templateFile: componentTemplate,
          data: templateData,
        });

        if (style && style !== "No") {
          if (style === "Styled Components") {
            actions.push({
              type: "add",
              path: `${componentBasePath}/${name}.styled.${fileExtension}`,
              templateFile: styledTemplate,
              data: templateData,
            });
          } else {
            const styleExtension = style === "SCSS" ? "scss" : "css";
            actions.push({
              type: "add",
              path: `${componentBasePath}/${name}.module.${styleExtension}`,
              templateFile: styleTemplate,
              data: templateData,
            });
          }
        }

        if (stories) {
          actions.push({
            type: "add",
            path: `${componentBasePath}/${name}.stories.${fileExtension}`,
            templateFile: storiesTemplate,
            data: templateData,
          });
        }

        if (test && test !== "No") {
          actions.push({
            type: "add",
            path: `${componentBasePath}/${name}.test.${fileExtension}`,
            templateFile: testTemplate,
            data: templateData,
          });
        }

        if (context) {
          actions.push({
            type: "add",
            path: `${componentBasePath}/${name}Context.${fileExtension}`,
            templateFile: contextTemplate,
            data: templateData,
          });
        }

        if (hooks) {
          actions.push({
            type: "add",
            path: `${componentBasePath}/use${name}.${fileExtension}`,
            templateFile: hooksTemplate,
            data: templateData,
          });
        }
      }

      return actions;
    },
  });
}